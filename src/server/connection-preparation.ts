import {revokeSavedConnectionCredentials,connectionAuthorizationStatus,oauthProfile} from './oauth-connections';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {ConnectionCapability,ConnectionPreparation} from '../lib/connection-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {fingerprint} from './provider-runtime';

const capability=z.enum(['crm.read','crm.write','email.activity.read','email.body.read','email.draft','email.send','sms.read','sms.send']);
const supported:Record<string,readonly ConnectionCapability[]>={salesforce:['crm.read','crm.write','email.activity.read','email.body.read','email.draft','email.send'],gmail:['email.body.read','email.draft','email.send'],outlook:['email.body.read','email.draft','email.send'],twilio:['sms.read','sms.send']};
const key=z.string().trim().min(1).max(160),owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const preparation=z.object({provider:z.enum(['salesforce','gmail','outlook','twilio']),remoteTenant:key,remoteUser:key,mode:z.enum(['demo','live']),capabilities:z.array(capability).max(8)}).strict();
interface Data {capabilities:ConnectionCapability[];cursor:string|null}
interface Row {id:string;organization_id:string;office_id:string;user_id:string;provider:ConnectionPreparation['provider'];remote_tenant:string;remote_user:string;version:number;state:ConnectionPreparation['state'];mode:ConnectionPreparation['mode'];data:string}
function read(actor:Actor,id:string):Row {
 assertActor(actor);const row=getDb().prepare('SELECT * FROM capability_connections WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(key.parse(id),...owner(actor)) as Row|undefined;
 if(!row)throw new AppError(404,'Connection preparation not found in your workspace.');return row;
}
function view(row:Row):ConnectionPreparation {
 const data=JSON.parse(row.data) as Data;
 let canAuthorize=false;try{canAuthorize=process.env.AGENTDESK_AUTH_MODE==='company_oidc'&&row.mode==='live'&&row.state==='prepared'&&!!oauthProfile(row.id);}catch{}
 const authorization=connectionAuthorizationStatus(row.id);
 const count=row.state==='prepared'?(getDb().prepare('SELECT COUNT(*) n FROM connection_sync_records WHERE connection_id=? AND connection_version=? AND deleted=0').get(row.id,row.version) as {n:number}).n:0;
 return {id:row.id,provider:row.provider,version:row.version,state:row.state,mode:row.mode,capabilities:data.capabilities,liveReady:false,authorization,canAuthorize,canDisconnect:process.env.AGENTDESK_AUTH_MODE==='company_oidc'&&row.mode==='live'&&row.state==='prepared'&&!['not_connected','revoked'].includes(authorization),stagedRecords:count,notice:row.mode==='demo'?'Fictional adapter rehearsal. Staged records do not replace CRM facts.':authorization==='connected'?'Salesforce identity authorized. Credentials are encrypted. CRM mapping and application data activation remain separate.':'Company authorization is required. Connecting credentials alone does not activate CRM data or email delivery.'};
}
export function listConnectionPreparations(actor:Actor){
 assertActor(actor);return (getDb().prepare('SELECT * FROM capability_connections WHERE organization_id=? AND office_id=? AND user_id=? ORDER BY rowid').all(...owner(actor)) as Row[]).map(view);
}
/** Trusted operator setup seam, not an employee/model activation endpoint. No credentials accepted. */
export function prepareCapabilityConnection(actor:Actor,raw:z.input<typeof preparation>):ConnectionPreparation {
 assertActor(actor);const input=preparation.parse(raw),capabilities=[...new Set(input.capabilities)].sort();
 if(capabilities.some(value=>!supported[input.provider].includes(value)))throw new AppError(422,'This provider does not support the requested capability.');
 return getDb().transaction(()=>{
  const prior=getDb().prepare('SELECT * FROM capability_connections WHERE organization_id=? AND office_id=? AND user_id=? AND provider=? AND remote_tenant=? AND remote_user=?').get(...owner(actor),input.provider,input.remoteTenant,input.remoteUser) as Row|undefined;
  if(prior){if(prior.state!=='prepared'||prior.mode!==input.mode||fingerprint((JSON.parse(prior.data) as Data).capabilities)!==fingerprint(capabilities))throw new AppError(409,'This source already has a different or disconnected preparation.');return view(prior);}
  const id=newId('connection');getDb().prepare("INSERT INTO capability_connections VALUES(?,?,?,?,?,?,?,1,'prepared',?,?)").run(id,...owner(actor),input.provider,input.remoteTenant,input.remoteUser,input.mode,JSON.stringify({capabilities,cursor:null}));
  audit(actor,'connection.prepared',id,{provider:input.provider,mode:input.mode,capabilities});return view(read(actor,id));
 }).immediate();
}
export function disconnectCapabilityConnection(actor:Actor,id:string,expectedVersion:number){
 return getDb().transaction(()=>{const row=read(actor,id);if(row.state==='disconnected'&&row.version===expectedVersion+1)return view(row);
  if(row.version!==expectedVersion)throw new AppError(409,'This connection preparation changed.');
  getDb().prepare("UPDATE capability_connections SET state='disconnected',version=version+1 WHERE id=?").run(id);
  revokeSavedConnectionCredentials(actor,id);audit(actor,'connection.disconnected',id);return view(read(actor,id));
 }).immediate();
}
/** Read authority never implies write/draft/delivery authority. Live activation is not implemented. */
export function requirePreparedCapability(actor:Actor,id:string,expectedVersion:number,requested:ConnectionCapability){
 const row=read(actor,id);capability.parse(requested);
 if(row.version!==expectedVersion||row.state!=='prepared')throw new AppError(409,'This source changed or was disconnected.');
 if(!(JSON.parse(row.data) as Data).capabilities.includes(requested))throw new AppError(403,'This source has no permission for that capability.');
 if(row.mode!=='demo')throw new AppError(503,'Live connection execution is not enabled. Preparation does not authorize company data access.');
 return row;
}

const stagedRecord=z.object({externalId:key,revision:z.number().int().positive(),deleted:z.boolean(),fields:z.object({displayName:z.string().max(240).optional(),company:z.string().max(240).optional(),email:z.string().email().max(320).optional()}).strict()}).strict();
const batch=z.object({batchId:key,expectedVersion:z.number().int().positive(),previousCursor:z.string().max(500).nullable(),nextCursor:z.string().min(1).max(500),records:z.array(stagedRecord).max(100)}).strict();
/** Normalized, private staging only. Never treats a remote record as a send receipt or reviewed CRM fact. */
export function stageConnectionBatch(actor:Actor,id:string,raw:z.input<typeof batch>){
 const input=batch.parse(raw),hash=fingerprint(input);
 return getDb().transaction(()=>{
  const row=requirePreparedCapability(actor,id,input.expectedVersion,'crm.read'),data=JSON.parse(row.data) as Data;
  const prior=getDb().prepare('SELECT input_hash FROM connection_sync_batches WHERE connection_id=? AND batch_id=?').get(id,input.batchId) as {input_hash:string}|undefined;
  if(prior){if(prior.input_hash!==hash)throw new AppError(409,'This batch already represents different source data.');return {batchId:input.batchId,replayed:true};}
  if(data.cursor!==input.previousCursor||input.nextCursor===input.previousCursor)throw new AppError(409,'Continue from the exact saved synchronization cursor.');
  if(new Set(input.records.map(record=>record.externalId)).size!==input.records.length)throw new AppError(422,'A batch cannot contain duplicate external identities.');
  for(const record of input.records){
   if(record.deleted&&Object.keys(record.fields).length)throw new AppError(422,'A withdrawn record must not retain readable fields.');
   const saved=getDb().prepare('SELECT revision,data,deleted FROM connection_sync_records WHERE connection_id=? AND external_id=?').get(id,record.externalId) as {revision:number;data:string;deleted:number}|undefined;
   if(saved&&(record.revision<saved.revision||record.revision===saved.revision&&(fingerprint(record.fields)!==fingerprint(JSON.parse(saved.data))||Number(record.deleted)!==saved.deleted)))throw new AppError(409,'Source revision conflict; reconcile before advancing the cursor.');
   if(saved&&saved.revision===record.revision)continue;
   getDb().prepare('INSERT INTO connection_sync_records VALUES(?,?,?,?,?,?) ON CONFLICT(connection_id,external_id) DO UPDATE SET revision=excluded.revision,connection_version=excluded.connection_version,deleted=excluded.deleted,data=excluded.data').run(id,record.externalId,record.revision,row.version,Number(record.deleted),JSON.stringify(record.fields));
  }
  data.cursor=input.nextCursor;getDb().prepare('UPDATE capability_connections SET data=? WHERE id=?').run(JSON.stringify(data),id);
  getDb().prepare('INSERT INTO connection_sync_batches VALUES(?,?,?,?,?)').run(id,input.batchId,hash,row.version,now());audit(actor,'connection.batch_staged',id,{batchId:input.batchId,count:input.records.length});return {batchId:input.batchId,replayed:false};
 }).immediate();
}
export function readStagedConnectionRecord(actor:Actor,id:string,expectedVersion:number,externalId:string){
 requirePreparedCapability(actor,id,expectedVersion,'crm.read');
 const row=getDb().prepare('SELECT revision,data,deleted FROM connection_sync_records WHERE connection_id=? AND connection_version=? AND external_id=?').get(id,expectedVersion,key.parse(externalId)) as {revision:number;data:string;deleted:number}|undefined;
 if(!row||row.deleted)throw new AppError(404,'This staged source is absent or withdrawn.');
 return {externalId,revision:row.revision,fields:JSON.parse(row.data) as z.infer<typeof stagedRecord>['fields'],synthetic:true as const,reviewed:false as const};
}
