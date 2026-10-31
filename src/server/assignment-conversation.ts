import {controlTextAssignment} from './text-controls';
import {renewTextAssignment} from './text-renewal';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import type {AssignmentReview} from '../lib/assignment-review-contracts';
import {assignmentReviewLabel} from '../lib/assignment-review-contracts';
import type {WorkConversationOptions} from '../lib/work-conversation-contracts';
import {AppError,getDb,now,scopedGet} from './db';
import {requireFeature} from './billing';
import {getAssignmentReview,listAssignmentReviews,decideAssignmentReview,assignmentReviewReference,cancelAssignmentReview} from './assignment-reviews';
import {fingerprint} from './provider-runtime';
import {conversationLink} from './messaging-config';

const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
export const assignmentConversationReference=(reviewId:string)=>`S${fingerprint(reviewId).slice(0,16).toUpperCase()}`;
const result=(message:string,reviews:AssignmentReview[]=[]):ToolResult=>({message,specialistIds:[],artifacts:reviews.filter(review=>!review.contentRestricted&&review.state!=='obsolete').map(review=>({type:'work_run',title:'Assignment spending review',data:{assignmentReviewReference:assignmentReviewReference(review)}}))});
const presentation=(review:AssignmentReview)=>fingerprint({id:review.id,quoteId:review.quoteId,revision:review.revision,title:review.title,summary:review.summary,parts:review.parts,estimated:review.estimatedCents,maximum:review.maximumCents,expires:review.expiresAt});
type Intent={action:'list'|'review'|'status'|'approve'|'deny'|'cancel'|'renew'|'pause'|'continue'|'revise'|'help';target?:string;instructions?:string};
/** Whole employee commands only. No model, retrieved text, quoted sentence or vague yes can approve. */
export function assignmentConversationIntent(message:string):Intent|null {
 const text=message.trim().replace(/[.!?]+$/,'').replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/i,'');let match:RegExpExecArray|null;
 if(/^(?:show|list|review|check)(?: me)?(?: my| the)? (?:spending|spending reviews|cost approvals|assignment costs)$/i.test(text))return {action:'list'};
 if((match=/^(review|show|status|check)(?: (?:spending|cost|assignment))?\s+(S[0-9a-f]{16})$/i.exec(text)))return {action:match[1].toLowerCase()==='review'?'review':'status',target:match[2].toUpperCase()};
 if((match=/^(pause|continue|resume)(?: assignment)?\s+(S[0-9a-f]{16})$/i.exec(text)))return {action:match[1].toLowerCase()==='pause'?'pause':'continue',target:match[2].toUpperCase()};
 if((match=/^(?:revise|change)\s+(S[0-9a-f]{16})\s*:\s*([\s\S]+)$/i.exec(text)))return {action:'revise',target:match[1].toUpperCase(),instructions:match[2]};
 if((match=/^(?:renew|refresh)(?: (?:quote|spending|assignment))?\s+(S[0-9a-f]{16})$/i.exec(text)))return {action:'renew',target:match[1].toUpperCase()};
 if((match=/^(?:cancel|stop)(?: (?:remaining work|assignment|spending))?\s+(S[0-9a-f]{16})$/i.exec(text)))return {action:'cancel',target:match[1].toUpperCase()};
 if((match=/^(approve|deny)\s+(R[0-9a-f]{16})$/i.exec(text)))return {action:match[1].toLowerCase() as 'approve'|'deny',target:match[2].toUpperCase()};
 if(/^(?:yes|approve|deny|approve (?:it|that|the cost|the job)|deny (?:it|that|the cost|the job))$/i.test(text))return {action:'help'};
 return null;
}
type Row={code:string;request_id:string;review_id:string;quote_id:string;revision:number;presentation_hash:string;channel:string;created_at:string;expires_at:string};
function showReview(actor:Actor,review:AssignmentReview,conversationId:string,requestId:string,options:WorkConversationOptions):ToolResult {
 const reference=assignmentConversationReference(review.id);
 if(!review.canDecide)return result(`${reference}: ${assignmentReviewLabel(review)}. Simulated credits: ${money(review.spentCents)} spent, ${money(review.heldCents)} held, ${money(review.maximumCents)} quoted maximum. No new cost decision is available.${review.canContinue?` Say “Continue ${reference}” or “Revise ${reference}: updated instructions”.`:review.canPause?` Say “Pause ${reference}” before changing the remaining work.`:''}${review.canRenew?` Say “Renew ${reference}” to refresh the original request’s quote.`:""}${review.canCancel?` Say “Cancel ${reference}” to stop remaining execution.`:""}`,[review]);
 const prior=getDb().prepare('SELECT * FROM assignment_conversation_reviews WHERE organization_id=? AND office_id=? AND user_id=? AND conversation_id=? AND request_id=?').get(...owner(actor),conversationId,requestId) as Row|undefined;
 if(prior&&(prior.review_id!==review.id||prior.presentation_hash!==presentation(review)||(options.channel??'web')!==prior.channel))throw new AppError(409,'This request already represents a different spending review.');
 const code=prior?.code??`R${randomBytes(8).toString('hex').toUpperCase()}`;
 const message=`${reference}: ${review.title}\n${review.summary}\n${review.parts.map((part,index)=>`${index+1}. ${part.label} (up to ${part.maximumCalls} calls)`).join('\n')}\nSimulated credits: estimate ${money(review.estimatedCents)}, maximum ${money(review.maximumCents)}, spent ${money(review.spentCents)}, held ${money(review.heldCents)}.\nExpires ${review.expiresAt}.\nApprove ${code} / Deny ${code}`;
 const channel=options.channel??'web',url=conversationLink(conversationId);
 if(['sms','slack'].includes(channel)&&message.length+(url?url.length+2:0)>(channel==='sms'?700:3500))return result(`The complete spending scope for ${reference} is too long for this channel. Open your ongoing Agent conversation and say “Review spending ${reference}”, or use Work → Copilot jobs. The simulated maximum is ${money(review.maximumCents)}. No approval code was issued here.`,[review]);
 if(!prior)getDb().prepare('INSERT INTO assignment_conversation_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(code,...owner(actor),conversationId,requestId,review.id,review.quoteId,review.revision,presentation(review),channel,now(),review.expiresAt);
 return result(message,[review]);
}
function decide(actor:Actor,intent:Intent,conversationId:string,requestId:string,options:WorkConversationOptions):ToolResult {
 const row=getDb().prepare('SELECT * FROM assignment_conversation_reviews WHERE code=? AND organization_id=? AND office_id=? AND user_id=? AND conversation_id=?').get(intent.target,...owner(actor),conversationId) as Row|undefined;
 if(!row)throw new AppError(404,'That spending code is not available in this conversation. Ask to review spending first.');
 const received=options.receivedAt?Date.parse(z.string().datetime({offset:true}).parse(options.receivedAt)):Date.now();
 if(received>Date.now()||options.receivedAt&&received<=Date.parse(row.created_at))throw new AppError(409,'This message predates the spending review. Retrieve its current scope first.');
 if(Date.parse(row.expires_at)<=Date.now())throw new AppError(409,'This spending review expired. A current quote is needed.');
 if(['sms','slack'].includes(row.channel)){
  const receipt=getDb().prepare(`SELECT o.updated_at FROM assistant_turns a JOIN messaging_outbox o ON o.reference_id=json_extract(a.result,'$.messageId') JOIN messaging_links l ON l.id=o.link_id
   WHERE a.organization_id=? AND a.office_id=? AND a.user_id=? AND a.conversation_id=? AND a.request_id=? AND a.status='completed'
   AND o.kind='reply' AND o.status IN ('accepted','delivered') AND l.organization_id=a.organization_id AND l.office_id=a.office_id AND l.user_id=a.user_id AND l.active=1 AND l.opted_out=0 ORDER BY o.updated_at LIMIT 1`)
   .get(...owner(actor),conversationId,row.request_id) as {updated_at:string}|undefined;
  if(!receipt||Date.parse(receipt.updated_at)>=received)throw new AppError(409,'The complete spending review was not confirmed available before this message. Review it in the app or wait for delivery.');
 }
 const review=getAssignmentReview(actor,row.review_id);
 if(review.contentRestricted||review.quoteId!==row.quote_id||review.revision!==row.revision||presentation(review)!==row.presentation_hash)throw new AppError(409,'This spending scope changed. Retrieve its current review.');
 if(!review.canDecide)return showReview(actor,review,conversationId,requestId,options);
 const updated=decideAssignmentReview(actor,review.id,{quoteId:row.quote_id,revision:row.revision,decision:intent.action as 'approve'|'deny',eventKey:`conversation:${fingerprint({conversationId,requestId})}`});
 return result(intent.action==='approve'?`Approved the reviewed scope up to ${money(review.maximumCents)} in simulated credits. The original saved request is ready for the worker to continue; approval alone does not mean it finished.`:'Spending declined. No new paid execution is authorized by this review.',[updated]);
}
/** Invoke only before model execution with the authenticated employee message, in the chat transaction. */
export function executeAssignmentConversationAction(actor:Actor,message:string,conversationId:string,requestId:string,options:WorkConversationOptions={}):ToolResult|null {
 const intent=assignmentConversationIntent(message);if(!intent)return null;
 scopedGet(actor,'conversations',conversationId,true);if(!['cancel','pause'].includes(intent.action))requireFeature(actor,'core');z.string().min(1).max(150).parse(requestId);
 return getDb().transaction(()=>{
  try{
   if(intent.action==='approve'||intent.action==='deny')return decide(actor,intent,conversationId,requestId,options);
   const reviews=listAssignmentReviews(actor);
   if(intent.action==='help')return reviews.some(review=>review.canDecide)?result('Use the exact Approve R… or Deny R… command from the spending review. Say “Show my spending” to select it. A general yes does not approve a cost.'):null;
   if(intent.action==='list'){
    const selected=reviews.filter(review=>!review.contentRestricted&&(review.state!=='obsolete'||review.canRenew)).slice(0,8);
    return result(selected.length?selected.map(review=>`${assignmentConversationReference(review.id)} — ${review.title}: ${assignmentReviewLabel(review)}, ${money(review.maximumCents)} simulated maximum.`).join('\n')+'\nSay “Review spending S…” with the intended reference.':'No available assignment spending reviews are saved. You can also check Work → Copilot jobs.',selected);
   }
   const matches=reviews.filter(review=>assignmentConversationReference(review.id)===intent.target&&(['cancel','pause'].includes(intent.action)||!review.contentRestricted));
   if(matches.length!==1)throw new AppError(404,'That spending review is unavailable. Say “Show my spending” to select a current review.');
   if(['pause','continue','revise'].includes(intent.action)){const review=matches[0],updated=controlTextAssignment(actor,review.id,{quoteId:review.quoteId,revision:review.revision,eventKey:`conversation:${fingerprint({conversationId,requestId})}`,action:intent.action as 'pause'|'continue'|'revise',...(intent.instructions?{instructions:intent.instructions}:{})});return result(intent.action==='pause'?`${assignmentReviewLabel(updated)}. Completed work and usage stay saved. Say “Continue ${assignmentConversationReference(updated.id)}” or “Revise ${assignmentConversationReference(updated.id)}: your updated instructions” once paused.`:`Updated remaining work on the original assignment. ${money(updated.spentCents)} already spent; ${money(updated.maximumCents)} maximum includes completed and remaining work. ${updated.canDecide?`Say “Review spending ${assignmentConversationReference(updated.id)}” to decide the revised cost.`:'The worker can continue the saved request.'}`,[updated]);}
   if(intent.action==='renew'){const review=matches[0],updated=renewTextAssignment(actor,review.id,{quoteId:review.quoteId,revision:review.revision,eventKey:`conversation:${fingerprint({conversationId,requestId})}`});return result(`The original request has an updated quote: estimate ${money(updated.estimatedCents)}, maximum ${money(updated.maximumCents)} in simulated credits. ${updated.canDecide?`Say “Review spending ${assignmentConversationReference(updated.id)}” for the current approval code.`:'The original request is ready for the worker to continue within this maximum.'} No AI generation was dispatched by the renewal command.`,[updated]);}
   if(intent.action==='cancel'){const review=matches[0],updated=cancelAssignmentReview(actor,review.id,{quoteId:review.quoteId,revision:review.revision,eventKey:`conversation:${fingerprint({conversationId,requestId})}`});return result(updated.executionState==='stopping'?'Remaining execution stopped. An in-flight or uncertain request still needs its outcome checked; held credit remains reserved. Completed work and incurred usage stay saved.':'Remaining assignment canceled. Completed work and incurred credits stay saved; unused credit was released.',[updated]);}
   return showReview(actor,matches[0],conversationId,requestId,options);
  }catch(error){if(error instanceof AppError&&[400,402,403,404,409,422].includes(error.status))return result(`${error.message} Nothing was approved by this command.`);throw error;}
 }).immediate();
}
