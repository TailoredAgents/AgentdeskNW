import type {Actor,Artifact} from '../lib/contracts';
import {getDb} from './db';
import {getInboxState,getInboxThread} from './communications';
import {getConversation} from './services';

export interface InboxReplyCommand {conversationId:string;requestId:string;message:string;receivedAt?:string}
export function inboxSourceForRequest(message:string):'company'|'external'|null {
 return /\b(?:company|salesforce)\b/i.test(message)?'company':/\b(?:external|gmail|outlook)\b/i.test(message)?'external':null;
}
export function inboxThreadsForRequest(actor:Actor,message:string){
 const inbox=getInboxState(actor),source=inboxSourceForRequest(message);
 const accounts=inbox.accounts.filter(account=>source===null||(source==='company')===(account.source.system==='salesforce'));
 return inbox.threads.filter(thread=>accounts.some(account=>account.id===thread.accountId));
}
const requestPrefix='(?:(?:yes|yeah|okay|ok|sure)[,!.]?\\s+)?(?:(?:please|can you|could you|would you)\\s+)?';
/** A short employee instruction only; source prose and hypothetical statements are not consent. */
export function requestsFocusedInboxReply(message:string){
 return new RegExp(`^${requestPrefix}(?:draft|prepare|compose|write)\\s+(?:(?:a|the)\\s+)?(?:(?:reply|response)(?:\\s+(?:to|for)?\\s*(?:this|that|it|him|her|them)(?:\\s+(?:email|message|thread))?)?|(?:this|that)(?:\\s+(?:reply|response|email|message))?)[.!?]?$`,'i').test(message.trim());
}
function requestsInboxReply(message:string){
 return new RegExp(`(?:^|[.!?]\\s+|\\band\\s+)${requestPrefix}(?:draft|prepare|compose|write|reply|respond)\\b`,'i').test(message)&&!/\b(?:do not|don't|never)\s+(?:draft|prepare|compose|write|reply|respond)/i.test(message);
}
// A tiny continuation vocabulary preserves a source through conversational
// advice, without interpreting names, new topics or model prose as focus.
const continuesInboxDiscussion=(message:string)=>/^(?:(?:and|okay|ok|yeah|please)[,.]?\s+)?(?:what (?:would|should) (?:you|I|we) do next|what do you (?:suggest|recommend)|what(?:'s| is) (?:the )?next step|how would you handle (?:that|this|it)|why(?: is that)?|tell me more(?: about (?:that|this|it))?|(?:make|keep) (?:it|that|this) (?:shorter|short|brief|casual|less formal|more direct)|(?:shorter|less formal)(?: please)?)[.!?]?$/i.test(message.trim());
/** Only the latest actually shown, still-current source may supply an omitted target. */
export function focusedInboxReplyThread(actor:Actor,command:InboxReplyCommand):string|null {
 if(!requestsFocusedInboxReply(command.message))return null;
 return getDb().transaction(()=>{
 const messages=getConversation(actor,command.conversationId).messages;
 let index=messages.findLastIndex(message=>message.role==='assistant'),latest=messages[index];
 const seenReplies=[],evidenceBridges:Artifact[]=[];
 for(let skipped=0;latest&&skipped<=2;skipped++){
  if(latest.content.startsWith('This historical message is withheld'))return null;
  seenReplies.push(latest);
  if(latest.artifacts.some(item=>item.type==='inbox'))break;
  // A brief next-step discussion may retrieve the same person's current journey.
  // Exact source IDs are checked against the earlier inbox association below;
  // lists, prose, tasks, properties and different business actions cannot bridge.
  if(latest.artifacts.some(item=>item.type!=='guidance'&&(!['investors','briefing'].includes(item.type)||!item.id)))return null;
  evidenceBridges.push(...latest.artifacts.filter(item=>item.type!=='guidance'));
  const previousUser=messages.slice(0,index).findLastIndex(message=>message.role==='user');
  if(skipped===2||previousUser<0||!continuesInboxDiscussion(messages[previousUser].content))return null;
  index=messages.slice(0,previousUser).findLastIndex(message=>message.role==='assistant');latest=messages[index];
 }
 if(!latest||Date.now()-Date.parse(latest.createdAt)>24*60*60_000)return null;
 if(command.receivedAt){
  const receiptQuery=getDb().prepare(`SELECT 1 FROM messaging_outbox o JOIN messaging_links l ON l.id=o.link_id
   WHERE o.reference_id=? AND o.kind='reply' AND o.status IN ('accepted','delivered') AND o.updated_at<?
   AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND l.active=1 AND l.opted_out=0`);
  for(const reply of seenReplies){
   if(Date.parse(reply.createdAt)>=Date.parse(command.receivedAt)||!receiptQuery.get(reply.id,command.receivedAt,actor.organizationId,actor.officeId,actor.id))return null;
  }
 }
 const artifacts=latest.artifacts.filter(item=>item.type==='inbox'&&item.id),ids=[...new Set(artifacts.map(item=>item.id!))];
 if(ids.length!==1)return null;
 // An inbox link alongside another person, property, task or work result is not
 // one clear subject. Only same-thread links and display guidance are harmless.
 if(latest.artifacts.some(item=>item.type!=='guidance'&&(item.type!=='inbox'||item.id!==ids[0])))return null;
 const detail=getInboxThread(actor,ids[0]);
 if(detail.bodyAccess!=='full'||!detail.account.capabilities.localDraft)return null;
 if(evidenceBridges.some(item=>item.id!==detail.thread.association.investor?.id))return null;
 // Public history deliberately strips tool data. Read only version metadata from
 // this same scoped message, after its current visible artifact passed redaction.
 // Raw content/references are never restored to the model or used as authority.
 const row=getDb().prepare('SELECT data FROM messages WHERE id=? AND conversation_id=? AND organization_id=? AND office_id=? AND owner_id=?')
  .get(latest.id,command.conversationId,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 const saved=row?(JSON.parse(row.data) as {artifacts:Artifact[]}).artifacts.filter(item=>item.type==='inbox'&&item.id===ids[0]):[];
 const versions=saved.map(item=>(item.data as {threadVersion?:unknown}|undefined)?.threadVersion);
 return versions.length&&versions.every(version=>version===detail.thread.version)?detail.thread.id:null;
 })();
}
export function employeeRequestedInboxReply(actor:Actor,message:string,threadId:string,command?:InboxReplyCommand):boolean {
 if(!requestsInboxReply(message))return false;
 const explicitIds=message.match(/\binbox_thread_[\w-]+\b/g);if(explicitIds)return explicitIds.length===1&&explicitIds[0]===threadId;
 const matches=inboxThreadsForRequest(actor,message).filter(thread=>{const lower=message.toLowerCase(),name=thread.correspondent.name.toLowerCase();return lower.includes(name)||lower.includes(thread.subject.toLowerCase())||new RegExp(`\\b${name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(message);});
 if(matches.length)return matches.length===1&&matches[0].id===threadId;
 return !!command&&focusedInboxReplyThread(actor,command)===threadId;
}
