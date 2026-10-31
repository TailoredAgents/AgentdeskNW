import {cancelIncludedAssignmentWork} from './work-runs';
import {cancelIncludedResearch} from './local-assignment-work';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError,getDb,audit} from './db';
import {withAssignment} from './assignment-roots';
import {readTextExecution,advanceTextExecution} from './text-execution';
import {responsesReceipt} from './responses-receipt';
import {settleTextSpending,finishTextSpending} from './text-spending';
import {recordProviderUsage,fingerprint} from './provider-runtime';
import {reconcileTextUsage} from './metering';
import {getMeteredAssignment} from './metered-work';

const evidence=z.object({requestHash:z.string().regex(/^[a-f0-9]{64}$/),source:z.string().trim().min(8).max(240),receipt:z.unknown()}).strict();
/** Trusted operator/provider-adapter boundary only. No HTTP, UI or model receipt route.
 * An operator must verify the receipt-to-request correspondence externally. This records
 * incurred usage and closes stopped work; it never replays output, tools or the request.
 */
export function reconcileStoppedTextUsage(actor:Actor,requestId:string,raw:z.input<typeof evidence>){
 const input=evidence.parse(raw);
 return withAssignment(actor,{kind:'turn',id:requestId},()=>getDb().transaction(()=>{
  const saved=readTextExecution(actor,requestId);
  if(!saved?.data.metering)throw new AppError(409,'Only an originally admitted text request can reconcile customer credits.');
  const operationId=`text:${requestId}:${saved.data.round}`;
  const row=getDb().prepare('SELECT data FROM provider_operations WHERE organization_id=? AND office_id=? AND user_id=? AND operation_id=?').get(actor.organizationId,actor.officeId,actor.id,operationId) as {data:string}|undefined;
  const operation=row?JSON.parse(row.data) as {requestHash:string;status:string;providerResponseId?:string}:null;
  if(!operation||operation.requestHash!==input.requestHash)throw new AppError(409,'The evidence does not match the original dispatched request.');
  const receipt=responsesReceipt(input.receipt,{model:saved.data.config.model,serviceTier:'default'});
  if(operation.providerResponseId&&operation.providerResponseId!==receipt.id)throw new AppError(409,'Keep the original provider response identity during reconciliation.');
  if(!['unknown','dispatching','failed'].includes(saved.phase))throw new AppError(409,'This execution is not stopped with unresolved usage.');
  if(saved.phase==='failed'&&!['succeeded','failed'].includes(operation.status))throw new AppError(409,'This failure has no reconcilable dispatched usage.');
  const result=settleTextSpending(actor,saved,{status:receipt.status==='completed'?'succeeded':receipt.status==='canceled'?'canceled':'failed',usage:receipt.units,responseId:receipt.id});
  recordProviderUsage(actor,{operationId,providerResponseId:receipt.id,status:receipt.status==='completed'?'succeeded':'failed',usage:{input_tokens:receipt.units.input_tokens+receipt.units.cached_input_tokens,output_tokens:receipt.units.output_tokens,cached_input_tokens:receipt.units.cached_input_tokens},errorCode:'reconciled_after_stop'});
  reconcileTextUsage(actor,operationId);
  if(saved.phase!=='failed')advanceTextExecution(actor,saved,'failed',{...saved.data,response:null,result:null});
  finishTextSpending(actor,saved,'canceled');
  cancelIncludedAssignmentWork(actor,saved.data.metering.assignmentId);cancelIncludedResearch(actor,saved.data.metering.assignmentId);
  // Source descriptions may contain private operator notes; retain only an evidence digest.
  if(saved.phase!=='failed')audit(actor,'text.usage_reconciled',requestId,{evidenceHash:fingerprint(input),receiptId:receipt.id,executionResumed:false});
  return getMeteredAssignment(actor,result!.id);
 }).immediate());
}
