import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {MobileNoticeKind,MobileNoticeStatus,MobileNotificationState} from '../lib/mobile-notification-contracts';
import type {WorkRun} from '../lib/work-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {requireFeature} from './billing';
import {notificationsAllowed} from './services';
import {getWorkRun} from './work-runs';
import {requireMobileSession} from './mobile-auth';

type Device={id:string;session_id:string;organization_id:string;office_id:string;user_id:string;expo_push_token:string|null;platform:'ios'|'android';enabled:number;created_at:string;enabled_at:string;updated_at:string};
type Notice={id:string;device_id:string;work_run_id:string;plan_version:number;kind:MobileNoticeKind;status:MobileNoticeStatus;ticket_id:string|null;error_code:string|null;created_at:string;updated_at:string;reconcile_at:string|null};
const token=z.string().regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/,'This device did not return a valid Expo notification address.');
const registration=z.object({enabled:z.boolean(),expoPushToken:token.optional(),platform:z.enum(['ios','android']).optional()}).strict().refine(value=>!value.enabled||!!value.expoPushToken&&!!value.platform,'Enable notifications from a supported phone after granting notification permission.');
const pushSendingEnabled=()=>process.env.AGENTDESK_MOBILE_PUSH_SEND_ENABLED==='true';
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function activeSession(actor:Actor,sessionId:string){assertActor(actor);const current=requireMobileSession(sessionId);if(current.actor.id!==actor.id||current.actor.organizationId!==actor.organizationId||current.actor.officeId!==actor.officeId)throw new AppError(404,'Mobile connection not found in your workspace.');return current;}
function deviceFor(actor:Actor,sessionId:string):Device|undefined {activeSession(actor,sessionId);return getDb().prepare('SELECT * FROM mobile_push_devices WHERE session_id=? AND organization_id=? AND office_id=? AND user_id=?').get(sessionId,...owner(actor)) as Device|undefined;}
function requireDevice(id:string){const device=getDb().prepare('SELECT * FROM mobile_push_devices WHERE id=?').get(id) as Device|undefined;if(!device||!device.enabled||!device.expo_push_token)throw new AppError(403,'Mobile notifications are disabled.');const {actor}=requireMobileSession(device.session_id);if(device.organization_id!==actor.organizationId||device.office_id!==actor.officeId||device.user_id!==actor.id)throw new AppError(403,'Mobile notification ownership changed.');requireFeature(actor,'core');return {actor,device};}
function cancelPending(deviceId:string){getDb().prepare("UPDATE mobile_push_outbox SET status='canceled',error_code='connection_changed',updated_at=? WHERE device_id=? AND status='queued'").run(now(),deviceId);}
export function mobileNotificationState(actor:Actor,sessionId:string):MobileNotificationState {
 const device=deviceFor(actor,sessionId),sendingEnabled=pushSendingEnabled();
 const recent=device?(getDb().prepare('SELECT id,work_run_id AS workRunId,kind,status,created_at AS createdAt,updated_at AS updatedAt FROM mobile_push_outbox WHERE device_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20').all(device.id) as MobileNotificationState['recent']):[];
 return {registered:!!device?.expo_push_token,enabled:!!device?.enabled,platform:device?.platform??null,sendingEnabled,notice:!device?.enabled?'Phone notifications are off.':!sendingEnabled?'This phone is registered. Server push sending is off; no phone delivery is claimed.':'Job notifications are enabled, subject to your quiet hours and device settings. Provider acceptance does not confirm that a phone displayed a notification.',recent};
}
export function registerPushDevice(actor:Actor,sessionId:string,input:unknown):MobileNotificationState {
 const parsed=registration.parse(input);activeSession(actor,sessionId);if(parsed.enabled)requireFeature(actor,'core');
 getDb().transaction(()=>{
  const previous=deviceFor(actor,sessionId),stamp=now();
  if(!parsed.enabled){if(previous){getDb().prepare('UPDATE mobile_push_devices SET enabled=0,updated_at=? WHERE id=?').run(stamp,previous.id);cancelPending(previous.id);audit(actor,'mobile.notifications_updated',sessionId,{enabled:false});}return;}
  const collision=getDb().prepare('SELECT * FROM mobile_push_devices WHERE expo_push_token=? AND session_id<>?').get(parsed.expoPushToken!,sessionId) as Device|undefined;
  if(collision){let active=true;try{requireMobileSession(collision.session_id);}catch(error){if(error instanceof AppError&&[401,403,404].includes(error.status))active=false;else throw error;}if(active)throw new AppError(409,'This notification address is linked to another active connection. Sign out of that connection first.');getDb().prepare('UPDATE mobile_push_devices SET expo_push_token=NULL,enabled=0,updated_at=? WHERE id=?').run(stamp,collision.id);cancelPending(collision.id);}
  if(previous){if(previous.enabled&&previous.expo_push_token===parsed.expoPushToken&&previous.platform===parsed.platform)return;cancelPending(previous.id);getDb().prepare('UPDATE mobile_push_devices SET expo_push_token=?,platform=?,enabled=1,enabled_at=?,updated_at=? WHERE id=?').run(parsed.expoPushToken!,parsed.platform!,stamp,stamp,previous.id);}
  else getDb().prepare('INSERT INTO mobile_push_devices VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(newId('mobile_push'),sessionId,...owner(actor),parsed.expoPushToken!,parsed.platform!,1,stamp,stamp,stamp);
  audit(actor,'mobile.notifications_updated',sessionId,{enabled:true,platform:parsed.platform});
 }).immediate();return mobileNotificationState(actor,sessionId);
}
function kindFor(run:WorkRun):MobileNoticeKind|null {return run.status==='waiting_cost_approval'?'cost_approval':run.status==='completed'?'completed':['failed','waiting_for_input','reconciling'].includes(run.status)?'needs_attention':null;}
function currentNotice(actor:Actor,row:Notice):WorkRun|null {const run=getWorkRun(actor,row.work_run_id);return !run.contentRestricted&&run.planVersion===row.plan_version&&kindFor(run)===row.kind?run:null;}
/** Queue current state transitions once per job plan and kind, never replay pre-registration history. */
export function queueMobileJobNotifications():number {
 const db=getDb();let count=0;
 for(const device of db.prepare('SELECT * FROM mobile_push_devices WHERE enabled=1').all() as Device[]){
  try{
   const {actor}=requireDevice(device.id);
   const runs=db.prepare("SELECT id FROM work_runs WHERE organization_id=? AND office_id=? AND owner_id=? AND updated_at>=? AND status IN ('waiting_cost_approval','completed','failed','waiting_for_input','reconciling') ORDER BY updated_at DESC LIMIT 100").all(...owner(actor),device.enabled_at) as {id:string}[];
   for(const item of runs){const run=getWorkRun(actor,item.id),kind=kindFor(run);if(run.contentRestricted||!kind)continue;const stamp=now();count+=db.prepare("INSERT OR IGNORE INTO mobile_push_outbox VALUES(?,?,?,?,?,'queued',NULL,NULL,?,?,NULL)").run(newId('mobile_notice'),device.id,run.id,run.planVersion,kind,stamp,stamp).changes;}
  }catch(error){if(error instanceof AppError&&[401,402,403,404].includes(error.status)){cancelPending(device.id);continue;}throw error;}
 }
 return count;
}
export interface MobilePushPayload {to:string;title:string;body:string;data:{url:string;workRunId:string;notificationId:string};sound:'default';channelId:'work';ttl:number}
export interface MobilePushTransport {send:(payload:MobilePushPayload)=>Promise<{ticketId:string}>;receipt:(ticketId:string)=>Promise<'pending'|'service_received'|'device_not_registered'|'failed'>}
class PushRejected extends Error {constructor(readonly code:string){super('The notification service rejected this request.');}}
const responseEnvelope=z.object({data:z.unknown().optional(),errors:z.array(z.unknown()).optional()});
const ticket=z.object({status:z.enum(['ok','error']),id:z.string().min(1).max(200).optional(),details:z.object({error:z.string().max(120).optional()}).optional()});
const headers=()=>({'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})});
const expoTransport:MobilePushTransport={
 async send(payload){
  const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:headers(),body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  if(!response.ok){if([400,401,403,404,413,429].includes(response.status))throw new PushRejected('service_rejected');throw new Error('Unconfirmed notification send');}
  const body=responseEnvelope.parse(await response.json());if(body.errors?.length)throw new PushRejected('service_rejected');const parsed=ticket.parse(Array.isArray(body.data)?body.data[0]:body.data);
  if(parsed.status==='error')throw new PushRejected(parsed.details?.error==='DeviceNotRegistered'?'device_not_registered':'service_rejected');if(!parsed.id)throw new Error('Missing notification ticket');return {ticketId:parsed.id};
 },
 async receipt(ticketId){
  const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers:headers(),body:JSON.stringify({ids:[ticketId]}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Notification receipt unavailable');
  const body=responseEnvelope.parse(await response.json());if(body.errors?.length)throw new Error('Notification receipt rejected');if(!body.data||typeof body.data!=='object'||Array.isArray(body.data))throw new Error('Invalid notification receipt');const value=(body.data as Record<string,unknown>)[ticketId];if(value===undefined)return 'pending';const parsed=ticket.parse(value);return parsed.status==='ok'?'service_received':parsed.details?.error==='DeviceNotRegistered'?'device_not_registered':'failed';
 }
};
function payloadFor(device:Device,row:Notice):MobilePushPayload {return {to:device.expo_push_token!,title:'AgentDesk',body:row.kind==='completed'?'Your saved work is ready. Open AgentDesk to review it.':row.kind==='cost_approval'?'A saved job needs your spending decision. Open AgentDesk to review it.':'A saved job needs your attention. Open AgentDesk to continue.',data:{url:`agentdesknw://work/${encodeURIComponent(row.work_run_id)}`,workRunId:row.work_run_id,notificationId:row.id},sound:'default',channelId:'work',ttl:3600};}
function disableDevice(id:string){getDb().prepare('UPDATE mobile_push_devices SET enabled=0,updated_at=? WHERE id=?').run(now(),id);cancelPending(id);}
/** Network uncertainty never requeues a send. Expo tickets and APNs/FCM receipts are separate evidence. */
export async function processMobilePushOutbox(transport:MobilePushTransport=expoTransport):Promise<number> {
 const db=getDb();db.prepare("UPDATE mobile_push_outbox SET status='unknown',error_code='interrupted_send',updated_at=? WHERE status='dispatching' AND updated_at<?").run(now(),new Date(Date.now()-60_000).toISOString());if(!pushSendingEnabled())return 0;let count=0;
 for(const row of db.prepare("SELECT * FROM mobile_push_outbox WHERE status='queued' ORDER BY updated_at,rowid LIMIT 20").all() as Notice[]){
  try{
   const {actor,device}=requireDevice(row.device_id);
   if(Date.now()-Date.parse(row.created_at)>86400_000){db.prepare("UPDATE mobile_push_outbox SET status='expired',updated_at=? WHERE id=? AND status='queued'").run(now(),row.id);continue;}
   if(!currentNotice(actor,row)){db.prepare("UPDATE mobile_push_outbox SET status='canceled',error_code='work_changed',updated_at=? WHERE id=? AND status='queued'").run(now(),row.id);continue;}
   if(!notificationsAllowed(actor)){db.prepare("UPDATE mobile_push_outbox SET updated_at=? WHERE id=? AND status='queued'").run(now(),row.id);continue;}
   const recent=db.prepare("SELECT COUNT(*) n FROM mobile_push_outbox WHERE device_id=? AND status IN ('dispatching','accepted','service_received','unknown') AND updated_at>?").get(device.id,new Date(Date.now()-3600_000).toISOString()) as {n:number};if(recent.n>=12){db.prepare("UPDATE mobile_push_outbox SET updated_at=? WHERE id=? AND status='queued'").run(now(),row.id);continue;}
   if(!db.prepare("UPDATE mobile_push_outbox SET status='dispatching',updated_at=? WHERE id=? AND status='queued'").run(now(),row.id).changes)continue;
   requireDevice(row.device_id);const result=await transport.send(payloadFor(device,row));
   db.prepare("UPDATE mobile_push_outbox SET status='accepted',ticket_id=?,updated_at=? WHERE id=? AND status='dispatching'").run(z.string().min(1).max(200).parse(result.ticketId),now(),row.id);count++;
  }catch(error){const rejected=error instanceof PushRejected,denied=error instanceof AppError&&[401,402,403,404].includes(error.status);if(rejected&&error.code==='device_not_registered')disableDevice(row.device_id);db.prepare("UPDATE mobile_push_outbox SET status=?,error_code=?,updated_at=? WHERE id=? AND status IN ('queued','dispatching')").run(denied?'canceled':rejected?'failed':'unknown',denied?'access_changed':rejected?error.code:'unconfirmed_send',now(),row.id);}
 }
 return count;
}
export async function reconcileMobilePushReceipts(transport:MobilePushTransport=expoTransport):Promise<number> {
 if(!pushSendingEnabled())return 0;const db=getDb();let count=0;
 const rows=db.prepare("SELECT * FROM mobile_push_outbox WHERE status='accepted' AND ticket_id IS NOT NULL AND COALESCE(reconcile_at,updated_at)<? ORDER BY COALESCE(reconcile_at,updated_at) LIMIT 10").all(new Date(Date.now()-15*60_000).toISOString()) as Notice[];
 for(const row of rows){
  db.prepare('UPDATE mobile_push_outbox SET reconcile_at=? WHERE id=?').run(now(),row.id);
  try{requireDevice(row.device_id);const result=await transport.receipt(row.ticket_id!);if(result==='pending'){if(Date.now()-Date.parse(row.created_at)>24*3600_000)db.prepare("UPDATE mobile_push_outbox SET status='unknown',error_code='receipt_unavailable',updated_at=? WHERE id=? AND status='accepted'").run(now(),row.id);continue;}if(result==='device_not_registered')disableDevice(row.device_id);db.prepare("UPDATE mobile_push_outbox SET status=?,error_code=?,updated_at=? WHERE id=? AND status='accepted'").run(result==='service_received'?'service_received':'failed',result==='service_received'?null:result,now(),row.id);count++;}
  catch(error){if(error instanceof AppError&&[401,402,403,404].includes(error.status))db.prepare("UPDATE mobile_push_outbox SET status='unknown',error_code='connection_changed_after_send',updated_at=? WHERE id=? AND status='accepted'").run(now(),row.id);}
 }
 return count;
}
export async function processMobileNotifications(){queueMobileJobNotifications();await processMobilePushOutbox();await reconcileMobilePushReceipts();}
