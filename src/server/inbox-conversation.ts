import type {Actor,Artifact} from '../lib/contracts';
import type {InboxThread,InboxThreadDetail} from '../lib/communications-contracts';
import {getDb} from './db';
import {getInboxState,getInboxThread} from './communications';
import {inboxDraftRevisionContext} from './communication-draft-revisions';
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
 return currentInboxFocus(actor,command)?.detail.thread.id??null;
}
function currentInboxFocus(actor:Actor,command:InboxReplyCommand):{detail:InboxThreadDetail;saved:Artifact[]}|null {
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
 return versions.length&&versions.every(version=>version===detail.thread.version)?{detail,saved}:null;
 })();
}
export function employeeRequestedInboxReply(actor:Actor,message:string,threadId:string,command?:InboxReplyCommand):boolean {
 if(!requestsInboxReply(message))return false;
 const explicitIds=message.match(/\binbox_thread_[\w-]+\b/g);if(explicitIds)return explicitIds.length===1&&explicitIds[0]===threadId;
 const matches=inboxThreadsForRequest(actor,message).filter(thread=>{const lower=message.toLowerCase(),name=thread.correspondent.name.toLowerCase();return lower.includes(name)||lower.includes(thread.subject.toLowerCase())||new RegExp(`\\b${name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(message);});
 if(matches.length)return matches.length===1&&matches[0].id===threadId;
 return !!command&&focusedInboxReplyThread(actor,command)===threadId;
}

const escapePattern=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const revisionPrefix='(?:(?:yes|yeah|okay|ok|sure)[,!.]?\\s+)?(?:please\\s+|(?:can|could|would) you (?:please\\s+)?)?';
const draftNoun='(?:reply|response|draft|email|message)(?: draft)?';
const focusedDraft=`(?:(?:(?:the|my|this|that) )?(?:current |saved )?${draftNoun}|it|this|that)`;
const styleAtom='(?:(?:a bit|a little|slightly|much) )?(?:shorter|short|briefer|brief|more concise|concise|more casual|casual|less formal|informal|more direct|direct|less salesy|more natural|natural|friendlier|warmer|more conversational|conversational|simpler|simple|clearer|more polite|polite|more professional|professional|less robotic|more human|more relaxed|casually|more casually|concisely|more concisely|naturally|more naturally)';
const styleList=`${styleAtom}(?:\\s*(?:,\\s*(?:and\\s+)?|and\\s+)${styleAtom})*`;
const styleTail=new RegExp(`^(?:(?:to be|to sound|so it (?:is|sounds)|and (?:make|keep) it) )?${styleList}$`,'i');
const styleMode=new RegExp(`^(?:in|with|using) (?:a |an )?${styleList} (?:tone|style)$`,'i');
interface DraftRevisionRequest {verb:string;remainder:string}
/** This is employee intent, not a classifier for quoted mail or model prose. */
function draftRevisionRequest(message:string):DraftRevisionRequest|null {
 const value=message.trim();
 if(value.length>2000||/[\r\n]/.test(value)||/^["'“‘>`]/.test(value))return null;
 // Saving wording is the only effect here. Larger correspondence work has its own review.
 if(/\b(?:preview|hypothetical|pretend|suppose|imagine|remember|always|permanently|from now on|default style|writing preferences?)\b/i.test(value)||/\b(?:do not|don['’]t|dont|never|without)\s+(?:save|saving|rewrite|revise|reword|shorten|edit|change|update|send)\b/i.test(value)||/\b(?:only|just)\s+(?:show|suggest|explain|preview)\b/i.test(value)||/\b(?:no saving|no changes|do not change|don['’]t change)\b/i.test(value))return null;
 if(/\b(?:cc|bcc|recipients?|attachments?|attach|files?|subject(?: line)?|sender|title|escrow|wire|wiring|earnest money|purchase (?:and sale )?agreement|closing instructions)\b/i.test(value)||/\b(?:send|share|market|offer|pitch|distribute)\b.{0,80}\b(?:property|properties|listing|listings|deal|deals)\b/i.test(value)||/\b(?:property|listing|deal) (?:package|distribution|marketing|outreach)\b/i.test(value))return null;
 if(/\b(?:asking price|purchase price|property address|repair (?:estimate|budget|cost|scope)s?|rehab (?:estimate|budget|cost|scope)s?|seller terms|deposit|signed contract|signed agreement|funds received|title cleared)\b/i.test(value))return null;
 const matched=value.replace(/[.!?]$/,'').match(new RegExp(`^${revisionPrefix}(rewrite|revise|reword|shorten|edit|make|keep)\\s+(.+)$`,'i'));
 return matched?{verb:matched[1].toLowerCase(),remainder:matched[2]}:null;
}
function targetMatchesRevision(request:DraftRevisionRequest,target:string):boolean {
 const matched=request.remainder.match(new RegExp(`^(?:${target})(?:\\s+(.+))?$`,'i'));
 if(!matched)return false;
 const tail=matched[1]?.trim()??'';
 if(request.verb==='make'||request.verb==='keep')return styleTail.test(tail)||styleMode.test(tail);
 if(!tail||styleTail.test(tail)||styleMode.test(tail))return true;
 // An explicit body instruction remains data for the model, not authority to
 // change recipients, deliver, remember preferences or perform another action.
 return /^(?:to say|so it says|to explain|to mention|to ask|to remove|by removing|by replacing|to replace)\s+\S.+$/i.test(tail)&&!/(?:[.!?;,]\s*|\band\s+)(?:please |then )?(?:send|deliver|forward|create|delete|approve|remember|schedule|update|change|add)\b/i.test(tail);
}
function namedDraftTargets(thread:InboxThread,source:'company'|'external',provider:string):string {
 const names=[thread.correspondent.name,...thread.correspondent.name.trim().split(/\s+/).slice(0,1)].filter(Boolean).map(escapePattern);
 const person=`(?:${[...new Set(names)].join('|')})`,possessive=`${person}(?:['’]s)?`;
 const sourceWord=source==='company'?'(?:company|salesforce)':`(?:external|${escapePattern(provider)})`;
 const correspondence=`(?:(?:${sourceWord}) )?(?:email|message|reply|response)(?: draft)?`;
 const id=escapePattern(thread.id),subject=escapePattern(thread.subject);
 return `(?:${id}(?: draft)?|(?:the )?${draftNoun} (?:for|to) ${id}|(?:the )?${possessive} ${correspondence}|(?:the )?${draftNoun} (?:for|to) ${possessive}(?: ${correspondence})?|(?:the )?(?:draft|reply|response) (?:for|to) ${subject}|${subject} draft)`;
}
function shownDraftIsCurrent(detail:InboxThreadDetail,artifacts:Artifact[]):boolean {
 const draft=detail.draft;if(!draft||!artifacts.length)return false;
 return artifacts.every(artifact=>{
  const data=artifact.data as {draft?:{id?:unknown;version?:unknown}|null;draftId?:unknown;draftVersion?:unknown}|undefined;
  if(!data)return false;
  const nested=data.draft,flat=data.draftId!==undefined||data.draftVersion!==undefined;
  if(nested&&(nested.id!==draft.id||nested.version!==draft.version))return false;
  if(flat&&(data.draftId!==draft.id||data.draftVersion!==draft.version))return false;
  return !!nested||flat;
 });
}
/** A current employee request may save wording, never approve sending or model-selected retargeting. */
export function employeeRequestedInboxRevision(actor:Actor,message:string,threadId:string,command?:InboxReplyCommand):boolean {
 if(command&&command.message!==message)return false;
 const request=draftRevisionRequest(message);if(!request)return false;
 return getDb().transaction(()=>{
  if(targetMatchesRevision(request,focusedDraft)){
   if(!command)return false;
   const focused=currentInboxFocus(actor,command);
   return !!focused&&focused.detail.thread.id===threadId&&shownDraftIsCurrent(focused.detail,focused.saved)&&inboxDraftRevisionContext(actor,focused.detail).eligible;
  }
  const state=getInboxState(actor);
  const matches=state.threads.filter(thread=>{
   const account=state.accounts.find(account=>account.id===thread.accountId);
   return !!account&&targetMatchesRevision(request,namedDraftTargets(thread,account.source.system==='salesforce'?'company':'external',account.provider));
  });
  if(matches.length!==1||matches[0].id!==threadId)return false;
  return inboxDraftRevisionContext(actor,getInboxThread(actor,threadId)).eligible;
 })();
}
