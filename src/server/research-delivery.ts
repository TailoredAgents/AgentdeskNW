import type {Actor,Artifact,ResearchJob} from '../lib/contracts';
import {getDb} from './db';
import {addMessage} from './services';
import {getAssignmentReview,assignmentReviewReference} from './assignment-reviews';
import {queueTextContinuationReply} from './text-delivery';
import type {TextState} from './text-execution';
import type {ResearchSpendingState} from './research-spending';
import {researchSourceVisible} from './research-spending';

/** Saved once beside the worker transition, addressed only to the original conversation/transport. */
export function publishResearchUpdate(actor:Actor,job:ResearchJob,reviewId?:string){
 const row=getDb().prepare('SELECT parent_request_id,data FROM metered_research_hosts WHERE job_id=? AND organization_id=? AND office_id=? AND user_id=?').get(job.id,actor.organizationId,actor.officeId,actor.id) as {parent_request_id:string|null;data:string}|undefined;
 if(!row?.parent_request_id)return;
 const execution=getDb().prepare('SELECT conversation_id,data FROM text_executions WHERE request_id=? AND organization_id=? AND office_id=? AND user_id=?').get(row.parent_request_id,actor.organizationId,actor.officeId,actor.id) as {conversation_id:string;data:string}|undefined;
 if(!execution)return;
 if(!researchSourceVisible(actor,job.id))return;
 const event=reviewId?`review:${reviewId}`:`${job.status}:${job.attempt}`;
 if(getDb().prepare('SELECT 1 FROM research_conversation_events WHERE job_id=? AND event_key=?').get(job.id,event))return;
 const data=JSON.parse(execution.data) as TextState,state=JSON.parse(row.data) as ResearchSpendingState;
 const artifacts:Artifact[]=[{type:'job',id:job.id,title:'Saved public-source research'}];
 let content:string;
 if(reviewId){const review=getAssignmentReview(actor,reviewId);if(!review.canDecide)return;
  content=`Your research is waiting for a cost decision. The entire assignment has a maximum of $${(review.maximumCents/100).toFixed(2)} in simulated credits, including earlier work. Say “Review spending ${review.conversationReference}” to review and approve or deny. No research request has started under this quote.`;
  artifacts.push({type:'work_run',title:'Research spending review',data:{assignmentReviewReference:assignmentReviewReference(review)}});
 }else{
  if(!['completed','failed','canceled'].includes(job.status))return;
  content=job.status==='completed'?`Your research has finished with ${job.prospects.length} public-source candidates. Their identities, purchases and contact details remain unverified. Ask me to review the saved evidence or help plan the next step.`:job.status==='canceled'?'The remaining research was canceled. Completed work and incurred usage remain saved.':'Your research needs attention. Saved work is retained; an uncertain request will not be repeated. Open the research job or ask for its status.';
  if(state.reviewId){const review=getAssignmentReview(actor,state.reviewId);content+=` Recorded assignment usage: $${(review.spentCents/100).toFixed(2)}; $${(review.heldCents/100).toFixed(2)} remains held.`;}
 }
 const message=addMessage(actor,execution.conversation_id,{role:'assistant',content,artifacts,specialistIds:['investor-hunter']});
 getDb().prepare('INSERT INTO research_conversation_events VALUES(?,?,?)').run(job.id,event,message.id);
 queueTextContinuationReply(actor,`research:${job.id}:${event}`,execution.conversation_id,message.id,data.request?.replyTarget);
}
