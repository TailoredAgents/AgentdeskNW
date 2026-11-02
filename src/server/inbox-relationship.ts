import type {Actor} from '../lib/contracts';
import type {InboxConversation,InboxThreadDetail} from '../lib/communications-contracts';
import {inboxConversationKey} from '../lib/inbox-conversations';
import {getInboxState,getInboxThread} from './communications';
import {getDb} from './db';

/** Browser-only projection; no new model context, action authority or cached source copies. */
export function getInboxConversation(actor:Actor,id:string):InboxThreadDetail&{conversation:InboxConversation}{
 return getDb().transaction(()=>{
  const detail=getInboxThread(actor,id),key=inboxConversationKey(detail.thread);
  const candidates=getInboxState(actor).threads.filter(thread=>inboxConversationKey(thread)===key);
  // Always include the selected thread. Other subjects retain their own source,
  // recipient, status, drafts and exact review; source guards run on every read.
  const ids=[id,...candidates.filter(thread=>thread.id!==id).map(thread=>thread.id)].slice(0,40);
  const records=ids.map(threadId=>threadId===id?detail:getInboxThread(actor,threadId));
  const messages=records.flatMap(record=>record.messages).sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)||a.id.localeCompare(b.id));
  const evidence=(detail.investorContext?.evidence??[]).filter(item=>item.kind==='observation'||item.kind==='debrief'||item.kind==='relationship'&&/^Recorded (call|note)$/.test(item.label))
   .sort((a,b)=>(a.recordedAt??'').localeCompare(b.recordedAt??'')||a.id.localeCompare(b.id));
  return {...detail,conversation:{key,threads:records.map(record=>({thread:record.thread,account:record.account})),messages:messages.slice(-200),evidence:evidence.slice(-60),totalThreads:candidates.length,totalMessages:messages.length,totalEvidence:evidence.length}};
 })();
}
