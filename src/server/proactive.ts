import {transactionTeamTaskClosed} from '../lib/transaction-team-contracts';
import {proactiveDeliveryState} from './proactive-delivery-state';
import {z} from 'zod';
import type {Actor,Role} from '../lib/contracts';
import {proactiveTopics,type ProactiveItem,type ProactivePreferences,type ProactiveState,type ProactiveUpdate} from '../lib/proactive-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {hasFeature,requireFeature} from './billing';
import {fingerprint} from './provider-runtime';
import {listPersonalTasks} from './task-actions';
import {getInboxState,getInboxThread} from './communications';
import {listWorkRuns} from './work-runs';
import {getTransactionTeams} from './transaction-team';
import {getHandoffBoard} from './handoffs';
import {notificationsAllowed,notify} from './services';
import {dueBriefingSlot,validTimeZone} from './proactive-time';

const id=z.string().trim().min(1).max(150),time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const proactiveSettingsSchema=z.object({expectedVersion:z.number().int().nonnegative(),eventKey:id,enabled:z.boolean(),timeZone:z.string().max(100).refine(validTimeZone,'Choose a valid IANA timezone, such as America/New_York.'),times:z.array(time).min(1).max(3),weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),topics:z.array(z.enum(proactiveTopics)).min(1).max(proactiveTopics.length),watchChanges:z.boolean(),preferredChannel:z.enum(['app','sms','slack'])}).strict().refine(v=>new Set(v.times).size===v.times.length&&new Set(v.weekdays).size===v.weekdays.length&&new Set(v.topics).size===v.topics.length,'Remove duplicate times, weekdays or topics.');
type Cursor={slot:string|null;seen:string[];sequence:number;lastCreatedAt:string|null};
export type StoredUpdate=Omit<ProactiveUpdate,'items'|'withheldCount'|'summary'>&{preferenceVersion?:number;references:{key:string;reference:string}[]};
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const initial:ProactivePreferences={version:0,enabled:false,timeZone:'America/New_York',times:['09:00','13:00','16:30'],weekdays:[1,2,3,4,5],topics:['replies','tasks','jobs','handoffs'],watchChanges:true,preferredChannel:'app',updatedAt:null};
function prefs(actor:Actor){assertActor(actor);const row=getDb().prepare('SELECT data,cursor FROM proactive_preferences WHERE organization_id=? AND office_id=? AND user_id=?').get(...owner(actor)) as {data:string;cursor:string}|undefined;return row?{preferences:JSON.parse(row.data) as ProactivePreferences,cursor:JSON.parse(row.cursor) as Cursor}:{preferences:structuredClone(initial),cursor:{slot:null,seen:[],sequence:0,lastCreatedAt:null} as Cursor};}
function save(actor:Actor,preferences:ProactivePreferences,cursor:Cursor){getDb().prepare('INSERT INTO proactive_preferences VALUES(?,?,?,?,?) ON CONFLICT(organization_id,office_id,user_id) DO UPDATE SET data=excluded.data,cursor=excluded.cursor').run(...owner(actor),JSON.stringify(preferences),JSON.stringify(cursor));}
function event(actor:Actor,eventKey:string,payload:unknown){getDb().prepare('INSERT INTO proactive_events VALUES(?,?,?,?,?,?,?,?)').run(newId('proactive_event'),...owner(actor),eventKey,fingerprint(payload),JSON.stringify(payload),now());}
function replay(actor:Actor,eventKey:string,payload:unknown){const row=getDb().prepare('SELECT payload_hash FROM proactive_events WHERE organization_id=? AND office_id=? AND user_id=? AND event_key=?').get(...owner(actor),eventKey) as {payload_hash:string}|undefined;if(row&&row.payload_hash!==fingerprint(payload))throw new AppError(409,'This request already belongs to different update settings.');return !!row;}
export function currentProactiveItems(actor:Actor,preferences=prefs(actor).preferences):ProactiveItem[]{
 assertActor(actor);if(!hasFeature(actor,'core'))return [];const items:ProactiveItem[]=[];
 if(preferences.topics.includes('tasks')&&hasFeature(actor,'daily-coordinator'))for(const task of listPersonalTasks(actor)){
  if(task.status!=='open'||!task.dueAt||Date.parse(task.dueAt)>Date.now()+86400000)continue;
  const overdue=Date.parse(task.dueAt)<=Date.now(),key=`task:${task.id}:${task.version??0}:${task.dueAt}`;
  items.push({key,topic:'tasks',title:task.title,detail:`${overdue?'Due now or overdue':'Due within 24 hours'} · ${new Date(task.dueAt).toLocaleString('en-US',{timeZone:preferences.timeZone})}`,reference:fingerprint({task}),artifact:{type:'task',id:task.id,title:'Open follow-up'},watchEligible:overdue});
 }
 if(preferences.topics.includes('replies')){const inbox=getInboxState(actor);for(const thread of inbox.threads){
  if(thread.status!=='needs_reply'||inbox.accounts.find(a=>a.id===thread.accountId)?.access!=='available')continue;
  const detail=getInboxThread(actor,thread.id);if(detail.bodyAccess==='revoked')continue;const latest=detail.messages.at(-1);if(!latest||latest.direction!=='inbound')continue;
  const key=`reply:${thread.id}:${latest.id}`;items.push({key,topic:'replies',title:`${thread.correspondent.name} replied`,detail:detail.bodyAccess==='full'?thread.subject:'A reply is available; only headers are accessible.',reference:fingerprint({message:latest.id,account:detail.account.accessVersion,bodyAccess:detail.bodyAccess,association:thread.association.status}),artifact:{type:'inbox',id:thread.id,title:'Review reply'},watchEligible:true});
 }}
 if(preferences.topics.includes('jobs'))for(const run of listWorkRuns(actor)){
  if(run.contentRestricted||!['waiting_cost_approval','waiting_for_input','reconciling','failed','completed'].includes(run.status))continue;
  const labels:Record<string,string>={waiting_cost_approval:'Needs your spending decision',waiting_for_input:'Needs your answer',reconciling:'Outcome needs reconciliation',failed:'Stopped; review saved progress',completed:'Saved result ready'};
  items.push({key:`job:${run.id}:${run.planVersion}:${run.status}`,topic:'jobs',title:run.title,detail:labels[run.status],reference:fingerprint({id:run.id,plan:run.planVersion,version:run.version,status:run.status}),artifact:{type:'work_run',id:run.id,title:'Open saved work'},watchEligible:true});
 }
 if(preferences.topics.includes('handoffs')&&(actor.role!=='manager'||hasFeature(actor,'team-performance')))for(const handoff of getHandoffBoard(actor).items){
  if(['waiting','resolved'].includes(handoff.attention))continue;
  const key=`handoff:${handoff.releaseId}:${handoff.releaseVersion}:${handoff.record?.version??0}:${handoff.attention}`;
  items.push({key,topic:'handoffs',title:handoff.address,detail:handoff.nextStep,reference:fingerprint({release:handoff.releaseVersion,record:handoff.record,attention:handoff.attention}),artifact:{type:'handoff',id:handoff.releaseId,title:'Review handoff'},watchEligible:true});
 }
 if(preferences.topics.includes('transactions')&&hasFeature(actor,'transaction-coordinator'))for(const team of getTransactionTeams(actor).items){
  // Reports remain separate from deal outcomes; observers do not inherit another person's reminders.
  if(team.status!=='current'){
   if(team.status==='source_changed'&&team.canManage)items.push({key:`team-refresh:${team.id}:${team.reference}`,topic:'transactions',title:'Shared coordination needs refresh',detail:'The source changed. Review a current summary before teammates continue.',reference:team.reference,artifact:{type:'transaction_team',id:team.id,title:'Review shared coordination'},watchEligible:true});
   continue;
  }
  const today=new Date().toLocaleDateString('en-CA',{timeZone:preferences.timeZone});
  for(const task of team.tasks){
   if(transactionTeamTaskClosed(task)||(!team.canManage&&task.assignedTo!==actor.id))continue;
   const overdue=task.dueDate<today,dueToday=task.dueDate===today;
   const detail=task.state==='reported'?(team.canManage?'Completion reported · needs your review':'Completion reported · awaiting owner review'):task.state==='blocked'?'Blocker reported · review the next step':task.state==='assigned'?(task.assignedTo===actor.id?'Assigned to you · acknowledgment needed':'Assigned · awaiting acknowledgment'):overdue?'Follow-up overdue':dueToday?'Follow-up due today':'Follow-up in progress';
   const key=`team-task:${team.id}:${task.id}:${fingerprint({generation:team.generation,task,overdue,dueToday})}`;
   items.push({key,topic:'transactions',title:team.snapshot!.address,detail:`${detail}. ${task.instruction} · due ${task.dueDate}. Employee reports are not verified transaction outcomes.`,reference:team.reference,artifact:{type:'transaction_team',id:team.id,title:'Review shared follow-up'},watchEligible:task.state==='assigned'&&task.assignedTo===actor.id||task.state==='blocked'||task.state==='reported'&&team.canManage||overdue||dueToday});
  }
 }
 return items.sort((a,b)=>a.topic.localeCompare(b.topic)||a.key.localeCompare(b.key)).slice(0,200);
}
function project(value:StoredUpdate,current:ProactiveItem[]):ProactiveUpdate {
 const items=value.references.flatMap(ref=>{const item=current.find(item=>item.key===ref.key&&item.reference===ref.reference);return item?[item]:[];}),withheldCount=value.references.length-items.length;
 const {references:_references,...rest}=value;void _references;
 return {...rest,delivery:proactiveDeliveryState(value.id,value.delivery),items,withheldCount,summary:items.length?`${items.length} current item${items.length===1?'':'s'} to review.${withheldCount?' Changed, resolved or unavailable references are withheld.':''}`:withheldCount?'These items changed, were resolved or are no longer available. Open current work for the latest state.':'No current items need attention for your selected topics.'};
}
export function getProactiveState(actor:Actor):ProactiveState {const {preferences}=prefs(actor),current=currentProactiveItems(actor,preferences),rows=getDb().prepare('SELECT data FROM proactive_updates WHERE organization_id=? AND office_id=? AND user_id=? ORDER BY rowid DESC LIMIT 30').all(...owner(actor)) as {data:string}[];return {preferences,current,updates:rows.map(row=>project(JSON.parse(row.data),current)),notice:'Fictional workspace · Deterministic updates, no AI credit charge. Current source access is checked whenever an update opens. Selected-channel delivery requires an active connection and server sending. Provider receipts do not prove phone display.'};}
export function saveProactivePreferences(actor:Actor,raw:z.input<typeof proactiveSettingsSchema>):ProactiveState {
 assertActor(actor);const input=proactiveSettingsSchema.parse(raw);return getDb().transaction(()=>{
  if(replay(actor,input.eventKey,input))return getProactiveState(actor);const old=prefs(actor);if(input.expectedVersion!==old.preferences.version)throw new AppError(409,'Update preferences changed. Reload before saving.');if(input.enabled)requireFeature(actor,'core');
  const {expectedVersion,eventKey,...settings}=input,preferences:ProactivePreferences={...settings,times:[...settings.times].sort(),version:expectedVersion+1,updatedAt:now()},seen=currentProactiveItems(actor,preferences).filter(item=>item.watchEligible).map(item=>item.key);
  save(actor,preferences,{slot:dueBriefingSlot(preferences),seen,sequence:old.cursor.sequence,lastCreatedAt:old.cursor.lastCreatedAt});event(actor,eventKey,{...input});audit(actor,'proactive.preferences',actor.id,{enabled:preferences.enabled,timeZone:preferences.timeZone,preferredChannel:preferences.preferredChannel});return getProactiveState(actor);
 }).immediate();
}
function createUpdate(actor:Actor,preferences:ProactivePreferences,items:ProactiveItem[],kind:'briefing'|'changes',dedupeKey:string){
 const value:StoredUpdate={id:newId('update'),kind,preferenceVersion:preferences.version,createdAt:now(),read:false,title:kind==='briefing'?'Your scheduled briefing':'Since your last update',references:items.map(({key,reference})=>({key,reference})),channel:preferences.preferredChannel,delivery:preferences.preferredChannel==='app'?'in_app':'connection_required'};
 const db=getDb(),insert=db.prepare('INSERT OR IGNORE INTO proactive_updates VALUES(?,?,?,?,?,?)').run(value.id,...owner(actor),dedupeKey,JSON.stringify(value));if(!insert.changes)return;
 // Generic notice only; private current content is read behind the same employee scope.
 notify(actor,`proactive:${value.id}`,value.title,'Open AgentDesk to review current replies, deadlines and saved work.','updates');
 event(actor,`update:${value.id}`,{kind,updateId:value.id,referenceCount:items.length,channel:value.channel});
}
/** No paid reasoning, CRM mutation or external send. Quiet-hour/downtime catch-up rechecks current sources. */
export function processProactiveActor(actor:Actor):number {
 assertActor(actor);return getDb().transaction(()=>{
  const {preferences,cursor}=prefs(actor);if(!preferences.enabled||!hasFeature(actor,'core')||!notificationsAllowed(actor))return 0;
  const count=getDb().prepare("SELECT count(*) n FROM proactive_updates WHERE organization_id=? AND office_id=? AND user_id=? AND json_extract(data,'$.createdAt')>=?").get(...owner(actor),new Date(Date.now()-86400000).toISOString()) as {n:number};if(count.n>=10)return 0;
  const current=currentProactiveItems(actor,preferences),seen=current.filter(item=>item.watchEligible).map(item=>item.key),slot=dueBriefingSlot(preferences);
  if(slot&&(!cursor.slot||slot>cursor.slot)){createUpdate(actor,preferences,current,'briefing',`brief:${preferences.version}:${slot}`);save(actor,preferences,{slot,seen,sequence:cursor.sequence,lastCreatedAt:now()});return 1;}
  const changed=current.filter(item=>item.watchEligible&&!cursor.seen.includes(item.key));
  if(preferences.watchChanges&&changed.length&&(!cursor.lastCreatedAt||Date.now()-Date.parse(cursor.lastCreatedAt)>=5*60000)){const sequence=cursor.sequence+1;createUpdate(actor,preferences,changed,'changes',`watch:${preferences.version}:${sequence}`);save(actor,preferences,{...cursor,seen,sequence,lastCreatedAt:now()});return 1;}
  // Keep unseen changes pending during coalescing; remove obsolete keys so resolved sources never alert later.
  save(actor,preferences,{...cursor,seen:cursor.seen.filter(key=>seen.includes(key))});return 0;
 }).immediate();
}
export function processProactiveUpdates():number {
 const rows=getDb().prepare('SELECT p.organization_id,p.office_id,p.user_id,u.name,m.role FROM proactive_preferences p JOIN memberships m ON m.organization_id=p.organization_id AND m.office_id=p.office_id AND m.user_id=p.user_id JOIN users u ON u.id=p.user_id').all() as {organization_id:string;office_id:string;user_id:string;name:string;role:Role}[];
 return rows.reduce((sum,row)=>sum+processProactiveActor({organizationId:row.organization_id,officeId:row.office_id,id:row.user_id,name:row.name,role:row.role}),0);
}
export function readProactiveUpdate(actor:Actor,updateId:string,eventKey:string):ProactiveState {
 assertActor(actor);id.parse(updateId);id.parse(eventKey);return getDb().transaction(()=>{const payload={updateId,read:true};if(replay(actor,eventKey,payload))return getProactiveState(actor);const row=getDb().prepare('SELECT data FROM proactive_updates WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(updateId,...owner(actor)) as {data:string}|undefined;if(!row)throw new AppError(404,'Update not found in your workspace.');const value=JSON.parse(row.data) as StoredUpdate;getDb().prepare('UPDATE proactive_updates SET data=? WHERE id=?').run(JSON.stringify({...value,read:true}),updateId);getDb().prepare("UPDATE notifications SET data=json_set(data,'$.read',json('true')) WHERE organization_id=? AND office_id=? AND owner_id=? AND dedupe_key=?").run(...owner(actor),`proactive:${updateId}`);event(actor,eventKey,payload);return getProactiveState(actor);}).immediate();
}

/** Exact saved update retrieval also supports links older than the thirty-item list. */
export function getProactiveUpdate(actor:Actor,updateId:string):ProactiveUpdate {assertActor(actor);const row=getDb().prepare('SELECT data FROM proactive_updates WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id.parse(updateId),...owner(actor)) as {data:string}|undefined;if(!row)throw new AppError(404,'Update not found in your workspace.');return project(JSON.parse(row.data),currentProactiveItems(actor));}
/** References for non-job summaries never recurse through job/history validation. */
export function proactiveItemReference(item:ProactiveItem):string{return JSON.stringify({key:item.key,reference:item.reference});}
export function proactiveReferenceCurrent(actor:Actor,reference:string):boolean {
 try{const saved=JSON.parse(reference) as {key:string;reference:string};return currentProactiveItems(actor,{...prefs(actor).preferences,topics:['tasks','replies','handoffs','transactions']}).some(item=>item.key===saved.key&&item.reference===saved.reference);}catch(error){if(error instanceof SyntaxError||error instanceof AppError&&[402,403,404].includes(error.status))return false;throw error;}
}
