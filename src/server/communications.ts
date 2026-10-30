import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,Investor} from '../lib/contracts';
import type {CommunicationAccount,CommunicationDraft,CommunicationMessage,InboxFilter,InboxMutation,InboxState,InboxThread,InboxThreadDetail,InvestorAssociation,InvestorMatch,LinkCommunicationInvestor,ReceiveDemoCommunication,SaveCommunicationDraft,UpdateCommunicationThread} from '../lib/communications-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {readInvestor,readInvestors} from './access';
import {featureAccess,requireFeature} from './billing';
import {hostedDemo,validateHostedDemo} from './demo-config';
import {getInvestorJourney} from './journey';
import {companyInboxScenarios,companyThreadFixtures,demoFollowup,demoThreadFixtures,inboxScenarios,isCommunicationDemoPersona,type DemoThreadFixture} from './communications-demo';

import {getCommunicationAccount,normalizeCommunicationAccount,requireCommunicationCapability,visibleCommunicationMessage,type StoredCommunicationAccount} from './communications-capabilities';

interface StoredThread extends Omit<InboxThread,'association'|'hasDraft'> {investorId:string|null;matchMethod:'exact_contact'|'employee_review'|null;manualUnlink:boolean}
type ScopedTable='communication_accounts'|'communication_threads'|'communication_messages'|'communication_drafts'|'communication_draft_revisions';
const idSchema=z.string().min(1).max(150);
const mutation={expectedVersion:z.number().int().positive(),eventKey:z.string().trim().min(1).max(150)};
export const inboxQuerySchema=z.object({filter:z.enum(['all','email','sms','needs_reply','drafts']).default('all'),accountId:idSchema.optional(),q:z.string().trim().max(200).default('')}).strict();
export const threadUpdateSchema=z.object({...mutation,status:z.enum(['needs_reply','waiting','done']).optional(),unread:z.boolean().optional()}).strict().refine(value=>value.status!==undefined||value.unread!==undefined,'Choose a status or read-state change.');
export const saveDraftSchema=z.object({...mutation,body:z.string().trim().min(1).max(12000),subject:z.string().trim().min(1).max(240).optional()}).strict();
export const discardDraftSchema=z.object(mutation).strict();
export const linkInvestorSchema=z.object({...mutation,investorId:idSchema.nullable()}).strict();
export const receiveDemoSchema=z.object({scenarioId:z.enum(['mike-repair-followup','sarah-rental-followup','david-text-followup','unknown-buyer','company-repair-followup','company-duplicate-source','company-revoke-access','company-restore-access']),eventKey:z.string().trim().min(1).max(150)}).strict();
const notice='Fictional email and investor-text inbox. Accounts are demo adapters; reviewed simulations stay here and no message is delivered externally. Your private Copilot SMS/Slack conversation is separate.';
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const providerLabel={gmail:'Gmail demo mailbox',outlook:'Outlook demo mailbox',twilio:'Demo business text line',salesforce:'Company email · Salesforce workflow demo'};

function assertCommunicationsDemo(actor:Actor){
 assertActor(actor);
 if(hostedDemo()){validateHostedDemo();return;}
 if(process.env.AGENTDESK_DEMO!=='true'||process.env.NODE_ENV==='production'&&process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO!=='true')throw new AppError(403,'The fictional inbox is available only in an explicitly configured demonstration.');
}
function rows<T>(actor:Actor,table:ScopedTable,extra='',args:unknown[]=[]):T[]{return (getDb().prepare(`SELECT data FROM ${table} WHERE organization_id=? AND office_id=? AND owner_id=? ${extra}`).all(...scope(actor),...args) as {data:string}[]).map(row=>JSON.parse(row.data) as T);}
function scoped<T>(actor:Actor,table:ScopedTable,id:string):T {
 const value=rows<T>(actor,table,'AND id=?',[idSchema.parse(id)])[0];
 if(!value)throw new AppError(404,'This inbox record was not found in your private workspace.');
 return value;
}
const investorMatch=(investor:Investor,reason:string):InvestorMatch=>({id:investor.id,name:investor.name,company:investor.company,reason});
const contact=(value:string)=>value.trim().toLowerCase();
const phone=(value:string)=>value.replace(/[^0-9]/g,'');
function candidates(actor:Actor,thread:Pick<StoredThread,'correspondent'|'channel'>){
 const visible=readInvestors(actor);
 const exact=visible.filter(investor=>thread.channel==='email'?!!investor.email&&contact(investor.email)===contact(thread.correspondent.address):!!investor.phone&&phone(investor.phone)===phone(thread.correspondent.address));
 if(exact.length)return {exact:true,values:exact.map(value=>investorMatch(value,'Contact address matches this permitted CRM record; fictional identity is not independently verified.'))};
 const name=thread.correspondent.name.toLowerCase();
 const possible=visible.filter(investor=>investor.name.toLowerCase().split(/\s+/).filter(part=>part.length>=3).every(part=>name.includes(part)));
 return {exact:false,values:possible.map(value=>investorMatch(value,'Name resemblance only. Review the relationship before linking; this contact is not verified.'))};
}
function association(actor:Actor,thread:StoredThread):InvestorAssociation {
 if(thread.investorId){
  try{return {status:'linked',investor:investorMatch(readInvestor(actor,thread.investorId),thread.matchMethod==='employee_review'?'Linked by employee review.':'Matched by the unique permitted contact address.'),candidates:[],method:thread.matchMethod,notice:'This connection is a relationship reference, not verification of the sender or permission to send.'};}
  catch(error){if(!(error instanceof AppError&&error.status===404))throw error;return {status:'unavailable',investor:null,candidates:[],method:null,notice:'The previously linked relationship is no longer available to you. Mailbox history remains private to you.'};}
 }
 if(thread.manualUnlink)return {status:'unmatched',investor:null,candidates:[],method:null,notice:'No investor linked. An employee removed the previous association.'};
 const matches=candidates(actor,thread);
 return {status:matches.values.length?'needs_review':'unmatched',investor:null,candidates:matches.values,method:null,notice:matches.values.length?'Review the possible relationship before linking. Names alone do not establish identity.':'No permitted relationship match. Choose an existing investor after review; no CRM record is created automatically.'};
}
function activeDraft(actor:Actor,threadId:string){return rows<CommunicationDraft>(actor,'communication_drafts',"AND thread_id=? AND status='draft'",[threadId])[0]??null;}
function visibleThread(actor:Actor,value:StoredThread):InboxThread {
 const {investorId:_investorId,matchMethod:_matchMethod,manualUnlink:_manualUnlink,...thread}=value;
 void _investorId;void _matchMethod;void _manualUnlink;
 const account=getCommunicationAccount(actor,thread.accountId);
 if(account.access==='revoked')return {...thread,subject:'Company email access unavailable',correspondent:{name:'Unavailable correspondent',address:''},preview:'Message contents are withheld while source access is revoked.',association:{status:'unavailable',investor:null,candidates:[],method:null,notice:account.capabilityNotice},hasDraft:false};
 return {...thread,...(!account.capabilities.readBody?{subject:'Subject unavailable · headers only',preview:'Only sender, recipients and time were captured. Message body is unavailable.'}:{}),association:association(actor,value),hasDraft:account.capabilities.readBody&&!!activeDraft(actor,thread.id)};
}
function saveThread(actor:Actor,value:StoredThread){getDb().prepare('UPDATE communication_threads SET data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify(value),value.id,...scope(actor));}
function insertMessage(actor:Actor,thread:StoredThread,account:CommunicationAccount,fixture:DemoThreadFixture,ref:string,receivedAt:string){
 const value:CommunicationMessage={id:newId('inbox_message'),threadId:thread.id,accountId:account.id,direction:'inbound',from:fixture.correspondent,to:[{name:actor.name,address:account.address}],subject:fixture.subject,body:fixture.body,receivedAt,sourceRef:ref,sourceLabel:`${providerLabel[account.provider]} · fictional source`,deliveryStatus:'demo_received',attachments:fixture.attachments,synthetic:true};
 getDb().prepare('INSERT INTO communication_messages VALUES(?,?,?,?,?,?,?,?)').run(value.id,...scope(actor),account.id,thread.id,ref,JSON.stringify(value));
 return value;
}
function ensureDemoInbox(actor:Actor){
 assertCommunicationsDemo(actor);
 if(!isCommunicationDemoPersona(actor))return;
 getDb().transaction(()=>{
  if(getDb().prepare('SELECT 1 FROM communication_demo_seeds WHERE organization_id=? AND office_id=? AND owner_id=?').get(...scope(actor)))return;
  const aliases=actor.name.toLowerCase().replace(/[^a-z]+/g,'.');
  const accounts:StoredCommunicationAccount[]=(['gmail','outlook','twilio'] as const).map(provider=>({id:newId('inbox_account'),provider,channel:provider==='twilio'?'sms':'email',label:provider==='gmail'?'Work Gmail':provider==='outlook'?'Outlook mailbox':'Business texts',address:provider==='twilio'?`+140455501${String(parseInt(fingerprint(scope(actor)).slice(0,4),16)%100).padStart(2,'0')}`:`${aliases}@${provider}.example`,status:'demo',synthetic:true}));
  for(const account of accounts)getDb().prepare('INSERT INTO communication_accounts VALUES(?,?,?,?,?,?)').run(account.id,...scope(actor),`demo:${account.provider}`,JSON.stringify(account));
  const seededAt=Date.now();
  for(const [index,fixture] of demoThreadFixtures(actor).entries()){
   const account=accounts.find(item=>item.provider===fixture.provider)!,receivedAt=new Date(seededAt-(index+1)*3_600_000).toISOString();
   const matching=candidates(actor,{correspondent:fixture.correspondent,channel:account.channel});
   const linked=matching.exact&&matching.values.length===1?matching.values[0].id:null;
   const thread:StoredThread={id:newId('inbox_thread'),accountId:account.id,channel:account.channel,subject:fixture.subject,correspondent:fixture.correspondent,status:'needs_reply',unread:true,version:1,updatedAt:receivedAt,lastMessageAt:receivedAt,preview:fixture.body.slice(0,180),messageCount:1,investorId:linked,matchMethod:linked?'exact_contact':null,manualUnlink:false,synthetic:true};
   getDb().prepare('INSERT INTO communication_threads VALUES(?,?,?,?,?,?,?)').run(thread.id,...scope(actor),account.id,`demo:${fixture.key}`,JSON.stringify(thread));
   insertMessage(actor,thread,normalizeCommunicationAccount(account),fixture,`demo:initial:${fixture.key}`,receivedAt);
  }
  getDb().prepare('INSERT INTO communication_demo_seeds VALUES(?,?,?,?)').run(...scope(actor),now());
  audit(actor,'communications.demo.prepared',null,{accounts:3,threads:5});
 }).immediate();
 ensureCompanyDemoInbox(actor);
}
export function getInboxState(actor:Actor,input:unknown={}):InboxState {
 const query=inboxQuerySchema.parse(input);ensureDemoInbox(actor);
 const accounts=rows<StoredCommunicationAccount>(actor,'communication_accounts').map(normalizeCommunicationAccount).sort((a,b)=>Number(b.primary)-Number(a.primary));
 if(query.accountId)scoped<CommunicationAccount>(actor,'communication_accounts',query.accountId);
 const access=featureAccess(actor,'core');
 const all=rows<StoredThread>(actor,'communication_threads').map(thread=>visibleThread(actor,thread)).sort((a,b)=>b.lastMessageAt.localeCompare(a.lastMessageAt)||a.id.localeCompare(b.id));
 const selected=all.filter(thread=>{
  if(query.accountId&&thread.accountId!==query.accountId)return false;if(!query.q)return true;
  const account=accounts.find(item=>item.id===thread.accountId)!;
  if(account.access==='revoked')return false;
  const draft=account.capabilities.readBody?activeDraft(actor,thread.id):null;
  const bodies=account.capabilities.readBody?rows<CommunicationMessage>(actor,'communication_messages','AND thread_id=?',[thread.id]).map(message=>message.body):[];
  return [thread.subject,thread.correspondent.name,thread.correspondent.address,...bodies,draft?.body??'',draft?.subject??''].join('\n').toLowerCase().includes(query.q.toLowerCase());
 });
 const matches=(thread:InboxThread,filter:InboxFilter)=>filter==='all'||filter==='email'&&thread.channel==='email'||filter==='sms'&&thread.channel==='sms'||filter==='needs_reply'&&thread.status==='needs_reply'||filter==='drafts'&&thread.hasDraft;
 return {accounts,preferredAccountId:accounts.find(account=>account.primary)?.id??null,threads:selected.filter(thread=>matches(thread,query.filter)),counts:Object.fromEntries((['all','email','sms','needs_reply','drafts'] as const).map(filter=>[filter,selected.filter(thread=>matches(thread,filter)).length])) as InboxState['counts'],unreadCount:selected.filter(thread=>thread.unread).length,filter:query.filter,accountId:query.accountId??null,query:query.q,scenarios:[...companyInboxScenarios,...inboxScenarios].map(scenario=>({...scenario,available:isCommunicationDemoPersona(actor)&&access.allowed&&companyScenarioAvailable(scenario.id,accounts)})),canEdit:access.allowed,accessReason:access.reason,mode:'demonstration',liveDelivery:false,notice};
}
export function getInboxThread(actor:Actor,id:string):InboxThreadDetail {
 ensureDemoInbox(actor);const raw=scoped<StoredThread>(actor,'communication_threads',id),thread=visibleThread(actor,raw),account=getCommunicationAccount(actor,thread.accountId),access=featureAccess(actor,'core'),draft=account.capabilities.readBody?activeDraft(actor,id):null;
 const messages=rows<CommunicationMessage>(actor,'communication_messages','AND thread_id=? ORDER BY rowid',[id]).map(message=>visibleCommunicationMessage(actor,account,message));
 const draftHistory=account.capabilities.readBody?rows<CommunicationDraft>(actor,'communication_draft_revisions','AND thread_id=? ORDER BY rowid DESC LIMIT 25',[id]).filter(value=>!(draft?.id===value.id&&draft.version===value.version)):[];
 let investorContext:InboxThreadDetail['investorContext']=null;
 if(thread.association.investor&&access.allowed&&account.capabilities.readBody)investorContext=getInvestorJourney(actor,thread.association.investor.id);
 return {bodyAccess:account.access==='revoked'?'revoked':account.capabilities.readBody?'full':'headers_only',capabilityNotice:account.capabilityNotice,thread,account,messages,draft,draftHistory,investorContext,contextNotice:account.access==='revoked'||!account.capabilities.readBody?account.capabilityNotice:investorContext?'Existing authorized relationship history. Inbox messages are separate source material and have not updated CRM facts automatically. Only explicitly reviewed notes and follow-ups are added to relationship work.':!access.allowed?'Mailbox history remains available. An active workforce subscription is required for relationship context and changes.':thread.association.notice,availableInvestors:account.access==='revoked'?[]:readInvestors(actor).map(value=>investorMatch(value,'Permitted CRM relationship; linking requires your review.')),canEdit:access.allowed&&account.access==='available',accessReason:account.access==='revoked'?account.capabilityNotice:access.reason,liveDelivery:false};
}
function replay(actor:Actor,key:string,payload:unknown){
 const row=getDb().prepare('SELECT payload_hash,thread_id FROM communication_events WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope(actor),key) as {payload_hash:string;thread_id:string}|undefined;
 if(row&&row.payload_hash!==fingerprint(payload))throw new AppError(409,'This request key was already used for a different inbox action.');
 return row?.thread_id??null;
}
function recordEvent(actor:Actor,key:string,payload:unknown,threadId:string,kind:string){getDb().prepare('INSERT INTO communication_events VALUES(?,?,?,?,?,?,?,?)').run(newId('inbox_event'),...scope(actor),key,fingerprint(payload),threadId,now());audit(actor,`communications.${kind}`,threadId);}
function mutateThread(actor:Actor,id:string,kind:string,input:InboxMutation,change:(thread:StoredThread)=>StoredThread):InboxThreadDetail {
 ensureDemoInbox(actor);requireFeature(actor,'core');
 return getDb().transaction(()=>{
  const thread=scoped<StoredThread>(actor,'communication_threads',id),account=getCommunicationAccount(actor,thread.accountId);
  if(account.access==='revoked')throw new AppError(403,account.capabilityNotice);
  if(kind.startsWith('draft.'))requireCommunicationCapability(account,'localDraft');
  const payload={kind,threadId:id,input};
  if(replay(actor,input.eventKey,payload))return getInboxThread(actor,id);
  if(thread.version!==input.expectedVersion)throw new AppError(409,'This conversation changed. Reload it before saving your change.');
  const updated=change(thread);saveThread(actor,{...updated,version:thread.version+1,updatedAt:now()});recordEvent(actor,input.eventKey,payload,id,kind);
  return getInboxThread(actor,id);
 }).immediate();
}
export function updateInboxThread(actor:Actor,id:string,input:UpdateCommunicationThread){const parsed=threadUpdateSchema.parse(input);return mutateThread(actor,id,'thread.updated',parsed,thread=>({...thread,...(parsed.status===undefined?{}:{status:parsed.status}),...(parsed.unread===undefined?{}:{unread:parsed.unread})}));}
function saveDraftRecord(actor:Actor,value:CommunicationDraft){
 getDb().prepare('INSERT INTO communication_drafts VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(value.id,...scope(actor),value.threadId,value.status,JSON.stringify(value));
 getDb().prepare('INSERT INTO communication_draft_revisions VALUES(?,?,?,?,?,?,?,?)').run(newId('draft_revision'),...scope(actor),value.threadId,value.id,value.version,JSON.stringify(value));
}
export function saveInboxDraft(actor:Actor,id:string,input:SaveCommunicationDraft){
 const parsed=saveDraftSchema.parse(input);
 return mutateThread(actor,id,'draft.saved',parsed,thread=>{
  if(thread.channel==='sms'&&parsed.subject!==undefined)throw new AppError(400,'Text-message drafts do not have an editable subject.');
  if(thread.channel==='sms'&&parsed.body.length>1600)throw new AppError(400,'Keep this text-message draft to 1,600 characters or fewer.');
  const account=getCommunicationAccount(actor,thread.accountId),existing=activeDraft(actor,id),timestamp=now();
  const draft:CommunicationDraft={id:existing?.id??newId('inbox_draft'),threadId:id,accountId:account.id,from:{name:actor.name,address:account.address},to:thread.correspondent,subject:thread.channel==='sms'?thread.subject:parsed.subject??existing?.subject??`Re: ${thread.subject}`,body:parsed.body,status:'draft',createdAt:existing?.createdAt??timestamp,updatedAt:timestamp,version:(existing?.version??0)+1,deliveryStatus:'not_sent',synthetic:true};
  saveDraftRecord(actor,draft);return thread;
 });
}
export function discardInboxDraft(actor:Actor,id:string,input:InboxMutation){const parsed=discardDraftSchema.parse(input);return mutateThread(actor,id,'draft.discarded',parsed,thread=>{const current=activeDraft(actor,id);if(!current)throw new AppError(409,'There is no saved draft to discard.');saveDraftRecord(actor,{...current,status:'discarded',updatedAt:now(),version:current.version+1});return thread;});}
export function linkInboxInvestor(actor:Actor,id:string,input:LinkCommunicationInvestor){const parsed=linkInvestorSchema.parse(input);return mutateThread(actor,id,'investor.linked',parsed,thread=>{if(parsed.investorId)readInvestor(actor,parsed.investorId);return {...thread,investorId:parsed.investorId,matchMethod:parsed.investorId?'employee_review':null,manualUnlink:parsed.investorId===null};});}
export function receiveDemoCommunication(actor:Actor,input:ReceiveDemoCommunication):InboxThreadDetail {
 const parsed=receiveDemoSchema.parse(input);ensureDemoInbox(actor);requireFeature(actor,'core');
 if(!isCommunicationDemoPersona(actor))throw new AppError(403,'Fictional arrival scenarios are available only for the fixed demonstration personas.');
 return getDb().transaction(()=>{
  const payload={kind:'demo.received',input:parsed},prior=replay(actor,parsed.eventKey,payload);if(prior)return getInboxThread(actor,prior);
  if(parsed.scenarioId.startsWith('company-'))return receiveCompanyScenario(actor,parsed,payload);
  const fixture=demoFollowup(actor,parsed.scenarioId as Parameters<typeof demoFollowup>[1]);
  const row=getDb().prepare('SELECT data FROM communication_threads WHERE organization_id=? AND office_id=? AND owner_id=? AND provider_ref=?').get(...scope(actor),`demo:${fixture.key}`) as {data:string}|undefined;
  if(!row)throw new AppError(404,'The demonstration conversation is not available.');
  const thread=JSON.parse(row.data) as StoredThread,account=getCommunicationAccount(actor,thread.accountId),timestamp=now();
  if(thread.messageCount>=200)throw new AppError(409,'This demonstration conversation has reached its sample-message limit. Existing history and drafts remain available.');
  insertMessage(actor,thread,account,fixture,`demo:arrival:${fingerprint(parsed.eventKey)}`,timestamp);
  saveThread(actor,{...thread,status:'needs_reply',unread:true,version:thread.version+1,updatedAt:timestamp,lastMessageAt:timestamp,preview:fixture.body.slice(0,180),messageCount:thread.messageCount+1});
  recordEvent(actor,parsed.eventKey,payload,thread.id,'demo.received');return getInboxThread(actor,thread.id);
 }).immediate();
}

function companyScenarioAvailable(scenarioId:ReceiveDemoCommunication['scenarioId'],accounts:CommunicationAccount[]){
 const account=accounts.find(item=>item.primary);if(!scenarioId.startsWith('company-'))return true;if(!account)return false;
 return scenarioId==='company-restore-access'?account.access==='revoked':account.access==='available';
}
function recordSourceLink(actor:Actor,accountId:string,messageId:string,system:'salesforce'|'company_mailbox',reference:string,label:string){
 const previous=getDb().prepare('SELECT message_id FROM communication_source_links WHERE organization_id=? AND office_id=? AND owner_id=? AND account_id=? AND source_system=? AND source_ref=?').get(...scope(actor),accountId,system,reference) as {message_id:string}|undefined;
 if(previous){if(previous.message_id!==messageId)throw new AppError(409,'This source reference is already associated with a different message.');return false;}
 getDb().prepare('INSERT INTO communication_source_links VALUES(?,?,?,?,?,?,?,?,?)').run(newId('inbox_source'),...scope(actor),accountId,messageId,system,reference,JSON.stringify({system,reference,label,synthetic:true}));return true;
}
function ensureCompanyDemoInbox(actor:Actor){
 getDb().transaction(()=>{
  if(getDb().prepare('SELECT 1 FROM communication_company_demo_seeds WHERE organization_id=? AND office_id=? AND owner_id=?').get(...scope(actor)))return;
  const aliases=actor.name.toLowerCase().replace(/[^a-z]+/g,'.'),timestamp=Date.now();
  for(const [index,fixture] of companyThreadFixtures(actor).entries()){
   const primary=index===0,coverage=index===0?'mailbox':index===1?'crm_activity':'headers_only';
   const account=normalizeCommunicationAccount({id:newId('inbox_account'),provider:'salesforce',channel:'email',label:primary?'Company email · Salesforce':index===1?'Salesforce activity example':'Salesforce headers-only example',address:`${aliases}@company.example`,status:'demo',synthetic:true,source:{system:'salesforce',coverage,label:primary?'Company email · Salesforce workflow':index===1?'Fictional captured CRM activity':'Fictional header-only activity'},transport:primary?'demo_company_email':'none',access:'available',accessVersion:1,primary});
   getDb().prepare('INSERT INTO communication_accounts VALUES(?,?,?,?,?,?)').run(account.id,...scope(actor),`demo:salesforce:${coverage}`,JSON.stringify(account));
   const matching=candidates(actor,{correspondent:fixture.correspondent,channel:'email'}),linked=matching.exact&&matching.values.length===1?matching.values[0].id:null,receivedAt=new Date(timestamp-(index+1)*60_000).toISOString();
   const thread:StoredThread={id:newId('inbox_thread'),accountId:account.id,channel:'email',subject:fixture.subject,correspondent:fixture.correspondent,status:'needs_reply',unread:true,version:1,updatedAt:receivedAt,lastMessageAt:receivedAt,preview:fixture.body.slice(0,180),messageCount:1,investorId:linked,matchMethod:linked?'exact_contact':null,manualUnlink:false,synthetic:true};
   getDb().prepare('INSERT INTO communication_threads VALUES(?,?,?,?,?,?,?)').run(thread.id,...scope(actor),account.id,`demo:${fixture.key}`,JSON.stringify(thread));
   const message=insertMessage(actor,thread,account,fixture,`demo:company:initial:${fixture.key}`,receivedAt);
   recordSourceLink(actor,account.id,message.id,primary?'company_mailbox':'salesforce',`demo:${primary?'company-mail':'salesforce-activity'}:${fixture.key}`,primary?'Original fictional company-email message':'Fictional Salesforce activity reference');
  }
  getDb().prepare('INSERT INTO communication_company_demo_seeds VALUES(?,?,?,?)').run(...scope(actor),now());audit(actor,'communications.company_demo.prepared',null,{accounts:3,threads:3});
 }).immediate();
}
function receiveCompanyScenario(actor:Actor,input:ReceiveDemoCommunication,payload:unknown):InboxThreadDetail {
 const row=getDb().prepare("SELECT data FROM communication_threads WHERE organization_id=? AND office_id=? AND owner_id=? AND provider_ref='demo:company-mike'").get(...scope(actor)) as {data:string}|undefined;
 if(!row)throw new AppError(404,'The company-email demonstration is not available.');
 const thread=JSON.parse(row.data) as StoredThread,account=getCommunicationAccount(actor,thread.accountId),timestamp=now();
 if(input.scenarioId==='company-revoke-access'||input.scenarioId==='company-restore-access'){
  const access=input.scenarioId==='company-revoke-access'?'revoked':'available';
  if(account.access!==access){
   const changed=normalizeCommunicationAccount({...account,access,accessVersion:account.accessVersion+1});
   getDb().prepare('UPDATE communication_accounts SET data=? WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(JSON.stringify(changed),account.id,...scope(actor));
   saveThread(actor,{...thread,version:thread.version+1,updatedAt:timestamp});
  }
 }else{
  requireCommunicationCapability(account,'readBody');
  if(input.scenarioId==='company-duplicate-source'){
   const original=rows<CommunicationMessage>(actor,'communication_messages','AND thread_id=? AND provider_ref=?',[thread.id,'demo:company:initial:company-mike'])[0];
   if(!original)throw new AppError(404,'The original company message is unavailable.');
   if(recordSourceLink(actor,account.id,original.id,'salesforce','demo:salesforce-activity:company-mike','Same fictional email captured as Salesforce activity'))saveThread(actor,{...thread,version:thread.version+1,updatedAt:timestamp});
  }else if(input.scenarioId==='company-repair-followup'){
   if(thread.messageCount>=200)throw new AppError(409,'This demonstration conversation has reached its sample-message limit.');
   const fixture={...companyThreadFixtures(actor)[0],body:'Thanks for following up through my company email conversation. Please separate sourced repair figures from assumptions and confirm what still needs contractor review before our next walkthrough. Fictional reply; no repair estimate or contractor availability has been verified.'};
   const message=insertMessage(actor,thread,account,fixture,`demo:company:arrival:${fingerprint(input.eventKey)}`,timestamp);
   recordSourceLink(actor,account.id,message.id,'company_mailbox',message.sourceRef,'Fictional company-email follow-up');
   saveThread(actor,{...thread,status:'needs_reply',unread:true,version:thread.version+1,updatedAt:timestamp,lastMessageAt:timestamp,preview:fixture.body.slice(0,180),messageCount:thread.messageCount+1});
  }else throw new AppError(400,'Unknown company-email demonstration scenario.');
 }
 recordEvent(actor,input.eventKey,payload,thread.id,'company_demo.received');return getInboxThread(actor,thread.id);
}
