import {z} from 'zod';
import type {Actor,Role,ToolResult} from '../lib/contracts';
import type {WorkStep,WorkStepInput} from '../lib/work-contracts';
import {AppError,assertActor,getDb,requireRole} from './db';
import {featureAccess,requireFeature} from './billing';
import {readInvestor,readProperty} from './access';
import {createResearchJob,getResearchJob,cancelJob,createTask,getManagementOverview,matchBuyers} from './services';
import {getRelease,listReleases} from './workflows';
import {recommendInvestorNextStep} from './journey';

const id=z.string().trim().min(1).max(150);
const reference=z.object({$step:id,path:z.string().min(1).max(240)}).strict();
const valueId=z.union([id,reference]);
const all:Role[]=['dispositions','acquisitions','manager'];
type Capability={name:string;description:string;feature:string;roles:Role[];schema:z.ZodObject;estimatedCents:number;maximumCents:number;effect:'read'|'personal_task'|'synthetic_research';output:string};
// Fictional analysis prices exercise admission/settlement. These are not provider prices.
// Existing direct lookups, navigation and task controls remain unmetered by the wallet.
const catalog:Record<string,Capability>={
 inspect_property:{name:'Read property facts',description:'Retrieve current authorized fictional property facts.',feature:'core',roles:all,schema:z.object({propertyId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'propertyId, property'},
 match_existing_buyers:{name:'Prepare existing-buyer shortlist',description:'Match current permitted CRM buy boxes first. Fit does not imply investor interest. Fictional analysis cost.',feature:'buyer-matchmaker',roles:['dispositions','manager'],schema:z.object({propertyId:valueId}).strict(),estimatedCents:40,maximumCents:50,effect:'read',output:'propertyId, property, matches[] (investorId, reasons, conflicts, missing)'},
 relationship_next_step:{name:'Prepare relationship next step',description:'Use sourced relationship history and saved employee preferences. Produces a relationship-only draft; nothing is sent. Fictional analysis cost.',feature:'investor-relationship',roles:['dispositions','manager'],schema:z.object({investorId:valueId}).strict(),estimatedCents:35,maximumCents:50,effect:'read',output:'investorId, recommendation (action, draft, evidence, unknowns)'},
 review_handoff:{name:'Review acquisition handoff',description:'Review recorded property/release facts and missing handoff information. This does not perform valuation or publish a release. Fictional analysis cost.',feature:'acquisition-disposition',roles:['acquisitions','manager'],schema:z.object({propertyId:valueId}).strict(),estimatedCents:50,maximumCents:75,effect:'read',output:'propertyId, property, releases[], missing[]'},
 office_priorities:{name:'Prepare office priorities',description:'Read permitted office workload and identify recorded overdue work. No private mail/chat, assignment changes or verified sales metrics. Fictional analysis cost.',feature:'team-performance',roles:['manager'],schema:z.object({}).strict(),estimatedCents:50,maximumCents:75,effect:'read',output:'overview (summary, tasks, overdue, pendingApprovals, activeJobs)'},
 create_followup:{name:'Save requested follow-up',description:'Create the explicitly requested personal internal task. Does not send, change CRM or assign a teammate.',feature:'daily-coordinator',roles:all,schema:z.object({title:z.string().trim().min(3).max(240),investorId:z.union([valueId,z.null()]),dueAt:z.string().datetime({offset:true}).nullable()}).strict(),estimatedCents:0,maximumCents:0,effect:'personal_task',output:'taskId, task'},
 start_synthetic_research:{name:'Start fictional investor research',description:'Start a synthetic-fixture child research job only after existing buyers are considered. No external provider or verified contacts. Include await_synthetic_research in the same plan. Fictional research cost.',feature:'investor-hunter',roles:['dispositions','manager'],schema:z.object({propertyId:valueId,limit:z.number().int().min(1).max(12)}).strict(),estimatedCents:150,maximumCents:225,effect:'synthetic_research',output:'jobId, propertyId'},
 await_synthetic_research:{name:'Collect fictional research results',description:'Wait for the child research job started by this plan and retrieve actual saved results; never invent completion.',feature:'investor-hunter',roles:['dispositions','manager'],schema:z.object({jobId:reference}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'jobId, job'},
};
export class WorkCapabilityPending extends Error {
 constructor(message:string,public dependencyKey?:string){super(message);this.name='WorkCapabilityPending';}
}
function definition(key:string):Capability {if(!Object.hasOwn(catalog,key))throw new AppError(422,'This job needs a capability that is not implemented. Choose an available capability or narrow its scope.');return catalog[key];}
function rejectUnsafeKeys(value:unknown,depth=0):void {
 if(depth>12)throw new AppError(400,'The job input is too deeply nested.');
 if(!value||typeof value!=='object')return;
 for(const [key,item] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new AppError(400,'Unsafe job input.');rejectUnsafeKeys(item,depth+1);}
}
export function listWorkCapabilities(actor:Actor){assertActor(actor);return Object.entries(catalog).map(([capabilityId,item])=>({capabilityId,name:item.name,description:item.description,feature:item.feature,effect:item.effect,output:item.output,inputSchema:z.toJSONSchema(item.schema),estimatedCents:item.estimatedCents,maximumCents:item.maximumCents,rateVersion:'fictional-work-v1',available:item.roles.includes(actor.role)&&featureAccess(actor,item.feature).allowed,simulation:true}));}

export function validateWorkSteps(actor:Actor,steps:WorkStepInput[]):WorkStepInput[]{
 assertActor(actor);requireFeature(actor,'core');
 if(!Array.isArray(steps)||!steps.length||steps.length>12)throw new AppError(400,'A job needs between one and twelve bounded steps.');
 const keys=new Set<string>();
 for(const step of steps){
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(step.key)||keys.has(step.key))throw new AppError(400,'Job step names must be unique short identifiers.');keys.add(step.key);
  const item=definition(step.capabilityId);requireRole(actor,item.roles);requireFeature(actor,item.feature);rejectUnsafeKeys(step.input);item.schema.parse(step.input);
  if(new Set(step.dependsOn).size!==step.dependsOn.length)throw new AppError(400,'A dependency cannot be repeated.');
 }
 for(const step of steps){
  for(const dependency of step.dependsOn)if(dependency===step.key||!keys.has(dependency))throw new AppError(400,'A job has an invalid dependency.');
  const inspect=(value:unknown)=>{if(!value||typeof value!=='object')return;if('$step' in value){const ref=reference.parse(value);if(!step.dependsOn.includes(ref.$step)||ref.path.split('.').some(k=>!/^\d+$|^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)||['__proto__','constructor','prototype'].includes(k)))throw new AppError(400,'A result reference must use a declared dependency and a safe data path.');}else Object.values(value).forEach(inspect);};inspect(step.input);
  if(step.capabilityId==='await_synthetic_research'){
   const ref=reference.parse(step.input.jobId);const source=steps.find(s=>s.key===ref.$step);
   if(source?.capabilityId!=='start_synthetic_research'||ref.path!=='jobId')throw new AppError(400,'Research results must refer to the child started by this job.');
  }
  if(step.capabilityId==='start_synthetic_research'){
   if(!step.dependsOn.some(key=>steps.some(s=>s.key===key&&s.capabilityId==='match_existing_buyers'&&JSON.stringify(s.input.propertyId)===JSON.stringify(step.input.propertyId))))throw new AppError(400,'Match existing buyers for the same property before new research.');
   if(!steps.some(s=>s.capabilityId==='await_synthetic_research'&&typeof s.input.jobId==='object'&&s.input.jobId!==null&&(s.input.jobId as {$step?:string}).$step===step.key))throw new AppError(400,'Include a results step so the job waits for its child research.');
  }
  validateStoredWorkOutput(actor,step,{specialistIds:[],message:'',artifacts:[]});
 }
 const visited=new Set<string>(),stack=new Set<string>();
 const visit=(key:string)=>{if(stack.has(key))throw new AppError(400,'Job dependencies cannot contain a cycle.');if(visited.has(key))return;stack.add(key);steps.find(s=>s.key===key)!.dependsOn.forEach(visit);stack.delete(key);visited.add(key);};steps.forEach(s=>visit(s.key));
 return steps;
}
export function estimateWorkStep(actor:Actor,step:WorkStepInput){const item=definition(step.capabilityId);requireRole(actor,item.roles);requireFeature(actor,item.feature);return {estimatedCents:item.estimatedCents,maximumCents:item.maximumCents,rateVersion:'fictional-work-v1'};}

/** Historical results retain their receipt, but never retain access to another person's records. */
export function validateStoredWorkOutput(actor:Actor,step:WorkStepInput,output:ToolResult):void {
 assertActor(actor);requireRole(actor,definition(step.capabilityId).roles);
 const inspect=(value:unknown,depth=0)=>{
  if(!value||typeof value!=='object'||depth>14)return;
  if(Array.isArray(value)){value.forEach(item=>inspect(item,depth+1));return;}
  if('$step' in value)return;
  for(const [key,item] of Object.entries(value)){
   if(typeof item==='string'){
    if(key==='investorId'||key==='matchedInvestorId'||key==='id'&&/^investor[-_]/.test(item))readInvestor(actor,item);
    if(key==='propertyId'||key==='id'&&/^property[-_]/.test(item))readProperty(actor,item);
    if(key==='releaseId'||key==='id'&&/^release_/.test(item))getRelease(actor,item);
    if(key==='jobId'||key==='id'&&/^research_/.test(item)){const job=getResearchJob(actor,item);if(job.ownerId!==actor.id&&actor.role!=='manager')throw new AppError(404,'Research is no longer accessible.');}
    if(key==='taskId'||key==='id'&&/^task[-_]/.test(item)){
     const row=getDb().prepare('SELECT owner_id,investor_id FROM tasks WHERE id=? AND organization_id=? AND office_id=?').get(item,actor.organizationId,actor.officeId) as {owner_id:string;investor_id:string|null}|undefined;
     if(!row||row.owner_id!==actor.id&&actor.role!=='manager')throw new AppError(404,'A task in this result is no longer accessible.');if(row.investor_id)readInvestor(actor,row.investor_id);
    }
   }else inspect(item,depth+1);
  }
 };inspect(step.input);inspect(output.data);inspect(output.artifacts);
}

export function executeWorkCapability(actor:Actor,step:WorkStepInput,_priorOutputs:Record<string,ToolResult>):ToolResult {
 const item=definition(step.capabilityId);requireRole(actor,item.roles);requireFeature(actor,item.feature);rejectUnsafeKeys(step.input);
 // References must already have been resolved by the worker; schema validation is repeated here.
 if(Object.values(step.input).some(value=>value&&typeof value==='object'))throw new AppError(400,'Resolve the required prior result before executing this step.');
 const input:Record<string,unknown>=step.capabilityId==='await_synthetic_research'?z.object({jobId:id}).strict().parse(step.input):item.schema.parse(step.input) as Record<string,unknown>;
 validateStoredWorkOutput(actor,step,{specialistIds:[],message:'',artifacts:[]});
 const result:ToolResult={specialistIds:item.feature==='core'?[]:[item.feature],message:'',artifacts:[]};
 switch(step.capabilityId){
  case 'inspect_property':{const property=readProperty(actor,input.propertyId as string);result.data={propertyId:property.id,property};result.message=`${property.address}: ${property.status}, $${property.price.toLocaleString()}, ${property.county} County. Fictional property record.`;break;}
  case 'match_existing_buyers':{
   const matched=matchBuyers(actor,input.propertyId as string);result.data={propertyId:matched.property.id,...matched};result.message=matched.matches.length?`Existing CRM shortlist for ${matched.property.address}:\n${matched.matches.slice(0,12).map(m=>`${m.investor.name}: ${m.reasons.join('; ')||'Review criteria'}${m.conflicts.length?` · Concerns: ${m.conflicts.join('; ')}`:''}`).join('\n')}\nFit is not confirmed interest; review current relationship concerns before outreach.`:'No existing permitted buyers match this property. No new prospects were invented.';break;
  }
  case 'relationship_next_step':{const recommendation=recommendInvestorNextStep(actor,input.investorId as string);result.data={investorId:input.investorId,recommendation};result.message=`${recommendation.action.title}\n${recommendation.action.description}${recommendation.draft?`\n\nRelationship-only draft: ${recommendation.draft}`:''}\n${recommendation.unknowns.length?`Missing: ${recommendation.unknowns.join('; ')}\n`:''}Nothing has been sent.`;break;}
  case 'review_handoff':{
   const property=readProperty(actor,input.propertyId as string),releases=listReleases(actor).filter(r=>r.propertyId===property.id);
   const missing:string[]=[];if(!releases.length)missing.push('a sourced acquisition release');
   for(const r of releases){if(!r.upstreamParty)missing.push('upstream wholesaler/source contact');if(!r.economicsSource)missing.push('source for the supplied economics');if(r.repairEstimate===null)missing.push('supported repair assumptions');if(!r.closingAt)missing.push('confirmed closing date');if(r.mediaAccess==='unverified')missing.push('recipient access to property media');}
   result.data={propertyId:property.id,property,releases,missing:[...new Set(missing)]};result.message=`Handoff review for ${property.address}: ${releases.length} recorded release(s).\n${missing.length?`Clarify: ${[...new Set(missing)].join('; ')}.`:'The checked handoff fields are recorded; validate their source and current status before releasing the deal.'}\nThis is a fictional readiness review, not valuation or a published handoff.`;break;
  }
  case 'office_priorities':{const overview=getManagementOverview(actor);result.data={overview};result.message=`${overview.summary}\n${overview.overdue.length?`Recorded overdue work: ${overview.overdue.slice(0,8).map(t=>t.title).join('; ')}.`:'No overdue tasks are recorded in this office view.'}\nLocal workload evidence only; no private mailbox access or verified sales-performance claim.`;break;}
  case 'create_followup':{const task=createTask(actor,input as {title:string;investorId:string|null;dueAt:string|null});result.data={taskId:task.id,task};result.message=`Saved your personal follow-up: ${task.title}.`;result.artifacts=[{type:'task',id:task.id,title:task.title}];break;}
  case 'start_synthetic_research':{
   const property=readProperty(actor,input.propertyId as string);
   if(property.status!=='Available')throw new AppError(409,'This property is not currently available. Review its status before research.');
   const currentFacts=JSON.stringify(property);
   const currentShortlist=step.dependsOn.some(key=>{const data=_priorOutputs[key]?.data as {property?:unknown;matches?:unknown}|undefined;return data&&Array.isArray(data.matches)&&JSON.stringify(data.property)===currentFacts;});
   if(!currentShortlist)throw new AppError(409,'Property facts changed or a current buyer shortlist is missing. Refresh the buyer-matching step before new research.');
   const job=createResearchJob(actor,{address:property.address,county:property.county,price:property.price,strategy:property.strategy,limit:input.limit as number,provider:'synthetic-fixtures-v1'});
   result.data={jobId:job.id,propertyId:property.id};result.message='Fictional child research queued; this job will wait for its saved results.';result.artifacts=[{type:'job',id:job.id,title:'Fictional investor research'}];break;
  }
  case 'await_synthetic_research':{
   const job=getResearchJob(actor,input.jobId as string);if(job.ownerId!==actor.id||job.provider!=='synthetic-fixtures-v1')throw new AppError(403,'Only this employee’s fictional child research can be collected here.');
   if(job.status==='queued'||job.status==='running')throw new WorkCapabilityPending('Waiting for fictional research results.',job.id);
   if(job.status!=='completed')throw new AppError(409,'The child research did not complete. Inspect its status before revising this job.');
   result.data={jobId:job.id,job};result.message=`Collected ${job.prospects.length} fictional research candidates. Source and contact verification remain synthetic; no investor was contacted or imported.`;result.artifacts=[{type:'job',id:job.id,title:'Review fictional research results'}];break;
  }
 }
 return result;
}
export function cancelWorkChildren(actor:Actor,steps:WorkStep[]):void {
 for(const step of steps){if(step.capabilityId!=='start_synthetic_research'||!step.result?.data)continue;const {jobId}=step.result.data as {jobId?:string};if(!jobId)continue;
  const job=getResearchJob(actor,jobId);if(job.ownerId===actor.id&&job.provider==='synthetic-fixtures-v1'&&['queued','running','awaiting_input'].includes(job.status))cancelJob(actor,jobId);
 }
}
