import {createHash} from 'node:crypto';
import type {Actor,Conversation} from '../lib/contracts';
import {AppError,assertActor,getDb} from './db';

function accountForThread(actor:Actor,threadId:string){
 assertActor(actor);
 return getDb().prepare('SELECT a.data FROM communication_threads t JOIN communication_accounts a ON a.id=t.account_id AND a.organization_id=t.organization_id AND a.office_id=t.office_id AND a.owner_id=t.owner_id WHERE t.id=? AND t.organization_id=? AND t.office_id=? AND t.owner_id=?').get(threadId,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
}

/** Account metadata contains the source capabilities and access revision, never a message body. */
export function inboxAccessReference(actor:Actor,threadId:string):string {
 const account=accountForThread(actor,threadId);
 if(!account)throw new AppError(404,'Inbox conversation not found in your private workspace.');
 return `${threadId}|${createHash('sha256').update(account.data).digest('hex')}`;
}

export function inboxAccessReferenceCurrent(actor:Actor,threadId:string,references:string[]):boolean {
 const account=accountForThread(actor,threadId);if(!account)return false;
 const saved=references.filter(reference=>reference.startsWith(`${threadId}|`));
 if(saved.length)return saved.every(reference=>reference===`${threadId}|${createHash('sha256').update(account.data).digest('hex')}`);
 // Historical Phase 3 results predate capability snapshots and only used full demo mailboxes.
 const value=JSON.parse(account.data) as {provider?:string;access?:string;accessVersion?:number;capabilities?:{readBody?:boolean};source?:{coverage?:string}};
 return value.provider!=='salesforce'&&value.access!=='revoked'&&(value.accessVersion??1)===1&&value.capabilities?.readBody!==false&&value.source?.coverage!=='headers_only';
}

/** Hash private correspondence without supplying an entire mailbox to the model. */
export function inboxContextFingerprint(actor:Actor):string {
 assertActor(actor);
 const scope=[actor.organizationId,actor.officeId,actor.id];
 const state=['communication_accounts','communication_threads','communication_messages','communication_drafts'].map(table=>getDb().prepare(`SELECT id,data FROM ${table} WHERE organization_id=? AND office_id=? AND owner_id=? ORDER BY id`).all(...scope));
 return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

/** Inbox tools are typed-only until Realtime has authenticated employee command binding. */
export function withoutInboxHistory(actor:Actor,conversation:Conversation):Conversation {
 assertActor(actor);
 const excluded=new Set((getDb().prepare('SELECT id,data FROM messages WHERE conversation_id=? AND organization_id=? AND office_id=? AND owner_id=?').all(conversation.id,actor.organizationId,actor.officeId,actor.id) as {id:string;data:string}[]).filter(row=>{
  const value=JSON.parse(row.data) as {references?:{inboxThreads?:string[]};artifacts?:{type:string}[]};
  return !!value.references?.inboxThreads?.length||!!value.artifacts?.some(artifact=>artifact.type==='inbox');
 }).map(row=>row.id));
 return {...conversation,messages:conversation.messages.filter(message=>!excluded.has(message.id))};
}
