import {isAuthorizedActor} from './db';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,Role} from '../lib/contracts';
import type {AutoTopUpSettings,AutoTopUpPurchase,AutoTopUpState,AutoTopUpPreview} from '../lib/auto-topup-contracts';
import {autoTopUpAmounts} from '../lib/auto-topup-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {assertBillingDemo} from './billing-provider';
import {getWalletState,creditAutomaticTopUp} from './wallet';
import {notify} from './services';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key=z.string().trim().min(1).max(150);
export const autoTopUpInputSchema=z.object({expectedVersion:z.number().int().nonnegative(),enabled:z.boolean(),triggerCents:z.number().int().min(0).max(10000),amountCents:z.number().int().refine(value=>autoTopUpAmounts.includes(value),'Choose a supported top-up amount.'),monthlyCapCents:z.number().int().min(0).max(100000),rearm:z.boolean()}).strict();
export const autoTopUpSaveSchema=autoTopUpInputSchema.extend({eventKey:key,reviewReference:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const autoTopUpResolveSchema=z.object({purchaseId:key,expectedVersion:z.number().int().positive(),outcome:z.enum(['unknown','succeeded','failed']),eventKey:key}).strict();
const scope=(actor:Actor)=>[actor.organizationId,actor.id];
function authorize(actor:Actor){assertActor(actor);assertBillingDemo();}
function settings(actor:Actor):AutoTopUpSettings {const row=getDb().prepare('SELECT data FROM auto_topup_settings WHERE organization_id=? AND user_id=?').get(...scope(actor)) as {data:string}|undefined;return row?JSON.parse(row.data):{version:0,enabled:false,triggerCents:300,amountCents:2500,monthlyCapCents:10000,armed:true,cycle:0,updatedAt:null};}
function purchases(actor:Actor):AutoTopUpPurchase[]{return (getDb().prepare('SELECT data FROM auto_topup_purchases WHERE organization_id=? AND user_id=? ORDER BY rowid DESC').all(...scope(actor)) as {data:string}[]).map(row=>JSON.parse(row.data));}
function writeSettings(actor:Actor,value:AutoTopUpSettings){getDb().prepare('INSERT INTO auto_topup_settings VALUES(?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET office_id=excluded.office_id,data=excluded.data').run(...scope(actor),actor.officeId,JSON.stringify(value));}
function writePurchase(actor:Actor,value:AutoTopUpPurchase){getDb().prepare('INSERT INTO auto_topup_purchases VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(value.id,...scope(actor),actor.officeId,value.status,JSON.stringify(value));}
function event(actor:Actor,eventKey:string,payload:unknown,value:unknown){getDb().prepare('INSERT INTO auto_topup_events VALUES(?,?,?,?,?,?,?,?)').run(newId('auto_topup_event'),...scope(actor),actor.officeId,eventKey,hash(payload),JSON.stringify(value),now());}
function replay(actor:Actor,eventKey:string,payload:unknown){const row=getDb().prepare('SELECT payload_hash FROM auto_topup_events WHERE organization_id=? AND user_id=? AND event_key=?').get(...scope(actor),eventKey) as {payload_hash:string}|undefined;if(row&&row.payload_hash!==hash(payload))throw new AppError(409,'This request already belongs to a different automatic top-up action.');return !!row;}
const pending=(items:AutoTopUpPurchase[])=>items.find(item=>item.status==='pending'||item.status==='unknown');
const month=()=>now().slice(0,7);
const committed=(items:AutoTopUpPurchase[])=>items.filter(item=>item.month===month()&&item.status!=='failed').reduce((sum,item)=>sum+item.amountCents,0);
export function getAutoTopUpState(actor:Actor):AutoTopUpState {
 authorize(actor);const wallet=getWalletState(actor),value=settings(actor),all=purchases(actor),open=pending(all),used=committed(all);
 const status:AutoTopUpState['status']=open?'pending':!value.enabled?'off':!wallet.canTopUp?'unavailable':!value.armed?'waiting_recovery':used+value.amountCents>value.monthlyCapCents?'cap_reached':wallet.availableCents<=value.triggerCents?'ready':'watching';
 const explanations:Record<AutoTopUpState['status'],string>={pending:`A ${open?.status==='unknown'?'purchase with an uncertain outcome':'simulated purchase'} needs reconciliation. No additional purchase can start.`,off:'Automatic top-up is off. No purchase will start.',unavailable:'Active workforce access and company permission for personal purchases are required. No new purchase will start.',waiting_recovery:'This low-balance cycle has already been handled. Recover above the trigger and fall again, or explicitly re-arm after reviewing the outcome.',cap_reached:'The next amount would exceed this UTC calendar month’s automatic-purchase cap. Pending and successful purchases count toward the cap.',ready:'The available balance is at or below your trigger. The next worker check can prepare one simulated purchase.',watching:'Watching available credits after reservations. One simulated purchase may be prepared when the balance reaches your trigger.'};
 return {settings:value,payer:{id:actor.id,name:actor.name,kind:'personal_demo',paymentMethod:null},availableCents:wallet.availableCents,walletVersion:wallet.version,monthlySpendLimitCents:wallet.monthlySpendLimitCents,month:month(),committedThisMonthCents:used,remainingPurchaseCapCents:Math.max(0,value.monthlyCapCents-used),purchases:[...all.filter(item=>['pending','unknown'].includes(item.status)),...all.filter(item=>!['pending','unknown'].includes(item.status)).slice(0,50)],canEnable:wallet.canTopUp,status,explanation:explanations[status],notice:'Simulation only. The personal payer is this employee; no payment method or company funds are connected. Only a confirmed simulated success adds credits. Funding never approves a job above $1, raises its maximum or changes the usage-spending limit.'};
}
export function previewAutoTopUp(actor:Actor,raw:z.input<typeof autoTopUpInputSchema>):AutoTopUpPreview {
 authorize(actor);const input=autoTopUpInputSchema.parse(raw),state=getAutoTopUpState(actor);
 if(input.expectedVersion!==state.settings.version)throw new AppError(409,'Automatic top-up settings changed. Reload before reviewing.');
 if(input.enabled&&!state.canEnable)throw new AppError(403,'Active access and personal-purchase permission are required to enable automatic top-up.');
 if(input.rearm&&pending(state.purchases))throw new AppError(409,'Resolve the pending purchase before re-arming automatic top-up.');
 const armed=input.rearm||!state.settings.enabled&&input.enabled||state.settings.armed;
 const willTrigger=input.enabled&&armed&&!pending(state.purchases)&&state.availableCents<=input.triggerCents&&state.committedThisMonthCents+input.amountCents<=input.monthlyCapCents;
 return {input,payerName:actor.name,currentBalanceCents:state.availableCents,committedThisMonthCents:state.committedThisMonthCents,willTrigger,explanation:willTrigger?'Your current balance already qualifies. A worker check may prepare one simulated purchase after you save.':!input.enabled?'No new automatic purchase will start. Existing purchase outcomes can still be reconciled.':'The saved trigger, access, pending-purchase and monthly-cap checks must all pass before a simulated purchase starts.',reviewReference:hash({scope:scope(actor),office:actor.officeId,input,state})};
}
export function saveAutoTopUp(actor:Actor,raw:z.input<typeof autoTopUpSaveSchema>):AutoTopUpState {
 authorize(actor);const input=autoTopUpSaveSchema.parse(raw);return getDb().transaction(()=>{
  if(replay(actor,input.eventKey,input))return getAutoTopUpState(actor);
  const {eventKey,reviewReference,...reviewInput}=input,preview=previewAutoTopUp(actor,reviewInput);if(reviewReference!==preview.reviewReference)throw new AppError(409,'Balance, permission or reviewed settings changed. Review again before saving.');
  const prior=settings(actor),value:AutoTopUpSettings={version:prior.version+1,enabled:input.enabled,triggerCents:input.triggerCents,amountCents:input.amountCents,monthlyCapCents:input.monthlyCapCents,armed:input.rearm||!prior.enabled&&input.enabled||prior.armed,cycle:prior.cycle,updatedAt:now()};writeSettings(actor,value);event(actor,eventKey,input,{kind:'settings',settings:value});audit(actor,'wallet.auto_topup.settings',actor.id,{simulated:true,enabled:value.enabled});return getAutoTopUpState(actor);
 }).immediate();
}
/** Prepares one pending simulator purchase; never dispatches payment or grants credits. */
export function checkAutoTopUp(actor:Actor):AutoTopUpState {
 authorize(actor);return getDb().transaction(()=>{
  const state=getAutoTopUpState(actor),value=state.settings;
  if(!value.enabled||!state.canEnable||pending(state.purchases))return state;
  if(state.availableCents>value.triggerCents){if(!value.armed){const next={...value,armed:true,version:value.version+1,updatedAt:now()};writeSettings(actor,next);event(actor,`rearm:${value.cycle}:${next.version}`,{cycle:value.cycle,version:next.version},{kind:'recovered',settings:next});}return getAutoTopUpState(actor);}
  if(!value.armed||state.committedThisMonthCents+value.amountCents>value.monthlyCapCents)return state;
  const cycle=value.cycle+1,stamp=now(),purchase:AutoTopUpPurchase={id:newId('auto_purchase'),payerId:actor.id,amountCents:value.amountCents,currency:'USD',month:month(),cycle,settingsVersion:value.version,status:'pending',version:1,createdAt:stamp,updatedAt:stamp,simulated:true};
  writePurchase(actor,purchase);writeSettings(actor,{...value,armed:false,cycle,version:value.version+1,updatedAt:stamp});event(actor,`purchase:${purchase.id}`,{purchaseId:purchase.id},{kind:'prepared',purchase});audit(actor,'wallet.auto_topup.prepared',purchase.id,{simulated:true});return getAutoTopUpState(actor);
 }).immediate();
}
export function resolveAutoTopUp(actor:Actor,raw:z.input<typeof autoTopUpResolveSchema>):AutoTopUpState {
 authorize(actor);const input=autoTopUpResolveSchema.parse(raw);return getDb().transaction(()=>{
  if(replay(actor,input.eventKey,input))return getAutoTopUpState(actor);
  const purchase=purchases(actor).find(item=>item.id===input.purchaseId);if(!purchase)throw new AppError(404,'Automatic purchase not found in your personal wallet.');
  if(purchase.version!==input.expectedVersion)throw new AppError(409,'The purchase outcome changed. Reload before reviewing.');
  if(!['pending','unknown'].includes(purchase.status))throw new AppError(409,'This purchase already has a final outcome.');
  const next:AutoTopUpPurchase={...purchase,status:input.outcome,version:purchase.version+1,updatedAt:now()};writePurchase(actor,next);
  if(input.outcome==='succeeded')creditAutomaticTopUp(actor,purchase.id);
  event(actor,input.eventKey,input,{kind:'outcome',purchase:next});audit(actor,'wallet.auto_topup.outcome',purchase.id,{simulated:true,outcome:input.outcome});return getAutoTopUpState(actor);
 }).immediate();
}
export function processAutoTopUps():number {
 assertBillingDemo();const rows=getDb().prepare('SELECT s.organization_id,s.office_id,s.user_id,m.role,u.name FROM auto_topup_settings s JOIN memberships m ON m.organization_id=s.organization_id AND m.office_id=s.office_id AND m.user_id=s.user_id JOIN users u ON u.id=s.user_id').all() as {organization_id:string;office_id:string;user_id:string;role:Role;name:string}[];
 for(const row of rows){const actor:Actor={organizationId:row.organization_id,officeId:row.office_id,id:row.user_id,role:row.role,name:row.name};if(!isAuthorizedActor(actor))continue;checkAutoTopUp(actor);for(const purchase of purchases(actor))if(['succeeded','failed','unknown'].includes(purchase.status))notify(actor,`auto-topup:${purchase.id}:${purchase.status}`,purchase.status==='succeeded'?'Simulated automatic top-up completed':purchase.status==='failed'?'Simulated automatic top-up failed':'Automatic top-up needs reconciliation',purchase.status==='succeeded'?`$${(purchase.amountCents/100).toFixed(2)} in demonstration credits added. No payment collected.`:'Review the recorded purchase outcome in Credits & billing. No automatic retry or spendable credit was created.','billing');}
 return rows.length;
}
