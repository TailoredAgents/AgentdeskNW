import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {StandingPermission,StandingPermissionState} from '../lib/standing-permission-contracts';
import {standingPermissionNotice} from '../lib/standing-permission-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {getInboxThread} from './communications';
import {createTask,actorForMember} from './services';
import {requireFeature} from './billing';
import {fingerprint} from './provider-runtime';

const id=z.string().min(1).max(150),owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
export const grantStandingSchema=z.object({eventKey:id,scopeToken:z.string().regex(/^[a-f0-9]{64}$/),title:z.string().trim().min(3).max(240),expiresAt:z.string().datetime({offset:true}),maxActions:z.number().int().min(1).max(100),cooldownHours:z.number().int().min(1).max(168),dueHours:z.number().int().min(1).max(168)}).strict();
export const revokeStandingSchema=z.object({eventKey:id,expectedVersion:z.number().int().positive()}).strict();
interface Data {role:Actor['role'];scopeToken:string;title:string;expiresAt:string;maxActions:number;cooldownHours:number;dueHours:number;usedActions:number;cursor:number;lastActionAt:string|null;createdAt:string;lastCheckedAt?:string}
interface Row {id:string;organization_id:string;office_id:string;user_id:string;thread_id:string;version:number;state:'active'|'revoked'|'blocked';data:string}
function scopeFor(actor:Actor,threadId:string){
 const detail=getInboxThread(actor,threadId);
 if(!detail.canEdit||detail.bodyAccess!=='full')throw new AppError(409,'Current full conversation access is required for routine follow-ups.');
 const thread=detail.thread,account=detail.account;
 return {detail,token:fingerprint({actor:owner(actor),role:actor.role,account:account.id,address:account.address,accessVersion:account.accessVersion,capabilities:account.capabilities,thread:thread.id,contact:thread.correspondent,investor:thread.association.investor?.id??null,packageReference:thread.packageReference??null,transaction:thread.transactionId??null,action:'personal_followup_on_reply',budgetCents:0})};
}
function read(actor:Actor,permissionId:string){
 assertActor(actor);const row=getDb().prepare('SELECT * FROM standing_permissions WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id.parse(permissionId),...owner(actor)) as Row|undefined;
 if(!row)throw new AppError(404,'Routine permission not found in your workspace.');return row;
}
function view(actor:Actor,row:Row):StandingPermission {
 const data=JSON.parse(row.data) as Data;let restricted=false;
 try{restricted=scopeFor(actor,row.thread_id).token!==data.scopeToken;}catch{restricted=true;}
 return {id:row.id,version:row.version,state:row.state!=='active'?row.state:restricted?'blocked':Date.parse(data.expiresAt)<=Date.now()?'expired':data.usedActions>=data.maxActions?'exhausted':'active',title:restricted?'Routine follow-up permission':data.title,expiresAt:data.expiresAt,maxActions:data.maxActions,usedActions:data.usedActions,cooldownHours:data.cooldownHours,dueHours:data.dueHours,budgetCents:0,action:'personal_followup_on_reply',restricted,simulation:true};
}
export function standingPermissionState(actor:Actor,threadId:string):StandingPermissionState {
 assertActor(actor);getInboxThread(actor,threadId);
 const rows=getDb().prepare('SELECT * FROM standing_permissions WHERE organization_id=? AND office_id=? AND user_id=? AND thread_id=? ORDER BY rowid DESC LIMIT 20').all(...owner(actor),threadId) as Row[];
 let preview:StandingPermissionState['preview']=null;
 try{const scope=scopeFor(actor,threadId);preview={scopeToken:scope.token,title:`Review new reply from ${scope.detail.thread.correspondent.name}`.slice(0,240),expiresAt:new Date(Date.now()+7*86400000).toISOString(),maxActions:10,cooldownHours:6,dueHours:24};}catch{/* Revocation remains available, but stale sources cannot grant new authority. */}
 return {permissions:rows.map(row=>view(actor,row)),preview,notice:standingPermissionNotice};
}
function priorCommand(actor:Actor,eventKey:string,hash:string){
 const prior=getDb().prepare('SELECT payload_hash,permission_id FROM standing_permission_commands WHERE organization_id=? AND office_id=? AND user_id=? AND event_key=?').get(...owner(actor),eventKey) as {payload_hash:string;permission_id:string}|undefined;
 if(prior&&prior.payload_hash!==hash)throw new AppError(409,'This permission command already represents a different decision.');return prior;
}
/** Authenticated employee only: the model can explain this permission but cannot grant it. */
export function grantStandingPermission(actor:Actor,threadId:string,raw:z.input<typeof grantStandingSchema>):StandingPermission {
 assertActor(actor);const input=grantStandingSchema.parse(raw),hash=fingerprint({threadId,kind:'grant',input});
 return getDb().transaction(()=>{
  const prior=priorCommand(actor,input.eventKey,hash);if(prior)return view(actor,read(actor,prior.permission_id));
  requireFeature(actor,'daily-coordinator');const current=scopeFor(actor,threadId);
  if(current.token!==input.scopeToken)throw new AppError(409,'This conversation or its access changed. Review a current permission.');
  if(Date.parse(input.expiresAt)<=Date.now()||Date.parse(input.expiresAt)>Date.now()+31*86400000)throw new AppError(400,'Choose a permission expiry within the next 31 days.');
  const active=standingPermissionState(actor,threadId).permissions.find(p=>p.state==='active');if(active)throw new AppError(409,'Revoke the active permission before replacing its scope.');
  const cursor=(getDb().prepare('SELECT COALESCE(MAX(rowid),0) n FROM communication_messages WHERE organization_id=? AND office_id=? AND owner_id=? AND thread_id=?').get(...owner(actor),threadId) as {n:number}).n;
  const permissionId=newId('standing'),data:Data={...input,role:actor.role,usedActions:0,cursor,lastActionAt:null,createdAt:now()};
  getDb().prepare("INSERT INTO standing_permissions VALUES(?,?,?,?,?,1,'active',?)").run(permissionId,...owner(actor),threadId,JSON.stringify(data));
  getDb().prepare('INSERT INTO standing_permission_commands VALUES(?,?,?,?,?,?)').run(...owner(actor),input.eventKey,hash,permissionId);
  audit(actor,'standing.granted',permissionId,{action:'personal_followup_on_reply',budgetCents:0,maxActions:input.maxActions,expiresAt:input.expiresAt});return view(actor,read(actor,permissionId));
 }).immediate();
}
export function revokeStandingPermission(actor:Actor,permissionId:string,raw:z.input<typeof revokeStandingSchema>,threadId?:string):StandingPermission {
 const input=revokeStandingSchema.parse(raw),hash=fingerprint({permissionId,kind:'revoke',input});
 return getDb().transaction(()=>{
  const row=read(actor,permissionId);if(threadId&&row.thread_id!==threadId)throw new AppError(404,'Permission not found for this conversation.');const prior=priorCommand(actor,input.eventKey,hash);if(prior)return view(actor,row);
  if(row.version!==input.expectedVersion)throw new AppError(409,'This permission changed. Retrieve its current state.');
  getDb().prepare("UPDATE standing_permissions SET state='revoked',version=version+1 WHERE id=?").run(row.id);
  getDb().prepare('INSERT INTO standing_permission_commands VALUES(?,?,?,?,?,?)').run(...owner(actor),input.eventKey,hash,row.id);
  audit(actor,'standing.revoked',row.id);return view(actor,read(actor,row.id));
 }).immediate();
}
/** Deterministic, zero-AI-cost routine work. Effects and message receipts commit together. */
export function processStandingPermissions(actor?:Actor):number {
 if(actor)assertActor(actor);
 const rows=getDb().prepare(`SELECT * FROM standing_permissions WHERE state='active' AND json_extract(data,'$.expiresAt')>? AND json_extract(data,'$.usedActions')<json_extract(data,'$.maxActions') ${actor?'AND organization_id=? AND office_id=? AND user_id=?':''} ORDER BY COALESCE(json_extract(data,'$.lastCheckedAt'),''),rowid LIMIT 200`).all(now(),...(actor?owner(actor):[])) as Row[];let created=0;
 for(const original of rows){
  try{const employee=actorForMember(original.organization_id,original.office_id,original.user_id);
   created+=getDb().transaction(()=>{
    const row=read(employee,original.id),data=JSON.parse(row.data) as Data;
    if(row.state!=='active'||Date.parse(data.expiresAt)<=Date.now()||data.usedActions>=data.maxActions)return 0;
    requireFeature(employee,'daily-coordinator');const current=scopeFor(employee,row.thread_id);
    if(data.role!==employee.role||current.token!==data.scopeToken)throw new AppError(409,'Routine scope changed.');
    const messages=getDb().prepare("SELECT rowid sequence,id,data FROM communication_messages WHERE organization_id=? AND office_id=? AND owner_id=? AND thread_id=? AND rowid>? ORDER BY rowid LIMIT 20").all(...owner(employee),row.thread_id,data.cursor) as {sequence:number;id:string;data:string}[];
    data.lastCheckedAt=now();let count=0;
    for(const message of messages){
     data.cursor=message.sequence;const content=JSON.parse(message.data) as {direction:string;from:{address:string}};
     if(content.direction!=='inbound'||content.from.address!==current.detail.thread.correspondent.address)continue;
     if(getDb().prepare('SELECT 1 FROM standing_permission_receipts WHERE permission_id=? AND message_id=?').get(row.id,message.id))continue;
     if(data.usedActions>=data.maxActions)break;
     const coalesced=data.lastActionAt!==null&&Date.now()-Date.parse(data.lastActionAt)<data.cooldownHours*3600000;
     const task=coalesced?null:createTask(employee,{title:data.title,investorId:current.detail.thread.association.investor?.id??null,dueAt:new Date(Date.now()+data.dueHours*3600000).toISOString()});
     if(task){data.usedActions++;data.lastActionAt=now();count++;}
     getDb().prepare('INSERT INTO standing_permission_receipts VALUES(?,?,?,?,?)').run(row.id,message.id,task?'created_task':'coalesced',task?.id??null,now());
    }
    getDb().prepare('UPDATE standing_permissions SET data=? WHERE id=?').run(JSON.stringify(data),row.id);return count;
   }).immediate();
  }catch(error){
   // Scope/entitlement loss retires this grant. Restored access needs a new employee decision.
   if(error instanceof AppError&&[401,402,403,404,409].includes(error.status))getDb().prepare("UPDATE standing_permissions SET state='blocked',version=version+1 WHERE id=? AND state='active'").run(original.id);
   else throw error;
  }
 }
 return created;
}
