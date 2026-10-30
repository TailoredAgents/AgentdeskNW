import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import type { BillingState,BillingAdminState,BillingPolicy,CatalogProduct,EnterpriseSeat,FeatureAccess,SubscriptionQuote,SubscriptionRecord,SubscriptionSelection,TrialRecord } from '../lib/billing-contracts';
import { AppError,assertActor,audit,getDb,newId,now,requireRole } from './db';
import { specialists } from './registry';
import { addonPrices,coreFeatures,isWorkforcePlan,legacyPlanIds,planSeeds,pricingNotice,workforceFeatures } from './billing-catalog';
import { assertBillingDemo } from './billing-provider';

const key=z.string().trim().min(1).max(150);
export const selectionSchema=z.object({planId:key,addons:z.array(key).max(20)}).strict();
const featureIds=[...coreFeatures,...Object.keys(addonPrices),'sms'];
const policyFeatures=z.array(z.enum(['core',...Object.keys(addonPrices),'sms'] as [string,...string[]])).max(14);
const featureList=z.array(z.enum(['core',...featureIds] as [string,...string[]])).max(20);
const roles=z.object({dispositions:policyFeatures,acquisitions:policyFeatures,manager:policyFeatures}).strict();
export const policySchema=z.object({sponsored:roles,required:roles,restricted:featureList,purchasesEnabled:z.boolean(),trialsEnabled:z.boolean(),trialDays:z.number().int().min(1).max(90)}).strict();
const defaultPolicy:BillingPolicy={sponsored:{dispositions:[],acquisitions:[],manager:[]},required:{dispositions:[],acquisitions:[],manager:[]},restricted:[],purchasesEnabled:true,trialsEnabled:true,trialDays:14};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function nextMonth(value:string){const d=new Date(value),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString();}
export function catalog():CatalogProduct[]{
 const db=getDb();const seeds=[...planSeeds,...Object.entries(addonPrices).map(([id,price])=>({id,name:specialists.find(s=>s.id===id)!.name,kind:'specialist' as const,version:1,monthlyCents:price*100,features:[id],allowances:id==='investor-hunter'?{research_credits:1,research_target:25}:{},provisional:true as const,retired:true})),{id:'sms',name:'Copilot SMS access',kind:'sms' as const,version:1,monthlyCents:1900,features:['sms'],allowances:{sms_segments:500,sms_overage_cents:4},provisional:true as const}];
 const insert=db.prepare('INSERT OR IGNORE INTO billing_catalog VALUES(?,?,1,?)');for(const product of seeds)if(!db.prepare('SELECT 1 FROM billing_catalog WHERE product_id=?').get(product.id))insert.run(product.id,1,JSON.stringify(product));
 return (db.prepare('SELECT data FROM billing_catalog WHERE active=1 ORDER BY rowid').all() as {data:string}[]).map(row=>{const product=JSON.parse(row.data) as CatalogProduct;return {...product,...(legacyPlanIds.includes(product.id)||product.kind==='specialist'?{retired:true}:{})};});
}
export function isBillingAdmin(actor:Actor){assertActor(actor);return actor.role==='manager'&&!!getDb().prepare('SELECT 1 FROM billing_admins WHERE organization_id=? AND user_id=?').get(actor.organizationId,actor.id);}
export function requireBillingAdmin(actor:Actor){requireRole(actor,['manager']);if(!isBillingAdmin(actor))throw new AppError(403,'Organization billing administrator access is required.');assertBillingDemo();}
export function billingPolicy(actor:Actor):BillingPolicy {assertActor(actor);const row=getDb().prepare('SELECT data FROM billing_policies WHERE organization_id=?').get(actor.organizationId) as {data:string}|undefined;return row?JSON.parse(row.data):structuredClone(defaultPolicy);}
export function saveBillingPolicy(actor:Actor,input:unknown){requireBillingAdmin(actor);const policy=policySchema.parse(input);if(policy.restricted.some(id=>coreFeatures.includes(id)||id==='core'))throw new AppError(422,'Core foundations cannot be restricted individually.');getDb().prepare('INSERT INTO billing_policies VALUES(?,?) ON CONFLICT(organization_id) DO UPDATE SET data=excluded.data').run(actor.organizationId,JSON.stringify(policy));audit(actor,'billing.policy.updated');return policy;}
function sponsoredFeatures(actor:Actor){
 const policy=billingPolicy(actor),features=[...new Set([...policy.sponsored[actor.role],...policy.required[actor.role]])];
 // An explicit seat decision supersedes legacy base sponsorship for this employee,
 // including removal. Otherwise removal could silently replace $30 funding with $50.
 return enterpriseSeat(actor)?features.filter(id=>id!=='core'):features;
}
function expanded(ids:string[]){return [...new Set(ids.flatMap(id=>id==='core'?coreFeatures:[id]))];}
function roleAllowed(actor:Actor,id:string){return id==='sms'||coreFeatures.includes(id)||!!specialists.find(s=>s.id===id)?.roles.includes(actor.role);}
export function enterpriseSeat(actor:Actor):EnterpriseSeat|null {
 assertActor(actor);const row=getDb().prepare('SELECT data FROM billing_enterprise_seats WHERE organization_id=? AND user_id=?').get(actor.organizationId,actor.id) as {data:string}|undefined;
 return row?JSON.parse(row.data) as EnterpriseSeat:null;
}
function companyCore(actor:Actor){return sponsoredFeatures(actor).includes('core');}
function workforceQuote(actor:Actor,selection:SubscriptionSelection,plan:CatalogProduct,products:CatalogProduct[],locked?:Record<string,CatalogProduct>):SubscriptionQuote {
 const seat=enterpriseSeat(actor),isEnterprise=plan.id==='workforce-enterprise';
 if(isEnterprise&&!seat?.active)throw new AppError(403,'The company rate requires an explicitly assigned company seat.');
 const sponsored=sponsoredFeatures(actor),baseSponsored=isEnterprise||companyCore(actor),prices:Record<string,CatalogProduct>={[plan.id]:plan};
 const duplicates:string[]=[],addons:string[]=[];
 for(const id of [...new Set(selection.addons)]){
  if(workforceFeatures.includes(id)){duplicates.push(id);continue;}
  const item=locked?.[id]??products.find(p=>p.id===id);
  if(!item||id!=='sms')throw new AppError(422,'Only the employee Copilot SMS connection is available as an add-on.');
  if(sponsored.includes(id)){duplicates.push(id);continue;}prices[id]=item;addons.push(id);
 }
 const sms=locked?.sms??products.find(p=>p.id==='sms')!;
 if(sponsored.includes('sms'))prices.sms=sms;
 const lines=[{id:plan.id,name:plan.name,monthlyCents:plan.monthlyCents,creditCents:baseSponsored?plan.monthlyCents:0,personalCents:baseSponsored?0:plan.monthlyCents,note:isEnterprise?'Company-paid demonstration seat; assigned by a billing administrator.':baseSponsored?'Company-sponsored workforce at the retail rate.':'All available, role-authorized specialists; $15 monthly simulated credits.'},...addons.map(id=>({id,name:prices[id].name,monthlyCents:prices[id].monthlyCents,creditCents:0,personalCents:prices[id].monthlyCents,note:'Employee messaging connection; provider setup remains separate.'}))];
 return {selection:{planId:plan.id,addons},lines,personalCents:lines.reduce((n,line)=>n+line.personalCents,0),organizationCents:(baseSponsored?plan.monthlyCents:0)+(sponsored.includes('sms')?sms.monthlyCents:0),sponsored:[...new Set([...sponsored,...(isEnterprise?['core']:[])])],features:[...new Set([...plan.features,...addons.flatMap(id=>prices[id].features),...expanded(sponsored)])],removedDuplicates:duplicates,prices};
}
export function quoteSubscription(actor:Actor,input:SubscriptionSelection,locked?:Record<string,CatalogProduct>):SubscriptionQuote {
 assertActor(actor);const selection=selectionSchema.parse(input),products=catalog();const product=(id:string)=>locked?.[id]??products.find(p=>p.id===id);
 const plan=product(selection.planId);if(!plan||plan.kind!=='plan')throw new AppError(422,'Choose an available subscription plan.');
 if(isWorkforcePlan(plan.id))return workforceQuote(actor,selection,plan,products,locked);
 const sponsored=sponsoredFeatures(actor),covered=expanded(sponsored);const prices:Record<string,CatalogProduct>={[plan.id]:plan};const duplicates:string[]=[];
 const addons=[...new Set(selection.addons)].filter(id=>{const item=product(id);if(!item||item.kind==='plan')throw new AppError(422,'Choose a valid specialist or SMS add-on.');if(plan.features.includes(id)||covered.includes(id)){duplicates.push(id);return false;}prices[id]=item;return true;});
 // Core keeps its own price; the bundle discount is distributed across premium seats in integer cents.
 const core=product('core')!;prices.core=core;const premium=plan.features.filter(id=>!coreFeatures.includes(id));const weight=premium.reduce((sum,id)=>sum+(product(id)?.monthlyCents??0),0);
 const allocation:Record<string,number>={core:Math.min(plan.monthlyCents,core.monthlyCents)};let allocated=allocation.core;
 premium.forEach((id,index)=>{const amount=index===premium.length-1?plan.monthlyCents-allocated:Math.floor((plan.monthlyCents-allocation.core)*(product(id)?.monthlyCents??0)/Math.max(1,weight));allocation[id]=amount;allocated+=amount;prices[id]=product(id)!;});
 const credit=Object.entries(allocation).filter(([id])=>sponsored.includes(id)||id==='core'&&coreFeatures.every(id=>covered.includes(id))).reduce((n,[,amount])=>n+amount,0);
 const lines=[{id:plan.id,name:plan.name,monthlyCents:plan.monthlyCents,creditCents:credit,personalCents:plan.monthlyCents-credit,note:credit?'Company-sponsored share credited from this bundle.':'Includes Core; proposed monthly price.'},...addons.map(id=>({id,name:prices[id].name,monthlyCents:prices[id].monthlyCents,creditCents:0,personalCents:prices[id].monthlyCents,note:'Individual add-on'}))];
 const organizationCents=sponsored.reduce((sum,id)=>sum+(id==='core'?core.monthlyCents:coreFeatures.includes(id)?0:product(id)?.monthlyCents??0),0);
 return {selection:{planId:plan.id,addons},lines,personalCents:lines.reduce((n,line)=>n+line.personalCents,0),organizationCents,sponsored,features:[...new Set([...plan.features,...addons.flatMap(id=>prices[id].features),...covered])],removedDuplicates:duplicates,prices};
}
function persist(actor:Actor,value:SubscriptionRecord){getDb().prepare('INSERT INTO billing_subscriptions VALUES(?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET data=excluded.data').run(value.id,actor.organizationId,actor.id,JSON.stringify(value));return value;}
function migrateSubscription(actor:Actor,sub:SubscriptionRecord):SubscriptionRecord {
 if(isWorkforcePlan(sub.selection.planId))return sub;
 assertBillingDemo();
 // The original selection/price snapshot remains inspectable; old invoices and business records are unchanged.
 return getDb().transaction(()=>{
  const row=getDb().prepare('SELECT data FROM billing_subscriptions WHERE organization_id=? AND user_id=?').get(actor.organizationId,actor.id) as {data:string}|undefined;
  if(row){const fresh=JSON.parse(row.data) as SubscriptionRecord;if(isWorkforcePlan(fresh.selection.planId))return fresh;sub=fresh;}
  const quote=quoteSubscription(actor,{planId:'workforce',addons:sub.selection.addons.includes('sms')?['sms']:[]});
  const pending=sub.pending?{planId:'workforce',addons:sub.pending.addons.includes('sms')?['sms']:[]}:null;
  const next={...sub,selection:quote.selection,prices:quote.prices,pending,version:sub.version+1};
  getDb().prepare('INSERT OR IGNORE INTO billing_subscription_migrations VALUES(?,?,?,?,?,?)').run(actor.organizationId,actor.id,'workforce-v1',JSON.stringify(sub),JSON.stringify(next),now());
  persist(actor,next);
  const eventKey='migration:workforce-v1';
  getDb().prepare('INSERT OR IGNORE INTO billing_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('billing_event'),actor.organizationId,actor.id,eventKey,hash({migration:'workforce-v1'}),'workforce_migration',now(),'Legacy demonstration plan converted to workforce; original snapshot and invoices preserved. No money collected.',JSON.stringify(next));
  audit(actor,'billing.workforce_migrated',sub.id,{from:sub.selection.planId,to:'workforce'});
  return next;
 }).immediate();
}
function calendarEvent(actor:Actor,sub:SubscriptionRecord,kind:string){const eventKey=`calendar:${kind}:${sub.periodStart}`;const inserted=getDb().prepare('INSERT OR IGNORE INTO billing_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('billing_event'),actor.organizationId,actor.id,eventKey,hash({kind,periodStart:sub.periodStart}),kind,now(),'Automatic simulated calendar transition; no money collected.',JSON.stringify(sub));if(inserted.changes)audit(actor,`billing.${kind}`);}
function invoice(actor:Actor,sub:SubscriptionRecord,status='simulated_paid',personalAmount?:number){const quote=quoteSubscription(actor,sub.selection,sub.prices);getDb().prepare('INSERT OR IGNORE INTO billing_invoices VALUES(?,?,?,?,?,?,?)').run(newId('invoice'),actor.organizationId,actor.id,sub.periodStart,sub.periodEnd,personalAmount??quote.personalCents,status);}
export function subscription(actor:Actor):SubscriptionRecord {
 assertActor(actor);const row=getDb().prepare('SELECT data FROM billing_subscriptions WHERE organization_id=? AND user_id=?').get(actor.organizationId,actor.id) as {data:string}|undefined;
 if(!row){const quote=quoteSubscription(actor,{planId:'workforce',addons:[]});const stamp=now();const sub:SubscriptionRecord={id:newId('subscription'),selection:quote.selection,prices:quote.prices,status:'active',version:1,periodStart:stamp,periodEnd:nextMonth(stamp),pending:null,cancelAtPeriodEnd:false,createdAt:stamp};getDb().prepare('INSERT OR IGNORE INTO billing_customers VALUES(?,?,?,NULL)').run(actor.organizationId,actor.id,'local_simulator');persist(actor,sub);invoice(actor,sub);return sub;}
 let sub=migrateSubscription(actor,JSON.parse(row.data) as SubscriptionRecord);
 if(sub.status==='active'&&Date.parse(sub.periodEnd)<=Date.now()){
  // Calendar catch-up is a simulation only, never an external charge or trial conversion.
  let turns=0;while(sub.status==='active'&&Date.parse(sub.periodEnd)<=Date.now()&&turns++<240){
   if(sub.cancelAtPeriodEnd){sub={...sub,status:'canceled',cancelAtPeriodEnd:false,pending:null,version:sub.version+1};calendarEvent(actor,sub,'period_cancellation');break;}
   const quote=quoteSubscription(actor,sub.pending??sub.selection,sub.pending?undefined:sub.prices);const start=sub.periodEnd;sub={...sub,selection:quote.selection,prices:quote.prices,periodStart:start,periodEnd:nextMonth(start),pending:null,version:sub.version+1};invoice(actor,sub);calendarEvent(actor,sub,'period_renewal');
  }persist(actor,sub);
 }
 // A legacy company-sponsored base remains independent of a canceled personal add-on bill.
 // Its allowance period advances without resuming personal billing or charging inactive add-ons.
 if(sub.status!=='active'&&!enterpriseSeat(actor)?.active&&companyCore(actor)){
  let turns=0;while(Date.parse(sub.periodEnd)<=Date.now()&&turns++<240){
   const start=sub.periodEnd;sub={...sub,periodStart:start,periodEnd:nextMonth(start),version:sub.version+1};
   invoice(actor,sub,'simulated_company_sponsored',0);calendarEvent(actor,sub,'company_period_renewal');
  }
  persist(actor,sub);
 }
 return sub;
}
export function trial(actor:Actor):TrialRecord|null {assertActor(actor);const row=getDb().prepare('SELECT data FROM billing_trials WHERE organization_id=? AND user_id=?').get(actor.organizationId,actor.id) as {data:string}|undefined;if(!row)return null;const t=JSON.parse(row.data) as TrialRecord;return {...t,active:Date.parse(t.startsAt)<=Date.now()&&Date.parse(t.endsAt)>Date.now()&&billingPolicy(actor).trialsEnabled};}
export function featureAccess(actor:Actor,id:string):FeatureAccess {
 const sub=subscription(actor),policy=billingPolicy(actor),seat=enterpriseSeat(actor),hasCompanyBase=!seat?.active&&companyCore(actor),sponsored=expanded(sponsoredFeatures(actor)),t=trial(actor);
 const spec=specialists.find(s=>s.id===id),core=id==='core'||coreFeatures.includes(id),modern=isWorkforcePlan(sub.selection.planId);
 const coreActive=sub.status==='active'||hasCompanyBase;
 let source:FeatureAccess['source']='none';
 if(coreActive&&((seat?.active&&sub.status==='active'&&workforceFeatures.includes(id))||(modern&&hasCompanyBase&&workforceFeatures.includes(id))||sponsored.includes(id)||id==='core'&&hasCompanyBase))source='organization';
 else if(sub.status==='active'){const plan=sub.prices[sub.selection.planId];if(core)source=seat?.active?'organization':'core';else if(plan.features.includes(id))source='bundle';else if(sub.selection.addons.includes(id))source='individual';}
 if(source==='none'&&t?.active&&t.features.includes(id))source='trial';
 const entitled=source!=='none',role=roleAllowed(actor,id)||id==='core',implemented=id==='core'||id==='sms'||spec?.status!=='planned'&&!!spec;
 const restricted=policy.restricted.includes(id);
 const reason=restricted?'Restricted by organization policy.':!role?'Your role does not permit this capability.':!coreActive?'An active workforce subscription or company-sponsored seat is required.':!entitled?id==='sms'?'Copilot SMS access is an optional connection. Review Workforce & connections.':'This capability requires active workforce access.':!implemented?'In development. Inclusion does not enable an unfinished capability.':id==='sms'?'SMS access active; manage the employee messaging connection in Settings.':'Included in your workforce; available within your role and workspace.';
 return {id,name:id==='core'?'AgentDesk Workforce':id==='sms'?'Copilot SMS access':spec?.name??id,source,entitled,roleAllowed:role,implemented,allowed:entitled&&role&&implemented&&!restricted&&coreActive,reason,implementation:spec?.status??'foundation'};
}
export class EntitlementError extends AppError {constructor(public featureId:string,message:string,status=402){super(status,message);}}
export function requireFeature(actor:Actor,id:string){const access=featureAccess(actor,id);if(!access.allowed)throw new EntitlementError(id,access.reason,!access.roleAllowed||billingPolicy(actor).restricted.includes(id)?403:!access.implemented?503:402);return access;}
export function hasFeature(actor:Actor,id:string){return featureAccess(actor,id).allowed;}
function event<T>(actor:Actor,eventKey:string,kind:string,payload:unknown,fn:()=>T):T {
 key.parse(eventKey);const digest=hash({kind,payload});return getDb().transaction(()=>{const prior=getDb().prepare('SELECT payload_hash,result FROM billing_events WHERE organization_id=? AND user_id=? AND event_key=?').get(actor.organizationId,actor.id,eventKey) as {payload_hash:string;result:string}|undefined;if(prior){if(prior.payload_hash!==digest)throw new AppError(409,'This billing event key was used for different input.');return JSON.parse(prior.result) as T;}
 const result=fn();getDb().prepare('INSERT INTO billing_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('billing_event'),actor.organizationId,actor.id,eventKey,digest,kind,now(),`Simulated ${kind.replaceAll('_',' ')}; no money collected.`,JSON.stringify(result));audit(actor,`billing.${kind}`);return result;}).immediate();
}
export function changeSubscription(actor:Actor,input:{selection:SubscriptionSelection;expectedVersion:number;eventKey:string;timing:'now'|'period_end'}):SubscriptionRecord {
 assertActor(actor);assertBillingDemo();const parsed=z.object({selection:selectionSchema,expectedVersion:z.number().int().positive(),eventKey:key,timing:z.enum(['now','period_end'])}).strict().parse(input);
 return event(actor,parsed.eventKey,'subscription_change',parsed,()=>{
  const current=subscription(actor),policy=billingPolicy(actor),seat=enterpriseSeat(actor);
  if(current.version!==parsed.expectedVersion)throw new AppError(409,'Subscription changed. Reload and review the current quote.');
  if(current.status==='past_due')throw new AppError(403,'Resolve the simulated failed payment before changing your subscription.');
  if(!isWorkforcePlan(parsed.selection.planId))throw new AppError(422,'Legacy individual specialist plans are retired. Choose the workforce plan.');
  if(seat?.active&&current.status!=='active')throw new AppError(403,'A billing administrator must reactivate your company-paid seat.');
  if(seat?.active&&parsed.selection.planId!=='workforce-enterprise')throw new AppError(403,'A billing administrator manages your company-paid base seat.');
  const quote=quoteSubscription(actor,parsed.selection),currentQuote=quoteSubscription(actor,current.selection,current.prices);
  if(!policy.purchasesEnabled&&(current.status!=='active'||quote.personalCents>currentQuote.personalCents||quote.features.some(id=>!currentQuote.features.includes(id))))throw new AppError(403,'Personal subscription upgrades are disabled by your organization.');
  for(const id of quote.selection.addons)if(!roleAllowed(actor,id)||policy.restricted.includes(id))throw new AppError(403,`Your role or organization does not permit ${id}.`);
  // A complete workforce plan includes every specialist; execution still checks role, policy and readiness.
  return persist(actor,{...current,...(parsed.timing==='period_end'?{pending:quote.selection}:{selection:quote.selection,prices:quote.prices,status:'active' as const,pending:null}),cancelAtPeriodEnd:false,version:current.version+1});
 });
}
export function assignEnterpriseSeat(admin:Actor,input:{userId:string;enabled:boolean;agreementLabel:string;expectedVersion:number;eventKey:string}):SubscriptionRecord {
 requireBillingAdmin(admin);const parsed=z.object({userId:key,enabled:z.boolean(),agreementLabel:z.string().trim().min(3).max(160),expectedVersion:z.number().int().positive(),eventKey:key}).strict().parse(input);
 const actor=memberActor(admin,parsed.userId);
 return event(actor,parsed.eventKey,'enterprise_seat',parsed,()=>{
  const current=subscription(actor);if(current.version!==parsed.expectedVersion)throw new AppError(409,'Subscription changed. Reload before assigning the seat.');
  const prior=enterpriseSeat(actor);if(!parsed.enabled&&!prior?.active)return current;
  const seat:EnterpriseSeat={userId:actor.id,agreementLabel:parsed.agreementLabel,assignedBy:admin.id,assignedAt:now(),active:parsed.enabled,version:(prior?.version??0)+1};
  getDb().prepare('INSERT INTO billing_enterprise_seats VALUES(?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET data=excluded.data').run(actor.organizationId,actor.id,JSON.stringify(seat));
  const quote=quoteSubscription(actor,{planId:parsed.enabled?'workforce-enterprise':'workforce',addons:current.selection.addons.filter(id=>id==='sms')});
  const next=persist(actor,{...current,selection:quote.selection,prices:quote.prices,status:parsed.enabled?'active':'canceled',pending:null,cancelAtPeriodEnd:false,version:current.version+1});
  audit(admin,parsed.enabled?'billing.enterprise_seat.assigned':'billing.enterprise_seat.removed',actor.id,{agreementLabel:parsed.agreementLabel,monthlyCents:parsed.enabled?quote.organizationCents:0});
  return next;
 });
}
export function simulateLifecycle(requester:Actor,input:{userId?:string;action:'cancel_now'|'cancel_at_period_end'|'resume'|'payment_failed'|'payment_recovered'|'renew';expectedVersion:number;eventKey:string}):SubscriptionRecord {
 assertActor(requester);assertBillingDemo();const parsed=z.object({userId:key.optional(),action:z.enum(['cancel_now','cancel_at_period_end','resume','payment_failed','payment_recovered','renew']),expectedVersion:z.number().int().positive(),eventKey:key}).strict().parse(input);
 const actor=parsed.userId?memberActor(requester,parsed.userId):requester;
 if(enterpriseSeat(actor)?.active&&!isBillingAdmin(requester)&&['cancel_now','cancel_at_period_end','resume'].includes(parsed.action))throw new AppError(403,'A billing administrator manages your company-paid base seat.');
 if(['payment_failed','payment_recovered','renew'].includes(parsed.action))requireBillingAdmin(requester);
 if(parsed.userId)audit(requester,'billing.employee_simulation',actor.id,{action:parsed.action});
 return event(actor,parsed.eventKey,parsed.action,parsed,()=>{const sub=subscription(actor);if(sub.version!==parsed.expectedVersion)throw new AppError(409,'Subscription changed. Reload before this action.');let next={...sub,version:sub.version+1};
 if(parsed.action==='cancel_now')next={...next,status:'canceled',pending:null,cancelAtPeriodEnd:false};
 if(parsed.action==='cancel_at_period_end')next.cancelAtPeriodEnd=true;
 if(parsed.action==='resume'&&sub.status==='past_due')throw new AppError(403,'A billing administrator must simulate payment recovery.');
 if(parsed.action==='resume'||parsed.action==='payment_recovered'){if(!billingPolicy(actor).purchasesEnabled&&!(enterpriseSeat(actor)?.active&&isBillingAdmin(requester)))throw new AppError(403,'Personal subscriptions are disabled.');next={...next,status:'active',cancelAtPeriodEnd:false,pending:null};}
 if(parsed.action==='payment_failed'){next.status='past_due';getDb().prepare('UPDATE billing_invoices SET status=? WHERE organization_id=? AND user_id=? AND period_start=?').run('simulated_payment_failed',actor.organizationId,actor.id,sub.periodStart);}
 if(parsed.action==='payment_recovered')getDb().prepare('UPDATE billing_invoices SET status=? WHERE organization_id=? AND user_id=? AND period_start=?').run('simulated_paid',actor.organizationId,actor.id,sub.periodStart);
 if(parsed.action==='renew'){if(next.cancelAtPeriodEnd)next={...next,status:'canceled',cancelAtPeriodEnd:false,pending:null};else{const quote=quoteSubscription(actor,next.pending??next.selection,next.pending?undefined:next.prices);const stamp=next.periodEnd;next={...next,selection:quote.selection,prices:quote.prices,status:'active',pending:null,periodStart:stamp,periodEnd:nextMonth(stamp)};invoice(actor,next);}}
 return persist(actor,next);});
}
export function memberActor(admin:Actor,userId:string):Actor {requireBillingAdmin(admin);const row=getDb().prepare('SELECT m.user_id AS id,u.name,m.organization_id AS organizationId,m.office_id AS officeId,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? ORDER BY m.office_id').get(admin.organizationId,key.parse(userId)) as Actor|undefined;if(!row)throw new AppError(404,'Employee is not in this organization.');return row;}
export function grantTrial(admin:Actor,input:{userId:string;features:string[];days?:number;allowances?:Record<string,number>}){
 const parsed=z.object({userId:key,features:featureList,days:z.number().int().min(1).max(90).optional(),allowances:z.partialRecord(z.enum(['research_credits','voice_minutes','text_tokens','sms_segments']),z.number().int().min(0).max(10000000)).optional()}).strict().parse(input);const actor=memberActor(admin,parsed.userId),policy=billingPolicy(actor);if(!policy.trialsEnabled)throw new AppError(403,'Trials are disabled.');const features=expanded(parsed.features);for(const id of features)if(!roleAllowed(actor,id)||policy.restricted.includes(id))throw new AppError(403,'Trial cannot bypass role or organization restrictions.');const startsAt=now(),endsAt=new Date(Date.now()+(parsed.days??policy.trialDays)*86400000).toISOString();const t:TrialRecord={features,startsAt,endsAt,allowances:{...Object.assign({},...catalog().filter(product=>product.kind!=='plan'&&features.includes(product.id)).map(product=>product.allowances)),...parsed.allowances},active:true};getDb().prepare('INSERT INTO billing_trials VALUES(?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET data=excluded.data').run(actor.organizationId,actor.id,JSON.stringify(t));audit(admin,'billing.trial.granted',actor.id,{features,endsAt});return t;
}
export function updatePrice(admin:Actor,input:{id:string;monthlyCents:number;allowances:Record<string,number>}) {requireBillingAdmin(admin);if(admin.organizationId!=='org-demo'||admin.id!=='user-taylor')throw new AppError(403,'Platform demo pricing access is required.');const parsed=z.object({id:key,monthlyCents:z.number().int().min(0).max(1000000),allowances:z.record(z.string().max(50),z.number().int().min(0).max(10000000))}).strict().parse(input);const current=catalog().find(p=>p.id===parsed.id);if(!current)throw new AppError(404,'Product not found.');return getDb().transaction(()=>{const value={...current,...parsed,version:current.version+1};getDb().prepare('UPDATE billing_catalog SET active=0 WHERE product_id=?').run(value.id);getDb().prepare('INSERT INTO billing_catalog VALUES(?,?,1,?)').run(value.id,value.version,JSON.stringify(value));audit(admin,'billing.price.versioned',value.id,{version:value.version});return value;}).immediate();}
export function adminBillingState(actor:Actor):BillingAdminState {requireBillingAdmin(actor);const members=getDb().prepare('SELECT m.user_id AS id,u.name,m.organization_id AS organizationId,m.office_id AS officeId,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=?').all(actor.organizationId) as Actor[];const unique=[...new Map(members.map(m=>[m.id,m])).values()];const seats=unique.map(member=>{const sub=subscription(member),quote=quoteSubscription(member,sub.selection,sub.prices);return {userId:member.id,name:member.name,role:member.role,officeId:member.officeId,status:sub.status,version:sub.version,personalCents:sub.status==='active'?quote.personalCents:0,organizationCents:sub.status==='active'||!enterpriseSeat(member)?.active&&companyCore(member)?quote.organizationCents:0,enterpriseSeat:enterpriseSeat(member),activeFeatures:featureIds.filter(id=>hasFeature(member,id)).length};});return {policy:billingPolicy(actor),seats,organizationMonthlyCents:seats.reduce((n,s)=>n+s.organizationCents,0),personalMonthlyCents:seats.reduce((n,s)=>n+s.personalCents,0),activeSeats:seats.filter(s=>s.status==='active'||s.organizationCents>0).length};}
// Metering is loaded by billing-api.ts to keep the entitlement and ledger modules acyclic.
export function billingBaseState(actor:Actor):Omit<BillingState,'usage'> {const sub=subscription(actor);const events=(getDb().prepare('SELECT id,kind,created_at AS createdAt,detail FROM billing_events WHERE organization_id=? AND user_id=? ORDER BY rowid DESC LIMIT 30').all(actor.organizationId,actor.id)) as BillingState['events'];const invoices=(getDb().prepare('SELECT id,period_start AS periodStart,period_end AS periodEnd,amount_cents AS amountCents,status FROM billing_invoices WHERE organization_id=? AND user_id=? ORDER BY rowid DESC LIMIT 24').all(actor.organizationId,actor.id) as Omit<BillingState['invoices'][number],'simulated'>[]).map(i=>({...i,simulated:true as const}));return {catalog:catalog(),subscription:sub,quote:quoteSubscription(actor,sub.selection,sub.prices),access:featureIds.map(id=>featureAccess(actor,id)),policy:billingPolicy(actor),trial:trial(actor),enterpriseSeat:enterpriseSeat(actor),events,invoices,isAdmin:isBillingAdmin(actor),provider:'local_simulator',pricingNotice};}
