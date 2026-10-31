import {withAssignment} from './assignment-roots';
import { createHash } from 'node:crypto';
import type { Actor, ExternalResearchState, Prospect, ResearchJob } from '../lib/contracts';
import { AppError, assertActor, audit, getDb, newId, now, requireRole, updateRecord } from './db';
import { requireFeature } from './billing';
import { recordMeter, reconcileProviderCounter, releaseUsage, reserveUsage, researchCredits, settleUsage } from './metering';
import { beginProviderOperation, recordProviderUsage } from './provider-runtime';
import { classifyAuthorizedDuplicate } from './access';
import { actorForMember, processNotifications } from './services';
import { discoverExternalBatch, externalResearchProviderId, requireExternalResearchConfiguration, ResearchProviderError, type ResearchResponse } from './external-research-provider';
import { normalizeEntity } from './research';

interface CallData { estimatedCostCents:number; response?:ResearchResponse; errorCode?:string }
interface CallRow { id:string; sequence:number; state:'started'|'completed'|'failed'|'unknown'; data:string }
const source='External research target reservation';
const scope=(actor:Actor,id:string)=>[id,actor.organizationId,actor.officeId,actor.id];
const calls=(actor:Actor,id:string)=>getDb().prepare('SELECT id,sequence,state,data FROM research_provider_calls WHERE job_id=? AND organization_id=? AND office_id=? AND owner_id=? ORDER BY sequence').all(...scope(actor,id)) as CallRow[];
function summary(job:ResearchJob,rows:CallRow[]):ExternalResearchState {
 const state={...job.external!,providerRequests:rows.length,searchCalls:0,inputTokens:0,outputTokens:0,estimatedCostCents:0,receiptStatus:'not_started' as ExternalResearchState['receiptStatus']};
 for(const row of rows){const data=JSON.parse(row.data) as CallData;state.estimatedCostCents+=data.estimatedCostCents;state.searchCalls+=data.response?.searchCalls??0;state.inputTokens+=data.response?.inputTokens??0;state.outputTokens+=data.response?.outputTokens??0;}
 if(rows.length)state.receiptStatus=rows.some(row=>{const data=JSON.parse(row.data) as CallData;return row.state==='started'||row.state==='unknown'||row.state==='completed'&&(data.response?.inputTokens===null||data.response?.outputTokens===null);})?'unknown':'reported';
 return state;
}
function results(actor:Actor,job:ResearchJob,rows:CallRow[]):Prospect[]{
 const found=new Map<string,Prospect>();
 for(const row of rows){const data=JSON.parse(row.data) as CallData;for(const prospect of data.response?.prospects??[]){const key=normalizeEntity(prospect.company);if(!found.has(key))found.set(key,{...prospect,...classifyAuthorizedDuplicate(actor,prospect)});}}
 return [...found.values()].sort((a,b)=>b.score-a.score).slice(0,job.input.limit);
}
function currentLease(actor:Actor,id:string,token:string):ResearchJob|null {
 const row=getDb().prepare("SELECT data FROM research_jobs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=? AND worker_token=? AND status IN ('queued','running')").get(...scope(actor,id),token) as {data:string}|undefined;
 return row?JSON.parse(row.data) as ResearchJob:null;
}
function failJob(actor:Actor,job:ResearchJob,token:string,error:string,stopReason:string){
 if(!currentLease(actor,job.id,token))return;
 const rows=calls(actor,job.id);
 updateRecord(actor,'research_jobs',{...job,external:{...summary(job,rows),stopReason},status:'failed',stage:'External research stopped; saved evidence remains available',error,prospects:results(actor,job,rows),updatedAt:now()},true);
 releaseUsage(actor,'research_credits',job.id);audit(actor,'research.failed',job.id,{provider:externalResearchProviderId,reason:stopReason,partialCount:results(actor,job,rows).length});
}
function finishJob(actor:Actor,job:ResearchJob,token:string,stopReason:string){
 if(!currentLease(actor,job.id,token))return;
 requireRole(actor,['dispositions','manager']);requireFeature(actor,'investor-hunter');
 const rows=calls(actor,job.id),prospects=results(actor,job,rows);
 if(rows.length&&!rows.some(row=>{const data=JSON.parse(row.data) as CallData;return row.state==='completed'&&data.response?.responseStatus==='completed';})){failJob(actor,job,token,'The request budget ended without a successful research response. No research credits were consumed.','no_successful_response');return;}
 updateRecord(actor,'research_jobs',{...job,status:'completed',progress:100,stage:`Completed bounded public-source research: ${prospects.length} candidates for a target of ${job.input.limit}. No transactions, identities or contacts independently verified. ${stopReason}`,prospects,external:{...summary(job,rows),stopReason},error:null,updatedAt:now()},true);
 settleUsage(actor,'research_credits',job.id);recordMeter(actor,{category:'research_jobs',operationId:job.id,quantity:1,source:'Completed external public-source research'});audit(actor,'research.completed',job.id,{provider:externalResearchProviderId,count:prospects.length,verifiedContacts:0,stopReason});
}
function usage(response:ResearchResponse){return {provider_requests:1,web_search_calls:response.searchCalls,...(response.inputTokens===null?{}:{input_tokens:response.inputTokens}),...(response.outputTokens===null?{}:{output_tokens:response.outputTokens})};}
async function step(actor:Actor,id:string,token:string){
 let job=currentLease(actor,id,token);if(!job)return;
 try{
  requireRole(actor,['dispositions','manager']);requireFeature(actor,'investor-hunter');
  const config=requireExternalResearchConfiguration();
  if(!job.external)throw new AppError(409,'This external job has no saved budget. Create a new bounded job.');
  reserveUsage(actor,{category:'research_credits',operationId:id,quantity:researchCredits(actor,job.input.limit),source});
  let rows=calls(actor,id);
  for(const interrupted of rows.filter(row=>row.state==='started')){
   getDb().prepare("UPDATE research_provider_calls SET state='unknown',updated_at=? WHERE id=? AND state='started'").run(now(),interrupted.id);
   recordProviderUsage(actor,{operationId:interrupted.id,status:'unknown',usage:{provider_requests:1},actualCostCents:null,estimatedCostCents:(JSON.parse(interrupted.data) as CallData).estimatedCostCents,errorCode:'worker_interrupted'});
   // Unknown provider execution retains its search hold until trusted reconciliation.
  }
  rows=calls(actor,id);
  if(rows.some(row=>row.state==='unknown'))throw new ResearchProviderError('An earlier request has an unknown outcome after interruption. It was not repeated. Saved candidates remain available; provider usage requires reconciliation.','unknown','prior_unknown');
  const startedAt=job.external.startedAt||now();
  const deadlineAt=new Date(Math.min(job.external.deadlineAt?Date.parse(job.external.deadlineAt):Infinity,Date.parse(startedAt)+config.maxDurationMs)).toISOString();
  job={...job,external:{...summary(job,rows),startedAt,deadlineAt}};
  const state=job.external!,prospects=results(actor,job,rows);
  if(Date.now()>=Date.parse(deadlineAt)){getDb().transaction(()=>finishJob(actor,job!,token,'Maximum research duration reached.')).immediate();return;}
  if(prospects.length>=job.input.limit||rows.length>=Math.min(state.maxCalls,config.maxCalls)||state.searchCalls>=Math.min(state.maxSearchCalls,config.maxSearchCalls)||state.estimatedCostCents+config.estimatedRequestCents>Math.min(state.maxCostCents,config.maxCostCents)){
   getDb().transaction(()=>finishJob(actor,job!,token,prospects.length>=job!.input.limit?'Candidate target reached.':'Configured request, search or estimated-cost budget reached.')).immediate();return;
  }
  const nextSequence=rows.length+1;
  let callId:string|null=null;
  getDb().transaction(()=>{
   if(!currentLease(actor,id,token))return;
   // Serialize the provider-wide rate gate with the durable dispatch marker.
   const last=getDb().prepare('SELECT created_at FROM research_provider_calls ORDER BY created_at DESC LIMIT 1').get() as {created_at:string}|undefined;
   if(last&&Date.now()-Date.parse(last.created_at)<config.minRequestIntervalMs){getDb().prepare('UPDATE research_jobs SET next_attempt_at=? WHERE id=? AND worker_token=?').run(new Date(Date.parse(last.created_at)+config.minRequestIntervalMs).toISOString(),id,token);return;}
   requireFeature(actor,'investor-hunter');
   callId=`${id}:request:${nextSequence}`;
   const maxSearchCalls=Math.min(2,state.maxSearchCalls-state.searchCalls,config.maxSearchCalls-state.searchCalls);
   beginProviderOperation(actor,{operationId:callId,provider:'openai',feature:'investor-hunter',kind:'research',model:config.model,requestHash:createHash('sha256').update(JSON.stringify({input:job!.input,sequence:nextSequence})).digest('hex'),maxEstimatedCostCents:config.estimatedRequestCents});
   reserveUsage(actor,{category:'external_search',operationId:callId,quantity:maxSearchCalls,source:'Bounded external web-search request'});
   recordMeter(actor,{category:'provider_requests',operationId:callId,quantity:1,source:'Dispatched external research request; provider expense not invoiced'});
   getDb().prepare('INSERT INTO research_provider_calls VALUES(?,?,?,?,?,?,?,?,?,?)').run(callId,actor.organizationId,actor.officeId,actor.id,id,nextSequence,'started',JSON.stringify({estimatedCostCents:config.estimatedRequestCents} satisfies CallData),now(),now());
   job={...job!,status:'running',attempt:job!.status==='queued'?job!.attempt+1:job!.attempt,progress:Math.min(90,10+Math.round(rows.length/state.maxCalls*80)),stage:`Searching public business sources · bounded batch ${nextSequence} of ${state.maxCalls}`,prospects,external:summary(job!,calls(actor,id)),updatedAt:now()};
   updateRecord(actor,'research_jobs',job,true);
  }).immediate();
  if(!callId)return;
  const operationId=callId as string;
  let response:ResearchResponse;
  try{
   response=await discoverExternalBatch(job.input,{sequence:nextSequence,excludeCompanies:prospects.map(p=>p.company),maxSearchCalls:Math.min(state.maxSearchCalls-state.searchCalls,config.maxSearchCalls-state.searchCalls),timeoutMs:Math.max(1,Math.min(config.requestTimeoutMs,Date.parse(deadlineAt)-Date.now()))});
  }catch(error){
   const failure=error instanceof ResearchProviderError?error:new ResearchProviderError('External research failed. Saved candidates remain available; no demo candidates were substituted.','unknown','unexpected_provider_failure');
   actor=actorForMember(actor.organizationId,actor.officeId,actor.id);
   getDb().transaction(()=>{
    const changed=getDb().prepare('UPDATE research_provider_calls SET state=?,data=?,updated_at=? WHERE id=? AND state=?').run(failure.outcome,JSON.stringify({estimatedCostCents:config.estimatedRequestCents,errorCode:failure.code} satisfies CallData),now(),operationId,'started');
    if(changed.changes)recordProviderUsage(actor,{operationId,status:failure.outcome,usage:{provider_requests:1},actualCostCents:null,estimatedCostCents:config.estimatedRequestCents,errorCode:failure.code});
    if(failure.outcome==='failed')releaseUsage(actor,'external_search',operationId);
    failJob(actor,job!,token,failure.message,failure.code);
   }).immediate();return;
  }
  actor=actorForMember(actor.organizationId,actor.officeId,actor.id);
  const searchReservation=Math.min(2,state.maxSearchCalls-state.searchCalls,config.maxSearchCalls-state.searchCalls);
  getDb().transaction(()=>{
   // Save a returned receipt even if the employee canceled while it was in flight.
   const changed=getDb().prepare("UPDATE research_provider_calls SET state='completed',data=?,updated_at=? WHERE id=? AND state IN ('started','unknown')").run(JSON.stringify({estimatedCostCents:config.estimatedRequestCents,response} satisfies CallData),now(),operationId);
   if(!changed.changes)return;
   recordProviderUsage(actor,{operationId,providerResponseId:response.providerResponseId,status:response.inputTokens===null||response.outputTokens===null?'unknown':'succeeded',usage:usage(response),actualCostCents:null,estimatedCostCents:config.estimatedRequestCents});
   reconcileProviderCounter(actor,'external_search',operationId,'web_search_calls');
   const persisted=getDb().prepare('SELECT data FROM research_jobs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(...scope(actor,id)) as {data:string};
   const saved=JSON.parse(persisted.data) as ResearchJob;
   const allowPartial=['dispositions','manager'].includes(actor.role);
   updateRecord(actor,'research_jobs',{...saved,...(['canceled','failed'].includes(saved.status)&&allowPartial?{prospects:results(actor,saved,calls(actor,id))}:{}),external:summary(saved,calls(actor,id)),updatedAt:now()},true);
  }).immediate();
  getDb().transaction(()=>{
   const fresh=currentLease(actor,id,token);if(!fresh)return;
   job=fresh;
   requireFeature(actor,'investor-hunter');requireRole(actor,['dispositions','manager']);
   const all=calls(actor,id),partial=results(actor,job,all);
   job={...job,prospects:partial,external:summary(job,all),stage:`Saved ${partial.length} source-linked candidates; validating remaining scope`,progress:Math.min(95,10+Math.round(all.length/state.maxCalls*80)),updatedAt:now()};
   updateRecord(actor,'research_jobs',job,true);
   if(response.searchCalls>searchReservation)failJob(actor,job,token,'The provider exceeded the configured search-call bound. No further requests will run.','provider_search_limit');
   else if(response.responseStatus!=='completed'||response.rejectedCandidates&&!response.prospects.length)failJob(actor,job,token,'The provider response did not contain sufficient valid source-linked candidates. Saved results remain available. Retry can only use remaining bounded requests.','invalid_provider_output');
   else if(response.inputTokens===null||response.outputTokens===null)failJob(actor,job,token,'The provider returned candidates without complete token usage. Saved results remain available; further spending is stopped pending reconciliation.','missing_usage');
   else if(partial.length>=job.input.limit||all.length>=Math.min(state.maxCalls,config.maxCalls)||job.external!.searchCalls>=Math.min(state.maxSearchCalls,config.maxSearchCalls)||job.external!.estimatedCostCents+config.estimatedRequestCents>Math.min(state.maxCostCents,config.maxCostCents)||Date.now()>=Date.parse(deadlineAt))finishJob(actor,job,token,'Bounded research complete; candidate counts are targets.');
  }).immediate();
 }catch(error){
  const fresh=currentLease(actor,id,token);if(fresh)getDb().transaction(()=>failJob(actor,fresh,token,error instanceof AppError?error.message:'External research stopped safely; saved evidence remains available.','execution_stopped')).immediate();
 }
}
/** Network I/O runs outside transactions. Each invocation advances at most one request per scoped job. */
export async function processExternalResearchJobs(actor?:Actor):Promise<number>{
 if(actor)assertActor(actor);
 const stamp=now();
 const rows=getDb().prepare(`SELECT id,organization_id,office_id,owner_id FROM research_jobs WHERE json_extract(data,'$.provider')=? AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<=?) AND (next_attempt_at IS NULL OR next_attempt_at<=?)${actor?' AND organization_id=? AND office_id=? AND owner_id=?':''} ORDER BY rowid LIMIT 5`).all(externalResearchProviderId,stamp,stamp,...(actor?[actor.organizationId,actor.officeId,actor.id]:[])) as {id:string;organization_id:string;office_id:string;owner_id:string}[];
 let processed=0;
 for(const row of rows){
  const owner=actorForMember(row.organization_id,row.office_id,row.owner_id),token=newId('research-lease');
  const claim=getDb().prepare("UPDATE research_jobs SET worker_token=?,lease_until=?,next_attempt_at=NULL WHERE id=? AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<=?)").run(token,new Date(Date.now()+130000).toISOString(),row.id,stamp);
  if(!claim.changes)continue;
  try{await withAssignment(owner,{kind:'research',id:row.id},()=>step(owner,row.id,token));processed++;}finally{getDb().prepare('UPDATE research_jobs SET worker_token=NULL,lease_until=NULL WHERE id=? AND worker_token=?').run(row.id,token);processNotifications(actorForMember(owner.organizationId,owner.officeId,owner.id));}
 }
 return processed;
}
