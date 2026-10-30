import {createHash} from 'node:crypto';
import type {Actor,Conversation} from '../lib/contracts';
import {assertActor,getDb} from './db';

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
