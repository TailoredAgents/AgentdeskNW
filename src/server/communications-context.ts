import {packageThreadContext} from './package-draft-context';
import {transactionThreadContext} from './transaction-draft-context';
import {createHash} from 'node:crypto';
import type {Actor,Conversation} from '../lib/contracts';
import {AppError,assertActor,getDb} from './db';
import {getInboxThread} from './communications';
import {inboxDraftRevisionContext} from './communication-draft-revisions';
import {correspondenceMethodVersion} from './correspondence-intent';

function accountForThread(actor:Actor,threadId:string){
 assertActor(actor);
 return getDb().prepare('SELECT a.data,t.data AS thread FROM communication_threads t JOIN communication_accounts a ON a.id=t.account_id AND a.organization_id=t.organization_id AND a.office_id=t.office_id AND a.owner_id=t.owner_id WHERE t.id=? AND t.organization_id=? AND t.office_id=? AND t.owner_id=?').get(threadId,actor.organizationId,actor.officeId,actor.id) as {data:string;thread:string}|undefined;
}

function accessData(actor:Actor,account:{data:string;thread:string}){const context=transactionThreadContext(actor,JSON.parse(account.thread)),packageContext=packageThreadContext(actor,JSON.parse(account.thread));if(packageContext)return JSON.stringify([account.data,context,packageContext]);return context?JSON.stringify([account.data,context]):account.data;}

/** Account metadata contains the source capabilities and access revision, never a message body. */
export function inboxAccessReference(actor:Actor,threadId:string):string {
 const account=accountForThread(actor,threadId);
 if(!account)throw new AppError(404,'Inbox conversation not found in your private workspace.');
 return `${threadId}|${createHash('sha256').update(accessData(actor,account)).digest('hex')}`;
}

/** Exact current ordinary reply, including its reviewed source context; never action authority. */
export function inboxDraftReference(actor:Actor,threadId:string):string|null {
 const detail=getInboxThread(actor,threadId),draft=detail.draft;
 if(!draft||draft.copilotRevision?.current===false)return null;
 const context=inboxDraftRevisionContext(actor,detail);
 if(!context.eligible||!context.sourceReference)return null;
 const binding={version:1,access:inboxAccessReference(actor,threadId),sourceReference:context.sourceReference,draft:{id:draft.id,version:draft.version,body:draft.body,subject:draft.subject,authorship:draft.authorship,copilotRevision:draft.copilotRevision??null}};
 return `${threadId}|draft-v1|${createHash('sha256').update(JSON.stringify(binding)).digest('hex')}`;
}

export function inboxAccessReferenceCurrent(actor:Actor,threadId:string,references:string[]):boolean {
 let account;try{account=accountForThread(actor,threadId);if(account)accessData(actor,account);}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}if(!account)return false;
 const saved=references.filter(reference=>reference.startsWith(`${threadId}|`));
 if(saved.length){
  const ordinary=`${threadId}|${createHash('sha256').update(accessData(actor,account)).digest('hex')}`;
  let currentDraft:string|null|undefined;
  return saved.every(reference=>{
   if(reference.startsWith(`${threadId}|draft-v1|`)){
    if(currentDraft===undefined)try{currentDraft=inboxDraftReference(actor,threadId);}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}
    return currentDraft!==null&&reference===currentDraft;
   }
   return reference===ordinary;
  });
 }
 // Historical Phase 3 results predate capability snapshots and only used full demo mailboxes.
 const value=JSON.parse(account.data) as {provider?:string;access?:string;accessVersion?:number;capabilities?:{readBody?:boolean};source?:{coverage?:string}};
 return !JSON.parse(account.thread).packageId&&!JSON.parse(account.thread).transactionId&&value.provider!=='salesforce'&&value.access!=='revoked'&&(value.accessVersion??1)===1&&value.capabilities?.readBody!==false&&value.source?.coverage!=='headers_only';
}

/** Presentation only: a current readable source cannot revive an earlier draft binding. */
export function inboxReadableHistoryReference(actor:Actor,threadId:string):string|null {
 try {
  const detail=getInboxThread(actor,threadId);
  if(detail.bodyAccess!=='full'||detail.account.access!=='available'||detail.thread.association.status==='unavailable')return null;
  return inboxAccessReference(actor,threadId);
 }catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return null;throw error;}
}

/** Hash private correspondence without supplying an entire mailbox to the model. */
export function inboxContextFingerprint(actor:Actor):string {
 assertActor(actor);
 const scope=[actor.organizationId,actor.officeId,actor.id];
 const state=['communication_accounts','communication_threads','communication_messages','communication_drafts'].map(table=>getDb().prepare(`SELECT id,data FROM ${table} WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY id`).all(...scope));
 const sources=(state[1] as {id:string;data:string}[]).map(row=>{try{return [transactionThreadContext(actor,JSON.parse(row.data)),packageThreadContext(actor,JSON.parse(row.data))];}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return 'unavailable';throw error;}});
 return createHash('sha256').update(JSON.stringify([correspondenceMethodVersion,state,sources])).digest('hex');
}

/** Inbox tools are typed-only until Realtime has authenticated employee command binding. */
export function withoutInboxHistory(actor:Actor,conversation:Conversation):Conversation {
 assertActor(actor);
 const excluded=new Set((getDb().prepare('SELECT id,data FROM messages WHERE conversation_id=? AND organization_id=? AND office_id=? AND owner_id=?').all(conversation.id,actor.organizationId,actor.officeId,actor.id) as {id:string;data:string}[]).filter(row=>{
  const value=JSON.parse(row.data) as {references?:{rolePreparations?:string[];documentAccess?:string[];transactionTeamAccess?:string[];transactionAccess?:string[];inboxThreads?:string[];updatesAccess?:string[]};artifacts?:{type:string}[]};
  return !!value.references?.rolePreparations?.length||!!value.references?.documentAccess?.length||!!value.references?.transactionTeamAccess?.length||!!value.references?.transactionAccess?.length||!!value.references?.updatesAccess?.length||!!value.references?.inboxThreads?.length||!!value.artifacts?.some(artifact=>artifact.type==='inbox');
 }).map(row=>row.id));
 return {...conversation,messages:conversation.messages.filter(message=>!excluded.has(message.id))};
}
