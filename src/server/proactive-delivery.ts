import {fingerprint} from './provider-runtime';
import type {Actor} from '../lib/contracts';
import {AppError,assertActor,getDb,newId,now} from './db';
import {actorForMember} from './services';
import {hasFeature} from './billing';
import {notificationsAllowed} from './services';
import {getProactiveUpdate,type StoredUpdate} from './proactive';
import {proactivePreference} from './proactive-policy';
import {requireMessagingLink,queueOutbound,type MessagingLink} from './messaging';
import {channelConfigured,messagingOrigin} from './messaging-config';
import {expoTransport,PushRejected,requirePushDevice,type MobilePushTransport} from './mobile-notifications';

type Delivery={update_id:string;channel:'app'|'sms'|'slack';target_id:string;status:string;outbound_id:string|null;provider_id:string|null;error_code:string|null;created_at:string;updated_at:string;reconcile_at:string|null};
type UpdateRow={id:string;organization_id:string;office_id:string;user_id:string;data:string};
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function rowFor(actor:Actor,id:string){assertActor(actor);return getDb().prepare('SELECT * FROM proactive_updates WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id,...scope(actor)) as UpdateRow|undefined;}
function actorFor(row:UpdateRow){return actorForMember(row.organization_id,row.office_id,row.user_id);}
function eligible(actor:Actor,row:UpdateRow){
 const value=JSON.parse(row.data) as StoredUpdate,preferences=proactivePreference(actor);
 if(!preferences?.enabled||preferences.version!==value.preferenceVersion||preferences.preferredChannel!==value.channel||value.read||Date.now()-Date.parse(value.createdAt)>86400000||!hasFeature(actor,'core'))return false;
 const projected=getProactiveUpdate(actor,row.id);return projected.items.length>0||value.kind==='briefing'&&projected.withheldCount===0;
}
function trace(id:string,status:string,error:string|null=null){const row=getDb().prepare('SELECT * FROM proactive_updates WHERE id=?').get(id) as UpdateRow;const payload={updateId:id,status,error},eventId=newId('delivery_event');getDb().prepare('INSERT INTO proactive_events VALUES(?,?,?,?,?,?,?,?)').run(eventId,row.organization_id,row.office_id,row.user_id,eventId,fingerprint(payload),JSON.stringify(payload),now());}
function change(id:string,status:string,error:string|null=null,providerId:string|null=null){getDb().prepare('UPDATE proactive_deliveries SET status=?,error_code=?,provider_id=COALESCE(?,provider_id),updated_at=? WHERE update_id=?').run(status,error,providerId,now(),id);trace(id,status,error);}
/** A single fixed target per update: no fallback or reroute after an uncertain attempt. */
export function queueProactiveDeliveries():number {
 const db=getDb();let count=0;
 const rows=db.prepare("SELECT u.* FROM proactive_updates u LEFT JOIN proactive_deliveries d ON d.update_id=u.id WHERE d.update_id IS NULL AND json_extract(u.data,'$.createdAt')>=? ORDER BY u.rowid").all(new Date(Date.now()-86400000).toISOString()) as UpdateRow[];
 for(const row of rows){try{
  const actor=actorFor(row),value=JSON.parse(row.data) as StoredUpdate;const preferences=proactivePreference(actor);if(!preferences?.enabled||preferences.version!==value.preferenceVersion||value.read||!notificationsAllowed(actor))continue;
  let target:string|undefined;
  if(value.channel==='app'){
   // Choose the most recently enabled eligible phone, rather than alerting every device.
   const devices=db.prepare('SELECT id FROM mobile_push_devices WHERE organization_id=? AND office_id=? AND user_id=? AND enabled=1 AND enabled_at<=? ORDER BY enabled_at DESC,id DESC').all(...scope(actor),value.createdAt) as {id:string}[];
   for(const device of devices){try{requirePushDevice(device.id);target=device.id;break;}catch(error){if(!(error instanceof AppError))throw error;}}
  }else{
   if(!channelConfigured(value.channel))continue;
   const links=db.prepare('SELECT * FROM messaging_links WHERE organization_id=? AND office_id=? AND user_id=? AND provider=? AND active=1 AND opted_out=0 AND reminders=1 AND updated_at<=? ORDER BY updated_at DESC,id DESC').all(...scope(actor),value.channel,value.createdAt) as MessagingLink[];
   for(const link of links){try{requireMessagingLink(link.id);target=link.id;break;}catch(error){if(!(error instanceof AppError))throw error;}}
  }
  if(!target)continue;
  db.transaction(()=>{
   if(!eligible(actor,row)||db.prepare('SELECT 1 FROM proactive_deliveries WHERE update_id=?').get(row.id))return;
   const outbound=value.channel==='app'?null:queueOutbound(requireMessagingLink(target!).link,`proactive:${row.id}`,'notice','',`proactive:${row.id}`);
   db.prepare("INSERT INTO proactive_deliveries VALUES(?,?,?,'queued',?,NULL,NULL,?,?,NULL)").run(row.id,value.channel,target!,outbound,now(),now());trace(row.id,'queued');count++;
  }).immediate();if(count>=20)break;
 }catch(error){if(!(error instanceof AppError&&[401,402,403,404].includes(error.status)))throw error;}}
 return count;
}
/** Called immediately before sending, never from persisted private body text. */
export function proactiveMessageFor(actor:Actor,updateId:string,link:MessagingLink):string|null {
 const row=rowFor(actor,updateId),delivery=getDb().prepare('SELECT * FROM proactive_deliveries WHERE update_id=?').get(updateId) as Delivery|undefined;
 if(!row||Date.parse(link.updated_at)>Date.parse((JSON.parse(row.data) as StoredUpdate).createdAt)||!delivery||delivery.target_id!==link.id||delivery.channel!==link.provider||!eligible(actor,row)||!link.reminders)return null;
 const origin=messagingOrigin(),url=origin?`${origin}/?updates=${encodeURIComponent(updateId)}`:null;
 return `Your AgentDesk update is ready. Reply “show my updates” to review current work.${url?`\n${url}`:' Open My updates in AgentDesk.'}`;
}
export async function processProactivePush(transport:MobilePushTransport=expoTransport):Promise<number>{
 const db=getDb();db.prepare("UPDATE proactive_deliveries SET status='unknown',error_code='interrupted_send',updated_at=? WHERE channel='app' AND status='dispatching' AND updated_at<?").run(now(),new Date(Date.now()-60000).toISOString());
 if(process.env.AGENTDESK_MOBILE_PUSH_SEND_ENABLED!=='true')return 0;let sent=0;
 for(const delivery of db.prepare("SELECT * FROM proactive_deliveries WHERE channel='app' AND status='queued' ORDER BY created_at LIMIT 20").all() as Delivery[]){try{
  const {actor,device}=requirePushDevice(delivery.target_id),row=rowFor(actor,delivery.update_id);
  if(!row||device.enabled_at>(JSON.parse(row.data) as StoredUpdate).createdAt||!eligible(actor,row)){change(delivery.update_id,'canceled','source_or_preference_changed');continue;}
  if(!notificationsAllowed(actor))continue;
  if(!db.prepare("UPDATE proactive_deliveries SET status='dispatching',updated_at=? WHERE update_id=? AND status='queued'").run(now(),delivery.update_id).changes)continue;
  trace(delivery.update_id,'dispatching');requirePushDevice(delivery.target_id);
  const receipt=await transport.send({to:device.expo_push_token!,title:'AgentDesk',body:'Your update is ready. Open AgentDesk to review current work.',data:{url:`agentdesknw://updates/${delivery.update_id}`,updateId:delivery.update_id,notificationId:delivery.update_id},sound:'default',channelId:'work',ttl:3600});
  if(!receipt.ticketId||receipt.ticketId.length>200)throw new Error('Invalid ticket');change(delivery.update_id,'accepted',null,receipt.ticketId);sent++;
 }catch(error){const denied=error instanceof AppError&&[401,402,403,404].includes(error.status);change(delivery.update_id,denied?'canceled':error instanceof PushRejected?'failed':'unknown',denied?'access_changed':error instanceof PushRejected?error.code:'unconfirmed_send');}}
 return sent;
}
export async function reconcileProactivePush(transport:MobilePushTransport=expoTransport):Promise<number>{
 if(process.env.AGENTDESK_MOBILE_PUSH_SEND_ENABLED!=='true')return 0;const db=getDb();let count=0;
 for(const delivery of db.prepare("SELECT * FROM proactive_deliveries WHERE channel='app' AND status='accepted' AND COALESCE(reconcile_at,updated_at)<? ORDER BY updated_at LIMIT 10").all(new Date(Date.now()-15*60000).toISOString()) as Delivery[]){
  db.prepare('UPDATE proactive_deliveries SET reconcile_at=? WHERE update_id=?').run(now(),delivery.update_id);
  try{requirePushDevice(delivery.target_id);const receipt=await transport.receipt(delivery.provider_id!);if(receipt==='pending'){if(Date.now()-Date.parse(delivery.created_at)>86400000)change(delivery.update_id,'unknown','receipt_unavailable');continue;}change(delivery.update_id,receipt==='service_received'?'service_received':'failed',receipt==='service_received'?null:receipt);count++;}
  catch(error){if(error instanceof AppError)change(delivery.update_id,'unknown','connection_changed_after_send');}
 }
 return count;
}
/** Existing messaging worker owns SMS allowances, dispatch and receipt reconciliation. */
export async function processProactiveDelivery(){queueProactiveDeliveries();await processProactivePush();await reconcileProactivePush();}
