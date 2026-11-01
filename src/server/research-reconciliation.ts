import {z} from 'zod';
import type {Actor,ResearchJob} from '../lib/contracts';
import {AppError,getDb,audit,updateRecord,now} from './db';
import {withAssignment} from './assignment-roots';
import {parseResearchResponse} from './external-research-provider';
import {settleResearchSpending,cancelMeteredResearch} from './research-spending';
import {recordProviderUsage,fingerprint} from './provider-runtime';
import {getMeteredAssignment,finishMeteredAssignment} from './metered-work';
import {reconcileProviderCounter} from './metering';
import {cancelIncludedAssignmentWork} from './work-runs';
import {cancelIncludedResearch} from './local-assignment-work';

const evidence=z.object({requestHash:z.string().regex(/^[a-f0-9]{64}$/),source:z.string().trim().min(8).max(240),receipt:z.unknown()}).strict();
/** Operator-only evidence settlement. Never publishes returned prospects, resumes work or dispatches a request. */
export function reconcileStoppedResearchUsage(actor:Actor,jobId:string,operationId:string,raw:z.input<typeof evidence>){
 const input=evidence.parse(raw);
 return withAssignment(actor,{kind:'research',id:jobId},()=>getDb().transaction(()=>{
  const owner=[actor.organizationId,actor.officeId,actor.id];
  const host=getDb().prepare('SELECT assignment_id,data FROM metered_research_hosts WHERE job_id=? AND organization_id=? AND office_id=? AND user_id=?').get(jobId,...owner) as {assignment_id:string;data:string}|undefined;
  const call=getDb().prepare('SELECT state,data FROM research_provider_calls WHERE id=? AND job_id=? AND organization_id=? AND office_id=? AND owner_id=?').get(operationId,jobId,...owner) as {state:string;data:string}|undefined;
  const operation=getDb().prepare('SELECT data FROM provider_operations WHERE operation_id=? AND organization_id=? AND office_id=? AND user_id=?').get(operationId,...owner) as {data:string}|undefined;
  if(!host?.assignment_id||!call||!operation)throw new AppError(404,'Original admitted research request not found.');
  const original=JSON.parse(operation.data) as {requestHash:string;providerResponseId?:string};
  if(original.requestHash!==input.requestHash)throw new AppError(409,'Evidence does not match the original dispatched request.');
  const saved=getDb().prepare('SELECT data FROM research_jobs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(jobId,...owner) as {data:string};
  const job=JSON.parse(saved.data) as ResearchJob;
  if(!['failed','canceled'].includes(job.status))throw new AppError(409,'Stop the original research before reconciling usage.');
  const response=parseResearchResponse(input.receipt,job.input,(JSON.parse(host.data) as {model:string}).model);
  if(!response.receiptValid)throw new AppError(409,'The receipt must report the original model, tier and complete token usage.');
  if(original.providerResponseId&&original.providerResponseId!==response.providerResponseId)throw new AppError(409,'Keep the original provider response identity.');
  settleResearchSpending(actor,jobId,operationId,response);
  recordProviderUsage(actor,{operationId,providerResponseId:response.providerResponseId,status:response.responseStatus==='completed'?'succeeded':'failed',usage:{provider_requests:1,web_search_calls:response.searchCalls,input_tokens:response.inputTokens!,cached_input_tokens:response.cachedInputTokens!,output_tokens:response.outputTokens!},errorCode:'reconciled_after_stop'});
  reconcileProviderCounter(actor,'external_search',operationId,'web_search_calls');
  // Keep billing evidence, discard late generated output and stop every remaining child.
  const prior=JSON.parse(call.data) as Record<string,unknown>;
  getDb().prepare("UPDATE research_provider_calls SET state='completed',data=?,updated_at=? WHERE id=?").run(JSON.stringify({...prior,response:{...response,prospects:[]},reconciled:true}),now(),operationId);
  updateRecord(actor,'research_jobs',{...job,status:'canceled',stage:'Usage reconciled after stop; returned output was not executed',updatedAt:now()},true);
  finishMeteredAssignment(actor,host.assignment_id,'canceled');cancelIncludedAssignmentWork(actor,host.assignment_id);cancelIncludedResearch(actor,host.assignment_id);cancelMeteredResearch(actor,host.assignment_id);
  audit(actor,'research.usage_reconciled',jobId,{evidenceHash:fingerprint(input),receiptId:response.providerResponseId,executionResumed:false});
  return getMeteredAssignment(actor,host.assignment_id);
 }).immediate());
}
