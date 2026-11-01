import {localAssignmentHasPendingWork,localAssignmentOutcome,textAllocationsFinished} from './local-assignment-work';
import {releaseWorkBudget} from './work-budget';
import {assignmentConversationReference} from './assignment-conversation';
import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import {AppError,getDb} from './db';
import {currentAssignment} from './assignment-roots';
import {currentMeteredAssignment,quoteCurrentAssignment,admitCurrentAssignmentAttempt} from './assignment-metering';
import {customerTextTariff,assertMeteredRateCurrent} from './metered-rates';
import {getMeteredAssignment,recordMeteredReceipt,finishMeteredAssignment} from './metered-work';
import {presentCurrentAssignmentQuote,getAssignmentReview} from './assignment-reviews';
import {advanceTextExecution,type TextExecution} from './text-execution';
import {fingerprint} from './provider-runtime';
import type {UsageUnits} from '../lib/metered-work-contracts';

/** Optional development admission mode. Customer tariff is explicit; provider invoice expense stays unknown.
 * This prices the bounded text loop. Other paid hosts and existing sample-job charges remain separate.
 */
export function prepareTextSpending(actor:Actor,execution:TextExecution):TextExecution {
 if(execution.data.config.spendingMode!=='admitted_demo'||execution.data.metering)return execution;
 if(execution.phase!=='ready'||execution.data.round!==0)throw new AppError(409,'Existing AI execution cannot be repriced as a new zero-spend request.');
 const config=execution.data.config,rate=customerTextTariff(config.model),binding=currentAssignment(actor);
 // Do not treat an earlier operational-only model call in this root as zero spending.
 const uncovered=getDb().prepare("SELECT 1 FROM assignment_bindings b JOIN provider_operations p ON p.organization_id=b.organization_id AND p.office_id=b.office_id AND p.user_id=b.user_id AND substr(p.operation_id,1,length('text:'||b.host_id||':'))='text:'||b.host_id||':' LEFT JOIN text_executions e ON e.organization_id=b.organization_id AND e.office_id=b.office_id AND e.user_id=b.user_id AND e.request_id=b.host_id WHERE b.root_id=? AND b.host_kind='turn' AND (e.data IS NULL OR json_extract(e.data,'$.metering') IS NULL) LIMIT 1").get(binding.rootId);
 if(uncovered)throw new AppError(409,'This assignment contains earlier unpriced AI work. Reconcile it before preparing a spending quote.');
 return getDb().transaction(()=>{
  let prior:ReturnType<typeof currentMeteredAssignment>|null=null;
  const exists=getDb().prepare('SELECT 1 FROM metered_assignments WHERE organization_id=? AND office_id=? AND user_id=? AND assignment_key=?').get(actor.organizationId,actor.officeId,actor.id,`root:${binding.rootId}`);
  if(exists)prior=currentMeteredAssignment(actor);
  if(prior&&prior.parts.some(part=>prior!.attempts.filter(attempt=>attempt.partKey===part.key&&!['dispatched','unknown'].includes(attempt.status)).length<part.maximumCalls))throw new AppError(409,'Other paid parts in this assignment still need shared execution support before this text host can continue.');
  const partKey=`text:${fingerprint(execution.requestId)}`;
  if(prior?.parts.some(part=>part.key===partKey))throw new AppError(409,'This text allocation already exists without its saved execution binding.');
  const revision=(prior?.revision??0)+1,maximumUnits={input_tokens:config.maxInputTokens*config.maxRounds,cached_input_tokens:config.maxInputTokens*config.maxRounds,output_tokens:config.maxOutputTokens*config.maxRounds};
  const assignment=quoteCurrentAssignment(actor,{title:'Bounded Copilot reasoning',scopeHash:execution.scopeHash,revision,parts:[...(prior?.parts??[]),{key:partKey,feature:'core',rateId:rate.id,maximumCalls:config.maxRounds,maximumUnits,estimatedUnits:{input_tokens:Math.ceil(maximumUnits.input_tokens/2),cached_input_tokens:0,output_tokens:Math.ceil(maximumUnits.output_tokens/2)}}]});
  const review=presentCurrentAssignmentQuote(actor,{summary:'Review the bounded reasoning and permitted local steps for this request. Local steps add no AI credit charge. This simulated quote covers the listed work only.',parts:assignment.parts.map(part=>({key:part.key,label:part.key===partKey?'Reason, consult permitted specialists within the shared request allowance, and prepare the answer':'Previously quoted assignment work'}))});
  return advanceTextExecution(actor,execution,'ready',{...execution.data,metering:{assignmentId:assignment.id,revision,scopeHash:execution.scopeHash,partKey,reviewId:review.id}});
 }).immediate();
}
export function textSpendingWait(actor:Actor,execution:TextExecution):ToolResult|null {
 const metering=execution.data.metering;if(!metering)return null;
 const assignment=currentMeteredAssignment(actor);
 if(assignment.id!==metering.assignmentId||assignment.revision!==metering.revision||assignment.scopeHash!==metering.scopeHash)throw new AppError(409,'The whole-assignment quote changed. Review the saved scope before continuing.');
 const review=getAssignmentReview(actor,metering.reviewId);
 if(assignment.budget.status==='awaiting_approval')return {message:`This Copilot request needs your spending decision before AI generation. Estimated reasoning credits: $${(review.estimatedCents/100).toFixed(2)}; maximum: $${(review.maximumCents/100).toFixed(2)}. Say “Review spending ${assignmentConversationReference(review.id)}” or open Work → Copilot jobs to approve or deny. This is a simulated customer-credit charge; the original request is saved.`,specialistIds:[],artifacts:[{type:'work_run',title:'Review saved assignment spending'}]};
 if(!['approved','reserved'].includes(assignment.budget.status)||['obsolete','closed'].includes(review.state))throw new AppError(409,'The current assignment quote is not available for execution. Review its saved decision and expiry.');
 return null;
}
export async function countTextInput(actor:Actor,execution:TextExecution,payload:Record<string,unknown>,currentScope:()=>string):Promise<number|null>{
 const metering=execution.data.metering;if(!metering)return null;
 if(textSpendingWait(actor,execution))throw new AppError(409,'Approve the current assignment before requesting AI generation.');
 const assignment=getMeteredAssignment(actor,metering.assignmentId),part=assignment.parts.find(p=>p.key===metering.partKey)!;
 assertMeteredRateCurrent(assignment.rates.find(rate=>rate.id===part.rateId)!);
 const {max_output_tokens,service_tier,store,include,...countPayload}=payload;void max_output_tokens;void service_tier;void store;void include;
 const response=await fetch('https://api.openai.com/v1/responses/input_tokens',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(countPayload),signal:AbortSignal.timeout(execution.data.config.requestTimeoutMs)});
 if(!response.ok)throw new AppError(502,'Input-token counting failed. No AI generation was dispatched.');
 const body=await response.text();if(body.length>2000)throw new AppError(502,'The input count response was invalid.');
 let raw:unknown;try{raw=JSON.parse(body);}catch{throw new AppError(502,'The input count response was invalid.');}
 const counted=z.object({object:z.literal('response.input_tokens'),input_tokens:z.number().int().nonnegative().max(execution.data.config.maxInputTokens)}).safeParse(raw);
 if(!counted.success)throw new AppError(413,'This request exceeds its quoted input limit or has no trustworthy token count. No AI generation was dispatched.');
 if(currentScope()!==execution.scopeHash)throw new AppError(409,'Protected context changed while input was counted. No AI generation was dispatched.');
 if(textSpendingWait(actor,execution))throw new AppError(409,'The assignment needs a current cost decision.');
 return counted.data.input_tokens;
}
export function admitTextSpending(actor:Actor,execution:TextExecution,payload:unknown,inputTokens:number|null){
 const metering=execution.data.metering;if(!metering)return;
 if(inputTokens===null)throw new AppError(409,'A counted input is required before AI generation.');
 const claim=admitCurrentAssignmentAttempt(actor,{revision:metering.revision,scopeHash:metering.scopeHash,attemptId:`text:${fingerprint({requestId:execution.requestId,round:execution.data.round})}`,partKey:metering.partKey,requestHash:fingerprint(payload),bounds:{input_tokens:inputTokens,cached_input_tokens:inputTokens,output_tokens:execution.data.config.maxOutputTokens}});
 if(!claim.dispatch)throw new AppError(409,'This AI request was already admitted. Reconcile its original outcome instead of sending it again.');
}
export function settleTextSpending(actor:Actor,execution:TextExecution,input:{status:'succeeded'|'failed'|'canceled'|'unknown';usage:UsageUnits|null;responseId:string|null;rejected?:boolean}){
 const metering=execution.data.metering;if(!metering)return;
 const value=recordMeteredReceipt(actor,{assignmentId:metering.assignmentId,attemptId:`text:${fingerprint({requestId:execution.requestId,round:execution.data.round})}`,status:input.status,usage:input.usage,responseId:input.responseId,providerCostMicros:input.rejected?0:null});
 return value;
}
export function finishTextSpending(actor:Actor,execution:TextExecution,outcome:'completed'|'canceled'){
 if(execution.data.metering){
  if(outcome==='completed'&&!textAllocationsFinished(actor,execution.data.metering.assignmentId))return;
  // All paid text rounds are final. Keep the assignment open for its included local
  // children without tying up credit while an employee answers a free-work question.
  if(outcome==='completed'&&localAssignmentHasPendingWork(actor,execution.data.metering.assignmentId)){releaseWorkBudget(actor,execution.data.metering.assignmentId);return;}
  finishMeteredAssignment(actor,execution.data.metering.assignmentId,outcome==='completed'?localAssignmentOutcome(actor,execution.data.metering.assignmentId):outcome);
 }
}

/** A stop may arrive while transport is in flight. Keep its receipt, but never execute the returned tools. */
export function assertTextAssignmentRunning(actor:Actor,execution:TextExecution){
 if(!execution.data.metering)return;
 const value=getMeteredAssignment(actor,execution.data.metering.assignmentId);
 if(value.stopRequested||['canceled','completed','paused','reconciling'].includes(value.status))throw new AppError(409,'The assignment stopped. No further tools or AI requests will run. Completed work and incurred usage remain saved.');
}
