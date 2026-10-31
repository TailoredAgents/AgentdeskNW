import {textPauseState} from './text-pause';
import {z} from 'zod';
import {localAssignmentHasPendingWork} from './local-assignment-work';
import type {Actor,Artifact} from '../lib/contracts';
import type {AssignmentReview,AssignmentReviewDecision,AssignmentCancellation} from '../lib/assignment-review-contracts';
import {AppError,assertActor,getDb,newId,now} from './db';
import {requireFeature} from './billing';
import {currentAssignment,getAssignmentBinding,type AssignmentHost} from './assignment-roots';
import {currentMeteredAssignment} from './assignment-metering';
import {getMeteredAssignment,decideMeteredAssignment,finishMeteredAssignment} from './metered-work';
import {collectHistoryReferences,historyReferencesVisible,type HistoryReferences} from './history';
import {fingerprint} from './provider-runtime';
import {getWorkRun,cancelIncludedAssignmentWork} from './work-runs';

const id=z.string().trim().min(1).max(150);
export const assignmentDecisionSchema=z.object({quoteId:id,revision:z.number().int().positive(),decision:z.enum(['approve','deny']),eventKey:id}).strict();
export const assignmentCancellationSchema=z.object({quoteId:id,revision:z.number().int().positive(),eventKey:id}).strict();
const presentation=z.object({summary:z.string().trim().min(3).max(4000),parts:z.array(z.object({key:id,label:z.string().trim().min(3).max(200)}).strict()).min(1).max(40)}).strict();
type ReviewData=z.infer<typeof presentation>&{references:HistoryReferences;quote:{title:string;estimatedCents:number;maximumCents:number;expiresAt:string;calls:Record<string,number>}};
type Row={id:string;assignment_id:string;binding_id:string;quote_id:string;revision:number;scope_hash:string;presentation_hash:string;data:string;state:'waiting'|'ready'|'claimed'|'continued'|'denied';claim_token:string|null;created_at:string;updated_at:string};
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function read(actor:Actor,reviewId:string):Row {
 assertActor(actor);
 const row=getDb().prepare('SELECT * FROM assignment_reviews WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id.parse(reviewId),...owner(actor)) as Row|undefined;
 if(!row)throw new AppError(404,'Assignment review not found in your private workspace.');return row;
}
function binding(actor:Actor,row:Row){
 const host=getDb().prepare('SELECT host_kind kind,host_id id FROM assignment_bindings WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(row.binding_id,...owner(actor)) as AssignmentHost|undefined;
 if(!host)throw new AppError(409,'The original assignment is unavailable.');
 const value=getAssignmentBinding(actor,host);
 if(!value||value.legacy||value.id!==row.binding_id)throw new AppError(409,'The original assignment is unavailable.');return value;
}
function current(actor:Actor,row:Row){
 const source=binding(actor,row),assignment=getMeteredAssignment(actor,row.assignment_id);
 if(assignment.assignmentKey!==`root:${source.rootId}`)throw new AppError(409,'The review no longer matches its original assignment.');
 return assignment;
}
function projection(actor:Actor,row:Row):AssignmentReview {
 const assignment=current(actor,row),data=JSON.parse(row.data) as ReviewData,budget=assignment.budget;
 const contentRestricted=!historyReferencesVisible(actor,data.references);
 const same=assignment.revision===row.revision&&budget.quoteId===row.quote_id&&assignment.scopeHash===row.scope_hash;
 const closed=!!assignment.stopRequested||['completed','canceled','paused','reconciling'].includes(assignment.status);
 const employeeStopped=!!getDb().prepare('SELECT 1 FROM assignment_cancellations WHERE review_id=? LIMIT 1').get(row.id);
 const pendingLocal=localAssignmentHasPendingWork(actor,assignment.id);
 const renewableHost=getDb().prepare("SELECT 1 FROM text_executions WHERE binding_id=? AND phase='ready' AND json_extract(data,'$.metering.reviewId')=?").get(row.binding_id,row.id);
 const pauseState=textPauseState(row.id);
 const paused=pauseState==='requested'||pauseState==='paused';
 const execution=getDb().prepare("SELECT e.phase,e.conversation_id FROM text_executions e WHERE e.binding_id=? AND json_extract(e.data,'$.metering.reviewId')=?").get(row.binding_id,row.id) as {phase:string;conversation_id:string}|undefined;
 const canPause=same&&!paused&&!assignment.stopRequested&&['quoted','active'].includes(assignment.status)&&!!execution&&['ready','received','dispatching'].includes(execution.phase)&&row.state!=='denied';
 const canContinue=same&&!contentRestricted&&pauseState==='paused'&&!assignment.stopRequested&&!!execution&&['ready','received'].includes(execution.phase)&&['ready','waiting','continued'].includes(row.state)&&!getDb().prepare("SELECT 1 FROM assistant_turns WHERE conversation_id=? AND status='running'").get(execution.conversation_id);
 const canRenew=!paused&&same&&!contentRestricted&&!assignment.stopRequested&&['quoted','active'].includes(assignment.status)&&['waiting','ready'].includes(row.state)&&!!renewableHost&&assignment.attempts.length===0&&assignment.parts.length===1;
 const expired=Date.parse(budget.expiresAt)<=Date.now()&&['approved','awaiting_approval'].includes(budget.status);
 const state:AssignmentReview['state']=!same||contentRestricted||expired?'obsolete':closed?'closed':row.state;
 return {id:row.id,conversationReference:`S${fingerprint(row.id).slice(0,16).toUpperCase()}`,title:contentRestricted?'Assignment context changed':data.quote.title,summary:contentRestricted?'The original sources changed or are no longer available. Ask the Agent to prepare a current review.':data.summary,revision:row.revision,quoteId:row.quote_id,
  parts:contentRestricted?[]:data.parts.map(p=>({...p,maximumCalls:data.quote.calls[p.key]})),
  estimatedCents:data.quote.estimatedCents,maximumCents:data.quote.maximumCents,spentCents:budget.spentCents,heldCents:budget.reservedCents,
  expiresAt:data.quote.expiresAt,createdAt:row.created_at,state,contentRestricted,canPause,canContinue,canRenew,replacedByRenewal:!!getDb().prepare('SELECT 1 FROM assignment_renewals WHERE original_review_id=? LIMIT 1').get(row.id)||!!getDb().prepare('SELECT 1 FROM assignment_text_control_events WHERE review_id=? AND replacement_review_id IS NOT NULL LIMIT 1').get(row.id),canCancel:same&&!employeeStopped&&assignment.status!=='completed'&&(assignment.status!=='canceled'||pendingLocal),executionState:assignment.stopRequested==='canceled'?(assignment.status==='canceled'?'canceled':'stopping'):['reconciling','paused'].includes(assignment.status)?'needs_attention':paused?(pauseState==='requested'?'pausing':'paused'):assignment.status==='completed'?'completed':['reconciling','paused'].includes(assignment.status)?'needs_attention':'open',canDecide:!paused&&state==='waiting'&&budget.status==='awaiting_approval',simulation:true};
}
export function getAssignmentReview(actor:Actor,reviewId:string){return projection(actor,read(actor,reviewId));}
/** Current-use history keeps the exact quote and sources. State changes alone do not erase the reviewed scope. */
export function assignmentReviewReference(review:AssignmentReview){return `${review.id}@${review.quoteId}@${review.revision}`;}
export function assignmentReviewReferenceCurrent(actor:Actor,reference:string){
 const [reviewId,quoteId,revision,...extra]=reference.split('@');
 if(extra.length||!reviewId||!quoteId||!revision)return false;
 const row=read(actor,reviewId),view=projection(actor,row),assignment=current(actor,row);
 return row.quote_id===quoteId&&String(row.revision)===revision&&assignment.revision===row.revision&&assignment.budget.quoteId===row.quote_id&&!view.contentRestricted;
}
export function listAssignmentReviews(actor:Actor):AssignmentReview[]{
 assertActor(actor);
 const rows=getDb().prepare('SELECT * FROM assignment_reviews WHERE organization_id=? AND office_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 50').all(...owner(actor)) as Row[];
 // Invalid host identities are never republished as fresh work or leaked in a list.
 return rows.flatMap(row=>{try{return [projection(actor,row)];}catch(error){if(error instanceof AppError&&[403,404,409].includes(error.status))return [];throw error;}});
}
/** Trusted host publishes a review of an already priced root. There is no client/model creation route. */
export function presentCurrentAssignmentQuote(actor:Actor,input:z.input<typeof presentation>,sourceArtifacts:Artifact[]=[],inherited:HistoryReferences[]=[]):AssignmentReview {
 requireFeature(actor,'core');const parsed=presentation.parse(input);
 return getDb().transaction(()=>{
  const host=currentAssignment(actor),assignment=currentMeteredAssignment(actor),budget=assignment.budget;
  if(assignment.stopRequested||!['quoted','active'].includes(assignment.status)||!['awaiting_approval','approved','reserved'].includes(budget.status))throw new AppError(409,'This assignment is not available for a cost review.');
  if(parsed.parts.length!==assignment.parts.length||new Set(parsed.parts.map(p=>p.key)).size!==parsed.parts.length||parsed.parts.some(p=>!assignment.parts.some(part=>part.key===p.key)))throw new AppError(400,'The review must describe every quoted assignment part exactly once.');
  if(inherited.some(ref=>!historyReferencesVisible(actor,ref)))throw new AppError(409,'The review sources changed. Prepare current context first.');
  const hostSources:Artifact[]=[];
  if(host.host.kind==='work'){
   const run=getWorkRun(actor,host.host.id);
   if(run.contentRestricted)throw new AppError(409,'The original job context is no longer available.');
   hostSources.push({type:'work_run',id:run.id,title:'Original saved work',data:{workPlanVersion:run.planVersion}});
  }
  const data:ReviewData={...parsed,references:collectHistoryReferences(actor,[...hostSources,...sourceArtifacts],inherited),quote:{title:assignment.title,estimatedCents:budget.estimatedCents,maximumCents:budget.maximumCents,expiresAt:budget.expiresAt,calls:Object.fromEntries(assignment.parts.map(p=>[p.key,p.maximumCalls]))}};
  // A cost review is not a business source for another quote; prevent recursive review provenance.
  if(data.references.assignmentReviews?.length)throw new AppError(400,'Use the original business sources for a spending review, not another cost review.');
  if(!historyReferencesVisible(actor,data.references))throw new AppError(409,'The review sources are no longer available.');
  const hash=fingerprint({binding:host.id,scope:assignment.scopeHash,data});
  const prior=getDb().prepare('SELECT * FROM assignment_reviews WHERE assignment_id=? AND quote_id=?').get(assignment.id,budget.quoteId) as Row|undefined;
  if(prior){if(prior.presentation_hash!==hash)throw new AppError(409,'This quote already has a different review. Prepare a new assignment revision.');return projection(actor,prior);}
  if(getDb().prepare("SELECT 1 FROM assignment_reviews WHERE assignment_id=? AND state='claimed'").get(assignment.id))throw new AppError(409,'Reconcile the original continuation before publishing another review.');
  const stamp=now(),reviewId=newId('assignment_review');
  getDb().prepare('INSERT INTO assignment_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(reviewId,assignment.id,host.id,...owner(actor),budget.quoteId,assignment.revision,assignment.scopeHash,hash,JSON.stringify(data),budget.status==='awaiting_approval'?'waiting':'ready',null,stamp,stamp);
  return getAssignmentReview(actor,reviewId);
 }).immediate();
}
/** Authenticated employee only. Approval records readiness; it never fabricates execution or a new job. */
export function decideAssignmentReview(actor:Actor,reviewId:string,raw:AssignmentReviewDecision):AssignmentReview {
 const input=assignmentDecisionSchema.parse(raw);
 return getDb().transaction(()=>{
  const row=read(actor,reviewId),view=projection(actor,row);
  if(input.quoteId!==row.quote_id||input.revision!==row.revision||view.contentRestricted||view.state==='obsolete')throw new AppError(409,'This review changed or expired. Review the current assignment before deciding.');
  decideMeteredAssignment(actor,{assignmentId:row.assignment_id,...input});
  // An exact retry after continuation must not reset the claim or create another dispatch.
  if(row.state==='waiting')getDb().prepare('UPDATE assignment_reviews SET state=?,updated_at=? WHERE id=?').run(input.decision==='approve'?'ready':'denied',now(),row.id);
  return getAssignmentReview(actor,reviewId);
 }).immediate();
}
/** Trusted original host only. A claim is durable and never automatically re-leased after a crash.
 * Each paid attempt still requires root admission. The host reconciles a saved claim instead of repeating work.
 */
export function claimAssignmentContinuation(actor:Actor,reviewId:string,currentScope:()=>string):{claimed:boolean;token:string|null;review:AssignmentReview} {
 return getDb().transaction(()=>{
  requireFeature(actor,'core');const row=read(actor,reviewId),active=currentAssignment(actor),view=projection(actor,row);
  if(['requested','paused'].includes(textPauseState(row.id)??''))throw new AppError(409,'The assignment is paused. Use its explicit continue control.');
  if(active.id!==row.binding_id)throw new AppError(409,'Continue from the original assignment host.');
  if(currentScope()!==row.scope_hash||view.contentRestricted||['obsolete','closed','waiting','denied'].includes(view.state))throw new AppError(409,'This assignment is not approved for its current context.');
  if(row.state!=='ready')return {claimed:false,token:null,review:view};
  const token=newId('continuation');
  getDb().prepare("UPDATE assignment_reviews SET state='claimed',claim_token=?,updated_at=? WHERE id=? AND state='ready'").run(token,now(),row.id);
  return {claimed:true,token,review:getAssignmentReview(actor,reviewId)};
 }).immediate();
}
/** A host acknowledges only its own durable return to the saved execution, not completion of the assignment. */
export function completeAssignmentContinuation(actor:Actor,reviewId:string,token:string):AssignmentReview {
 return getDb().transaction(()=>{
  const row=read(actor,reviewId),active=currentAssignment(actor);current(actor,row);
  if(active.id!==row.binding_id||row.claim_token!==id.parse(token)||!['claimed','continued'].includes(row.state))throw new AppError(409,'This continuation does not belong to the original execution.');
  getDb().prepare("UPDATE assignment_reviews SET state='continued',updated_at=? WHERE id=?").run(now(),row.id);
  return getAssignmentReview(actor,reviewId);
 }).immediate();
}

/** Authenticated employee stop. Expired/restricted source content never prevents stopping owned current work. */
export function cancelAssignmentReview(actor:Actor,reviewId:string,raw:AssignmentCancellation):AssignmentReview {
 const input=assignmentCancellationSchema.parse(raw);
 return getDb().transaction(()=>{
  const row=read(actor,reviewId),assignment=current(actor,row),digest=fingerprint({reviewId,...input});
  const prior=getDb().prepare('SELECT payload_hash FROM assignment_cancellations WHERE organization_id=? AND office_id=? AND user_id=? AND event_key=?').get(...owner(actor),input.eventKey) as {payload_hash:string}|undefined;
  if(prior){if(prior.payload_hash!==digest)throw new AppError(409,'This command already represents a different cancellation.');return projection(actor,row);}
  if(input.quoteId!==row.quote_id||input.revision!==row.revision||assignment.revision!==row.revision||assignment.budget.quoteId!==row.quote_id)throw new AppError(409,'This assignment scope changed. Select its current review before canceling.');
  finishMeteredAssignment(actor,row.assignment_id,'canceled');
  cancelIncludedAssignmentWork(actor,row.assignment_id);
  getDb().prepare('INSERT INTO assignment_cancellations VALUES(?,?,?,?,?,?,?)').run(...owner(actor),input.eventKey,row.id,digest,now());
  return projection(actor,row);
 }).immediate();
}

/** Trusted host input only; never serialize this private binding/presentation to a client or model. */
export function originalAssignmentReview(actor:Actor,reviewId:string){
 const row=read(actor,reviewId),data=JSON.parse(row.data) as ReviewData;
 return {host:binding(actor,row).host,assignment:current(actor,row),references:data.references,presentation:{summary:data.summary,parts:data.parts}};
}
