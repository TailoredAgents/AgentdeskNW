import type {Actor} from '../lib/contracts';
import type {AssignmentTextControl} from '../lib/assignment-review-contracts';
import {AppError,getDb,now} from './db';
import {withAssignment} from './assignment-roots';
import {originalAssignmentReview,getAssignmentReview,presentCurrentAssignmentQuote,decideAssignmentReview} from './assignment-reviews';
import {quoteCurrentAssignment} from './assignment-metering';
import {fingerprint} from './provider-runtime';
import {customerResearchTariff} from './metered-rates';
import {requireFeature} from './billing';
import {researchConfig} from './external-research-provider';
import {researchControlState,type ResearchSpendingState} from './research-spending';

/** Same authenticated review controls as typed Copilot. Never callable by an AI tool. */
export function controlResearchAssignment(actor:Actor,reviewId:string,input:AssignmentTextControl,renew=false){
 return getDb().transaction(()=>{
  const original=originalAssignmentReview(actor,reviewId),view=getAssignmentReview(actor,reviewId),owner=[actor.organizationId,actor.officeId,actor.id],hash=fingerprint({reviewId,...input,renew});
  const prior=getDb().prepare('SELECT payload_hash,replacement_review_id FROM assignment_text_control_events WHERE organization_id=? AND office_id=? AND user_id=? AND event_key=?').get(...owner,input.eventKey) as {payload_hash:string;replacement_review_id:string|null}|undefined;
  if(prior){if(prior.payload_hash!==hash)throw new AppError(409,'This command already represents different instructions.');return getAssignmentReview(actor,prior.replacement_review_id??reviewId);}
  if(original.host.kind!=='research'||input.quoteId!==view.quoteId||input.revision!==view.revision||original.assignment.revision!==view.revision||original.assignment.budget.quoteId!==view.quoteId)throw new AppError(409,'Select the current original research review.');
  const state=researchControlState(actor,reviewId);if(!state)throw new AppError(409,'Original admitted research is unavailable.');
  const {jobStatus,...saved}=state;
  const save=(value:ResearchSpendingState,replacement:string|null)=>{
   getDb().prepare('UPDATE metered_research_hosts SET data=? WHERE job_id=?').run(JSON.stringify(value),original.host.id);
   getDb().prepare('INSERT INTO assignment_text_control_events VALUES(?,?,?,?,?,?,?,?,?)').run(...owner,input.eventKey,reviewId,replacement,hash,JSON.stringify({action:renew?'renew':input.action,instructions:input.instructions??null}),now());
  };
  if(input.action==='pause'&&!renew){
   if(!view.canPause)throw new AppError(409,'This research cannot pause in its current state.');
   const outstanding=original.assignment.attempts.some(a=>a.partKey===state.partKey&&a.status==='dispatched');
   save({...saved,pause:outstanding?'requested':'paused'},null);return getAssignmentReview(actor,reviewId);
  }
  requireFeature(actor,'investor-hunter');
  if((renew?!view.canRenew:!view.canContinue)||!['queued','running'].includes(jobStatus))throw new AppError(409,'Wait for an acknowledged pause or select a renewable original quote.');
  if(original.assignment.attempts.some(a=>['unknown','dispatched'].includes(a.status)||a.discrepancy))throw new AppError(409,'Reconcile outstanding usage before continuing research.');
  const config=researchConfig();if(config.model!==state.model||config.maxCalls!==state.maxCalls||config.maxOutputTokens!==state.bounds.output_tokens||customerResearchTariff(config.model).id!==state.rateId)throw new AppError(409,'Research configuration changed; reconcile the original job before replacing it.');
  return withAssignment(actor,original.host,()=>{
   const instructions=input.action==='revise'?input.instructions:saved.instructions;
   const scopeHash=fingerprint({originalScope:original.assignment.scopeHash,event:input.eventKey,instructions,renew});
   const assignment=quoteCurrentAssignment(actor,{title:original.assignment.title,scopeHash,revision:original.assignment.revision+1,parts:original.assignment.parts});
   const review=presentCurrentAssignmentQuote(actor,{summary:input.action==='revise'?`Updated remaining research instructions: ${instructions}. Existing requests, results and charges are retained. The original property, target and request limits remain in force.`:original.presentation.summary,parts:original.presentation.parts},[],[original.references]);
   save({...saved,instructions,pause:'resumed',reviewId:review.id,revision:assignment.revision,scopeHash},review.id);
   if(!renew&&input.action==='continue'&&original.assignment.budget.approvedMaximumCents!==null&&original.assignment.budget.approvedMaximumCents>=review.maximumCents&&Date.parse(original.assignment.budget.expiresAt)>Date.now()&&review.canDecide)return decideAssignmentReview(actor,review.id,{quoteId:review.quoteId,revision:review.revision,decision:'approve',eventKey:`research-continue:${fingerprint(input.eventKey)}`});
   return getAssignmentReview(actor,review.id);
  });
 }).immediate();
}
