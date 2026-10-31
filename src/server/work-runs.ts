import {bindAssignment,getAssignmentBinding,withAssignment} from './assignment-roots';
import {createHash} from 'node:crypto';
import type {AnswerWorkInput} from '../lib/work-contracts';
import {getWorkQuestion,nextReadyStep,parseWorkAnswer} from './work-questions';
import {readProperty} from './access';
import {z} from 'zod';
import type {Actor,Role,ToolResult} from '../lib/contracts';
import type {CreateWorkRunInput,ControlWorkRunInput,DecideWorkCostInput,ReviseWorkRunInput,WorkRun,WorkRunEvent,WorkRunStatus,WorkStep,WorkStepInput,WorkSourceReferences} from '../lib/work-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {requireFeature} from './billing';
import {validateWorkSourceReferences} from './work-context';
import {quoteWorkBudget,getWorkBudget,decideWorkBudget,reserveWorkBudget,consumeWorkBudget,releaseWorkBudget} from './work-budget';
import {validateWorkSteps,validateConcreteWorkInput,estimateWorkStep,executeWorkCapability,validateStoredWorkOutput,WorkCapabilityPending,cancelWorkChildren} from './work-capabilities';

const id=z.string().trim().min(1).max(150);
const stepKey=z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/,'Use a short step key containing letters, numbers, underscores or dashes.');
const stepSchema=z.object({key:stepKey,capabilityId:id,input:z.record(z.string(),z.unknown()),dependsOn:z.array(stepKey).max(12)}).strict();
const sourceReferencesSchema=z.object({assignmentReviews:z.array(z.string().min(1).max(400)).max(200).optional(),documentAccess:z.array(z.string().min(1).max(240)).max(200).optional(),transactionTeamAccess:z.array(z.string().min(1).max(240)).max(200).optional(),transactionAccess:z.array(z.string().min(1).max(240)).max(200).optional(),knowledgeAccess:z.array(z.string().min(1).max(300)).max(200).optional(),updatesAccess:z.array(z.string().min(1).max(500)).max(200).optional(),analysisAccess:z.array(z.string().min(1).max(200)).max(200).optional(),opportunityAccess:z.array(z.string().min(1).max(200)).max(200).optional(),workQuestions:z.array(z.string().min(1).max(200)).max(200).optional(),handoffAccess:z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(200).optional(),investors:z.array(id).max(200),properties:z.array(id).max(200),releases:z.array(id).max(200),packages:z.array(id).max(200),debriefs:z.array(id).max(200),inboxThreads:z.array(id).max(200),inboxAccess:z.array(z.string().min(1).max(500)).max(200)}).strict();
export const createWorkRunSchema=z.object({requestId:id,title:z.string().trim().min(3).max(180),instructions:z.string().trim().min(3).max(6000),conversationId:id.optional(),steps:z.array(stepSchema).min(1).max(12),sourceReferences:sourceReferencesSchema.optional()}).strict();
const change={expectedVersion:z.number().int().positive(),eventKey:id};
export const reviseWorkRunSchema=z.object({...change,title:z.string().trim().min(3).max(180).optional(),instructions:z.string().trim().min(3).max(6000),steps:z.array(stepSchema).min(1).max(12)}).strict();
export const controlWorkRunSchema=z.object({...change,action:z.enum(['pause','resume','cancel'])}).strict();
export const decideWorkCostSchema=z.object({...change,quoteId:id,decision:z.enum(['approve','deny'])}).strict();
export const answerWorkSchema=z.object({...change,questionReference:z.string().regex(/^Q[0-9A-F]{16}$/),answer:z.string().trim().min(1).max(2000)}).strict();

type StoredRun=Omit<WorkRun,'budget'|'events'|'contentRestricted'> & {sourceReferences?:WorkSourceReferences;sourceRole?:Role};
interface RunRow {id:string;organization_id:string;office_id:string;owner_id:string;request_hash:string;status:WorkRunStatus;lease_token:string|null;lease_expires_at:string|null;lease_step_key:string|null;data:string}
export interface WorkStepClaim {runId:string;stepKey:string;token:string;organizationId:string;officeId:string;ownerId:string;planVersion:number}
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const terminal=new Set<WorkRunStatus>(['completed','canceled']);
const emptyResult:ToolResult={specialistIds:[],message:'',artifacts:[]};
const leaseDurationMs=60_000;
function stable(value:unknown):unknown {if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]));return value;}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const inputOf=(step:WorkStep):WorkStepInput=>({key:step.key,capabilityId:step.capabilityId,input:step.input,dependsOn:step.dependsOn});
function readRow(actor:Actor,runId:string):RunRow {
 assertActor(actor);const row=getDb().prepare('SELECT * FROM work_runs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id.parse(runId),...scope(actor)) as RunRow|undefined;
 if(!row)throw new AppError(404,'Work not found in your workspace.');return row;
}
function write(run:StoredRun,clearLease=false){
 run.version++;run.updatedAt=now();
 getDb().prepare(`UPDATE work_runs SET status=?,version=?,plan_version=?,data=?,updated_at=?${clearLease?',lease_token=NULL,lease_expires_at=NULL,lease_step_key=NULL':''} WHERE id=?`).run(run.status,run.version,run.planVersion,JSON.stringify(run),run.updatedAt,run.id);
}
function appendEvent(run:StoredRun,kind:string,message:string,stepKey:string|null=null){
 const entry:WorkRunEvent={id:newId('work_event'),kind,message,createdAt:now(),planVersion:run.planVersion,stepKey};
 getDb().prepare('INSERT INTO work_run_events VALUES(?,?,?,?)').run(entry.id,run.id,JSON.stringify(entry),entry.createdAt);
}
function actorFor(row:RunRow):Actor {
 const member=getDb().prepare('SELECT u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.office_id=? AND m.user_id=?').get(row.organization_id,row.office_id,row.owner_id) as {name:string;role:Role}|undefined;
 if(!member)throw new AppError(403,'The work owner is no longer authorized.');
 return {id:row.owner_id,name:member.name,role:member.role,organizationId:row.organization_id,officeId:row.office_id};
}
function concreteStep(step:WorkStep):WorkStepInput {return {...inputOf(step),input:step.resolvedInput??step.input};}
function display(actor:Actor,row:RunRow):WorkRun {
 const run=JSON.parse(row.data) as StoredRun;
 const events=(getDb().prepare('SELECT data FROM work_run_events WHERE run_id=? ORDER BY rowid DESC LIMIT 100').all(run.id) as {data:string}[]).reverse().map(item=>JSON.parse(item.data) as WorkRunEvent);
 const {sourceReferences,sourceRole,...visibleRun}=run;
 let restricted=false;
 try{validateWorkSourceReferences(actor,sourceReferences,sourceRole);}catch(error){if(error instanceof AppError&&[403,404,409].includes(error.status))restricted=true;else throw error;}
 for(const step of run.steps){try{validateStoredWorkOutput(actor,concreteStep(step),step.result??emptyResult);}catch(error){if(error instanceof AppError&&[403,404,409].includes(error.status)){restricted=true;break;}throw error;}}
 if(!restricted)return {...visibleRun,question:getWorkQuestion(actor,run),budget:getWorkBudget(actor,run.id),events,contentRestricted:false};
 return {...visibleRun,title:'Saved work with restricted context',instructions:'Some source records are no longer available. Saved content is hidden; you can still stop this work.',lastError:'Current source access is required to inspect or continue this work.',steps:run.steps.map((step,index)=>({...step,key:`step-${index+1}`,input:{},resolvedInput:null,dependsOn:[],result:null,error:null})),budget:getWorkBudget(actor,run.id),events:events.map(entry=>({...entry,message:'Saved work history; source content is restricted.',stepKey:null})),contentRestricted:true};
}
export function getWorkRun(actor:Actor,runId:string):WorkRun {return display(actor,readRow(actor,runId));}
export function listWorkRuns(actor:Actor):WorkRun[] {
 assertActor(actor);return (getDb().prepare("SELECT * FROM work_runs WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY CASE WHEN status IN ('completed','canceled') THEN 1 ELSE 0 END,updated_at DESC LIMIT 100").all(...scope(actor)) as RunRow[]).map(row=>display(actor,row));
}

function checkInputTree(value:unknown,step:WorkStepInput,keys:Set<string>,depth=0):void {
 if(depth>12)throw new AppError(400,'Work inputs are too deeply nested.');
 if(Array.isArray(value)){if(value.length>200)throw new AppError(400,'A work input list is too large.');for(const item of value)checkInputTree(item,step,keys,depth+1);return;}
 if(!value||typeof value!=='object')return;
 const object=value as Record<string,unknown>;
 if(Object.keys(object).some(key=>['__proto__','prototype','constructor'].includes(key)))throw new AppError(400,'Unsupported work input field.');
 if('$step' in object){
  if(Object.keys(object).length!==2||typeof object.$step!=='string'||typeof object.path!=='string'||!keys.has(object.$step)||!step.dependsOn.includes(object.$step))throw new AppError(400,'Result references must identify a declared step dependency and a data path.');
  const path=object.path.split('.');if(!object.path||path.length>10||path.some(part=>!/^([a-zA-Z][a-zA-Z0-9_]*|\d+)$/.test(part)||['__proto__','constructor','prototype'].includes(part)))throw new AppError(400,'This result reference path is not supported.');return;
 }
 for(const child of Object.values(object))checkInputTree(child,step,keys,depth+1);
}
function validatePlan(actor:Actor,steps:WorkStepInput[]):WorkStepInput[] {
 const parsed=z.array(stepSchema).min(1).max(12).parse(steps);
 if(JSON.stringify(parsed).length>50_000)throw new AppError(400,'This work plan is too large.');
 const keys=new Set(parsed.map(step=>step.key));if(keys.size!==parsed.length)throw new AppError(400,'Every work step needs a unique key.');
 for(const step of parsed){if(new Set(step.dependsOn).size!==step.dependsOn.length||step.dependsOn.some(key=>key===step.key||!keys.has(key)))throw new AppError(400,'Step dependencies must name other steps in this plan.');checkInputTree(step.input,step,keys);}
 const finished=new Set<string>(),visiting=new Set<string>();
 function visit(key:string){if(finished.has(key))return;if(visiting.has(key))throw new AppError(400,'Work dependencies must not form a cycle.');visiting.add(key);for(const dependency of parsed.find(step=>step.key===key)!.dependsOn)visit(dependency);visiting.delete(key);finished.add(key);}
 for(const key of keys)visit(key);
 return validateWorkSteps(actor,parsed);
}
function makeSteps(actor:Actor,inputs:WorkStepInput[],planVersion:number,old:WorkStep[]=[]):WorkStep[] {
 return inputs.map(input=>{
  const completed=old.find(step=>step.key===input.key&&step.status==='completed');
  if(completed){if(hash(inputOf(completed))!==hash(input))throw new AppError(409,'Completed steps cannot be changed or repeated. Add a new step key for new work.');return completed;}
  const estimate=estimateWorkStep(actor,input);
  if(!Number.isSafeInteger(estimate.estimatedCents)||!Number.isSafeInteger(estimate.maximumCents)||estimate.estimatedCents<0||estimate.maximumCents<estimate.estimatedCents)throw new AppError(500,'A capability returned an invalid cost estimate.');
  return {...input,...estimate,planVersion,status:'pending',resolvedInput:null,result:null,error:null,attempts:0,startedAt:null,completedAt:null};
 });
}
function savePlan(actor:Actor,run:StoredRun){
 const spent=run.planVersion===1?0:getWorkBudget(actor,run.id).spentCents;
 const pending=run.steps.filter(step=>step.status!=='completed');
 const quoteInput={runId:run.id,planVersion:run.planVersion,planHash:hash({title:run.title,instructions:run.instructions,sourceReferences:run.sourceReferences,sourceRole:run.sourceRole,steps:run.steps.map(step=>({...inputOf(step),estimatedCents:step.estimatedCents,maximumCents:step.maximumCents,rateVersion:step.rateVersion}))}),estimatedCents:spent+pending.reduce((sum,step)=>sum+step.estimatedCents,0),maximumCents:spent+pending.reduce((sum,step)=>sum+step.maximumCents,0)};
 const budget=quoteWorkBudget(actor,quoteInput);
 getDb().prepare('INSERT INTO work_run_plans VALUES(?,?,?,?,?)').run(run.id,run.planVersion,quoteInput.planHash,JSON.stringify({title:run.title,instructions:run.instructions,sourceReferences:run.sourceReferences,sourceRole:run.sourceRole,steps:run.steps.map(inputOf),quoteInput}),now());
 run.status=budget.status==='awaiting_approval'?'waiting_cost_approval':'queued';run.lastError=null;
 if(nextReadyStep(run.steps)?.capabilityId==='request_information'){run.status='waiting_for_input';run.lastError='Answer the pending question to continue this saved job.';}
}
function refreshBudget(actor:Actor,run:StoredRun){
 const row=getDb().prepare('SELECT data FROM work_run_plans WHERE run_id=? AND plan_version=?').get(run.id,run.planVersion) as {data:string};
 const plan=JSON.parse(row.data) as {quoteInput:Parameters<typeof quoteWorkBudget>[1]};
 return quoteWorkBudget(actor,plan.quoteInput);
}
export function createWorkRun(actor:Actor,input:CreateWorkRunInput):WorkRun {
 const parsed=createWorkRunSchema.parse(input);assertActor(actor);const digest=hash(parsed);
 const runId=getDb().transaction(()=>{
  const prior=getDb().prepare('SELECT id,request_hash FROM work_runs WHERE organization_id=? AND office_id=? AND owner_id=? AND request_id=?').get(...scope(actor),parsed.requestId) as {id:string;request_hash:string}|undefined;
  if(prior){if(prior.request_hash!==digest)throw new AppError(409,'This request already represents different work.');if(!getAssignmentBinding(actor,{kind:'work',id:prior.id}))withAssignment(actor,{kind:'work',id:prior.id},()=>null);bindAssignment(actor,{kind:'work',id:prior.id});return prior.id;}
  requireFeature(actor,'core');validateWorkSourceReferences(actor,parsed.sourceReferences);const inputs=validatePlan(actor,parsed.steps);
  if(parsed.conversationId&&!getDb().prepare('SELECT 1 FROM conversations WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(parsed.conversationId,...scope(actor)))throw new AppError(404,'Conversation not found in your workspace.');
  const stamp=now(),run:StoredRun={id:newId('work'),ownerId:actor.id,title:parsed.title,instructions:parsed.instructions,conversationId:parsed.conversationId??null,version:1,planVersion:1,status:'queued',steps:makeSteps(actor,inputs,1),createdAt:stamp,updatedAt:stamp,lastError:null,simulation:true,...(parsed.sourceReferences?{sourceReferences:parsed.sourceReferences,sourceRole:actor.role}:{})};
  getDb().prepare('INSERT INTO work_runs(id,organization_id,office_id,owner_id,request_id,request_hash,status,version,plan_version,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(run.id,...scope(actor),parsed.requestId,digest,run.status,run.version,run.planVersion,JSON.stringify(run),stamp,stamp);
  bindAssignment(actor,{kind:'work',id:run.id});savePlan(actor,run);getDb().prepare('UPDATE work_runs SET status=?,data=? WHERE id=?').run(run.status,JSON.stringify(run),run.id);
  appendEvent(run,'created',run.status==='waiting_for_input'?'Work saved. Answer the pending question to continue.':run.status==='waiting_cost_approval'?'Work saved. Review the complete simulated estimate before it starts.':'Work saved and queued with a bounded simulated estimate.');
  audit(actor,'work.created',run.id,{planVersion:1,stepCount:run.steps.length,simulated:true});return run.id;
 }).immediate();return getWorkRun(actor,runId);
}
function changeRun(actor:Actor,runId:string,input:{expectedVersion:number;eventKey:string},kind:string,payload:unknown,change:(run:StoredRun)=>void):WorkRun {
 assertActor(actor);const digest=hash({runId,kind,payload});
 getDb().transaction(()=>{
  const row=readRow(actor,runId),run=JSON.parse(row.data) as StoredRun;
  const old=getDb().prepare('SELECT run_id,payload_hash FROM work_run_commands WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope(actor),input.eventKey) as {run_id:string;payload_hash:string}|undefined;
  if(old){if(old.run_id!==runId||old.payload_hash!==digest)throw new AppError(409,'This event already represents different work.');return;}
  if(run.version!==input.expectedVersion)throw new AppError(409,'This work changed. Reload its current state before continuing.');
  change(run);write(run,true);
  getDb().prepare('INSERT INTO work_run_commands VALUES(?,?,?,?,?,?,?)').run(...scope(actor),input.eventKey,runId,digest,now());
  audit(actor,`work.${kind}`,runId,{planVersion:run.planVersion,simulated:true});
 }).immediate();return getWorkRun(actor,runId);
}
export function reviseWorkRun(actor:Actor,runId:string,input:ReviseWorkRunInput):WorkRun {
 const parsed=reviseWorkRunSchema.parse(input);return changeRun(actor,runId,parsed,'revised',parsed,run=>{
  requireFeature(actor,'core');validateWorkSourceReferences(actor,run.sourceReferences,run.sourceRole);if(terminal.has(run.status)||run.status==='reconciling')throw new AppError(409,'This work cannot be revised in its current state.');
  const inputs=validatePlan(actor,parsed.steps);
  for(const step of run.steps.filter(step=>step.status==='completed'))if(!inputs.some(item=>item.key===step.key&&hash(item)===hash(inputOf(step))))throw new AppError(409,'Retain completed steps unchanged; revise only the work still to do.');
  run.planVersion++;run.title=parsed.title??run.title;run.instructions=parsed.instructions;run.steps=makeSteps(actor,inputs,run.planVersion,run.steps);savePlan(actor,run);
  appendEvent(run,'revised','Instructions and remaining work revised. Earlier completed results remain in history.');
 });
}
/** An authenticated employee supplies information, never cost/action approval. */
export function answerWorkQuestion(actor:Actor,runId:string,input:AnswerWorkInput):WorkRun {
 const parsed=answerWorkSchema.parse(input);return changeRun(actor,runId,parsed,'answered',parsed,run=>{
  requireFeature(actor,'core');validateWorkSourceReferences(actor,run.sourceReferences,run.sourceRole);validatePlan(actor,run.steps.map(inputOf));
  for(const step of run.steps.filter(step=>step.status==='completed'))validateStoredWorkOutput(actor,concreteStep(step),step.result??emptyResult);
  const question=getWorkQuestion(actor,run);
  if(!question||question.reference!==parsed.questionReference)throw new AppError(409,'This question or its source context changed. Retrieve the current question before answering.');
  const result=parseWorkAnswer(question,parsed.answer),step=run.steps.find(step=>step.key===question.stepKey)!;
  // Fill the server-authored starter's placeholder once its missing target is supplied.
  if(step.key==='choose_property'&&question.answerType==='property'&&['Prepare buyers: the selected property','Review handoff: the selected property'].includes(run.title)){
   const address=readProperty(actor,(result.data as {propertyId:string}).propertyId).address;
   run.title=run.title.replace('the selected property',address).slice(0,180);
   for(const pending of run.steps.filter(item=>item.status==='pending'&&item.key==='followup'&&item.capabilityId==='create_followup'))if(typeof pending.input.title==='string')pending.input={...pending.input,title:pending.input.title.replace('the selected property',address).slice(0,240)};
  }
  step.status='completed';step.result=result;step.resolvedInput=step.input;step.completedAt=now();step.error=null;
  // Reject incompatible answers before committing them, while the employee can still correct this question.
  for(const consumer of run.steps.filter(item=>item.status==='pending'&&item.dependsOn.includes(step.key)&&item.dependsOn.every(key=>run.steps.some(source=>source.key===key&&source.status==='completed')))){
   try{validateConcreteWorkInput(actor,{...inputOf(consumer),input:resolveWorkInput(consumer,run.steps)});}catch(error){if(error instanceof z.ZodError)throw new AppError(422,`This answer does not fit the next step: ${error.issues.map(issue=>issue.message).join('; ')}`);throw error;}
  }
  getDb().prepare('INSERT INTO work_step_receipts VALUES(?,?,?,?,?,?)').run(run.id,step.key,run.planVersion,hash(inputOf(step)),JSON.stringify({step:inputOf(step),resolvedInput:step.input,result,chargedCents:0}),now());
  appendEvent(run,'answer_received','Employee information saved; prior results are retained and the remaining job estimate will be refreshed.',step.key);
  run.planVersion++;run.steps=makeSteps(actor,run.steps.map(inputOf),run.planVersion,run.steps);savePlan(actor,run);
 });
}
export function controlWorkRun(actor:Actor,runId:string,input:ControlWorkRunInput):WorkRun {
 const parsed=controlWorkRunSchema.parse(input);return changeRun(actor,runId,parsed,parsed.action,parsed,run=>{
  if(terminal.has(run.status)||run.status==='reconciling')throw new AppError(409,'This work cannot be changed in its current state.');
  for(const step of run.steps)if(step.status==='running')step.status='pending';
  if(parsed.action==='cancel'){
   cancelWorkChildren(actor,run.steps);releaseWorkBudget(actor,run.id);for(const step of run.steps)if(step.status!=='completed')step.status='canceled';run.status='canceled';run.lastError=null;appendEvent(run,'canceled','Remaining work canceled. Completed work and consumed simulated credits are retained.');
  }else if(parsed.action==='pause'){
   if(!['queued','running','waiting_for_dependency'].includes(run.status))throw new AppError(409,'Only queued or running work can be paused.');run.status='paused';appendEvent(run,'paused','Work paused. Completed results and its credit reservation are retained.');
  }else{
   if(getWorkQuestion(actor,run))throw new AppError(409,'Answer the pending question before resuming this job.');
   requireFeature(actor,'core');validateWorkSourceReferences(actor,run.sourceReferences,run.sourceRole);validatePlan(actor,run.steps.map(inputOf));
   for(const step of run.steps)if(step.status==='failed')step.status='pending';
   const budget=refreshBudget(actor,run);run.status=budget.status==='awaiting_approval'?'waiting_cost_approval':'queued';run.lastError=null;appendEvent(run,'resumed',run.status==='waiting_cost_approval'?'Review the refreshed whole-job estimate before work resumes.':'Work queued to continue from its saved progress.');
  }
 });
}
export function decideWorkCost(actor:Actor,runId:string,input:DecideWorkCostInput):WorkRun {
 const parsed=decideWorkCostSchema.parse(input);return changeRun(actor,runId,parsed,`cost_${parsed.decision}`,parsed,run=>{
  if(run.status!=='waiting_cost_approval')throw new AppError(409,'This work is not waiting for a cost decision.');
  if(parsed.decision==='approve'){validateWorkSourceReferences(actor,run.sourceReferences,run.sourceRole);validatePlan(actor,run.steps.map(inputOf));}
  decideWorkBudget(actor,{runId:run.id,quoteId:parsed.quoteId,planVersion:run.planVersion,decision:parsed.decision,eventKey:parsed.eventKey});
  if(parsed.decision==='deny'){cancelWorkChildren(actor,run.steps);releaseWorkBudget(actor,run.id);for(const step of run.steps)if(step.status!=='completed')step.status='canceled';run.status='canceled';}
  else run.status='queued';
  run.lastError=null;appendEvent(run,`cost_${parsed.decision}`,parsed.decision==='approve'?'Employee approved the complete simulated job maximum.':'Employee declined the job estimate. Remaining work will not execute.');
 });
}

/** Resolve only own data properties in completed, explicitly declared dependencies. */
export function resolveWorkInput(step:WorkStepInput,steps:WorkStep[]):Record<string,unknown> {
 function resolve(value:unknown):unknown {
  if(Array.isArray(value))return value.map(resolve);
  if(!value||typeof value!=='object')return value;
  const object=value as Record<string,unknown>;
  if('$step' in object){
   const dependency=steps.find(item=>item.key===object.$step&&item.status==='completed');
   if(!dependency||!step.dependsOn.includes(dependency.key)||!dependency.result)throw new AppError(409,'A required step result is not available yet.');
   let current:unknown=dependency.result.data;
   for(const part of String(object.path).split('.')){
    if(['__proto__','prototype','constructor'].includes(part)||!current||typeof current!=='object'||!Object.prototype.hasOwnProperty.call(current,part))throw new AppError(409,'A required result field is missing. Revise the remaining work.');
    current=(current as Record<string,unknown>)[part];
   }
   return structuredClone(current);
  }
  return Object.fromEntries(Object.entries(object).map(([key,item])=>[key,resolve(item)]));
 }
 return resolve(step.input) as Record<string,unknown>;
}
function resetLeasedStep(run:StoredRun){for(const step of run.steps)if(step.status==='running')step.status='pending';}
function stopAfterFailure(row:RunRow,error:unknown){
 const run=JSON.parse(row.data) as StoredRun;resetLeasedStep(run);
 let unresolved=false;try{unresolved=getWorkBudget(actorFor(row),run.id).status==='unknown';}catch{/* Revoked membership still stops this run. */}
 run.status=unresolved?'reconciling':'waiting_for_input';run.lastError=unresolved?'A prior outcome is unresolved. Its reservation remains held until reconciliation.':error instanceof AppError?error.message:'The next step could not finish. Review this work before resuming.';
 appendEvent(run,'attention','Work paused before its next step. Review the current requirement to continue.');write(run,true);
}
export function claimNextWorkStep(actor?:Actor):WorkStepClaim|null {
 if(actor)assertActor(actor);
 return getDb().transaction(()=>{
  const rows=getDb().prepare(`SELECT * FROM work_runs WHERE status IN ('queued','running','waiting_for_dependency') AND (lease_expires_at IS NULL OR lease_expires_at<=?)${actor?' AND organization_id=? AND office_id=? AND owner_id=?':''} ORDER BY updated_at,id LIMIT 30`).all(now(),...(actor?scope(actor):[])) as RunRow[];
  for(const row of rows){
   const run=JSON.parse(row.data) as StoredRun;
   try{
    const owner=actorFor(row);requireFeature(owner,'core');validateWorkSourceReferences(owner,run.sourceReferences,run.sourceRole);resetLeasedStep(run);
    validatePlan(owner,run.steps.map(inputOf));
    for(const completed of run.steps.filter(step=>step.status==='completed'))validateStoredWorkOutput(owner,concreteStep(completed),completed.result??emptyResult);
    const step=run.steps.find(item=>item.status==='pending'&&item.dependsOn.every(key=>run.steps.some(dependency=>dependency.key===key&&dependency.status==='completed')));
    if(!step){
     if(run.steps.every(item=>item.status==='completed')){releaseWorkBudget(owner,run.id);run.status='completed';run.lastError=null;appendEvent(run,'completed','Every planned step completed. Unused simulated credits were released.');write(run,true);}
     else{run.status='waiting_for_input';run.lastError='No remaining step can proceed. Review its dependencies.';write(run,true);}continue;
    }
    if(step.capabilityId==='request_information'){run.status='waiting_for_input';run.lastError='Answer the pending question to continue this saved job.';appendEvent(run,'question_requested','A required answer is needed before the next step.',step.key);write(run,true);continue;}
    const budget=getWorkBudget(owner,run.id);
    if(budget.status==='awaiting_approval'){run.status='waiting_cost_approval';write(run,true);continue;}
    if(budget.status==='unknown'){run.status='reconciling';run.lastError='A prior outcome is unresolved. No additional work will execute.';write(run,true);continue;}
    if(budget.status!=='reserved'&&Date.parse(budget.expiresAt)<=Date.now()){run.status='waiting_cost_approval';run.lastError='The estimate expired. Refresh it before continuing.';write(run,true);continue;}
    reserveWorkBudget(owner,run.id);
    step.status='running';step.attempts++;step.startedAt=now();step.error=null;run.status='running';run.lastError=null;
    const token=newId('work_lease');write(run);
    getDb().prepare('UPDATE work_runs SET lease_token=?,lease_expires_at=?,lease_step_key=? WHERE id=?').run(token,new Date(Date.now()+leaseDurationMs).toISOString(),step.key,run.id);
    appendEvent(run,'step_started','A saved work step is ready to execute.',step.key);
    return {runId:run.id,stepKey:step.key,token,organizationId:row.organization_id,officeId:row.office_id,ownerId:row.owner_id,planVersion:run.planVersion};
   }catch(error){stopAfterFailure(row,error);}
  }
  return null;
 }).immediate();
}
function claimRow(claim:WorkStepClaim):RunRow|undefined {
 return getDb().prepare('SELECT * FROM work_runs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=? AND lease_token=? AND lease_step_key=? AND plan_version=?').get(claim.runId,claim.organizationId,claim.officeId,claim.ownerId,claim.token,claim.stepKey,claim.planVersion) as RunRow|undefined;
}
/** Local action, fictional debit and receipt commit atomically; interrupted local work is safe to reclaim. */
export function executeClaimedWorkStep(claim:WorkStepClaim):boolean {
 try{return getDb().transaction(()=>{
  const row=claimRow(claim);if(!row)return false;
  if(!row.lease_expires_at||Date.parse(row.lease_expires_at)<=Date.now())return false;
  const actor=actorFor(row),run=JSON.parse(row.data) as StoredRun;
  if(run.status!=='running')return false;requireFeature(actor,'core');validateWorkSourceReferences(actor,run.sourceReferences,run.sourceRole);validatePlan(actor,run.steps.map(inputOf));
  const step=run.steps.find(item=>item.key===claim.stepKey);if(!step||step.status!=='running')return false;
  for(const completed of run.steps.filter(item=>item.status==='completed'))validateStoredWorkOutput(actor,concreteStep(completed),completed.result??emptyResult);
  const resolvedInput=resolveWorkInput(step,run.steps),concrete={...inputOf(step),input:resolvedInput};
  const estimate=estimateWorkStep(actor,concrete);
  if(estimate.maximumCents>step.maximumCents||estimate.estimatedCents>step.estimatedCents||estimate.rateVersion!==step.rateVersion)throw new AppError(409,'The step estimate changed. Revise and review the remaining work before continuing.');
  reserveWorkBudget(actor,run.id);
  const result=withAssignment(actor,{kind:'work',id:run.id},()=>executeWorkCapability(actor,concrete,Object.fromEntries(run.steps.filter(item=>item.status==='completed'&&item.result).map(item=>[item.key,item.result!]))));
  if(!result||typeof result.message!=='string'||!Array.isArray(result.artifacts)||!Array.isArray(result.specialistIds))throw new AppError(500,'The work step did not return a verifiable result.');
  if(JSON.stringify(result).length>500_000)throw new AppError(500,'The work result is too large to save safely.');
  validateStoredWorkOutput(actor,concrete,result);
  consumeWorkBudget(actor,{runId:run.id,stepKey:step.key,amountCents:estimate.estimatedCents});
  step.status='completed';step.resolvedInput=resolvedInput;step.result=result;step.completedAt=now();step.error=null;
  getDb().prepare('INSERT INTO work_step_receipts VALUES(?,?,?,?,?,?)').run(run.id,step.key,run.planVersion,hash(concrete),JSON.stringify({step:inputOf(step),resolvedInput,result,chargedCents:estimate.estimatedCents}),now());
  appendEvent(run,'step_completed','A work step completed and its result was saved.',step.key);
  if(run.steps.every(item=>item.status==='completed')){releaseWorkBudget(actor,run.id);run.status='completed';appendEvent(run,'completed','Every planned step completed. Unused simulated credits were released.');}
  else run.status='queued';
  run.lastError=null;write(run,true);audit(actor,'work.step_completed',run.id,{stepKey:step.key,planVersion:run.planVersion,simulated:true});return true;
 }).immediate();}
 catch(error){
  getDb().transaction(()=>{
   const row=claimRow(claim);if(!row)return;const run=JSON.parse(row.data) as StoredRun;resetLeasedStep(run);
   if(error instanceof WorkCapabilityPending){run.status='waiting_for_dependency';run.lastError=error.message;appendEvent(run,'dependency_wait','Waiting for a linked work result; no additional simulated step charge was consumed.',claim.stepKey);write(run,true);getDb().prepare('UPDATE work_runs SET lease_expires_at=? WHERE id=?').run(new Date(Date.now()+2000).toISOString(),run.id);}
   else stopAfterFailure(row,error);
  }).immediate();return false;
 }
}
export function processWorkRuns(actor?:Actor,limit=1):number {
 const bounded=Math.max(1,Math.min(20,Math.floor(limit)));let completed=0;
 for(let index=0;index<bounded;index++){const claim=claimNextWorkStep(actor);if(!claim)break;if(executeClaimedWorkStep(claim))completed++;}
 return completed;
}
