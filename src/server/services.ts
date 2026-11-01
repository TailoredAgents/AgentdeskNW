import {researchSourceVisible} from './research-spending';
import {isAuthorizedActor,researchOwnerEligibility} from './db';
import {registerResearchSpending,assertResearchSpendingRetry,researchSpendingFinished} from './research-spending';
import {researchAssignmentParent,bindIncludedResearch,includedResearchAdmission,assertIncludedResearchRetry,finishIncludedResearch} from './local-assignment-work';
import {buildBuyerShortlist} from './buyer-shortlist';
import {bindAssignment,withAssignment} from './assignment-roots';
import {proactiveOwnsTopic} from './proactive-policy';
import {employeeTimeZone} from './proactive-time';
import {getHandoffBoard} from './handoffs';
import { researchConfig } from './external-research-provider';
import { z } from 'zod';
import type { Actor, Artifact, Bootstrap, Conversation, Investor, Message, NoteSummary, Notification, ProposedAction, ResearchInput, ResearchJob, Role, Settings, Task } from '../lib/contracts';
import { AppError, assertActor, audit, getDb, insertRecord, newId, now, requireRole, scopedGet, scopedRows, updateRecord } from './db';
import { specialists } from './registry';
import { hasFeature,requireFeature } from './billing';
import { reserveUsage,releaseUsage,settleUsage,recordMeter,researchCredits } from './metering';
import { researchInputSchema, syntheticResearchProvider } from './research';
import { externalResearchProviderId, prepareExternalResearch } from './external-research-provider';
import { classifyAuthorizedDuplicate, readInvestor, readInvestorRow, readInvestors, readProperty, readProperties, writableInvestor } from './access';
import { addRelationshipEvent, applyBuyBoxApproval, listBuyBoxes, matchProperty, syncPrimaryBuyBox } from './intelligence';
import { extractNotes } from './notes';
import { withHistoryReadSnapshot, collectHistoryReferences, readHistoryMessage, type StoredMessage } from './history';
import { listPersonalTasks, mutateTask, taskReminderKey } from './task-actions';

export { AppError, assertActor, demoActor } from './db';
export { specialists } from './registry';

const idSchema=z.string().min(1).max(150);
const titleSchema=z.string().trim().min(1).max(300);
const settingsSchema=z.object({guidance:z.enum(['concise','guided']),notifications:z.boolean(),quietHoursStart:z.number().int().min(0).max(23),quietHoursEnd:z.number().int().min(0).max(23)}).strict();
const defaultSettings:Settings={guidance:'guided',notifications:true,quietHoursStart:21,quietHoursEnd:8};
const researchRoles:Role[]=['dispositions','manager'];

export function listInvestors(actor:Actor) { return readInvestors(actor); }
export function getInvestor(actor:Actor,id:string) { return readInvestor(actor,idSchema.parse(id)); }
export function listProperties(actor:Actor) { return readProperties(actor); }
function refreshDuplicateStatus(actor:Actor,job:ResearchJob):ResearchJob {
 if(job.status!=='completed'&&!job.prospects.length)return job;
 const prospects=job.prospects.map(prospect=>({...prospect,...classifyAuthorizedDuplicate(actor,prospect)}));
 return {...job,prospects,stage:job.provider===syntheticResearchProvider.id&&job.status==='completed'?`Completed: ${prospects.length} synthetic candidates (${prospects.filter(item=>item.duplicateStatus==='net_new').length} currently eligible as new after privacy-preserving CRM duplicate checks). Dataset contains 12 candidates.`:job.stage};
}
function visibleResearch(actor:Actor,job:ResearchJob){const owner=actorForMember(actor.organizationId,actor.officeId,job.ownerId);if(!isAuthorizedActor(owner)||!researchSourceVisible(owner,job.id))return {...job,prospects:[],input:{...job.input,address:'Source context unavailable',county:'Unavailable',price:0,strategy:'Unavailable',propertyType:undefined},stage:'Original sources changed; saved results are withheld. Review current context before preparing replacement work.'};return refreshDuplicateStatus(actor,job);}
export function listJobs(actor:Actor) { return scopedRows<ResearchJob>(actor,'research_jobs').map(job=>visibleResearch(actor,job)); }
export function listTasks(actor:Actor) { return scopedRows<Task>(actor,'tasks'); }
function checkApprovalReferences(actor:Actor,action:ProposedAction):ProposedAction {
 if(typeof action.payload.investorId==='string')getInvestor(actor,action.payload.investorId);
 return action;
}
export function getApproval(actor:Actor,id:string):ProposedAction {return checkApprovalReferences(actor,scopedGet<ProposedAction>(actor,'proposed_actions',idSchema.parse(id)));}
export function listApprovals(actor:Actor) {return scopedRows<ProposedAction>(actor,'proposed_actions').filter(action=>{try{checkApprovalReferences(actor,action);return true;}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}});}

export function recordUsage(actor:Actor,kind:string,quantity:number) {
 assertActor(actor);
 const value=z.object({kind:z.string().min(1).max(100),quantity:z.number().finite().min(0).max(1_000_000_000)}).parse({kind,quantity});
 getDb().prepare('INSERT INTO usage_events VALUES(?,?,?,?,?,?,?)').run(newId('usage'),actor.organizationId,actor.officeId,actor.id,value.kind,value.quantity,now());
}
export function getSettings(actor:Actor):Settings {
 assertActor(actor);
 const row=getDb().prepare('SELECT data FROM user_settings WHERE organization_id=? AND office_id=? AND owner_id=?').get(actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 return row?settingsSchema.parse(JSON.parse(row.data)):{...defaultSettings};
}
export function updateSettings(actor:Actor,partial:Partial<Settings>,expected?:Settings):Settings {
 assertActor(actor);const changes=settingsSchema.partial().parse(partial),snapshot=expected?settingsSchema.parse(expected):undefined;
 return getDb().transaction(()=>{const current=getSettings(actor),keys=Object.keys(changes) as (keyof Settings)[];
  if(snapshot&&keys.every(key=>current[key]===changes[key]))return current; // A confirmed exact retry has no second effect.
  if(snapshot&&(Object.keys(snapshot) as (keyof Settings)[]).some(key=>current[key]!==snapshot[key]))throw new AppError(409,'Notification preferences changed elsewhere. Reload the current settings before saving.');
  const value={...current,...changes};getDb().prepare('INSERT INTO user_settings VALUES(?,?,?,?) ON CONFLICT(organization_id,office_id,owner_id) DO UPDATE SET data=excluded.data').run(actor.organizationId,actor.officeId,actor.id,JSON.stringify(value));
  audit(actor,'preferences.updated');return value;
 }).immediate();
}
export function notificationsAllowed(actor:Actor):boolean {
 const settings=getSettings(actor);
 if(!settings.notifications) return false;
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:employeeTimeZone(actor),hour:'numeric',hourCycle:'h23'}).format(new Date()));
 const start=settings.quietHoursStart,end=settings.quietHoursEnd;
 return start===end || !(start<end?hour>=start&&hour<end:hour>=start||hour<end);
}
export function notify(actor:Actor,dedupeKey:string,title:string,body:string,link:string) {
 if(!notificationsAllowed(actor))return;
 const count=getDb().prepare("SELECT COUNT(*) AS n FROM notifications WHERE organization_id=? AND office_id=? AND owner_id=? AND json_extract(data,'$.createdAt')>=?").get(actor.organizationId,actor.officeId,actor.id,new Date(Date.now()-86400000).toISOString()) as {n:number};
 if(count.n>=10)return;
 const item:Notification={id:newId('notice'),title,body,read:false,createdAt:now(),link};
 getDb().prepare('INSERT OR IGNORE INTO notifications(id,organization_id,office_id,owner_id,dedupe_key,data) VALUES(?,?,?,?,?,?)').run(item.id,actor.organizationId,actor.officeId,actor.id,dedupeKey,JSON.stringify(item));
}
export function processNotifications(actor:Actor) {
 assertActor(actor);
 if(!proactiveOwnsTopic(actor,'tasks')&&hasFeature(actor,'core')&&hasFeature(actor,'daily-coordinator'))for(const task of listPersonalTasks(actor))if(task.status==='open'&&task.dueAt&&Date.parse(task.dueAt)<=Date.now())notify(actor,taskReminderKey(task),'Follow-up is due',task.title,'queue');
 for(const job of scopedRows<ResearchJob>(actor,'research_jobs',true))if(job.status==='completed'&&researchSourceVisible(actor,job.id))notify(actor,`research-done:${job.id}`,'Your research is ready',`${job.prospects.length} ${job.provider===syntheticResearchProvider.id?'synthetic prospects':'public-source candidates; identities and purchases unverified'} for ${job.input.address}. Review evidence and duplicates before importing.`,'hunter');
 for(const job of scopedRows<ResearchJob>(actor,'research_jobs',true))if(job.status==='failed'&&job.provider===externalResearchProviderId&&researchSourceVisible(actor,job.id))notify(actor,`research-stopped:${job.id}:${job.attempt}`,'External research stopped',`${job.prospects.length} saved candidates remain available. Review the job for its stop reason and remaining scope.`,'hunter');
 if(!notificationsAllowed(actor))return;
 // Retry from durable current records after quiet hours; stale/withdrawn releases are not replayed.
 const releases=getDb().prepare('SELECT id,data FROM property_releases WHERE organization_id=? AND office_id=?').all(actor.organizationId,actor.officeId) as {id:string;data:string}[];
 for(const row of releases){
  const release=JSON.parse(row.data) as {status:string;version:number;authorizedUserIds:string[];property:{address:string;id:string}};
  const key=`release:${row.id}:${release.version}`;
  if(release.status!=='released'||!release.authorizedUserIds.includes(actor.id)||getDb().prepare('SELECT 1 FROM notifications WHERE organization_id=? AND office_id=? AND owner_id=? AND dedupe_key=?').get(actor.organizationId,actor.officeId,actor.id,key))continue;
  const matches=hasFeature(actor,'buyer-matchmaker')?matchProperty(actor,release.property.id):[];notify(actor,key,'Demo property release',`${release.property.address}: ${matches.filter(match=>match.score>0).length} matches among your permitted investors. Review fit and disclosure before preparing details.`,'properties');
 }
 for(const row of getDb().prepare("SELECT data FROM deal_packages WHERE organization_id=? AND office_id=? AND owner_id=? AND json_extract(data,'$.status')='draft'").all(actor.organizationId,actor.officeId,actor.id) as {data:string}[]){
  const item=JSON.parse(row.data) as {id:string;investorId:string;releaseId:string};
  try{readInvestor(actor,item.investorId);const release=releases.find(row=>row.id===item.releaseId);if(!release)continue;const value=JSON.parse(release.data) as {status:string;authorizedUserIds:string[]};if(value.status!=='released'||actor.role!=='manager'&&!value.authorizedUserIds.includes(actor.id))continue;notify(actor,`package-review:${item.id}`,'Deal package awaiting review','Open the saved demo package to review current eligibility and exact content. Nothing has been sent.','properties');}catch(error){if(!(error instanceof AppError)||![403,404].includes(error.status))throw error;}
 }
}
/** Scheduler entry point: reminders do not depend on an active research job or open browser. */
export function processAllNotifications():number {
 const members=getDb().prepare('SELECT m.organization_id,m.office_id,m.user_id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id').all() as {organization_id:string;office_id:string;user_id:string;name:string;role:Role}[];
 let processed=0;for(const member of members){const actor:Actor={id:member.user_id,name:member.name,organizationId:member.organization_id,officeId:member.office_id,role:member.role};if(isAuthorizedActor(actor)){processNotifications(actor);processed++;}}
 return processed;
}
export function readNotification(actor:Actor,id:string) {
 const item=scopedGet<Notification>(actor,'notifications',idSchema.parse(id),true);
 return updateRecord(actor,'notifications',{...item,read:true},true);
}

export function createConversation(actor:Actor,title='New conversation'):Conversation {
 requireFeature(actor,'core');
 assertActor(actor);
 const conversation:Conversation={id:newId('conversation'),title:titleSchema.parse(title),createdAt:now(),updatedAt:now(),messages:[]};
 insertRecord(actor,'conversations',conversation); audit(actor,'conversation.created',conversation.id); return conversation;
}
export function getConversation(actor:Actor,id:string):Conversation {
 return withHistoryReadSnapshot(()=>{const conversation=scopedGet<Conversation>(actor,'conversations',idSchema.parse(id),true);
 const rows=getDb().prepare('SELECT data FROM messages WHERE conversation_id=? AND organization_id=? AND office_id=? AND owner_id=? ORDER BY sequence ASC').all(conversation.id,actor.organizationId,actor.officeId,actor.id) as {data:string}[];
 const messages=rows.map(row=>readHistoryMessage(actor,JSON.parse(row.data) as StoredMessage));
 return {...conversation,title:messages.some(message=>message.content.startsWith('This historical message is withheld'))?'Conversation with restricted history':conversation.title,messages};});
}
export function listConversations(actor:Actor):Conversation[] {
 return scopedRows<Conversation>(actor,'conversations',true).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50).map(item=>getConversation(actor,item.id));
}
const messageSchema=z.object({role:z.enum(['user','assistant']),content:z.string().trim().min(1).max(50000),specialistIds:z.array(z.string().max(100)).max(16).optional(),artifacts:z.array(z.object({type:z.enum(['document','transaction_team','transaction','knowledge','updates','analysis','opportunity','handoff','work_run','job','approval','notes','task','investors','guidance','package','debrief','release','calling_queue','briefing','marketplace','inbox']),id:z.string().max(150).optional(),title:z.string().max(300),data:z.unknown().optional()})).max(20).optional()}).strict();
export function addMessage(actor:Actor,conversationId:string,input:{role:'user'|'assistant';content:string;specialistIds?:string[];artifacts?:Artifact[]},context?:{investors:{id:string}[];properties:{id:string}[]}):Message {
 const parsed=messageSchema.parse(input);
 return getDb().transaction(()=>{
  const conversation=getConversation(actor,conversationId);
  const prior=(getDb().prepare('SELECT data FROM messages WHERE conversation_id=? AND organization_id=? AND office_id=? AND owner_id=? ORDER BY sequence DESC LIMIT 24').all(conversation.id,actor.organizationId,actor.officeId,actor.id) as {data:string}[]).map(row=>JSON.parse(row.data) as StoredMessage);
  const references=collectHistoryReferences(actor,parsed.artifacts??[],prior.flatMap(message=>message.references?[message.references]:[]),context);
  const message:StoredMessage={id:newId('message'),role:parsed.role,content:parsed.content,specialistIds:parsed.specialistIds??[],artifacts:parsed.artifacts??[],createdAt:now(),references};
  const sequence=(getDb().prepare('SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM messages WHERE conversation_id=?').get(conversation.id) as {sequence:number}).sequence;
  getDb().prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?)').run(message.id,actor.organizationId,actor.officeId,actor.id,conversation.id,JSON.stringify(message),sequence);
  updateRecord(actor,'conversations',{...conversation,messages:[],updatedAt:now(),title:conversation.title==='New conversation'&&parsed.role==='user'?parsed.content.slice(0,70):conversation.title},true);
  return message;
 })();
}

export function createResearchJob(actor:Actor,input:ResearchInput):ResearchJob {
 requireRole(actor,researchRoles); requireFeature(actor,'investor-hunter'); const parsed=researchInputSchema.parse(input);
 const active=listJobs(actor).filter(job=>job.ownerId===actor.id&&(job.status==='queued'||job.status==='running'));
 if(active.length>=5)throw new AppError(429,'Finish or cancel an active research job before starting another.');
 const provider=parsed.provider??syntheticResearchProvider.id;
 const assignmentParent=researchAssignmentParent(actor);
 const external=provider===externalResearchProviderId?prepareExternalResearch(parsed):undefined;
 const missing=!parsed.county||!parsed.price||!parsed.strategy;
 const job:ResearchJob={id:newId('research'),input:parsed,status:missing?'awaiting_input':'queued',progress:0,stage:missing?'Add county, price and investment strategy to continue.':external?'Waiting for bounded external research':'Waiting for the local research worker',provider,prospects:[],error:null,createdAt:now(),updatedAt:now(),ownerId:actor.id,attempt:0,...(external?{external}:{})};
 return getDb().transaction(()=>{if(!missing)reserveUsage(actor,{category:'research_credits',operationId:job.id,quantity:researchCredits(actor,parsed.limit),source:external?'External research target reservation':'Synthetic research target reservation'});insertRecord(actor,'research_jobs',job);bindAssignment(actor,{kind:'research',id:job.id});if(assignmentParent&&provider===syntheticResearchProvider.id)bindIncludedResearch(actor,job,assignmentParent);if(external)registerResearchSpending(actor,job,assignmentParent?.requestId); audit(actor,'research.queued',job.id,{provider:job.provider,target:parsed.limit,maxEstimatedCostCents:external?.maxCostCents??null});return job;}).immediate();
}
export function getResearchJob(actor:Actor,id:string) { return visibleResearch(actor,scopedGet<ResearchJob>(actor,'research_jobs',idSchema.parse(id))); }
export function cancelJob(actor:Actor,id:string):ResearchJob {
 const job=scopedGet<ResearchJob>(actor,'research_jobs',idSchema.parse(id));
 if(job.status==='canceled')return visibleResearch(actor,job);
 if(job.status==='completed'||job.status==='failed')throw new AppError(409,'Only queued, running or awaiting-input jobs can be canceled.');
 return getDb().transaction(()=>{
  const value=updateRecord(actor,'research_jobs',{...job,status:'canceled' as const,stage:job.external?'Canceled by employee; in-flight provider usage will still be reconciled':'Canceled by employee',updatedAt:now()});
  getDb().prepare('UPDATE research_jobs SET worker_token=NULL,lease_until=NULL WHERE id=? AND organization_id=? AND office_id=?').run(id,actor.organizationId,actor.officeId);
  releaseUsage(actorForMember(actor.organizationId,actor.officeId,job.ownerId),'research_credits',id);audit(actor,'research.canceled',id);finishIncludedResearch(actorForMember(actor.organizationId,actor.officeId,job.ownerId),id);researchSpendingFinished(actorForMember(actor.organizationId,actor.officeId,job.ownerId),id);return visibleResearch(actor,value);
 }).immediate();
}
export function retryJob(actor:Actor,id:string,input?:ResearchInput):ResearchJob {
 requireRole(actor,researchRoles);requireFeature(actor,'investor-hunter'); const job=scopedGet<ResearchJob>(actor,'research_jobs',idSchema.parse(id));
 if(!['failed','canceled','awaiting_input'].includes(job.status))throw new AppError(409,'Only failed, canceled or awaiting-input jobs can be retried.');
 const parsed=input?researchInputSchema.parse(input):job.input;
 assertResearchSpendingRetry(actorForMember(actor.organizationId,actor.officeId,job.ownerId),{...job,input:parsed});
 assertIncludedResearchRetry(actorForMember(actor.organizationId,actor.officeId,job.ownerId),{...job,input:parsed});
 if(!parsed.county||!parsed.price||!parsed.strategy)throw new AppError(422,'Provide county, price and strategy before resuming research.');
 const external=job.provider===externalResearchProviderId;
 if((parsed.provider??syntheticResearchProvider.id)!==job.provider)throw new AppError(409,'A retry cannot switch research providers. Start a separately scoped job.');
 if(external){
  prepareExternalResearch(parsed);
  if(['address','county','price','strategy','limit','propertyType','maxCostCents'].some(key=>parsed[key as keyof ResearchInput]!==job.input[key as keyof ResearchInput]))throw new AppError(409,'An external retry keeps its original scope and budget. Start a new job to change criteria.');
  const unknown=getDb().prepare("SELECT 1 FROM research_provider_calls WHERE job_id=? AND organization_id=? AND office_id=? AND owner_id=? AND state IN ('started','unknown')").get(job.id,actor.organizationId,actor.officeId,job.ownerId);
  if(unknown)throw new AppError(409,'A prior external request has an unknown outcome. It will not be repeated; reconcile provider usage before separately authorized new research.');
  if(job.external?.stopReason==='provider_search_limit')throw new AppError(409,'The provider exceeded its tool-call bound. Review provider configuration before separately authorized new research.');
  if(job.external?.receiptStatus==='unknown')throw new AppError(409,'Provider usage is incomplete. Reconcile it before further external spending.');
 }
 const owner=actorForMember(actor.organizationId,actor.officeId,job.ownerId);reserveUsage(owner,{category:'research_credits',operationId:job.id,quantity:researchCredits(owner,parsed.limit),source:external?'External research target reservation':'Synthetic research target reservation'});
 const value=updateRecord(actor,'research_jobs',{...job,input:parsed,status:'queued' as const,progress:external?job.progress:0,stage:external?'Resuming within the original budget; completed requests will not repeat':'Queued for retry',error:null,prospects:external?job.prospects:[],updatedAt:now()});
 getDb().prepare('UPDATE research_jobs SET lease_until=NULL,next_attempt_at=NULL,worker_token=NULL WHERE id=?').run(id);
 audit(actor,'research.retried',id);return value;
}
export function actorForMember(organizationId:string,officeId:string,userId:string):Actor {
 const member=getDb().prepare('SELECT u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.office_id=? AND m.user_id=?').get(organizationId,officeId,userId) as {name:string;role:Role}|undefined;
 if(!member)throw new AppError(403,'The job owner is no longer an authorized employee.');
 return {id:userId,name:member.name,organizationId,officeId,role:member.role};
}
/** One transaction per stage makes multiple local workers safe; providers currently run locally. */
export function processQueuedJobs(actor?:Actor):number {
 if(actor)assertActor(actor);
 const stamp=now(),eligible=researchOwnerEligibility();
 const rows=getDb().prepare(`SELECT id,organization_id,office_id,owner_id FROM research_jobs WHERE ${eligible.sql} AND json_extract(data,'$.provider')='synthetic-fixtures-v1' AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<=?) AND (next_attempt_at IS NULL OR next_attempt_at<=?)${actor?' AND organization_id=? AND office_id=? AND owner_id=?':''} ORDER BY rowid LIMIT 20`)
  .all(...eligible.args,...(actor?[stamp,stamp,actor.organizationId,actor.officeId,actor.id]:[stamp,stamp])) as {id:string;organization_id:string;office_id:string;owner_id:string}[];
 let processed=0;
 for(const row of rows){
  const owner=actorForMember(row.organization_id,row.office_id,row.owner_id);if(!isAuthorizedActor(owner))continue;
  getDb().transaction(()=>{
   const claim=getDb().prepare("UPDATE research_jobs SET lease_until=? WHERE id=? AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<=?) AND (next_attempt_at IS NULL OR next_attempt_at<=?)").run(new Date(Date.now()+30000).toISOString(),row.id,stamp,stamp);
   if(!claim.changes)return;
   const job=getResearchJob(owner,row.id);
   try{
    const admission=includedResearchAdmission(owner,job);
    if(admission==='wait'||admission==='unresolved'){getDb().prepare('UPDATE research_jobs SET lease_until=NULL,next_attempt_at=? WHERE id=?').run(new Date(Date.now()+1000).toISOString(),job.id);return;}
    if(admission==='stopped'){cancelJob(owner,job.id);return;}
    requireRole(owner,researchRoles);requireFeature(owner,'investor-hunter');reserveUsage(owner,{category:'research_credits',operationId:job.id,quantity:researchCredits(owner,job.input.limit),source:'Synthetic research target reservation'});
    let next:ResearchJob;
    if(job.status==='queued')next={...job,status:'running',progress:20,stage:'Analyzing supplied property criteria · synthetic dataset',attempt:job.attempt+1,updatedAt:now()};
    else if(job.progress<50)next={...job,progress:50,stage:'Scoring fictional buying-activity evidence',updatedAt:now()};
    else if(job.progress<80)next={...job,progress:80,stage:'Checking duplicates against your authorized demo CRM records',updatedAt:now()};
    else{
     const prospects=withAssignment(owner,{kind:'research',id:job.id},()=>syntheticResearchProvider.discover(job.input)).map(prospect=>({...prospect,...classifyAuthorizedDuplicate(owner,prospect)}));
     next={...job,status:'completed',progress:100,stage:`Completed: ${prospects.length} synthetic candidates (${prospects.filter(item=>item.duplicateStatus==='net_new').length} eligible as new after privacy-preserving CRM duplicate checks). Dataset contains 12 candidates.`,prospects,updatedAt:now()};
     settleUsage(owner,'research_credits',job.id);recordMeter(owner,{category:'research_jobs',operationId:job.id,quantity:1,source:'Completed synthetic research; provider cost unknown'});recordUsage(owner,'research_jobs',1);audit(owner,'research.completed',job.id,{count:prospects.length,synthetic:true});
    }
    updateRecord(owner,'research_jobs',next);finishIncludedResearch(owner,job.id);
    getDb().prepare('UPDATE research_jobs SET lease_until=NULL,next_attempt_at=? WHERE id=?').run(new Date(Date.now()+1000).toISOString(),job.id);
    processed++;
   }catch(error){
    releaseUsage(owner,'research_credits',job.id);const failure=error instanceof AppError?error.message:'The research provider failed. Retry this job; no CRM changes occurred.';
    updateRecord(owner,'research_jobs',{...job,status:'failed',error:failure,stage:'Research failed',updatedAt:now()});
    getDb().prepare('UPDATE research_jobs SET lease_until=NULL WHERE id=?').run(job.id);audit(owner,'research.failed',job.id);
   }
  }).immediate();
  processNotifications(owner);
 }
 return processed;
}
export const tickJobs=processQueuedJobs;

export function summarizeNotes(actor:Actor,transcript:string):NoteSummary {
 requireFeature(actor,'call-notetaker');
 assertActor(actor); const result=extractNotes(transcript); recordUsage(actor,'transcript_characters',transcript.length); audit(actor,'notes.extracted',null,{characters:transcript.length,mode:result.mode});return result;
}
const noteSummarySchema=z.object({proposedNote:z.string().trim().min(1).max(15000),summary:z.string().max(2000),source:z.literal('employee_transcript'),mode:z.enum(['local_extraction','model']),sourceExcerpts:z.array(z.string().max(10000)).max(30)}).passthrough();
export function proposeNote(actor:Actor,investorId:string,summary:NoteSummary):ProposedAction {
 requireFeature(actor,'salesforce-assistant');
 const investor=writableInvestor(actor,investorId); const parsed=noteSummarySchema.parse(summary);
 const action:ProposedAction={id:newId('action'),kind:'crm_note',title:`Add reviewed call note to ${investor.name}`,status:'pending',payload:{investorId:investor.id,note:parsed.proposedNote,source:parsed.source,sourceExcerpts:parsed.sourceExcerpts,synthetic:investor.synthetic},createdAt:now(),executedAt:null,ownerId:actor.id,error:null};
 insertRecord(actor,'proposed_actions',action);audit(actor,'approval.proposed',action.id,{kind:action.kind});return action;
}
export function proposeImport(actor:Actor,jobId:string,prospectIds:string[]):ProposedAction {
 requireFeature(actor,'salesforce-assistant');
 requireRole(actor,researchRoles);
 const ids=z.array(idSchema).min(1).max(100).parse(prospectIds);
 if(new Set(ids).size!==ids.length)throw new AppError(422,'Choose each prospect only once.');
 const job=getResearchJob(actor,jobId);
 if(job.status!=='completed')throw new AppError(409,'Complete the research job before preparing an import.');
 const selected=ids.map(id=>job.prospects.find(item=>item.id===id));
 if(selected.some(item=>!item||item.duplicateStatus!=='net_new'))throw new AppError(422,'Only identified net-new prospects can be prepared for import. Review duplicates first.');
 const action:ProposedAction={id:newId('action'),kind:'crm_import',title:`Import ${ids.length} ${job.provider===syntheticResearchProvider.id?'fictional prospect':'unverified public-source candidate'}${ids.length===1?'':'s'} into the demo CRM`,status:'pending',payload:{jobId:job.id,prospectIds:ids,prospects:selected,synthetic:selected.every(item=>item!.synthetic),crmMode:'demo'},createdAt:now(),executedAt:null,ownerId:actor.id,error:null};
 insertRecord(actor,'proposed_actions',action);audit(actor,'approval.proposed',action.id,{kind:action.kind,count:ids.length});return action;
}
const investorChangesSchema=z.object({counties:z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional(),strategy:z.string().trim().min(1).max(100).optional(),budgetMin:z.number().finite().min(0).max(100000000).optional(),budgetMax:z.number().finite().min(0).max(100000000).optional(),financing:z.string().trim().min(1).max(300).optional(),rehab:z.string().trim().min(1).max(300).optional(),timeframe:z.string().trim().min(1).max(300).optional()}).strict();
export function proposeInvestorUpdate(actor:Actor,investorId:string,changes:Record<string,unknown>):ProposedAction {
 requireFeature(actor,'salesforce-assistant');
 const investor=writableInvestor(actor,investorId);const parsed=investorChangesSchema.parse(changes);listBuyBoxes(actor,investorId);
 if(!Object.keys(parsed).length)throw new AppError(422,'Supply at least one qualification field.');
 const merged={...investor,...parsed};if(merged.budgetMin>merged.budgetMax)throw new AppError(422,'Minimum budget cannot exceed maximum budget.');
 const action:ProposedAction={id:newId('action'),kind:'crm_update',title:`Update ${investor.name}’s qualification details`,status:'pending',payload:{investorId,changes:parsed,before:Object.fromEntries(Object.keys(parsed).map(key=>[key,investor[key as keyof Investor]]))},createdAt:now(),executedAt:null,ownerId:actor.id,error:null};
 insertRecord(actor,'proposed_actions',action);audit(actor,'approval.proposed',action.id,{kind:action.kind});return action;
}
/** Only the authenticated approval route calls this function. It is intentionally absent from AI tool registries. */
export function decideAction(actor:Actor,id:string,decision:'approve'|'reject'):ProposedAction {
 requireFeature(actor,'salesforce-assistant');
 z.enum(['approve','reject']).parse(decision);
 return getDb().transaction(()=>{
 const initial=getApproval(actor,idSchema.parse(id));
 if(initial.status==='executed'&&decision==='approve'||initial.status==='rejected'&&decision==='reject')return initial;
 if(initial.status!=='pending')throw new AppError(409,'This action has already been decided.');
 if(decision==='reject'){
  const rejected=updateRecord(actor,'proposed_actions',{...initial,status:'rejected' as const});audit(actor,'approval.rejected',id);return rejected;
 }
 try{return getDb().transaction(()=>{
  const action=getApproval(actor,id);
  if(action.status!=='pending')throw new AppError(409,'This action has already been decided.');
  const owner=actorForMember(actor.organizationId,actor.officeId,action.ownerId);
  if(action.kind==='crm_note'){
   const payload=z.object({investorId:idSchema,note:z.string().min(1).max(15000)}).parse(action.payload);
   const investor=writableInvestor(actor,payload.investorId);
   updateRecord(actor,'investors',{...investor,notes:`${investor.notes}\n\n[Reviewed local note · ${now()}]\n${payload.note}`});
   addRelationshipEvent(actor,investor.id,'debrief',payload.note,'Reviewed employee-supplied recap/transcript; statements not independently verified');
  }else if(action.kind==='crm_update'){
   const payload=z.object({investorId:idSchema,changes:investorChangesSchema,before:z.record(z.string(),z.unknown())}).parse(action.payload);
   const investor=writableInvestor(actor,payload.investorId);
   if(Object.entries(payload.before).some(([key,value])=>JSON.stringify(investor[key as keyof Investor])!==JSON.stringify(value)))throw new AppError(409,'The record changed after this proposal. Prepare a new update from the current record.');
   const updated=updateRecord(actor,'investors',{...investor,...payload.changes});
   syncPrimaryBuyBox(actor,updated,payload.changes,action.id,action.payload);
  }else if(action.kind==='buy_box'){
   applyBuyBoxApproval(actor,action);
  }else if(action.kind==='crm_import'){
   const payload=z.object({jobId:idSchema,prospectIds:z.array(idSchema).min(1).max(100)}).parse(action.payload);
   const job=getResearchJob(actor,payload.jobId);
   for(const prospectId of payload.prospectIds){
    const candidate=job.prospects.find(item=>item.id===prospectId);
    if(!candidate||classifyAuthorizedDuplicate(actor,candidate).duplicateStatus!=='net_new')throw new AppError(409,'A prospect is now a duplicate or unavailable. Review the current CRM and prepare a new import.');
    const investor:Investor={id:newId('investor'),name:candidate.name,company:candidate.company,counties:[candidate.county],strategy:candidate.strategy,budgetMin:0,budgetMax:0,financing:null,rehab:null,timeframe:null,email:null,phone:null,notes:candidate.synthetic?`Imported fictional research fixture. Typical synthetic transaction price: $${candidate.typicalPrice}; this is not a confirmed budget. Contact details and buying intent are unverified. Research job ${job.id}.`:`Imported into local demo CRM from unverified public-source research. Company identity, purchases, contact association and buying intent require review. Reported transaction examples are not a confirmed budget. Research job ${job.id}. Sources: ${candidate.evidence.filter(e=>e.url).map(e=>e.url).join(' | ')}`,lastContactAt:null,ownerId:owner.id,synthetic:candidate.synthetic};
    insertRecord(owner,'investors',investor);
   }
  }else throw new AppError(422,'This action kind is not executable.');
  const executed=updateRecord(actor,'proposed_actions',{...action,status:'executed' as const,executedAt:now(),error:null});
  audit(actor,'approval.approved',id);audit(actor,'crm.demo_write.executed',id,{kind:action.kind});return executed;
 })();}catch(error){
  const message=error instanceof AppError?error.message:'The local CRM change failed. No partial changes were applied.';
  const failed=updateRecord(actor,'proposed_actions',{...initial,status:'failed' as const,error:message});audit(actor,'crm.demo_write.failed',id);return failed;
 }
 }).immediate();
}

const taskSchema=z.object({title:titleSchema,dueAt:z.string().datetime({offset:true}).nullable().optional(),investorId:idSchema.nullable().optional()}).strict();
export function createTask(actor:Actor,input:{title:string;dueAt?:string|null;investorId?:string|null}):Task {
 requireFeature(actor,'daily-coordinator');
 assertActor(actor);const parsed=taskSchema.parse(input);
 if(parsed.investorId){const investorRow=readInvestorRow(actor,parsed.investorId);if(investorRow.office_id!==actor.officeId)throw new AppError(403,'A linked task must use an investor in your office.');}
 const stamp=now();
 const task:Task={id:newId('task'),title:parsed.title,dueAt:parsed.dueAt?new Date(parsed.dueAt).toISOString():null,investorId:parsed.investorId??null,status:'open',ownerId:actor.id,createdAt:stamp,updatedAt:stamp,version:1};
 getDb().prepare('INSERT INTO tasks(id,organization_id,office_id,owner_id,investor_id,data) VALUES(?,?,?,?,?,?)').run(task.id,actor.organizationId,actor.officeId,actor.id,task.investorId,JSON.stringify(task));
 audit(actor,'task.created',task.id);return task;
}
export function completeTask(actor:Actor,id:string):Task {
 return mutateTask(actor,id,{action:'complete'});
}

export function getGuidance(actor:Actor,investorId?:string) {
 requireFeature(actor,'workflow-navigator');
 const available=investorId?[]:listInvestors(actor);
 const investor=investorId?getInvestor(actor,investorId):available.length===1?available[0]:undefined;
 if(!investor)return {investor:null,missing:['investor identity'],nextAction:'Select or add an authorized investor before preparing next-step guidance.',followingStep:'Review their qualification information.',explanation:'Investor-specific guidance needs a confirmed record.',source:'Generic demo qualification checklist; not approved New Western procedures.'};
 const missing:string[]=[];
 if(!investor.budgetMax)missing.push('confirmed acquisition budget');if(!investor.counties.length)missing.push('target counties');if(!investor.strategy)missing.push('investment strategy');if(!investor.financing)missing.push('cash or financing');if(!investor.rehab)missing.push('rehab capacity');if(!investor.timeframe)missing.push('purchase timeline');
 return {investor,missing,nextAction:missing.length?`Confirm ${missing[0]} with ${investor.name.split(' ')[0]}.`:`Review properties within ${investor.name.split(' ')[0]}’s budget and target counties.`,followingStep:missing.length?'Prepare the confirmed qualification update for review, then match available properties.':'Prepare a source-grounded property summary and review it before outreach.',explanation:missing.length?'This information changes which opportunities are relevant. Only confirmed details should become CRM facts.':'The core demo qualification fields are recorded. Property fit still requires human review.',source:'Generic demo qualification checklist; not approved New Western procedures.'};
}
export function matchBuyers(actor:Actor,propertyId?:string) {
 requireRole(actor,researchRoles);
 const property=propertyId?readProperty(actor,propertyId):listProperties(actor)[0];
 if(!property)throw new AppError(404,'No authorized property is available to match.');
 return buildBuyerShortlist(actor,property.id);
}
export function getDailyBrief(actor:Actor) {
 const tasks=listTasks(actor).filter(task=>task.status==='open');
 const overdue=tasks.filter(task=>task.dueAt&&Date.parse(task.dueAt)<Date.now());
 const pendingApprovals=listApprovals(actor).filter(action=>action.status==='pending');
 const activeJobs=listJobs(actor).filter(job=>['queued','running','awaiting_input'].includes(job.status));
 const dormantInvestors=listInvestors(actor).filter(investor=>!investor.lastContactAt||Date.now()-new Date(investor.lastContactAt).getTime()>14*86400000);
 return {tasks,overdue,pendingApprovals,activeJobs,dormantInvestors,summary:`You have ${tasks.length} open task${tasks.length===1?'':'s'}, ${overdue.length} overdue, ${pendingApprovals.length} pending approval${pendingApprovals.length===1?'':'s'} and ${activeJobs.length} active research job${activeJobs.length===1?'':'s'}.`};
}
export function getManagementOverview(actor:Actor) {
 requireFeature(actor,'team-performance');
 requireRole(actor,['manager']);
 const brief=getDailyBrief(actor);
 const usage=getDb().prepare('SELECT kind,SUM(quantity) AS quantity FROM usage_events WHERE organization_id=? AND office_id=? GROUP BY kind').all(actor.organizationId,actor.officeId) as {kind:string;quantity:number}[];
 return {...brief,usage,handoffs:getHandoffBoard(actor),scope:'Authorized office only',synthetic:true};
}
export function getBootstrap(actor:Actor):Bootstrap {
 assertActor(actor);processNotifications(actor);
 const organization=getDb().prepare('SELECT o.name,f.name AS office FROM organizations o JOIN offices f ON f.organization_id=o.id WHERE o.id=? AND f.id=?').get(actor.organizationId,actor.officeId) as {name:string;office:string};
 const usage=getDb().prepare('SELECT kind,SUM(quantity) AS quantity FROM usage_events WHERE organization_id=? AND office_id=? AND owner_id=? GROUP BY kind').all(actor.organizationId,actor.officeId,actor.id) as {kind:string;quantity:number}[];
 return {actor,organization,investors:listInvestors(actor),properties:listProperties(actor),tasks:listTasks(actor),jobs:listJobs(actor),approvals:listApprovals(actor),notifications:scopedRows<Notification>(actor,'notifications',true).slice(0,100),conversations:listConversations(actor),specialists,settings:getSettings(actor),integrations:{openai:!!process.env.OPENAI_API_KEY,voice:!!process.env.OPENAI_API_KEY,crm:'demo',research:researchConfig().selected&&researchConfig().configured&&researchConfig().estimatedRequestCents>0?'external_configured':'synthetic',researchLimits:{maxCostCents:researchConfig().maxCostCents,estimatedRequestCents:researchConfig().estimatedRequestCents},auth:process.env.AGENTDESK_AUTH_MODE==='company_oidc'?'company_oidc':'local_demo'},usage};
}
