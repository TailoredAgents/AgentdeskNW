import {publishResearchUpdate} from './research-delivery';
import {voiceContextSnapshot} from './voice-context';
import type {Actor,ResearchJob} from '../lib/contracts';
import type {MeteredAssignment,UsageUnits} from '../lib/metered-work-contracts';
import {AppError,assertActor,getDb,updateRecord,now} from './db';
import {getAssignmentBinding} from './assignment-roots';
import {textAllocationsFinished,localAssignmentOutcome} from './local-assignment-work';
import {customerResearchTariff} from './metered-rates';
import {quoteCurrentAssignment,admitCurrentAssignmentAttempt} from './assignment-metering';
import {getMeteredAssignment,recordMeteredReceipt,finishMeteredAssignment} from './metered-work';
import {presentCurrentAssignmentQuote,getAssignmentReview,claimAssignmentContinuation,completeAssignmentContinuation} from './assignment-reviews';
import {fingerprint} from './provider-runtime';
import {researchConfig,type ResearchResponse} from './external-research-provider';
import {textProviderConfig} from './provider-config';
import {releaseUsage} from './metering';

export interface ResearchSpendingState {model:string;maxCalls:number;bounds:UsageUnits;rateId:string;reviewId?:string;revision?:number;scopeHash?:string;partKey:string;pause?:'requested'|'paused'|'resumed';instructions?:string;protectedContext?:Record<string,string>}
type State=ResearchSpendingState;
interface Row {job_id:string;root_id:string;assignment_id:string|null;parent_request_id:string|null;input_hash:string;data:string}
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function read(actor:Actor,id:string){assertActor(actor);return getDb().prepare('SELECT * FROM metered_research_hosts WHERE job_id=? AND organization_id=? AND office_id=? AND user_id=?').get(id,...owner(actor)) as Row|undefined;}
/** Registered during normal job creation, before parent reasoning can finish its root. */
export function registerResearchSpending(actor:Actor,job:ResearchJob,parentRequestId?:string){
 if(textProviderConfig().spendingMode!=='admitted_demo')return;
 const binding=getAssignmentBinding(actor,{kind:'research',id:job.id});if(!binding||binding.legacy)throw new AppError(409,'Research needs its original current assignment.');
 const config=researchConfig(),rate=customerResearchTariff(config.model);
 // Conservative customer allocation, not a promised provider invoice limit.
 // The provider can overrun an allocation; settlement caps the employee debit.
 const bounds={input_tokens:384000,cached_input_tokens:384000,output_tokens:config.maxOutputTokens,web_search_calls:2};
 const parent=getDb().prepare('SELECT id FROM metered_assignments WHERE assignment_key=? AND organization_id=? AND office_id=? AND user_id=?').get(`root:${binding.rootId}`,...owner(actor)) as {id:string}|undefined;
 if(binding.parentId&&!parent)throw new AppError(409,'The parent assignment has no admitted spending history.');
 const state:State={model:config.model,maxCalls:config.maxCalls,bounds,rateId:rate.id,partKey:`research:${job.id}`,...(parentRequestId?{protectedContext:voiceContextSnapshot(actor)}:{})};
 getDb().prepare('INSERT INTO metered_research_hosts VALUES(?,?,?,?,?,?,?,?,?)').run(job.id,...owner(actor),binding.rootId,parent?.id??null,parentRequestId??null,fingerprint(job.input),JSON.stringify(state));
}
export function meteredResearchPending(actor:Actor,assignmentId:string){return !!getDb().prepare("SELECT 1 FROM metered_research_hosts h JOIN research_jobs j ON j.id=h.job_id WHERE h.assignment_id=? AND h.organization_id=? AND h.office_id=? AND h.user_id=? AND j.status NOT IN ('completed','canceled') LIMIT 1").get(assignmentId,...owner(actor));}
export function hasResearchSpending(actor:Actor,jobId:string){return !!read(actor,jobId);}
export function researchSourceVisible(actor:Actor,jobId:string){
 const row=read(actor,jobId);if(!row)return true;const context=(JSON.parse(row.data) as State).protectedContext;if(!context)return true;
 try{const current=voiceContextSnapshot(actor);return Object.entries(context).every(([key,value])=>current[key]===value);}catch(error){if(error instanceof AppError&&[403,404,409].includes(error.status))return false;throw error;}
}
export function researchControlState(actor:Actor,reviewId:string){
 const row=getDb().prepare("SELECT h.data,j.status FROM metered_research_hosts h JOIN research_jobs j ON j.id=h.job_id WHERE h.organization_id=? AND h.office_id=? AND h.user_id=? AND json_extract(h.data,'$.reviewId')=?").get(...owner(actor),reviewId) as {data:string;status:string}|undefined;
 return row?{...JSON.parse(row.data) as State,jobStatus:row.status}:null;
}
export function researchRequestInstructions(actor:Actor,jobId:string){const row=read(actor,jobId);return row?(JSON.parse(row.data) as State).instructions:undefined;}
function validate(actor:Actor,job:ResearchJob,row:Row){
 const binding=getAssignmentBinding(actor,{kind:'research',id:job.id});
 if(!binding||binding.rootId!==row.root_id||fingerprint(job.input)!==row.input_hash)throw new AppError(409,'Research no longer matches its original assignment.');
 if(!researchSourceVisible(actor,job.id))throw new AppError(409,'The original research sources changed or are unavailable. Review current context before preparing replacement work.');
 const state=JSON.parse(row.data) as State,config=researchConfig();
 if(config.model!==state.model||config.maxCalls!==state.maxCalls||config.maxOutputTokens!==state.bounds.output_tokens||customerResearchTariff(config.model).id!==state.rateId)throw new AppError(409,'Research configuration changed; prepare a current reviewed job.');
 return state;
}
/** No generation until parent reasoning is saved and the entire revised root is approved. */
export function researchSpendingAdmission(actor:Actor,job:ResearchJob):'ordinary'|'wait'|'ready'|'stopped'{
 const row=read(actor,job.id);if(!row)return 'ordinary';
 if(row.assignment_id){const assignment=getMeteredAssignment(actor,row.assignment_id);if(assignment.stopRequested||['completed','canceled','paused'].includes(assignment.status))return 'stopped';if(assignment.status==='reconciling')return 'wait';}
 const state=validate(actor,job,row);
 if(state.pause==='requested'||state.pause==='paused'){
  const outstanding=row.assignment_id&&getMeteredAssignment(actor,row.assignment_id).attempts.some(a=>a.partKey===state.partKey&&['dispatched','unknown'].includes(a.status));
  if(!outstanding&&state.pause==='requested')getDb().prepare('UPDATE metered_research_hosts SET data=? WHERE job_id=?').run(JSON.stringify({...state,pause:'paused'}),job.id);
  return 'wait';
 }
 if(row.parent_request_id){const parent=getDb().prepare('SELECT phase FROM text_executions WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=?').get(...owner(actor),row.parent_request_id) as {phase:string}|undefined;if(parent?.phase==='failed')return 'stopped';if(parent?.phase!=='completed')return 'wait';}
 const binding=getAssignmentBinding(actor,{kind:'research',id:job.id})!;
 const workParent=getDb().prepare("SELECT w.status FROM assignment_bindings b JOIN work_runs w ON b.host_kind='work' AND w.id=b.host_id WHERE b.id=? AND b.organization_id=? AND b.office_id=? AND b.user_id=?").get(binding.parentId??'',...owner(actor)) as {status:string}|undefined;
 if(workParent?.status==='canceled')return 'stopped';
 if(workParent&&['paused','waiting_for_input','waiting_cost_approval','reconciling'].includes(workParent.status))return 'wait';
 if(!state.reviewId){
  return getDb().transaction(()=>{
   let prior:MeteredAssignment|null=null;if(row.assignment_id)prior=getMeteredAssignment(actor,row.assignment_id);
   if(prior?.attempts.some(attempt=>['unknown','dispatched'].includes(attempt.status)))return 'wait' as const;
   // Serialize additional paid children; a sibling's unconsumed allocation must not become stale.
   if(prior&&getDb().prepare("SELECT 1 FROM metered_research_hosts h JOIN research_jobs j ON j.id=h.job_id WHERE h.assignment_id=? AND h.job_id<>? AND json_extract(h.data,'$.reviewId') IS NOT NULL AND j.status NOT IN ('completed','canceled') LIMIT 1").get(prior.id,job.id))return 'wait' as const;
   const scopeHash=fingerprint({input:job.input,binding:row.root_id,parentScope:prior?.scopeHash??null,config:state});
   const maximumUnits=Object.fromEntries(Object.entries(state.bounds).map(([k,v])=>[k,v*state.maxCalls]));
   const assignment=quoteCurrentAssignment(actor,{title:'Copilot assignment with public-source research',scopeHash,revision:(prior?.revision??0)+1,parts:[...(prior?.parts??[]),{key:state.partKey,feature:'investor-hunter',rateId:state.rateId,maximumCalls:state.maxCalls,maximumUnits,estimatedUnits:{...maximumUnits,cached_input_tokens:0}}]});
   const review=presentCurrentAssignmentQuote(actor,{summary:`Research public business sources for ${job.input.address}. This maximum includes previously quoted work and all bounded research requests. Public claims remain unverified.`,parts:assignment.parts.map(part=>({key:part.key,label:part.key===state.partKey?'Bounded public-source investor research':'Existing assignment work'}))});
   getDb().prepare('UPDATE metered_research_hosts SET assignment_id=?,data=? WHERE job_id=?').run(assignment.id,JSON.stringify({...state,reviewId:review.id,revision:assignment.revision,scopeHash}),job.id);
   if(assignment.budget.status==='awaiting_approval'){publishResearchUpdate(actor,job,review.id);return 'wait' as const;}
   const claim=claimAssignmentContinuation(actor,review.id,()=>scopeHash);if(claim.claimed)completeAssignmentContinuation(actor,review.id,claim.token!);
   return 'ready' as const;
  }).immediate();
 }
 const review=getAssignmentReview(actor,state.reviewId);
 if(review.state==='waiting'){getDb().transaction(()=>publishResearchUpdate(actor,job,state.reviewId)).immediate();return 'wait';}
 if(review.state==='obsolete'&&review.canRenew)return 'wait';
 if(['denied','closed','obsolete'].includes(review.state))return 'stopped';
 const claim=claimAssignmentContinuation(actor,state.reviewId,()=>state.scopeHash!);if(claim.claimed)completeAssignmentContinuation(actor,state.reviewId,claim.token!);
 return 'ready';
}
export function admitResearchSpending(actor:Actor,job:ResearchJob,operationId:string,requestHash:string){
 const row=read(actor,job.id);if(!row)return;
 const state=validate(actor,job,row);if(!state.reviewId)throw new AppError(409,'Prepare research spending before dispatch.');
 const claim=admitCurrentAssignmentAttempt(actor,{revision:state.revision!,scopeHash:state.scopeHash!,attemptId:operationId,partKey:state.partKey,requestHash,bounds:state.bounds});
 if(!claim.dispatch)throw new AppError(409,'This research attempt was already dispatched. Reconcile its original outcome.');
}
export function settleResearchSpending(actor:Actor,jobId:string,operationId:string,response:ResearchResponse|null,knownRejected=false){
 const row=read(actor,jobId);if(!row?.assignment_id)return;
 const complete=response&&response.inputTokens!==null&&response.outputTokens!==null&&response.cachedInputTokens!==null&&response.receiptValid;
 const usage:UsageUnits|null=complete?{input_tokens:response.inputTokens!-response.cachedInputTokens!,cached_input_tokens:response.cachedInputTokens!,output_tokens:response.outputTokens!,web_search_calls:response.searchCalls}:knownRejected?{}:null;
 return recordMeteredReceipt(actor,{assignmentId:row.assignment_id,attemptId:operationId,status:complete?(response.responseStatus==='completed'?'succeeded':'failed'):knownRejected?'failed':'unknown',responseId:response?.providerResponseId??null,usage,providerCostMicros:knownRejected?0:null});
}
export function researchSpendingFinished(actor:Actor,jobId:string){
 const row=read(actor,jobId);if(!row?.assignment_id)return;
 const assignment=getMeteredAssignment(actor,row.assignment_id);
 if(assignment.stopRequested||['completed','canceled'].includes(assignment.status))return;
 if(meteredResearchPending(actor,assignment.id))return;
 const pending=getDb().prepare("SELECT 1 FROM local_assignment_work l JOIN work_runs w ON w.id=l.run_id WHERE l.assignment_id=? AND w.status NOT IN ('completed','canceled') UNION ALL SELECT 1 FROM local_assignment_research l JOIN research_jobs j ON j.id=l.job_id WHERE l.assignment_id=? AND j.status NOT IN ('completed','canceled') LIMIT 1").get(assignment.id,assignment.id);
 if(pending)return;
 if(!textAllocationsFinished(actor,assignment.id))return;
 finishMeteredAssignment(actor,assignment.id,localAssignmentOutcome(actor,assignment.id));
}
export function assertResearchSpendingRetry(actor:Actor,job:ResearchJob){const row=read(actor,job.id);if(!row)return;validate(actor,job,row);if(row.assignment_id){const value=getMeteredAssignment(actor,row.assignment_id);if(value.stopRequested||value.attempts.some(a=>['unknown','dispatched'].includes(a.status)))throw new AppError(409,'Reconcile or stop the original research assignment before another request.');}}
export function cancelMeteredResearch(actor:Actor,assignmentId:string){
 const rows=getDb().prepare("SELECT j.data FROM metered_research_hosts h JOIN research_jobs j ON j.id=h.job_id WHERE h.assignment_id=? AND h.organization_id=? AND h.office_id=? AND h.user_id=? AND j.status NOT IN ('completed','canceled')").all(assignmentId,...owner(actor)) as {data:string}[];
 for(const row of rows){const job=JSON.parse(row.data) as ResearchJob;updateRecord(actor,'research_jobs',{...job,status:'canceled',stage:'Assignment canceled; in-flight usage remains subject to reconciliation',updatedAt:now()},true);getDb().prepare('UPDATE research_jobs SET lease_until=NULL,worker_token=NULL WHERE id=?').run(job.id);releaseUsage(actor,'research_credits',job.id);}
}
