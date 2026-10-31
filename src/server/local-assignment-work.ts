import type {Actor} from '../lib/contracts';
import {AppError,assertActor,getDb,now} from './db';
import {activeAssignment,getAssignmentBinding} from './assignment-roots';
import {getMeteredAssignment,finishMeteredAssignment} from './metered-work';
import type {TextState,TextPhase} from './text-execution';
import {fingerprint} from './provider-runtime';
import type {ResearchJob} from '../lib/contracts';
import {releaseUsage} from './metering';

interface LocalParent {assignmentId:string;bindingId:string;requestId:string}
interface Row {run_id:string;assignment_id:string;parent_binding_id:string;parent_request_id:string}
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function read(actor:Actor,runId:string):Row|undefined {
 assertActor(actor);return getDb().prepare('SELECT * FROM local_assignment_work WHERE run_id=? AND organization_id=? AND office_id=? AND user_id=?').get(runId,...owner(actor)) as Row|undefined;
}
/** Only actual admitted text execution may include local work in its existing reasoning charge. */
export function localWorkParent(actor:Actor):LocalParent|null {
 const binding=activeAssignment(actor);if(!binding||binding.host.kind!=='turn')return null;
 const execution=getDb().prepare('SELECT data,phase FROM text_executions WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=? AND binding_id=?').get(...owner(actor),binding.host.id,binding.id) as {data:string;phase:TextPhase}|undefined;
 if(!execution)return null;const data=JSON.parse(execution.data) as TextState;
 if(!data.metering||data.config.spendingMode!=='admitted_demo')return null;
 if(execution.phase!=='received')throw new AppError(409,'Delegation must come from the original saved model response.');
 const assignment=getMeteredAssignment(actor,data.metering.assignmentId);
 if(assignment.assignmentKey!==`root:${binding.rootId}`||assignment.stopRequested||assignment.status!=='active'||assignment.budget.status!=='reserved')throw new AppError(409,'The original assignment is not available for local delegation.');
 return {assignmentId:assignment.id,bindingId:binding.id,requestId:binding.host.id};
}
export function bindLocalWork(actor:Actor,runId:string,parent:LocalParent){
 const binding=getAssignmentBinding(actor,{kind:'work',id:runId}),original=getAssignmentBinding(actor,{kind:'turn',id:parent.requestId});
 if(!binding||!original||original.id!==parent.bindingId||binding.rootId!==original.rootId||binding.parentId!==original.id)throw new AppError(409,'Local delegation must retain its original assignment.');
 getDb().prepare('INSERT INTO local_assignment_work VALUES(?,?,?,?,?,?,?,?)').run(runId,...owner(actor),parent.assignmentId,parent.bindingId,parent.requestId,now());
}
export function isIncludedLocalWork(actor:Actor,runId:string){return !!read(actor,runId);}
/** Included workers wait until their parent has saved its final response, avoiding context races. */
export function localWorkAdmission(actor:Actor,runId:string):'ordinary'|'wait'|'ready'|'stopped'|'unresolved' {
 const row=read(actor,runId);if(!row)return 'ordinary';
 const binding=getAssignmentBinding(actor,{kind:'work',id:runId}),parent=getAssignmentBinding(actor,{kind:'turn',id:row.parent_request_id});
 const assignment=getMeteredAssignment(actor,row.assignment_id);
 if(!binding||!parent||parent.id!==row.parent_binding_id||parent.rootId!==binding.rootId||assignment.assignmentKey!==`root:${parent.rootId}`)throw new AppError(409,'This local job lost its original assignment binding.');
 const saved=getDb().prepare('SELECT phase FROM text_executions WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=? AND binding_id=?').get(...owner(actor),row.parent_request_id,row.parent_binding_id) as {phase:TextPhase}|undefined;
 if(assignment.status==='reconciling'||saved?.phase==='unknown')return 'unresolved';
 if(assignment.stopRequested||['completed','canceled','paused'].includes(assignment.status)||saved?.phase==='failed')return 'stopped';
 if(!saved||saved.phase!=='completed')return 'wait';
 if(!['reserved','settled','released'].includes(assignment.budget.status)||assignment.budget.approvedMaximumCents===null)throw new AppError(409,'The original assignment no longer has its recorded cost authority.');
 return 'ready';
}
export function localAssignmentHasPendingWork(actor:Actor,assignmentId:string){
 return !!getDb().prepare("SELECT 1 FROM local_assignment_work l JOIN work_runs w ON w.id=l.run_id WHERE l.assignment_id=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND w.status NOT IN ('completed','canceled') LIMIT 1").get(assignmentId,...owner(actor))||!!getDb().prepare("SELECT 1 FROM local_assignment_research l JOIN research_jobs j ON j.id=l.job_id WHERE l.assignment_id=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND j.status NOT IN ('completed','canceled') LIMIT 1").get(assignmentId,...owner(actor));
}
export function localAssignmentOutcome(actor:Actor,assignmentId:string):'completed'|'canceled' {
 const canceled=!!getDb().prepare("SELECT 1 FROM local_assignment_work l JOIN work_runs w ON w.id=l.run_id WHERE l.assignment_id=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND w.status='canceled' LIMIT 1").get(assignmentId,...owner(actor));
 const researchCanceled=!!getDb().prepare("SELECT 1 FROM local_assignment_research l JOIN research_jobs j ON j.id=l.job_id WHERE l.assignment_id=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND j.status='canceled' LIMIT 1").get(assignmentId,...owner(actor));
 return canceled||researchCanceled?'canceled':'completed';
}
/** Only the paid hosts implemented here can establish completion. An extra allocation
 * or a newer unbound quote must never be closed by an older local child. */
export function textAllocationsFinished(actor:Actor,assignmentId:string){
 const assignment=getMeteredAssignment(actor,assignmentId);
 const rows=getDb().prepare("SELECT phase,data FROM text_executions WHERE organization_id=? AND office_id=? AND user_id=? AND json_extract(data,'$.metering.assignmentId')=?").all(...owner(actor),assignmentId) as {phase:TextPhase;data:string}[];
 const hosts=rows.map(row=>({phase:row.phase,metering:(JSON.parse(row.data) as TextState).metering!,retired:(JSON.parse(row.data) as TextState).retiredMeteredParts??[]}));
 return hosts.some(host=>host.metering.revision===assignment.revision)&&assignment.parts.every(part=>hosts.some(host=>host.phase==='completed'&&(host.metering.partKey===part.key||host.retired.includes(part.key))));
}
/** Called only after local results/cancellation are durably written in the same transaction. */
export function finishLocalAssignment(actor:Actor,runId:string){
 const row=read(actor,runId);if(!row||localAssignmentHasPendingWork(actor,row.assignment_id))return;
 finishIncludedAssignment(actor,row.assignment_id);
}
function finishIncludedAssignment(actor:Actor,assignmentId:string){
 if(localAssignmentHasPendingWork(actor,assignmentId))return;
 if(!textAllocationsFinished(actor,assignmentId))return;
 const assignment=getMeteredAssignment(actor,assignmentId);if(assignment.stopRequested)return;
 finishMeteredAssignment(actor,assignmentId,localAssignmentOutcome(actor,assignmentId));
}

/** A deterministic research child inherits admitted reasoning; it never creates another AI charge. */
export function researchAssignmentParent(actor:Actor):LocalParent|null {
 const binding=activeAssignment(actor);if(!binding)return null;
 if(binding.host.kind==='turn')return localWorkParent(actor);
 if(binding.host.kind==='work'){
  const row=read(actor,binding.host.id);if(!row)return null;
  if(localWorkAdmission(actor,binding.host.id)!=='ready')throw new AppError(409,'The parent assignment is not ready for research.');
  return {assignmentId:row.assignment_id,bindingId:binding.id,requestId:row.parent_request_id};
 }
 return null;
}
export function bindIncludedResearch(actor:Actor,job:ResearchJob,parent:LocalParent){
 if(job.provider!=='synthetic-fixtures-v1')throw new AppError(409,'This assignment only includes fictional local research. Paid external research needs a shared admitted allocation.');
 const binding=getAssignmentBinding(actor,{kind:'research',id:job.id});
 if(binding?.parentId!==parent.bindingId||getMeteredAssignment(actor,parent.assignmentId).assignmentKey!==`root:${binding.rootId}`)throw new AppError(409,'Research lost its original parent assignment.');
 getDb().prepare('INSERT INTO local_assignment_research VALUES(?,?,?,?,?,?,?,?,?)').run(job.id,...owner(actor),parent.assignmentId,parent.bindingId,parent.requestId,fingerprint(job.input),now());
}
function researchRow(actor:Actor,jobId:string){
 assertActor(actor);return getDb().prepare('SELECT * FROM local_assignment_research WHERE job_id=? AND organization_id=? AND office_id=? AND user_id=?').get(jobId,...owner(actor)) as {assignment_id:string;parent_binding_id:string;parent_request_id:string;input_hash:string}|undefined;
}
export function includedResearchAdmission(actor:Actor,job:ResearchJob):'ordinary'|'wait'|'ready'|'stopped'|'unresolved'{
 const row=researchRow(actor,job.id);if(!row)return 'ordinary';
 const binding=getAssignmentBinding(actor,{kind:'research',id:job.id}),parent=getAssignmentBinding(actor,{kind:'turn',id:row.parent_request_id});
 const assignment=getMeteredAssignment(actor,row.assignment_id);
 if(!binding||binding.parentId!==row.parent_binding_id||!parent||parent.rootId!==binding.rootId||assignment.assignmentKey!==`root:${binding.rootId}`||fingerprint(job.input)!==row.input_hash)throw new AppError(409,'Research no longer matches its original assignment and input.');
 const saved=getDb().prepare('SELECT phase FROM text_executions WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=? AND binding_id=?').get(...owner(actor),row.parent_request_id,parent.id) as {phase:TextPhase}|undefined;
 if(assignment.status==='reconciling'||saved?.phase==='unknown')return 'unresolved';
 if(assignment.stopRequested||['completed','canceled','paused'].includes(assignment.status)||saved?.phase==='failed')return 'stopped';
 const workParent=getDb().prepare("SELECT w.status FROM assignment_bindings b JOIN work_runs w ON b.host_kind='work' AND w.id=b.host_id WHERE b.id=? AND b.organization_id=? AND b.office_id=? AND b.user_id=?").get(row.parent_binding_id,...owner(actor)) as {status:string}|undefined;
 if(workParent?.status==='canceled')return 'stopped';
 if(workParent?.status==='reconciling')return 'unresolved';
 if(workParent&&['paused','waiting_for_input','waiting_cost_approval'].includes(workParent.status))return 'wait';
 return saved?.phase==='completed'?'ready':'wait';
}
export function assertIncludedResearchRetry(actor:Actor,job:ResearchJob){
 if(!['ordinary','ready'].includes(includedResearchAdmission(actor,job)))throw new AppError(409,'This research cannot resume outside its original active assignment.');
}
export function finishIncludedResearch(actor:Actor,jobId:string){
 const row=researchRow(actor,jobId);if(row)finishIncludedAssignment(actor,row.assignment_id);
}
export function cancelIncludedResearch(actor:Actor,assignmentId:string){
 const assignment=getMeteredAssignment(actor,assignmentId);
 if(!assignment.stopRequested)throw new AppError(409,'Stop the assignment before canceling its research.');
 const rows=getDb().prepare("SELECT j.data FROM local_assignment_research l JOIN research_jobs j ON j.id=l.job_id WHERE l.assignment_id=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND j.status NOT IN ('completed','canceled')").all(assignmentId,...owner(actor)) as {data:string}[];
 for(const row of rows){const job=JSON.parse(row.data) as ResearchJob;
  if(job.provider!=='synthetic-fixtures-v1')throw new AppError(409,'Paid research requires receipt reconciliation.');
  const canceled={...job,status:'canceled',stage:'Original assignment canceled; completed fictional results retained',updatedAt:now()};
  getDb().prepare("UPDATE research_jobs SET data=?,lease_until=NULL,worker_token=NULL WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?").run(JSON.stringify(canceled),job.id,...owner(actor));
  releaseUsage(actor,'research_credits',job.id);
 }
}
