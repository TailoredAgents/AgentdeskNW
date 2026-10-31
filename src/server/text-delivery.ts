import type {Actor} from '../lib/contracts';
import {AppError,getDb} from './db';
import {queueOutbound,requireMessagingLink} from './messaging';
import {fingerprint} from './provider-runtime';

export interface TextReplyTarget {linkId:string;provider:'sms'|'slack';accountId:string;externalId:string;address:string}
/** Capture only the authenticated inbound transport. A channel name/client request is not a destination. */
export function captureTextReplyTarget(actor:Actor,requestId:string,conversationId:string,channel:string):TextReplyTarget|undefined {
 if(!['sms','slack'].includes(channel)||!requestId.startsWith('channel:'))return;
 const inbound=getDb().prepare(`SELECT i.link_id FROM messaging_inbox i JOIN messaging_links l ON l.id=i.link_id
 JOIN messaging_threads t ON t.organization_id=l.organization_id AND t.office_id=l.office_id AND t.user_id=l.user_id
 WHERE i.id=? AND i.status='processing' AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND l.provider=? AND t.conversation_id=?`)
 .get(requestId.slice(8),actor.organizationId,actor.officeId,actor.id,channel,conversationId) as {link_id:string}|undefined;
 if(!inbound)return;
 const {link}=requireMessagingLink(inbound.link_id);
 return {linkId:link.id,provider:link.provider,accountId:link.account_id,externalId:link.external_id,address:link.address};
}
/** Called in the same transaction as saved-result publication; never falls back to a different connection. */
export function queueTextContinuationReply(actor:Actor,requestId:string,conversationId:string,messageId:string,target?:TextReplyTarget){
 if(!target)return;
 try{
  const {link,actor:current}=requireMessagingLink(target.linkId);
  if(current.organizationId!==actor.organizationId||current.officeId!==actor.officeId||current.id!==actor.id||link.provider!==target.provider||link.account_id!==target.accountId||link.external_id!==target.externalId||link.address!==target.address)return;
  const thread=getDb().prepare('SELECT conversation_id FROM messaging_threads WHERE organization_id=? AND office_id=? AND user_id=?').get(actor.organizationId,actor.officeId,actor.id) as {conversation_id:string}|undefined;
  if(thread?.conversation_id!==conversationId)return;
  queueOutbound(link,`text-result:${fingerprint({owner:[actor.organizationId,actor.officeId,actor.id],requestId})}`,'reply','',messageId);
 }catch(error){if(error instanceof AppError&&[402,403,404].includes(error.status))return;throw error;}
}
