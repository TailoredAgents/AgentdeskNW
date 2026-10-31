import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {MeteredPart,UsageUnits} from '../lib/metered-work-contracts';
import {AppError,getDb,now} from './db';
import {requireFeature} from './billing';
import {withAssignment} from './assignment-roots';
import {quoteCurrentAssignment} from './assignment-metering';
import {getAssignmentReview,originalAssignmentReview,presentCurrentAssignmentQuote,decideAssignmentReview} from './assignment-reviews';
import {readTextExecution,advanceTextExecution} from './text-execution';
import {textProviderConfig} from './provider-config';
import {customerTextTariff} from './metered-rates';
import {fingerprint} from './provider-runtime';
import {currentTextScope} from './orchestrator';

const id=z.string().trim().min(1).max(150);
export const textControlSchema=z.object({quoteId:id,revision:z.number().int().positive(),eventKey:id,action:z.enum(['pause','continue','revise']),instructions:z.string().trim().min(1).max(2000).optional()}).strict().refine(v=>v.action==='revise'?!!v.instructions:v.instructions===undefined,'Only a revision includes new instructions.');
const sum=(units:UsageUnits[])=>{const value:UsageUnits={};for(const row of units)for(const [key,n] of Object.entries(row))value[key]=(value[key]??0)+n;return value;};
/** Employee control, never a tool. A fresh review resumes only a cooperatively paused original host. */
export function controlTextAssignment(actor:Actor,reviewId:string,raw:z.input<typeof textControlSchema>){
 const input=textControlSchema.parse(raw);if(input.action!=='pause')requireFeature(actor,'core');
 return getDb().transaction(()=>{
  const original=originalAssignmentReview(actor,reviewId),hash=fingerprint({reviewId,...input}),owner=[actor.organizationId,actor.officeId,actor.id];
  const retry=getDb().prepare('SELECT payload_hash,replacement_review_id FROM assignment_text_control_events WHERE organization_id=? AND office_id=? AND user_id=? AND event_key=?').get(...owner,input.eventKey) as {payload_hash:string;replacement_review_id:string|null}|undefined;
  if(retry){if(retry.payload_hash!==hash)throw new AppError(409,'This command already represents different instructions.');return getAssignmentReview(actor,retry.replacement_review_id??reviewId);}
  const view=getAssignmentReview(actor,reviewId);
  if(input.quoteId!==view.quoteId||input.revision!==view.revision||original.assignment.revision!==view.revision||original.assignment.budget.quoteId!==view.quoteId)throw new AppError(409,'This assignment changed. Select its current review.');
  if(original.host.kind!=='turn')throw new AppError(409,'This control requires an original text assignment.');
  return withAssignment(actor,original.host,()=>{
   const saved=readTextExecution(actor,original.host.id);
   if(!saved?.data.metering||saved.data.metering.reviewId!==reviewId)throw new AppError(409,'The original text execution is unavailable.');
   const record=(replacement:string|null)=>getDb().prepare('INSERT INTO assignment_text_control_events VALUES(?,?,?,?,?,?,?,?,?)').run(...owner,input.eventKey,reviewId,replacement,hash,JSON.stringify({action:input.action,instructions:input.instructions??null,execution:saved}),now());
   if(input.action==='pause'){
    if(!view.canPause)throw new AppError(409,'This assignment cannot pause at its current state.');
    const running=!!getDb().prepare("SELECT 1 FROM assistant_turns WHERE conversation_id=? AND status='running'").get(saved.conversationId);
    const state=running||saved.phase==='dispatching'?'requested':'paused';
    getDb().prepare('INSERT INTO assignment_text_controls VALUES(?,?,?) ON CONFLICT(review_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').run(reviewId,state,now());record(null);return getAssignmentReview(actor,reviewId);
   }
   if(!view.canContinue||!['ready','received'].includes(saved.phase))throw new AppError(409,'Wait for the saved pause boundary before continuing or changing instructions. Uncertain outcomes need reconciliation.');
   const config=textProviderConfig();
   if(fingerprint(config)!==fingerprint(saved.data.config)||config.spendingMode!=='admitted_demo')throw new AppError(409,'The AI configuration changed. Reconcile the saved request before continuing.');
   if(fingerprint(currentTextScope(actor,saved.conversationId))!==saved.scopeHash)throw new AppError(409,'The protected business context changed. Review that change before continuing this saved request.');
   if(original.assignment.attempts.some(a=>['dispatched','unknown'].includes(a.status)||a.discrepancy))throw new AppError(409,'Reconcile outstanding usage before changing this assignment.');
   let parts=original.assignment.parts,partKey=saved.data.metering.partKey,round=saved.data.round;
   let nextData={...saved.data};
   if(input.action==='revise'){
    // Retain paid allocations at their actual usage/rates; unconsumed allocations are replaced.
    const consumed:MeteredPart[]=parts.flatMap(part=>{const attempts=original.assignment.attempts.filter(a=>a.partKey===part.key);if(!attempts.length)return [];const usage=sum(attempts.map(a=>a.usage??{}));return [{...part,maximumCalls:attempts.length,maximumUnits:usage,estimatedUnits:usage}];});
    if(parts.some(p=>!p.key.startsWith('text:')))throw new AppError(409,'Other paid hosts need their own revised scope before this text request can change.');
    const rate=customerTextTariff(config.model);partKey=`text:${fingerprint({request:saved.requestId,event:input.eventKey})}`;
    const maximumUnits={input_tokens:config.maxInputTokens*config.maxRounds,cached_input_tokens:config.maxInputTokens*config.maxRounds,output_tokens:config.maxOutputTokens*config.maxRounds};
    parts=[...consumed,{key:partKey,feature:'core',rateId:rate.id,maximumCalls:config.maxRounds,maximumUnits,estimatedUnits:{input_tokens:Math.ceil(maximumUnits.input_tokens/2),cached_input_tokens:0,output_tokens:Math.ceil(maximumUnits.output_tokens/2)}}];
    // A paid but unprocessed response remains in the immutable control event, not executable.
    round+=saved.phase==='received'?1:0;
    nextData={...nextData,response:null,round,roundLimit:round+config.maxRounds,toolLimit:saved.data.toolCount+config.maxToolCalls,retiredMeteredParts:consumed.map(p=>p.key),revisedInstructions:input.instructions,
     items:[...saved.data.items,{role:'user',content:`Change the remaining work as follows: ${input.instructions}\nCompleted actions and charges remain. Inspect existing delegated plans before changing them; do not repeat completed actions.`}]};
   }
   let scopeHash=saved.scopeHash;
   let assignment=quoteCurrentAssignment(actor,{title:original.assignment.title,scopeHash,revision:original.assignment.revision+1,parts});
   scopeHash=fingerprint(currentTextScope(actor,saved.conversationId));
   if(scopeHash!==assignment.scopeHash)assignment=quoteCurrentAssignment(actor,{title:assignment.title,scopeHash,revision:assignment.revision+1,parts});
   const review=presentCurrentAssignmentQuote(actor,{summary:input.action==='revise'?`Updated remaining instructions: ${input.instructions}\nCompleted actions and charges stay saved. Existing delegated job plans remain until explicitly revised. This maximum includes prior usage and the new bounded reasoning.`:original.presentation.summary,parts:parts.map(p=>({key:p.key,label:input.action==='revise'?(p.key===partKey?'Reason about the updated instructions and perform permitted local steps':'Previously performed reasoning; usage retained'):original.presentation.parts.find(v=>v.key===p.key)!.label}))},[],[original.references]);
   advanceTextExecution(actor,saved,input.action==='revise'?'ready':saved.phase,{...nextData,metering:{assignmentId:assignment.id,revision:assignment.revision,scopeHash,partKey,reviewId:review.id,...(input.action==='continue'&&saved.data.metering.inputCount!==undefined?{inputCount:saved.data.metering.inputCount}:{})}},scopeHash);
   getDb().prepare("UPDATE assignment_text_controls SET state='resumed',updated_at=? WHERE review_id=?").run(now(),reviewId);record(review.id);
   // Explicit continue retains a still-current approval for unchanged work; revisions never do.
   if(input.action==='continue'&&original.assignment.budget.approvedMaximumCents!==null&&original.assignment.budget.approvedMaximumCents>=review.maximumCents&&Date.parse(original.assignment.budget.expiresAt)>Date.now()&&review.canDecide)return decideAssignmentReview(actor,review.id,{quoteId:review.quoteId,revision:review.revision,decision:'approve',eventKey:`continue:${fingerprint(input.eventKey)}`});
   return review;
  });
 }).immediate();
}
