import type {Actor} from '../lib/contracts';
import {AppError,assertActor,getDb,now} from './db';
import {activeAssignment,getAssignmentBinding} from './assignment-roots';
import {getMeteredAssignment,finishMeteredAssignment} from './metered-work';
import type {TextState,TextPhase} from './text-execution';

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
 return !!getDb().prepare("SELECT 1 FROM local_assignment_work l JOIN work_runs w ON w.id=l.run_id WHERE l.assignment_id=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND w.status NOT IN ('completed','canceled') LIMIT 1").get(assignmentId,...owner(actor));
}
export function localAssignmentOutcome(actor:Actor,assignmentId:string):'completed'|'canceled' {
 const canceled=!!getDb().prepare("SELECT 1 FROM local_assignment_work l JOIN work_runs w ON w.id=l.run_id WHERE l.assignment_id=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND w.status='canceled' LIMIT 1").get(assignmentId,...owner(actor));
 return canceled?'canceled':'completed';
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
 if(!textAllocationsFinished(actor,row.assignment_id))return;
 const assignment=getMeteredAssignment(actor,row.assignment_id);if(assignment.stopRequested)return;
 finishMeteredAssignment(actor,row.assignment_id,localAssignmentOutcome(actor,row.assignment_id));
}
