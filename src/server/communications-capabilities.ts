import type {Actor} from '../lib/contracts';
import type {CommunicationAccount,CommunicationMessage,CommunicationProvenance} from '../lib/communications-contracts';
import {AppError,assertActor,getDb} from './db';

export type StoredCommunicationAccount=Pick<CommunicationAccount,'id'|'provider'|'channel'|'label'|'address'|'status'|'synthetic'>&Partial<Omit<CommunicationAccount,'id'|'provider'|'channel'|'label'|'address'|'status'|'synthetic'>>;
/** Legacy records are projected without rewriting their persisted identity, source or draft history. */
export function normalizeCommunicationAccount(raw:StoredCommunicationAccount):CommunicationAccount {
 const source=raw.source??{system:raw.channel==='sms'?'business_text':'mailbox',coverage:'mailbox',label:raw.channel==='sms'?'Fictional business text account':'Fictional external mailbox'};
 const transport=raw.transport??(raw.channel==='sms'?'demo_sms':'demo_mailbox'),access=raw.access??'available';
 const readBody=access==='available'&&source.coverage!=='headers_only';
 const capabilities={readBody,threadHistory:readBody&&source.coverage==='mailbox',attachments:false as const,localDraft:readBody,simulateSend:readBody&&transport!=='none'};
 const capabilityNotice=access==='revoked'?'Demonstration source access is revoked. Message contents, saved drafts and relationship context are withheld until access is restored.':source.coverage==='headers_only'?'Headers only: sender, recipients and time are available. Subject, body and attachments were not captured. Copilot cannot infer the missing message or prepare a reply.':source.coverage==='crm_activity'?'Captured CRM activity only. This source supplies the recorded message, not a complete mailbox or a sending route. Local drafts are available; sending is unavailable.':raw.provider==='salesforce'?'Company email · Salesforce workflow demonstration. Full fictional correspondence and reviewed simulated sending are available. No Salesforce organization or real mailbox is connected.':'Fictional account. Local drafts and reviewed simulations are available; no live delivery or attachment access.';
 return {...raw,source,transport,access,accessVersion:raw.accessVersion??1,primary:raw.primary??false,capabilities,capabilityNotice};
}
export function getCommunicationAccount(actor:Actor,id:string):CommunicationAccount {
 assertActor(actor);const row=getDb().prepare('SELECT data FROM communication_accounts WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 if(!row)throw new AppError(404,'This inbox account was not found in your private workspace.');return normalizeCommunicationAccount(JSON.parse(row.data));
}
export function requireCommunicationCapability(account:CommunicationAccount,capability:'readBody'|'localDraft'|'simulateSend'){
 if(!account.capabilities[capability])throw new AppError(403,account.capabilityNotice);
}
export function visibleCommunicationMessage(actor:Actor,account:CommunicationAccount,message:CommunicationMessage):CommunicationMessage {
 const provenance=account.access==='available'?(getDb().prepare('SELECT data FROM communication_source_links WHERE account_id=? AND message_id=? AND organization_id=? AND office_id=? AND owner_id=? ORDER BY rowid').all(account.id,message.id,actor.organizationId,actor.officeId,actor.id) as {data:string}[]).map(row=>JSON.parse(row.data) as CommunicationProvenance):[];
 if(account.access==='revoked')return {...message,from:{name:'Unavailable correspondent',address:''},to:[],subject:'Company email access unavailable',body:'',attachments:[],sourceRef:'',sourceLabel:'Source access revoked',provenance:[],bodyAvailability:'revoked'};
 if(!account.capabilities.readBody)return {...message,subject:'Subject unavailable · headers only',body:'',attachments:[],provenance,bodyAvailability:'headers_only'};
 return {...message,provenance,bodyAvailability:'full'};
}
