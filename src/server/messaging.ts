import { createHash,randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import type { MessagingState } from '../lib/messaging-contracts';
import { AppError,assertActor,audit,getDb,newId,now,updateRecord } from './db';
import { requireFeature,hasFeature } from './billing';
import { actorForMember,createConversation,getConversation } from './services';
import { channelAccount,channelConfigured,messagingEnabled,sendingEnabled,type MessagingProvider } from './messaging-config';
import { recordSmsReceipt } from './metering';

export interface MessagingLink {id:string;organization_id:string;office_id:string;user_id:string;provider:MessagingProvider;account_id:string;external_id:string;address:string;active:number;opted_out:number;reminders:number;created_at:string;updated_at:string}
export interface Outbox {id:string;link_id:string;dedupe_key:string;kind:'reply'|'notice'|'system';reference_id:string|null;body:string;status:string;provider_id:string|null;provider_status:string|null;segments_reserved:number;segments_actual:number|null;created_at:string;updated_at:string;reconcile_at:string|null;error_code:string|null}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function actorForLink(link:MessagingLink){return actorForMember(link.organization_id,link.office_id,link.user_id);}
export function getMessagingLink(id:string){const link=getDb().prepare('SELECT * FROM messaging_links WHERE id=?').get(id) as MessagingLink|undefined;if(!link)throw new AppError(404,'Messaging connection not found.');return link;}
export function requireMessagingLink(id:string){const link=getMessagingLink(id);if(!messagingEnabled()||!link.active||link.opted_out||link.account_id!==channelAccount(link.provider))throw new AppError(403,'This messaging connection is not active.');const actor=actorForLink(link);requireFeature(actor,'core');if(link.provider==='sms')requireFeature(actor,'sms');return {link,actor};}
export function messagingConversation(actor:Actor){
 assertActor(actor);requireFeature(actor,'core');
 return getDb().transaction(()=>{const row=getDb().prepare('SELECT conversation_id FROM messaging_threads WHERE organization_id=? AND office_id=? AND user_id=?').get(actor.organizationId,actor.officeId,actor.id) as {conversation_id:string}|undefined;if(row){const conversation=getConversation(actor,row.conversation_id);updateRecord(actor,'conversations',{...conversation,messages:[],updatedAt:now()},true);return row.conversation_id;}const conversation=createConversation(actor,'Your ongoing Copilot');getDb().prepare('INSERT INTO messaging_threads VALUES(?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,conversation.id);return conversation.id;}).immediate();
}
export function createPairing(actor:Actor,provider:MessagingProvider){
 assertActor(actor);requireFeature(actor,'core');if(provider==='sms')requireFeature(actor,'sms');
 if(!channelConfigured(provider))throw new AppError(503,`Configure the ${provider==='sms'?'Twilio':'Slack'} connection before linking your account.`);
 const token=randomBytes(18).toString('hex').toUpperCase(),stamp=now(),expiresAt=new Date(Date.now()+10*60_000).toISOString();
 getDb().prepare('UPDATE messaging_pairings SET expires_at=? WHERE organization_id=? AND office_id=? AND user_id=? AND provider=? AND consumed_at IS NULL').run(stamp,actor.organizationId,actor.officeId,actor.id,provider);
 getDb().prepare('INSERT INTO messaging_pairings VALUES(?,?,?,?,?,?,?,?,NULL)').run(digest(token),actor.organizationId,actor.officeId,actor.id,provider,channelAccount(provider),stamp,expiresAt);
 audit(actor,'messaging.pairing_created',undefined,{provider});
 return {command:`LINK ${token}`,expiresAt,destination:provider==='sms'?process.env.TWILIO_PHONE_NUMBER:'AgentDesk NW in Slack'};
}
export function queueOutbound(link:MessagingLink,key:string,kind:Outbox['kind'],body:string,referenceId:string|null=null){
 const id=newId('outbound'),stamp=now();getDb().prepare('INSERT OR IGNORE INTO messaging_outbox(id,link_id,dedupe_key,kind,reference_id,body,status,created_at,updated_at) VALUES(?,?,?,?,?,?,\'queued\',?,?)').run(id,link.id,key,kind,referenceId,body,stamp,stamp);return (getDb().prepare('SELECT id FROM messaging_outbox WHERE dedupe_key=?').get(key) as {id:string}).id;
}
/** Called only after provider authentication; external events never choose an internal employee. */
export function acceptMessage(input:{provider:MessagingProvider;accountId:string;externalId:string;address:string;eventId:string;text:string;segments?:number;optOut?:'STOP'|'START'|'HELP'}){
 if(!channelConfigured(input.provider)||input.accountId!==channelAccount(input.provider))throw new AppError(403,'Messaging account is not configured.');
 const value=z.object({provider:z.enum(['slack','sms']),accountId:z.string().max(150),externalId:z.string().min(1).max(150),address:z.string().min(1).max(150),eventId:z.string().min(1).max(150),text:z.string().max(12000),segments:z.number().int().min(0).max(1000).optional(),optOut:z.enum(['STOP','START','HELP']).optional()}).parse(input);
 const hash=digest(JSON.stringify(value)),db=getDb();
 return db.transaction(()=>{
  const prior=db.prepare('SELECT body_hash FROM messaging_inbox WHERE provider=? AND account_id=? AND event_id=?').get(value.provider,value.accountId,value.eventId) as {body_hash:string}|undefined;
  if(prior){if(prior.body_hash!==hash)throw new AppError(409,'Conflicting messaging event.');return {status:'duplicate'};}
  let link=db.prepare('SELECT * FROM messaging_links WHERE provider=? AND account_id=? AND external_id=?').get(value.provider,value.accountId,value.externalId) as MessagingLink|undefined;
  const command=value.text.trim(),pair=/^LINK\s+([A-F0-9]{36})$/i.exec(command);let systemReply:string|null=null;
  if(pair){
   const tokenHash=digest(pair[1].toUpperCase());const pairing=db.prepare('SELECT * FROM messaging_pairings WHERE token_hash=? AND provider=? AND account_id=? AND consumed_at IS NULL AND expires_at>?').get(tokenHash,value.provider,value.accountId,now()) as {organization_id:string;office_id:string;user_id:string}|undefined;
   if(!pairing)return {status:'ignored'};
   const actor=actorForMember(pairing.organization_id,pairing.office_id,pairing.user_id);requireFeature(actor,'core');if(value.provider==='sms')requireFeature(actor,'sms');
   if(link&&(link.organization_id!==actor.organizationId||link.office_id!==actor.officeId||link.user_id!==actor.id))throw new AppError(409,'This account is linked to a different employee.');
   if(link?.opted_out)return {status:'opted_out'};
   const stamp=now();
   if(link){db.prepare('UPDATE messaging_links SET active=1,address=?,updated_at=? WHERE id=?').run(value.address,stamp,link.id);link=getMessagingLink(link.id);}
   else{const id=newId('link');db.prepare('INSERT INTO messaging_links VALUES(?,?,?,?,?,?,?, ?,1,0,0,?,?)').run(id,actor.organizationId,actor.officeId,actor.id,value.provider,value.accountId,value.externalId,value.address,stamp,stamp);link=getMessagingLink(id);}
   db.prepare('UPDATE messaging_pairings SET consumed_at=? WHERE token_hash=?').run(stamp,tokenHash);
   messagingConversation(actor);systemReply='AgentDesk NW is linked. Ask me a question or give me a task. Reminders are off until you enable them in Settings.';audit(actor,'messaging.linked',link.id,{provider:value.provider});
  }
  if(!link)return {status:'ignored'};
  if(link.address!==value.address&&!pair)return {status:'ignored'};
  const actor=actorForLink(link);const stamp=now(),id=newId('inbound');
  if(value.provider==='sms'&&value.segments!==undefined)recordSmsReceipt(actor,`sms:in:${value.accountId}:${value.eventId}`,value.segments);
  const opt=value.optOut||(value.provider==='sms'&&/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(command)?'STOP':value.provider==='sms'&&/^(START|UNSTOP)$/i.test(command)?'START':undefined);
  let status='queued';
  if(opt==='STOP'){db.prepare('UPDATE messaging_links SET opted_out=1,reminders=0,updated_at=? WHERE id=?').run(stamp,link.id);db.prepare("UPDATE messaging_outbox SET status='canceled',updated_at=? WHERE link_id=? AND status='queued'").run(stamp,link.id);db.prepare("UPDATE messaging_inbox SET status='canceled',updated_at=? WHERE link_id=? AND status='queued'").run(stamp,link.id);status='completed';systemReply=null;}
  else if(opt==='START'){db.prepare('UPDATE messaging_links SET opted_out=0,updated_at=? WHERE id=?').run(stamp,link.id);status='completed';}
  else if(!link.active||link.opted_out)status='canceled';
  else if(systemReply)status='completed';
  else if(opt==='HELP'||/^HELP$/i.test(command)){status='completed';systemReply='Ask Copilot about your work or request a task. Use Settings in AgentDesk NW to manage connections and reminders. SMS: reply STOP to stop or START to resume.';}
  else if(/^PAUSE REMINDERS$/i.test(command)){db.prepare('UPDATE messaging_links SET reminders=0,updated_at=? WHERE id=?').run(stamp,link.id);status='completed';systemReply='Reminders are paused for this connection. You can still ask Copilot questions.';}
  else if(!hasFeature(actor,'core')||value.provider==='sms'&&!hasFeature(actor,'sms'))status='canceled';
  else if(!command)status='completed';
  const count=db.prepare("SELECT COUNT(*) n FROM messaging_inbox WHERE link_id=? AND received_at>?").get(link.id,new Date(Date.now()-60_000).toISOString()) as {n:number};
  if(status==='queued'&&count.n>=12)status='canceled';
  db.prepare('INSERT INTO messaging_inbox VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,value.provider,value.accountId,value.eventId,link.id,hash,pair?'[Account linking]':value.text,status,stamp,stamp,null);
  if(systemReply&&link.active&&!link.opted_out)queueOutbound(link,`system:${id}`,'system',systemReply);
  return {status};
 }).immediate();
}
export function updateMessagingLink(actor:Actor,id:string,input:{active?:boolean;reminders?:boolean}){
 assertActor(actor);const link=getMessagingLink(id);if(link.organization_id!==actor.organizationId||link.office_id!==actor.officeId||link.user_id!==actor.id)throw new AppError(404,'Messaging connection not found.');
 if(input.active===true)throw new AppError(422,'Generate a new linking code to reconnect.');
 if(input.reminders===true){requireMessagingLink(id);}
 getDb().prepare('UPDATE messaging_links SET active=?,reminders=?,updated_at=? WHERE id=?').run(input.active===false?0:link.active,input.active===false?0:input.reminders===undefined?link.reminders:Number(input.reminders),now(),id);
 if(input.active===false||input.reminders===false)getDb().prepare(`UPDATE messaging_outbox SET status='canceled',updated_at=? WHERE link_id=? AND status='queued' ${input.active===false?'':"AND kind='notice'"}`).run(now(),id);
 if(input.active===false)getDb().prepare("UPDATE messaging_inbox SET status='canceled',updated_at=? WHERE link_id=? AND status='queued'").run(now(),id);
 audit(actor,'messaging.preferences_updated',id);return messagingState(actor);
}
export function messagingState(actor:Actor):MessagingState {
 assertActor(actor);const links=getDb().prepare('SELECT * FROM messaging_links WHERE organization_id=? AND office_id=? AND user_id=?').all(actor.organizationId,actor.officeId,actor.id) as MessagingLink[];
 const thread=getDb().prepare('SELECT conversation_id FROM messaging_threads WHERE organization_id=? AND office_id=? AND user_id=?').get(actor.organizationId,actor.officeId,actor.id) as {conversation_id:string}|undefined;
 const activity=getDb().prepare(`SELECT o.id,l.provider,o.kind,o.status,o.provider_status AS providerStatus,o.created_at AS createdAt,o.error_code AS errorCode FROM messaging_outbox o JOIN messaging_links l ON l.id=o.link_id WHERE l.organization_id=? AND l.office_id=? AND l.user_id=?
 UNION ALL SELECT i.id,l.provider,'request',i.status,NULL,i.received_at,i.error_code FROM messaging_inbox i JOIN messaging_links l ON l.id=i.link_id WHERE l.organization_id=? AND l.office_id=? AND l.user_id=? AND i.status IN ('failed','unknown') ORDER BY createdAt DESC LIMIT 15`).all(actor.organizationId,actor.officeId,actor.id,actor.organizationId,actor.officeId,actor.id) as MessagingState['activity'];
 return {enabled:messagingEnabled(),sendingEnabled:sendingEnabled(),conversationId:thread?.conversation_id??null,providers:(['slack','sms'] as const).map(id=>({id,configured:channelConfigured(id),accountLabel:id==='sms'?(process.env.TWILIO_PHONE_NUMBER||'No number configured'):(process.env.SLACK_TEAM_ID||'No workspace configured'),transport:id==='slack'?(process.env.SLACK_TRANSPORT==='socket'?'Socket Mode':'Signed webhooks'):'Twilio SMS',entitled:hasFeature(actor,id==='sms'?'sms':'core')})),links:links.map(link=>({id:link.id,provider:link.provider,destination:link.provider==='sms'?`${link.external_id.slice(0,2)}••••${link.external_id.slice(-4)}`:link.external_id,active:!!link.active,optedOut:!!link.opted_out,reminders:!!link.reminders,createdAt:link.created_at})),activity};
}
