import {destinationFromArtifact,workspacePath} from '../lib/workspace-links';
import {proactiveMessageFor} from './proactive-delivery';
import {proactiveOwnsTopic} from './proactive-policy';
import type { Actor,Artifact,Notification,ResearchJob } from '../lib/contracts';
import { AppError,getDb,now,scopedGet } from './db';
import { chat } from './orchestrator';
import { getConversation,notificationsAllowed } from './services';
import { messagingConversation,queueOutbound,requireMessagingLink,type MessagingLink,type Outbox } from './messaging';
import { channelConfigured,conversationLink,dailyMessageLimit,messagingEnabled,messagingOrigin,sendingEnabled } from './messaging-config';
import { releaseUsage,reserveUsage } from './metering';
import { applyTwilioReceipt,DeliveryRejected,fetchTwilioReceipt,sendChannelMessage } from './messaging-providers';
import { taskForReminder } from './task-actions';
import { confirmConversationFocusDelivery,setConversationFocus } from './conversation-focus';

interface Inbox {id:string;link_id:string;body:string;received_at:string}
export async function processMessagingInbox(){
 if(!messagingEnabled())return;
 recordConfirmedReminderFocus();
 const db=getDb();
 db.prepare("UPDATE messaging_inbox SET status='unknown',error_code='interrupted_review_required',updated_at=? WHERE status='processing' AND updated_at<?").run(now(),new Date(Date.now()-25*60_000).toISOString());
 const rows=db.prepare("SELECT id,link_id,body,received_at FROM messaging_inbox WHERE status='queued' ORDER BY received_at,rowid LIMIT 10").all() as Inbox[];
 for(const row of rows){
  let conversationId:string;
  try{
   const {actor,link}=requireMessagingLink(row.link_id);conversationId=messagingConversation(actor);
   // A dashboard turn can be using the same conversation. Wait without consuming this message.
   if(db.prepare("SELECT 1 FROM assistant_turns WHERE conversation_id=? AND status='running' AND started_at>?").get(conversationId,new Date(Date.now()-20*60_000).toISOString()))continue;
   if(!db.prepare("UPDATE messaging_inbox SET status='processing',updated_at=? WHERE id=? AND status='queued'").run(now(),row.id).changes)continue;
   await chat(actor,row.body,conversationId,`channel:${row.id}`,link.provider,{receivedAt:row.received_at});
   const fresh=requireMessagingLink(row.link_id);
   const turn=db.prepare('SELECT result FROM assistant_turns WHERE organization_id=? AND office_id=? AND user_id=? AND request_id=?').get(actor.organizationId,actor.officeId,actor.id,`channel:${row.id}`) as {result:string};
   const answer=JSON.parse(turn.result) as {messageId:string};if(!answer.messageId)throw new Error('Missing answer');
   db.transaction(()=>{queueOutbound(fresh.link,`reply:${row.id}`,'reply','',answer.messageId);db.prepare("UPDATE messaging_inbox SET status='completed',updated_at=? WHERE id=?").run(now(),row.id);}).immediate();
   break; // Deliver this answer before starting another potentially long AI turn.
  }catch(error){
   const canceled=error instanceof AppError&&[402,403,404].includes(error.status);
   db.prepare("UPDATE messaging_inbox SET status=?,error_code=?,updated_at=? WHERE id=? AND status IN ('queued','processing')").run(canceled?'canceled':'failed',canceled?'connection_or_access_changed':'request_failed_review_conversation',now(),row.id);
  }
 }
}
function noticeText(actor:Actor,id:string){
 const notice=scopedGet<Notification>(actor,'notifications',id,true);if(notice.read)return null;
 const row=getDb().prepare('SELECT dedupe_key FROM notifications WHERE id=?').get(id) as {dedupe_key:string};
 if(row.dedupe_key.startsWith('task-due:')){
  if(proactiveOwnsTopic(actor,'tasks'))return null;
  const task=taskForReminder(actor,id);if(!task)return null;
  return `Reminder: ${task.title}\nReply “done”, “snooze 2 hours”, or “move it to tomorrow at 9am”. If several reminders are active, include the task name.`;
 }
 if(row.dedupe_key.startsWith('research-done:')){const job=scopedGet<ResearchJob>(actor,'research_jobs',row.dedupe_key.slice(14),true);if(job.status==='completed')return 'Your research is ready. Open AgentDesk NW to review the saved results and evidence.';}
 if(row.dedupe_key.startsWith('research-stopped:')){const job=scopedGet<ResearchJob>(actor,'research_jobs',row.dedupe_key.slice(17).split(':')[0],true);if(job.status==='failed')return 'Your research needs attention. Open AgentDesk NW to review its status and saved work.';}
 return null;
}
export function queueMessagingReminders(){
 if(!messagingEnabled())return;
 const links=getDb().prepare('SELECT * FROM messaging_links WHERE active=1 AND opted_out=0 AND reminders=1').all() as MessagingLink[];
 for(const link of links){
  try{const {actor}=requireMessagingLink(link.id);if(!notificationsAllowed(actor))continue;
   const notices=getDb().prepare("SELECT id FROM notifications WHERE organization_id=? AND office_id=? AND owner_id=? AND json_extract(data,'$.createdAt')>=? ORDER BY rowid LIMIT 100").all(actor.organizationId,actor.officeId,actor.id,link.updated_at) as {id:string}[];
   for(const notice of notices){
    const sent=getDb().prepare("SELECT COUNT(*) n FROM messaging_outbox WHERE link_id=? AND kind='notice' AND created_at>? AND status NOT IN ('canceled','failed')").get(link.id,new Date(Date.now()-86400_000).toISOString()) as {n:number};if(sent.n>=10)break;
    try{if(noticeText(actor,notice.id))queueOutbound(link,`notice:${link.id}:${notice.id}`,'notice','',notice.id);}catch{/* A removed or newly restricted record is not a deliverable reminder. */}
   }
  }catch{/* Disconnected, expired or removed membership. */}
 }
}
/** UCS-2 is the conservative upper bound, including surrogate pairs. */
export function smsReservation(body:string){return body.length<=70?1:Math.ceil(body.length/67);}
export function formatChannelReply(text:string,provider:'sms'|'slack',conversationId:string,artifacts:Artifact[]=[]){
 const targets=artifacts.map(destinationFromArtifact).filter(item=>item!==null),unique=[...new Map(targets.map(target=>[workspacePath(target),target])).values()];
 const origin=messagingOrigin(),focused=origin&&unique.length===1?`${origin}${workspacePath(unique[0])}`:null;
 const url=conversationLink(conversationId),limit=provider==='sms'?700:3500;
 const complete=`${text}${focused?`\n\nOpen saved work: ${focused}`:url?`\n\n${url}`:''}`;if(complete.length<=limit)return complete;
 const ordinary=`${text}${url?`\n\n${url}`:''}`;if(ordinary.length<=limit)return ordinary;
 const suffix=url?`\n\nFull reply: ${url}`:'\n\nOpen your ongoing Copilot conversation for the full reply.';
 const prefix='Excerpt:\n',budget=limit-prefix.length-suffix.length;
 // Keep complete paragraphs or sentences. Never cut a URL, amount, task name or caution mid-sentence.
 const blocks=text.trim().split(/\n\s*\n/);let excerpt='';
 for(const block of blocks){const next=excerpt?`${excerpt}\n\n${block}`:block;if(next.length>budget)break;excerpt=next;}
 if(!excerpt){const sentences=blocks[0].match(/[^.!?]+[.!?](?=\s|$)/g)??[];for(const sentence of sentences){const next=excerpt?`${excerpt} ${sentence.trim()}`:sentence.trim();if(next.length>budget)break;excerpt=next;}}
 return excerpt?`${prefix}${excerpt}${suffix}`:`Your Copilot response is ready.${suffix}`;
}

/** Confirmed transport receipts establish a referent; queued/unknown/failed deliveries never do. */
export function recordConfirmedReminderFocus(){
 const db=getDb();
 const rows=db.prepare(`SELECT o.* FROM messaging_outbox o WHERE o.kind='notice' AND o.status IN ('accepted','delivered') AND o.updated_at>=?
   AND NOT EXISTS(SELECT 1 FROM conversation_focus_events f WHERE f.event_key='reminder:'||o.id) ORDER BY o.updated_at,o.rowid LIMIT 100`)
   .all(new Date(Date.now()-24*60*60_000).toISOString()) as Outbox[];
 for(const row of rows){
  try{const {actor}=requireMessagingLink(row.link_id);if(!row.reference_id)continue;const task=taskForReminder(actor,row.reference_id);if(!task)continue;
   setConversationFocus(actor,messagingConversation(actor),{kind:'task',id:task.id,version:task.version??0,source:'reminder',sourceEventId:row.id,eventKey:`reminder:${row.id}`});
  }catch{/* Access changes or superseded reminders cannot create reply context. */}
 }
}
function deliveryBody(row:Outbox,actor:Actor,link:MessagingLink){
 const conversationId=messagingConversation(actor);
 if(row.kind==='system')return row.body;
 if(row.kind==='notice'){
  if(!link.reminders)return null;
  if(row.reference_id?.startsWith('proactive:'))return proactiveMessageFor(actor,row.reference_id.slice(10),link);
  const text=noticeText(actor,row.reference_id!);return text?formatChannelReply(text,link.provider,conversationId):null;
 }
 const answer=getConversation(actor,conversationId).messages.find(message=>message.id===row.reference_id&&message.role==='assistant');
 if(!answer)return null;
 return formatChannelReply(answer.content,link.provider,conversationId,answer.artifacts);
}
export async function processMessagingOutbox(send=sendChannelMessage){
 if(!sendingEnabled())return;
 const db=getDb();
 // A process may have stopped after the provider accepted a request. Never automatically resend it.
 db.prepare("UPDATE messaging_outbox SET status='unknown',error_code='delivery_unconfirmed',updated_at=? WHERE status='dispatching' AND updated_at<?").run(now(),new Date(Date.now()-60_000).toISOString());
 const rows=db.prepare("SELECT * FROM messaging_outbox WHERE status='queued' ORDER BY created_at,rowid LIMIT 10").all() as Outbox[];
 for(const row of rows){
  let actor:Actor|undefined;
  try{
   const current=requireMessagingLink(row.link_id);actor=current.actor;const link=current.link;
   if(!channelConfigured(link.provider))continue;
   if(row.kind==='notice'&&!notificationsAllowed(actor))continue;
   const body=deliveryBody(row,actor,link);if(!body){db.prepare("UPDATE messaging_outbox SET status='canceled',updated_at=? WHERE id=?").run(now(),row.id);continue;}
   const count=db.prepare("SELECT COUNT(*) n FROM messaging_outbox o JOIN messaging_links l ON l.id=o.link_id WHERE l.provider=? AND l.account_id=? AND o.updated_at>? AND o.status IN ('dispatching','accepted','delivered','unknown')").get(link.provider,link.account_id,new Date(Date.now()-86400_000).toISOString()) as {n:number};
   if(count.n>=dailyMessageLimit())continue;
   const segments=link.provider==='sms'?smsReservation(body):0;
   const claimed=db.transaction(()=>{
    if(!db.prepare("UPDATE messaging_outbox SET status='dispatching',segments_reserved=?,updated_at=? WHERE id=? AND status='queued'").run(segments,now(),row.id).changes)return false;
    if(link.provider==='sms')reserveUsage(actor!,{category:'sms_segments',operationId:`sms:out:${row.id}`,quantity:segments,source:'Employee Copilot SMS delivery'});
    return true;
   }).immediate();if(!claimed)continue;
   requireMessagingLink(row.link_id);
   const receipt=await send(link,{...row,segments_reserved:segments},body);
   if(link.provider==='sms')applyTwilioReceipt(row.id,{sid:receipt.id,accountSid:link.account_id,from:process.env.TWILIO_PHONE_NUMBER!,to:link.address,status:receipt.status,numSegments:receipt.segments});
   else db.prepare("UPDATE messaging_outbox SET status='accepted',provider_id=?,provider_status=?,updated_at=? WHERE id=? AND status='dispatching'").run(receipt.id,receipt.status,now(),row.id);
   confirmConversationFocusDelivery(actor,messagingConversation(actor));
   recordConfirmedReminderFocus();
  }catch(error){
   const definitive=error instanceof DeliveryRejected||error instanceof AppError&&[402,403,404].includes(error.status);
   if(definitive&&actor)releaseUsage(actor,'sms_segments',`sms:out:${row.id}`);
   db.prepare("UPDATE messaging_outbox SET status=?,error_code=?,updated_at=? WHERE id=? AND status IN ('queued','dispatching')").run(definitive?'failed':'unknown',definitive?'delivery_rejected_or_access_changed':'delivery_unconfirmed',now(),row.id);
  }
 }
}
export async function reconcileMessagingDeliveries(fetchReceipt=fetchTwilioReceipt){
 if(!channelConfigured('sms'))return;
 const db=getDb(),cutoff=new Date(Date.now()-60_000).toISOString();
 const rows=db.prepare("SELECT o.* FROM messaging_outbox o JOIN messaging_links l ON l.id=o.link_id WHERE l.provider='sms' AND l.account_id=? AND o.provider_id IS NOT NULL AND (o.status IN ('accepted','unknown') OR o.segments_actual IS NULL) AND COALESCE(o.reconcile_at,o.updated_at)<? ORDER BY COALESCE(o.reconcile_at,o.updated_at) LIMIT 3").all(process.env.TWILIO_ACCOUNT_SID,cutoff) as Outbox[];
 for(const row of rows){db.prepare('UPDATE messaging_outbox SET reconcile_at=? WHERE id=?').run(now(),row.id);try{const receipt=await fetchReceipt(row.provider_id!);applyTwilioReceipt(row.id,receipt);}catch{/* Retain unresolved usage and never infer delivery or retry a send. */}}
}
export async function processMessaging(){await processMessagingInbox();queueMessagingReminders();await processMessagingOutbox();await reconcileMessagingDeliveries();recordConfirmedReminderFocus();}
