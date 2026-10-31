import {qualificationResult,qualificationReferenceCurrent} from './qualification-review';
import {rolePreparationReferenceCurrent,prepareOpportunityIntake,prepareHandoffAction,handoffPreparationSchema} from './role-preparations';
import {opportunityPreviewSchema} from './opportunities';
import {preparePropertyOutreachResult} from './package-correspondence';
import {reviewOpportunityScreening,opportunityScreeningMessage} from './opportunity-screening';
import {buyerShortlistMessage,buyerShortlistReferenceCurrent} from './buyer-shortlist';
import {reviewSourceDocument,documentContextReferenceCurrent} from './document-context';
import {getDocument} from './documents';
import {teamTransactionReviewResult,teamContextReferenceCurrent} from './transaction-team-context';
import {getTransactionTeam} from './transaction-team';
import {transactionReviewResult,transactionReferenceCurrent} from './transaction-context';
import {prepareTitleResult} from './transaction-results';
import {getTransaction} from './transactions';
import {createHash} from 'node:crypto';
import {getAnalysis,reviewSavedAnalysis,analysisReferenceCurrent,analysisMessage} from './deal-analysis';
import {getOpportunity,opportunityReferenceCurrent} from './opportunities';
import {handoffReferenceCurrent} from './handoffs';
import {workQuestionSchema} from './work-question-schema';
import {acquisitionMethod,reviewAcquisition} from './acquisitions';
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
type Capability={name:string;description:string;feature:string;roles:Role[];schema:z.ZodObject;estimatedCents:number;maximumCents:number;effect:'read'|'personal_task'|'synthetic_research'|'private_draft';output:string};
// Fictional analysis prices exercise admission/settlement. These are not provider prices.
// Existing direct lookups, navigation and task controls remain unmetered by the wallet.
const catalog:Record<string,Capability>={
 review_qualification:{name:'Review investor qualification',description:'Prioritize a sourced clarification across separate approved buying strategies, conditional or conflicting statements and freshness. No criteria update, funding verification or outreach.',feature:'investor-qualification',roles:['dispositions','manager'],schema:z.object({investorId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'investorId, questions, evidence, nextQuestion, qualificationReference'},
 prepare_opportunity_intake:{name:'Prepare acquisition intake review',description:'Prepare a private review of supplied wholesaler facts, unknowns and duplicates. Employee must apply it in Work; never publishes inventory.',feature:'acquisition-lead',roles:['acquisitions','manager'],schema:opportunityPreviewSchema,estimatedCents:0,maximumCents:0,effect:'private_draft',output:'preparation, opportunityAccessReference'},
 prepare_handoff_action:{name:'Prepare shared handoff review',description:'Prepare a source-bound assignment, acknowledgment, evidenced report or manager resolution. No shared change until the employee applies the review in Work.',feature:'core',roles:all,schema:handoffPreparationSchema,estimatedCents:0,maximumCents:0,effect:'private_draft',output:'preparation, handoffAccessReference'},
 review_source_document:{name:'Review private source document',description:'Retrieve up to four cited working-text sections and a provisional purpose checklist. Literal query matching only; no verified facts, semantic completeness, original PDF interpretation or actions.',feature:'core',roles:all,schema:z.object({documentId:valueId,documentAccessReference:z.union([z.string().min(1).max(240),reference]),query:z.union([z.string().max(200),reference])}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'documentId, documentAccessReference, sections, totalSections, reviewQuestions, cautions'},
 review_team_transaction:{name:'Review shared transaction work',description:'Read the current explicitly shared summary and follow-ups; never private investor/mailbox/files, changed sources or verified outcomes. No mutation.',feature:'transaction-coordinator',roles:all,schema:z.object({teamId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'teamId, transactionTeamAccessReference, coordination'},
 review_transaction:{name:'Review private transaction',description:'Read current employee reports, missing facts, issues and unsent title preparation. No file text, shared mailbox access or verified outcome.',feature:'transaction-coordinator',roles:all,schema:z.object({transactionId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'transactionId, transactionAccessReference, reports, preparation'},
 prepare_property_outreach:{name:'Prepare property Inbox draft',description:'Save an existing eligible property package into the owned company email or selected matching account. Preserves employee edits. Never sends or approves.',feature:'deal-marketing',roles:['dispositions','manager'],schema:z.object({packageId:valueId,accountId:z.union([valueId,z.null()])}).strict(),estimatedCents:0,maximumCents:0,effect:'private_draft',output:'packageId, threadId, hasDraft, liveDelivery false'},
 prepare_title_email:{name:'Prepare title Inbox draft',description:'Save current private title preparation only when explicitly requested. Exact current sources and account required; never send or change milestones. Reuses existing drafts and preserves edits.',feature:'transaction-coordinator',roles:all,schema:z.object({transactionId:valueId,accountId:valueId,transactionAccessReference:z.union([z.string().min(1).max(240),reference])}).strict(),estimatedCents:0,maximumCents:0,effect:'private_draft',output:'transactionId, transactionAccessReference, threadId, hasDraft, liveDelivery false'},
 request_information:{name:'Ask for missing information',description:'Ask the employee for a property, investor, text, number or explicit time. Wait for their answer; never invent it. Use answer (or propertyId/investorId) in dependent steps. Answers are supplied information, not approval or verified CRM facts.',feature:'core',roles:all,schema:workQuestionSchema,estimatedCents:0,maximumCents:0,effect:'read',output:'answer, provenance, questionReference; propertyId/investorId for record selections'},
 inspect_property:{name:'Read property facts',description:'Retrieve current authorized fictional property facts.',feature:'core',roles:all,schema:z.object({propertyId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'propertyId, property'},
 match_existing_buyers:{name:'Prepare existing-buyer shortlist',description:'Match current permitted CRM buy boxes first, with relationship concerns, pauses and sourced next actions. Fit does not imply interest. Fictional analysis cost.',feature:'buyer-matchmaker',roles:['dispositions','manager'],schema:z.object({propertyId:valueId}).strict(),estimatedCents:40,maximumCents:50,effect:'read',output:'propertyId, property, matches[] (investorId, fit score, readiness, nextAction, funding, timing, evidence, cautions), buyerShortlistReference'},
 relationship_next_step:{name:'Prepare relationship next step',description:'Use sourced relationship history and saved employee preferences. Produces a relationship-only draft; nothing is sent. Fictional analysis cost.',feature:'investor-relationship',roles:['dispositions','manager'],schema:z.object({investorId:valueId}).strict(),estimatedCents:35,maximumCents:50,effect:'read',output:'investorId, recommendation (action, draft, evidence, unknowns)'},
 review_investment_analysis:{name:'Review investment scenario',description:'Read a current private, employee-reviewed flip/rental calculation, sensitivities and unresolved assumptions. No market fetch, verified value or action.',feature:'deal-analyst',roles:['dispositions','manager'],schema:z.object({analysisId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'analysisId, analysisReview'},
 review_diligence_analysis:{name:'Review diligence scenario',description:'Review current private sourced assumptions, provisional comparable screening and shared deal calculations. No appraisal, publication or offer.',feature:'valuation-diligence',roles:['acquisitions','manager'],schema:z.object({analysisId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'analysisId, analysisReview'},
 review_opportunity:{name:'Review wholesaler opportunity',description:'Read a saved pre-inventory wholesaler submission, revisions, possible duplicates and missing-fact follow-up draft. Deterministic local review; no valuation, publication or delivery.',feature:'acquisition-lead',roles:['acquisitions','manager'],schema:z.object({opportunityId:valueId}).strict(),estimatedCents:0,maximumCents:0,effect:'read',output:'opportunityId, opportunityReview'},
 review_handoff:{name:'Review acquisition handoff',description:'Review recorded property/release facts and missing handoff information. This does not perform valuation or publish a release. Fictional analysis cost.',feature:'acquisition-disposition',roles:['acquisitions','manager'],schema:z.object({propertyId:valueId}).strict(),estimatedCents:50,maximumCents:75,effect:'read',output:'propertyId, property, releases[], missing[]'},
 office_priorities:{name:'Prepare office priorities',description:'Read permitted office workload and identify recorded overdue work. No private mail/chat, assignment changes or verified sales metrics. Fictional analysis cost.',feature:'team-performance',roles:['manager'],schema:z.object({}).strict(),estimatedCents:50,maximumCents:75,effect:'read',output:'overview (summary, tasks, overdue, pendingApprovals, activeJobs)'},
 create_followup:{name:'Save requested follow-up',description:'Create the explicitly requested personal internal task. Does not send, change CRM or assign a teammate.',feature:'daily-coordinator',roles:all,schema:z.object({title:z.union([z.string().trim().min(3).max(240),reference]),investorId:z.union([valueId,z.null()]),dueAt:z.union([z.string().datetime({offset:true}),reference,z.null()])}).strict(),estimatedCents:0,maximumCents:0,effect:'personal_task',output:'taskId, task'},
 start_synthetic_research:{name:'Start fictional investor research',description:'Start a synthetic-fixture child research job only after existing buyers are considered. No external provider or verified contacts. Include await_synthetic_research in the same plan. Fictional research cost.',feature:'investor-hunter',roles:['dispositions','manager'],schema:z.object({propertyId:valueId,limit:z.union([z.number().int().min(1).max(12),reference])}).strict(),estimatedCents:150,maximumCents:225,effect:'synthetic_research',output:'jobId, propertyId'},
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
// Explicit audited local-only scope. A future paid capability must not inherit included pricing.
const includedLocalCapabilities=new Set(['review_qualification','prepare_opportunity_intake','prepare_handoff_action','prepare_property_outreach','review_source_document','review_team_transaction','review_transaction','prepare_title_email','request_information','inspect_property','match_existing_buyers','relationship_next_step','review_investment_analysis','review_diligence_analysis','review_opportunity','review_handoff','office_priorities','create_followup','start_synthetic_research','await_synthetic_research']);
export function estimateWorkStep(actor:Actor,step:WorkStepInput,includedLocal=false){
 const item=definition(step.capabilityId);requireRole(actor,item.roles);requireFeature(actor,item.feature);
 if(includedLocal){if(!includedLocalCapabilities.has(step.capabilityId))throw new AppError(409,'This capability needs a separately admitted paid allocation before it can join the assignment.');return {estimatedCents:0,maximumCents:0,rateVersion:'included-local-v1'};}
 return {estimatedCents:item.estimatedCents,maximumCents:item.maximumCents,rateVersion:'fictional-work-v1'};
}

/** Historical results retain their receipt, but never retain access to another person's records. */
export function validateStoredWorkOutput(actor:Actor,step:WorkStepInput,output:ToolResult,options:{retiredShortlist?:boolean}={}):void {
 assertActor(actor);requireRole(actor,definition(step.capabilityId).roles);
 const acquisition=(output.data as {acquisitionReview?:{property:{id:string};version:number;method:{version:number}}}|undefined)?.acquisitionReview;
 const handoff=(output.data as {overview?:{handoffs?:{handoffAccessReference:string}}}|undefined)?.overview?.handoffs;
 if(handoff&&!handoffReferenceCurrent(actor,handoff.handoffAccessReference))throw new AppError(409,'The handoff evidence changed. Prepare a fresh office review.');
 if(acquisition){const current=reviewAcquisition(actor,acquisition.property.id);if(current.version!==acquisition.version||JSON.stringify(current.property)!==JSON.stringify(acquisition.property)||acquisition.method.version!==acquisitionMethod.version)throw new AppError(409,'The acquisition source changed. Prepare a fresh handoff review.');}
 const inspect=(value:unknown,depth=0)=>{
  if(!value||typeof value!=='object'||depth>14)return;
  if(Array.isArray(value)){value.forEach(item=>inspect(item,depth+1));return;}
  if('$step' in value)return;
  for(const [key,item] of Object.entries(value)){
   if(typeof item==='string'){
    if(key==='buyerShortlistReference'&&!options.retiredShortlist&&!buyerShortlistReferenceCurrent(actor,item))throw new AppError(409,'Buyer criteria or relationship context changed. Refresh this shortlist.');
    if(key==='documentAccessReference'&&!documentContextReferenceCurrent(actor,item))throw new AppError(409,'The source document changed. Retrieve its current revision.');
    if(key==='documentId'&&step.capabilityId==='review_source_document')getDocument(actor,item);
    if(key==='transactionTeamAccessReference'&&!teamContextReferenceCurrent(actor,item))throw new AppError(409,'Shared coordination changed. Retrieve current team work.');
    if(key==='teamId')getTransactionTeam(actor,item);
    if(key==='transactionAccessReference'&&!transactionReferenceCurrent(actor,item))throw new AppError(409,'The transaction source changed. Prepare current transaction work.');
    if(key==='transactionId')getTransaction(actor,item);
    if(key==='analysisAccessReference'&&!analysisReferenceCurrent(actor,item))throw new AppError(409,'The analysis source changed. Prepare a fresh review.');
    if(key==='analysisId'||key==='id'&&/^analysis_/.test(item)){const detail=getAnalysis(actor,item);if(key==='analysisId'&&step.capabilityId.startsWith('review_')&&step.capabilityId.endsWith('_analysis')&&detail.record.input.lens!==(step.capabilityId==='review_investment_analysis'?'investment':'diligence'))throw new AppError(409,'This scenario belongs to a different specialist.');}
    if(key==='qualificationReference'&&!qualificationReferenceCurrent(actor,item))throw new AppError(409,'The qualification evidence changed. Prepare a fresh review.');
    if(key==='rolePreparationReference'&&typeof item==='string'&&!rolePreparationReferenceCurrent(actor,item))throw new AppError(409,'This prepared action changed. Review its current status.');
   if(key==='opportunityAccessReference'&&!opportunityReferenceCurrent(actor,item))throw new AppError(409,'The opportunity source changed. Prepare a fresh review.');
    if(key==='opportunityId'||key==='id'&&/^opportunity_/.test(item))getOpportunity(actor,item);
    if(key==='investorId'||key==='matchedInvestorId'||key==='id'&&/^investor[-_]/.test(item))readInvestor(actor,item);
    if(key==='propertyId'||key==='id'&&/^property[-_]/.test(item))readProperty(actor,item);
    if(key==='releaseId'&&/^opportunity_/.test(item))getOpportunity(actor,item);
    else if(key==='releaseId'||key==='id'&&/^release_/.test(item))getRelease(actor,item);
    if(key==='jobId'||key==='id'&&/^research_/.test(item)){const job=getResearchJob(actor,item);if(job.ownerId!==actor.id&&actor.role!=='manager')throw new AppError(404,'Research is no longer accessible.');}
    if(key==='taskId'||key==='id'&&/^task[-_]/.test(item)){
     const row=getDb().prepare('SELECT owner_id,investor_id FROM tasks WHERE id=? AND organization_id=? AND office_id=?').get(item,actor.organizationId,actor.officeId) as {owner_id:string;investor_id:string|null}|undefined;
     if(!row||row.owner_id!==actor.id&&actor.role!=='manager')throw new AppError(404,'A task in this result is no longer accessible.');if(row.investor_id)readInvestor(actor,row.investor_id);
    }
   }else inspect(item,depth+1);
  }
 };inspect(step.input);inspect(output.data);inspect(output.artifacts);
}

export function validateConcreteWorkInput(actor:Actor,step:WorkStepInput):Record<string,unknown> {
 const item=definition(step.capabilityId);requireRole(actor,item.roles);requireFeature(actor,item.feature);rejectUnsafeKeys(step.input);
 // References must already have been resolved by the worker; schema validation is repeated here.
 const unresolved=(value:unknown):boolean=>!!value&&typeof value==='object'&&('$step' in value||Object.values(value).some(unresolved));
 if(unresolved(step.input))throw new AppError(400,'Resolve the required prior result before executing this step.');
 const input:Record<string,unknown>=step.capabilityId==='await_synthetic_research'?z.object({jobId:id}).strict().parse(step.input):item.schema.parse(step.input) as Record<string,unknown>;
 validateStoredWorkOutput(actor,step,{specialistIds:[],message:'',artifacts:[]});
 return input;
}
export function executeWorkCapability(actor:Actor,step:WorkStepInput,_priorOutputs:Record<string,ToolResult>):ToolResult {
 const item=definition(step.capabilityId),input=validateConcreteWorkInput(actor,step);
 const result:ToolResult={specialistIds:item.feature==='core'?[]:[item.feature],message:'',artifacts:[]};
 switch(step.capabilityId){
  case 'review_source_document':return reviewSourceDocument(actor,input);
  case 'review_team_transaction':return teamTransactionReviewResult(actor,String(input.teamId));
  case 'review_transaction':return transactionReviewResult(actor,input.transactionId as string);
  case 'review_qualification':return qualificationResult(actor,String(input.investorId));
  case 'prepare_opportunity_intake':return prepareOpportunityIntake(actor,input);
  case 'prepare_handoff_action':return prepareHandoffAction(actor,input);
  case 'prepare_property_outreach':return preparePropertyOutreachResult(actor,input as {packageId:string;accountId:string|null});
  case 'prepare_title_email':return prepareTitleResult(actor,input as {transactionId:string;accountId:string;transactionAccessReference:string},`title-work:${createHash('sha256').update(JSON.stringify([actor.organizationId,actor.officeId,actor.id,input])).digest('hex')}`);
  case 'request_information':throw new AppError(409,'This step requires the employee’s answer through the saved job.');
  case 'inspect_property':{const property=readProperty(actor,input.propertyId as string);result.data={propertyId:property.id,property};result.message=`${property.address}: ${property.status}, $${property.price.toLocaleString()}, ${property.county} County. Fictional property record.`;break;}
  case 'match_existing_buyers':{
   const matched=matchBuyers(actor,input.propertyId as string);result.data={propertyId:matched.property.id,...matched};result.message=buyerShortlistMessage(matched);break;
  }
  case 'relationship_next_step':{const recommendation=recommendInvestorNextStep(actor,input.investorId as string);result.data={investorId:input.investorId,recommendation};result.message=`${recommendation.action.title}\n${recommendation.action.description}${recommendation.draft?`\n\nRelationship-only draft: ${recommendation.draft}`:''}\n${recommendation.unknowns.length?`Missing: ${recommendation.unknowns.join('; ')}\n`:''}Nothing has been sent.`;break;}
  case 'review_investment_analysis':case 'review_diligence_analysis':{const review=reviewSavedAnalysis(actor,input.analysisId as string);result.data={analysisId:review.record.id,analysisReview:review};result.message=analysisMessage(review);result.artifacts=[{type:'analysis',id:review.record.id,title:'Review deal analysis',data:{analysisAccessReference:review.analysisAccessReference}}];break;}
  case 'review_opportunity':{const review=reviewOpportunityScreening(actor,input.opportunityId as string);result.data={opportunityId:review.opportunity.id,opportunityReview:review};result.message=opportunityScreeningMessage(review);result.artifacts=[{type:'opportunity',id:review.opportunity.id,title:'Review wholesaler opportunity',data:{opportunityAccessReference:review.opportunityAccessReference,screening:review.screening}}];break;}
  case 'review_handoff':{
   const review=reviewAcquisition(actor,input.propertyId as string),releases=listReleases(actor).filter(r=>r.propertyId===review.property.id);
   result.data={propertyId:review.property.id,property:review.property,releases,missing:review.questions.map(item=>item.reason),acquisitionReview:review};result.message=review.handoffDraft;break;
  }
  case 'office_priorities':{const overview=getManagementOverview(actor);result.data={overview};result.artifacts=[{type:'handoff',title:'Review shared handoffs',data:{handoffAccessReference:overview.handoffs.handoffAccessReference}}];result.message=`${overview.summary}\n${overview.handoffs.summary}\n${overview.handoffs.items.slice(0,8).map(item=>`${item.address}: ${item.nextStep} ${item.evidence.join(' ')}`).join('\n')}\n${overview.overdue.length?`Recorded overdue work: ${overview.overdue.slice(0,8).map(t=>t.title).join('; ')}.`:'No overdue tasks are recorded in this office view.'}\nLocal workload evidence only; no private mailbox access or verified sales-performance claim.`;break;}
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

/** An explicit plan revision can refresh matching without rerunning or discarding its paid receipt.
 * Retired output is withheld on display and may not feed any unfinished transitive dependency.
 */
export function retiredBuyerShortlists(steps:Array<WorkStepInput & {status:string}>):Set<string> {
 const retired=new Set<string>();
 const uses=(step:WorkStepInput,key:string,seen=new Set<string>()):boolean=>{
  if(seen.has(step.key))return false;seen.add(step.key);
  return step.dependsOn.some(parent=>parent===key||!!steps.find(s=>s.key===parent&&uses(s,key,seen)));
 };
 steps.forEach((step,index)=>{
  if(step.status!=='completed'||step.capabilityId!=='match_existing_buyers')return;
  const replacement=steps.slice(index+1).some(s=>s.capabilityId==='match_existing_buyers'&&JSON.stringify(s.input)===JSON.stringify(step.input));
  if(replacement&&!steps.some(s=>s.status!=='completed'&&uses(s,step.key)))retired.add(step.key);
 });
 return retired;
}
