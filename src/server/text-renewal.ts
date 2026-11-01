import {controlResearchAssignment} from './research-controls';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError,getDb,now} from './db';
import {requireFeature} from './billing';
import {withAssignment} from './assignment-roots';
import {quoteCurrentAssignment} from './assignment-metering';
import {getAssignmentReview,originalAssignmentReview,presentCurrentAssignmentQuote} from './assignment-reviews';
import {readTextExecution,advanceTextExecution} from './text-execution';
import {textProviderConfig} from './provider-config';
import {customerTextTariff} from './metered-rates';
import {fingerprint} from './provider-runtime';
import {currentTextScope} from './orchestrator';

const id=z.string().trim().min(1).max(150);
export const assignmentRenewalSchema=z.object({quoteId:id,revision:z.number().int().positive(),eventKey:id}).strict();
/** Renew the original unstarted reasoning request, never recreate it as a fresh spending root.
 * Paid/in-flight or changed instructions require the separate revised-scope continuation contract.
 */
export function renewTextAssignment(actor:Actor,reviewId:string,raw:z.input<typeof assignmentRenewalSchema>){
 const input=assignmentRenewalSchema.parse(raw);requireFeature(actor,'core');
 if(originalAssignmentReview(actor,reviewId).host.kind==='research')return controlResearchAssignment(actor,reviewId,{...input,action:'continue'},true);
 return getDb().transaction(()=>{
  const original=originalAssignmentReview(actor,reviewId),hash=fingerprint({reviewId,...input});
  const retry=getDb().prepare('SELECT payload_hash,replacement_review_id FROM assignment_renewals WHERE organization_id=? AND office_id=? AND user_id=? AND event_key=?').get(actor.organizationId,actor.officeId,actor.id,input.eventKey) as {payload_hash:string;replacement_review_id:string}|undefined;
  if(retry){if(retry.payload_hash!==hash)throw new AppError(409,'This command already represents a different renewal.');return getAssignmentReview(actor,retry.replacement_review_id);}
  const view=getAssignmentReview(actor,reviewId);
  if(input.quoteId!==view.quoteId||input.revision!==view.revision||!view.canRenew)throw new AppError(409,'This original request cannot renew its quote. Review its current scope and execution state.');
  if(original.host.kind!=='turn')throw new AppError(409,'Only an original text request can renew this review.');
  return withAssignment(actor,original.host,()=>{
   const execution=readTextExecution(actor,original.host.id),config=textProviderConfig();
   if(!execution?.data.metering||execution.phase!=='ready'||execution.data.metering.reviewId!==reviewId||fingerprint(config)!==fingerprint(execution.data.config)||config.spendingMode!=='admitted_demo')throw new AppError(409,'The saved request or AI configuration changed. It needs a revised scope, not a silent renewal.');
   if(getDb().prepare("SELECT 1 FROM assistant_turns WHERE conversation_id=? AND status='running'").get(execution.conversationId))throw new AppError(409,'Wait for the current conversation response before renewing this quote.');
   if(fingerprint(currentTextScope(actor,execution.conversationId))!==execution.scopeHash)throw new AppError(409,'The original business context changed. Prepare a revised scope before continuing.');
   const rate=customerTextTariff(config.model),part=original.assignment.parts.find(p=>p.key===execution.data.metering!.partKey);
   if(!part||original.assignment.parts.length!==1||original.assignment.attempts.length)throw new AppError(409,'This assignment requires a cumulative revised scope before continuing.');
   let assignment=quoteCurrentAssignment(actor,{title:original.assignment.title,scopeHash:execution.scopeHash,revision:original.assignment.revision+1,parts:[{...part,rateId:rate.id}]});
   // Retiring the old quote can withhold later conversation review messages. Business
   // context was checked above; no business records change in this transaction.
   const scopeHash=fingerprint(currentTextScope(actor,execution.conversationId));
   if(scopeHash!==assignment.scopeHash)assignment=quoteCurrentAssignment(actor,{title:assignment.title,scopeHash,revision:assignment.revision+1,parts:assignment.parts});
   const review=presentCurrentAssignmentQuote(actor,original.presentation,[],[original.references]);
   advanceTextExecution(actor,execution,'ready',{...execution.data,metering:{...execution.data.metering,assignmentId:assignment.id,revision:assignment.revision,scopeHash,reviewId:review.id}},scopeHash);
   getDb().prepare('INSERT INTO assignment_renewals VALUES(?,?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,input.eventKey,reviewId,review.id,hash,now());
   return review;
  });
 }).immediate();
}
