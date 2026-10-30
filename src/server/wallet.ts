import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {WalletLedgerEntry,WalletOperation,WalletQuote,WalletScenario,WalletScenarioId,WalletState} from '../lib/wallet-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {billingPolicy,featureAccess,requireFeature,subscription} from './billing';
import {assertBillingDemo} from './billing-provider';

interface Account {id:string;version:number;periodStart:string;periodEnd:string;monthlySpendLimitCents:number;createdAt:string}
type Scenario=Omit<WalletScenario,'allowed'|'reason'>;
const scenarios:Scenario[]=[
 {id:'reply-draft',name:'Reply draft',description:'Sample AI work to prepare one short investor reply.',feature:'core',rateVersion:1,markupMultiplier:5,maximumCents:50,successCents:40,sampleProviderMaximumCents:10,sampleProviderSuccessCents:8},
 {id:'relationship-briefing',name:'Relationship briefing',description:'Sample AI work to summarize a relationship and its next step.',feature:'investor-relationship',rateVersion:1,markupMultiplier:5,maximumCents:150,successCents:100,sampleProviderMaximumCents:30,sampleProviderSuccessCents:20},
 {id:'investor-research',name:'Investor research',description:'Sample bounded research work with a reviewable spending maximum.',feature:'investor-hunter',rateVersion:1,markupMultiplier:5,maximumCents:500,successCents:350,sampleProviderMaximumCents:100,sampleProviderSuccessCents:70},
];
const key=z.string().trim().min(1).max(150);
const version=z.number().int().positive();
const changeFields={expectedVersion:version,eventKey:key};
const topupSchema=z.object({...changeFields,amountCents:z.union([z.literal(1000),z.literal(2500),z.literal(5000),z.literal(10000)])}).strict();
const settingsSchema=z.object({...changeFields,monthlySpendLimitCents:z.number().int().min(0).max(100000)}).strict();
const estimateSchema=z.object({scenarioId:z.enum(['reply-draft','relationship-briefing','investor-research'])}).strict();
const simulationSchema=z.object({...changeFields,quoteId:key,outcome:z.enum(['reserve','success','cancel','unknown'])}).strict();
const resolveSchema=z.object({...changeFields,operationId:key,outcome:z.enum(['success','cancel'])}).strict();
// One paid employee seat has one wallet across authorized offices; retain the originating office on each write.
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const walletOwner=(actor:Actor)=>[actor.organizationId,actor.id];
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const notice='Demonstration credits only. Top-ups do not collect payment. Sample work uses fictional cost assumptions; live Copilot, voice, research and messaging do not debit this wallet in this phase.';

function readRows<T>(actor:Actor,table:'wallet_ledger'|'wallet_operations'):T[]{return (getDb().prepare(`SELECT data FROM ${table} WHERE organization_id=? AND user_id=? ORDER BY rowid`).all(...walletOwner(actor)) as {data:string}[]).map(row=>JSON.parse(row.data) as T);}
function writeAccount(actor:Actor,account:Account){getDb().prepare('INSERT INTO wallet_accounts(id,organization_id,office_id,user_id,data) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET data=excluded.data').run(account.id,...owner(actor),JSON.stringify(account));}
function append(actor:Actor,eventKey:string,value:Partial<WalletLedgerEntry>&Pick<WalletLedgerEntry,'kind'|'description'|'periodStart'>){
 const entry:WalletLedgerEntry={id:newId('wallet_entry'),includedDeltaCents:0,purchasedDeltaCents:0,reservedIncludedDeltaCents:0,reservedPurchasedDeltaCents:0,chargedCents:0,expiredCents:0,operationId:null,createdAt:now(),simulated:true,...value};
 getDb().prepare('INSERT INTO wallet_ledger(id,organization_id,office_id,user_id,event_key,data) VALUES(?,?,?,?,?,?)').run(entry.id,...owner(actor),eventKey,JSON.stringify(entry));
 return entry;
}
function totals(actor:Actor,periodStart:string){
 const entries=readRows<WalletLedgerEntry>(actor,'wallet_ledger');
 const operations=readRows<WalletOperation>(actor,'wallet_operations');
 const includedCents=entries.filter(entry=>entry.periodStart===periodStart).reduce((sum,entry)=>sum+entry.includedDeltaCents,0);
 const purchasedCents=entries.reduce((sum,entry)=>sum+entry.purchasedDeltaCents,0);
 const holds=operations.filter(operation=>operation.status==='reserved'||operation.status==='unknown');
 const reservedCents=holds.reduce((sum,operation)=>sum+operation.includedReservedCents+operation.purchasedReservedCents,0);
 const reservedThisPeriodCents=holds.filter(operation=>operation.periodStart===periodStart).reduce((sum,operation)=>sum+operation.includedReservedCents+operation.purchasedReservedCents,0);
 const spentThisPeriodCents=entries.filter(entry=>entry.periodStart===periodStart).reduce((sum,entry)=>sum+entry.chargedCents,0);
 return {entries,operations,includedCents,purchasedCents,reservedCents,reservedThisPeriodCents,spentThisPeriodCents};
}
/** Lazily advance only this employee's wallet. Old held funds remain attached to their original period. */
function ensureAccount(actor:Actor):Account {
 assertActor(actor);const sub=subscription(actor),db=getDb();
 let row=db.prepare('SELECT data FROM wallet_accounts WHERE organization_id=? AND user_id=?').get(...walletOwner(actor)) as {data:string}|undefined;
 const account:Account=row?JSON.parse(row.data):{id:newId('wallet'),version:1,periodStart:sub.periodStart,periodEnd:sub.periodEnd,monthlySpendLimitCents:2500,createdAt:now()};
 if(!row){writeAccount(actor,account);row={data:JSON.stringify(account)};}
 if(account.periodStart!==sub.periodStart){
  const old=totals(actor,account.periodStart).includedCents;
  if(old>0)append(actor,`expire:${account.periodStart}`,{kind:'expiration',description:'Unused monthly credits expired at the end of their period.',periodStart:account.periodStart,includedDeltaCents:-old,expiredCents:old});
  account.periodStart=sub.periodStart;account.periodEnd=sub.periodEnd;account.version++;writeAccount(actor,account);
 }
 const allowance=sub.prices[sub.selection.planId]?.allowances.wallet_cents??0;
 const monthlyKey=`monthly:${account.periodStart}`;
 if(allowance>0&&featureAccess(actor,'core').allowed&&!db.prepare('SELECT 1 FROM wallet_ledger WHERE organization_id=? AND user_id=? AND event_key=?').get(...walletOwner(actor),monthlyKey)){
  append(actor,monthlyKey,{kind:'monthly_credit',description:'Monthly included AgentDesk Credits — demonstration grant.',periodStart:account.periodStart,includedDeltaCents:allowance});
  account.version++;writeAccount(actor,account);
 }
 return account;
}
export function getWalletState(actor:Actor):WalletState {
 assertActor(actor);assertBillingDemo();return getDb().transaction(()=>{
  const account=ensureAccount(actor),balance=totals(actor,account.periodStart),access=featureAccess(actor,'core');
  const monthlyIncludedCents=balance.entries.filter(entry=>entry.kind==='monthly_credit'&&entry.periodStart===account.periodStart).reduce((sum,entry)=>sum+entry.includedDeltaCents,0);
  const availableCents=balance.includedCents+balance.purchasedCents;
  // Financial holds remain actionable even after a large amount of completed history.
  const unresolved=balance.operations.filter(operation=>operation.status==='reserved'||operation.status==='unknown');
  const completed=balance.operations.filter(operation=>operation.status==='settled'||operation.status==='released').slice(-50);
  const visibleOperations=new Set([...unresolved,...completed].map(operation=>operation.id));
  return {version:account.version,periodStart:account.periodStart,periodEnd:account.periodEnd,monthlyIncludedCents,includedCents:balance.includedCents,purchasedCents:balance.purchasedCents,reservedCents:balance.reservedCents,availableCents,spentThisPeriodCents:balance.spentThisPeriodCents,reservedThisPeriodCents:balance.reservedThisPeriodCents,monthlySpendLimitCents:account.monthlySpendLimitCents,spendRemainingCents:Math.max(0,account.monthlySpendLimitCents-balance.spentThisPeriodCents-balance.reservedThisPeriodCents),lowBalance:availableCents<=300,lowBalanceThresholdCents:300,canSpend:access.allowed,canTopUp:access.allowed&&billingPolicy(actor).purchasesEnabled,accessReason:access.allowed?'Available for demonstration sample work.':access.reason,topUpOptionsCents:[1000,2500,5000,10000],scenarios:scenarios.map(scenario=>{const allowed=featureAccess(actor,scenario.feature);return {...scenario,allowed:allowed.allowed,reason:allowed.reason};}),operations:balance.operations.filter(operation=>visibleOperations.has(operation.id)).reverse(),ledger:balance.entries.slice(-100).reverse(),mode:'demonstration' as const,liveUsageDebiting:false as const,notice};
 }).immediate();
}
function mutate(actor:Actor,input:{expectedVersion:number;eventKey:string},kind:string,payload:unknown,fn:(account:Account)=>void):WalletState {
 assertActor(actor);assertBillingDemo();const digest=hash({kind,payload});
 getDb().transaction(()=>{
  const account=ensureAccount(actor),db=getDb();
  const prior=db.prepare('SELECT payload_hash FROM wallet_events WHERE organization_id=? AND user_id=? AND event_key=?').get(...walletOwner(actor),input.eventKey) as {payload_hash:string}|undefined;
  if(prior){if(prior.payload_hash!==digest)throw new AppError(409,'This wallet event key already represents a different action.');return;}
  if(account.version!==input.expectedVersion)throw new AppError(409,'Wallet changed. Reload and review its current balance before trying again.');
  fn(account);account.version++;writeAccount(actor,account);
  db.prepare('INSERT INTO wallet_events(id,organization_id,office_id,user_id,event_key,payload_hash,result,created_at) VALUES(?,?,?,?,?,?,?,?)').run(newId('wallet_event'),...owner(actor),input.eventKey,digest,JSON.stringify({version:account.version}),now());
  audit(actor,`wallet.${kind}`,account.id,{simulated:true});
 }).immediate();
 return getWalletState(actor);
}
export function topUpWallet(actor:Actor,input:z.input<typeof topupSchema>){const parsed=topupSchema.parse(input);return mutate(actor,parsed,'topup',parsed,account=>{
 requireFeature(actor,'core');if(!billingPolicy(actor).purchasesEnabled)throw new AppError(403,'Personal credit purchases are disabled by your organization.');
 append(actor,`topup:${parsed.eventKey}`,{kind:'topup',description:`Simulated purchased credits: $${(parsed.amountCents/100).toFixed(2)}. No payment collected.`,periodStart:account.periodStart,purchasedDeltaCents:parsed.amountCents});
});}
export function updateWalletSettings(actor:Actor,input:z.input<typeof settingsSchema>){const parsed=settingsSchema.parse(input);return mutate(actor,parsed,'settings',parsed,account=>{
 const balance=totals(actor,account.periodStart);
 if(parsed.monthlySpendLimitCents<balance.spentThisPeriodCents+balance.reservedThisPeriodCents)throw new AppError(409,'The limit cannot be lower than work already spent or reserved in this period.');
 account.monthlySpendLimitCents=parsed.monthlySpendLimitCents;
 append(actor,`settings:${parsed.eventKey}`,{kind:'settings',description:`Monthly sample-work spending limit set to $${(parsed.monthlySpendLimitCents/100).toFixed(2)}.`,periodStart:account.periodStart});
});}
export function estimateWalletWork(actor:Actor,input:z.input<typeof estimateSchema>):WalletQuote {
 assertActor(actor);assertBillingDemo();const {scenarioId}=estimateSchema.parse(input),scenario=scenarios.find(item=>item.id===scenarioId)!;requireFeature(actor,scenario.feature);
 const quote:WalletQuote={id:newId('wallet_quote'),scenarioId,name:scenario.name,feature:scenario.feature,rateVersion:scenario.rateVersion,markupMultiplier:scenario.markupMultiplier,maximumCents:scenario.maximumCents,successCents:scenario.successCents,sampleProviderMaximumCents:scenario.sampleProviderMaximumCents,sampleProviderSuccessCents:scenario.sampleProviderSuccessCents,costBasis:'fictional_sample',createdAt:now(),expiresAt:new Date(Date.now()+15*60_000).toISOString()};
 getDb().prepare('INSERT INTO wallet_quotes VALUES(?,?,?,?,?)').run(quote.id,...owner(actor),JSON.stringify(quote));return quote;
}
function readQuote(actor:Actor,id:string):WalletQuote {
 const row=getDb().prepare('SELECT data FROM wallet_quotes WHERE id=? AND organization_id=? AND user_id=?').get(id,...walletOwner(actor)) as {data:string}|undefined;
 if(!row)throw new AppError(404,'Wallet estimate not found in your workspace.');return JSON.parse(row.data);
}
function writeOperation(actor:Actor,operation:WalletOperation){getDb().prepare('INSERT INTO wallet_operations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(operation.id,...owner(actor),operation.quoteId,JSON.stringify(operation));}
function finish(actor:Actor,account:Account,operation:WalletOperation,outcome:'success'|'cancel',eventKey:string){
 if(operation.status==='settled'||operation.status==='released')throw new AppError(409,'This sample work is already finished.');
 const chargedCents=outcome==='success'?operation.quote.successCents:0;
 const includedUsed=Math.min(chargedCents,operation.includedReservedCents),purchasedUsed=chargedCents-includedUsed;
 const includedUnused=operation.includedReservedCents-includedUsed,purchasedUnused=operation.purchasedReservedCents-purchasedUsed;
 const samePeriod=account.periodStart===operation.periodStart;
 append(actor,`finish:${eventKey}`,{kind:outcome==='success'?'settlement':'release',description:outcome==='success'?`${operation.name}: sample work completed; unused reservation released.`:`${operation.name}: sample canceled; unused reservation released.`,periodStart:operation.periodStart,includedDeltaCents:samePeriod?includedUnused:0,purchasedDeltaCents:purchasedUnused,reservedIncludedDeltaCents:-operation.includedReservedCents,reservedPurchasedDeltaCents:-operation.purchasedReservedCents,chargedCents,expiredCents:samePeriod?0:includedUnused,operationId:operation.id});
 writeOperation(actor,{...operation,status:outcome==='success'?'settled':'released',chargedCents,updatedAt:now()});
}
export function simulateWalletWork(actor:Actor,input:z.input<typeof simulationSchema>){const parsed=simulationSchema.parse(input);return mutate(actor,parsed,'sample_work',parsed,account=>{
 const quote=readQuote(actor,parsed.quoteId);if(quote.scenarioId==='copilot-work')throw new AppError(409,'Copilot job spending is managed by its work run.');requireFeature(actor,quote.feature);
 if(Date.parse(quote.expiresAt)<=Date.now())throw new AppError(409,'This estimate expired. Review a new estimate before continuing.');
 if(getDb().prepare('SELECT 1 FROM wallet_operations WHERE quote_id=?').get(quote.id))throw new AppError(409,'This estimate already has sample work. Open its existing reservation instead.');
 const balance=totals(actor,account.periodStart);
 if(balance.includedCents+balance.purchasedCents<quote.maximumCents)throw new AppError(402,'Not enough available credits for this maximum. Add demonstration credits or choose smaller sample work.');
 if(balance.spentThisPeriodCents+balance.reservedThisPeriodCents+quote.maximumCents>account.monthlySpendLimitCents)throw new AppError(402,'This maximum exceeds your monthly spending limit. Review the limit before continuing.');
 const includedReservedCents=Math.min(balance.includedCents,quote.maximumCents),purchasedReservedCents=quote.maximumCents-includedReservedCents;
 const operation:WalletOperation={id:newId('wallet_work'),quoteId:quote.id,scenarioId:quote.scenarioId,name:quote.name,periodStart:account.periodStart,rateVersion:quote.rateVersion,status:'reserved',maximumCents:quote.maximumCents,chargedCents:0,includedReservedCents,purchasedReservedCents,quote,createdAt:now(),updatedAt:now()};
 writeOperation(actor,operation);append(actor,`reserve:${parsed.eventKey}`,{kind:'reservation',description:`${quote.name}: reserved up to $${(quote.maximumCents/100).toFixed(2)} for fictional sample work.`,periodStart:account.periodStart,includedDeltaCents:-includedReservedCents,purchasedDeltaCents:-purchasedReservedCents,reservedIncludedDeltaCents:includedReservedCents,reservedPurchasedDeltaCents:purchasedReservedCents,operationId:operation.id});
 if(parsed.outcome==='unknown'){
  writeOperation(actor,{...operation,status:'unknown',updatedAt:now()});append(actor,`unknown:${parsed.eventKey}`,{kind:'unknown',description:`${quote.name}: sample result unresolved; the maximum stays reserved.`,periodStart:account.periodStart,operationId:operation.id});
 }else if(parsed.outcome!=='reserve')finish(actor,account,operation,parsed.outcome,parsed.eventKey);
});}
export function resolveWalletWork(actor:Actor,input:z.input<typeof resolveSchema>){const parsed=resolveSchema.parse(input);return mutate(actor,parsed,'sample_resolution',parsed,account=>{
 const row=getDb().prepare('SELECT data FROM wallet_operations WHERE id=? AND organization_id=? AND user_id=?').get(parsed.operationId,...walletOwner(actor)) as {data:string}|undefined;
 if(!row)throw new AppError(404,'Sample work not found in your workspace.');
 // Resolving already reserved fictional work remains possible after cancellation; it grants no new execution.
 const operation=JSON.parse(row.data) as WalletOperation;if(operation.workRunId)throw new AppError(409,'Copilot job spending is managed by its work run.');
 finish(actor,account,operation,parsed.outcome,parsed.eventKey);
});}

export type {WalletScenarioId};


/** Internal job-budget ledger bridge. No HTTP/model route accepts these server-priced inputs. */
export function reserveWorkWallet(actor:Actor,input:{runId:string;quoteId:string;maximumCents:number;expiresAt:string}):WalletOperation {
 assertActor(actor);assertBillingDemo();requireFeature(actor,'core');
 const maximum= z.number().int().nonnegative().max(100000).parse(input.maximumCents);
 return getDb().transaction(()=>{
  const account=ensureAccount(actor),db=getDb();
  const prior=db.prepare('SELECT data FROM wallet_operations WHERE quote_id=? AND organization_id=? AND office_id=? AND user_id=?').get(input.quoteId,...owner(actor)) as {data:string}|undefined;
  if(prior){const operation=JSON.parse(prior.data) as WalletOperation;if(operation.workRunId!==input.runId||operation.maximumCents!==maximum)throw new AppError(409,'This job reservation already represents different work.');return operation;}
  if(Date.parse(input.expiresAt)<=Date.now())throw new AppError(409,'This job estimate expired. Refresh the estimate before starting.');
  const balance=totals(actor,account.periodStart);
  if(balance.includedCents+balance.purchasedCents<maximum)throw new AppError(402,'Not enough available credits for this job maximum.');
  if(balance.spentThisPeriodCents+balance.reservedThisPeriodCents+maximum>account.monthlySpendLimitCents)throw new AppError(402,'This job maximum exceeds your monthly spending limit.');
  const quote:WalletQuote={id:input.quoteId,scenarioId:'copilot-work',name:'Copilot job · simulated usage',feature:'core',rateVersion:1,markupMultiplier:5,maximumCents:maximum,successCents:maximum,sampleProviderMaximumCents:maximum/5,sampleProviderSuccessCents:maximum/5,costBasis:'fictional_sample',createdAt:now(),expiresAt:input.expiresAt};
  db.prepare('INSERT INTO wallet_quotes VALUES(?,?,?,?,?)').run(quote.id,...owner(actor),JSON.stringify(quote));
  const includedReservedCents=Math.min(balance.includedCents,maximum),purchasedReservedCents=maximum-includedReservedCents;
  const operation:WalletOperation={id:newId('wallet_work'),quoteId:quote.id,scenarioId:'copilot-work',name:quote.name,periodStart:account.periodStart,rateVersion:1,workRunId:input.runId,status:'reserved',maximumCents:maximum,chargedCents:0,includedReservedCents,purchasedReservedCents,quote,createdAt:now(),updatedAt:now()};
  writeOperation(actor,operation);
  append(actor,`job-reserve:${quote.id}`,{kind:'reservation',description:'Copilot job: fictional credits reserved against its approved maximum.',periodStart:account.periodStart,includedDeltaCents:-includedReservedCents,purchasedDeltaCents:-purchasedReservedCents,reservedIncludedDeltaCents:includedReservedCents,reservedPurchasedDeltaCents:purchasedReservedCents,operationId:operation.id});
  account.version++;writeAccount(actor,account);
  return operation;
 }).immediate();
}

function readWorkWalletOperation(actor:Actor,operationId:string,runId:string):WalletOperation {
 const row=getDb().prepare('SELECT data FROM wallet_operations WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(operationId,...owner(actor)) as {data:string}|undefined;
 if(!row)throw new AppError(404,'Job reservation not found in your workspace.');
 const operation=JSON.parse(row.data) as WalletOperation;
 if(operation.workRunId!==runId)throw new AppError(409,'The reservation belongs to different work.');
 return operation;
}

export function consumeWorkWallet(actor:Actor,input:{runId:string;operationId:string;stepKey:string;amountCents:number}):WalletOperation {
 assertActor(actor);assertBillingDemo();requireFeature(actor,'core');
 const amount=z.number().int().nonnegative().max(100000).parse(input.amountCents);
 return getDb().transaction(()=>{
  const account=ensureAccount(actor),db=getDb(),operation=readWorkWalletOperation(actor,input.operationId,input.runId);
  const eventKey=`job-consume:${operation.id}:${input.stepKey}`;
  const prior=db.prepare('SELECT data FROM wallet_ledger WHERE organization_id=? AND user_id=? AND event_key=?').get(...walletOwner(actor),eventKey) as {data:string}|undefined;
  if(prior){if((JSON.parse(prior.data) as WalletLedgerEntry).chargedCents!==amount)throw new AppError(409,'This job step already has a different usage receipt.');return operation;}
  if(operation.status!=='reserved')throw new AppError(409,'This job reservation cannot dispatch more work.');
  const remaining=operation.includedReservedCents+operation.purchasedReservedCents;
  if(amount>remaining)throw new AppError(409,'This step exceeds the reserved job maximum. Review a revised estimate first.');
  const includedUsed=Math.min(amount,operation.includedReservedCents),purchasedUsed=amount-includedUsed;
  const updated:WalletOperation={...operation,includedReservedCents:operation.includedReservedCents-includedUsed,purchasedReservedCents:operation.purchasedReservedCents-purchasedUsed,chargedCents:operation.chargedCents+amount,status:amount===remaining?'settled':'reserved',updatedAt:now()};
  append(actor,eventKey,{kind:'settlement',description:'Copilot job: completed step settled at its fictional rate.',periodStart:operation.periodStart,reservedIncludedDeltaCents:-includedUsed,reservedPurchasedDeltaCents:-purchasedUsed,chargedCents:amount,operationId:operation.id});
  writeOperation(actor,updated);account.version++;writeAccount(actor,account);return updated;
 }).immediate();
}

export function releaseWorkWallet(actor:Actor,input:{runId:string;operationId:string}):WalletOperation {
 assertActor(actor);assertBillingDemo();
 return getDb().transaction(()=>{
  const account=ensureAccount(actor),operation=readWorkWalletOperation(actor,input.operationId,input.runId);
  if(operation.status==='unknown')throw new AppError(409,'The job outcome is unresolved; its reservation must remain held.');
  if(operation.status==='settled'||operation.status==='released')return operation;
  const samePeriod=account.periodStart===operation.periodStart;
  append(actor,`job-release:${operation.id}`,{kind:'release',description:'Copilot job: unused fictional reservation released; completed work remains spent.',periodStart:operation.periodStart,includedDeltaCents:samePeriod?operation.includedReservedCents:0,purchasedDeltaCents:operation.purchasedReservedCents,reservedIncludedDeltaCents:-operation.includedReservedCents,reservedPurchasedDeltaCents:-operation.purchasedReservedCents,expiredCents:samePeriod?0:operation.includedReservedCents,operationId:operation.id});
  const updated:WalletOperation={...operation,includedReservedCents:0,purchasedReservedCents:0,status:operation.chargedCents?'settled':'released',updatedAt:now()};
  writeOperation(actor,updated);account.version++;writeAccount(actor,account);return updated;
 }).immediate();
}

export function markWorkWalletUnknown(actor:Actor,input:{runId:string;operationId:string}):WalletOperation {
 assertActor(actor);assertBillingDemo();
 return getDb().transaction(()=>{
  const account=ensureAccount(actor),operation=readWorkWalletOperation(actor,input.operationId,input.runId);
  if(operation.status==='unknown')return operation;
  if(operation.status!=='reserved')throw new AppError(409,'Only an outstanding job reservation can have an unresolved outcome.');
  const updated:WalletOperation={...operation,status:'unknown',updatedAt:now()};
  append(actor,`job-unknown:${operation.id}`,{kind:'unknown',description:'Copilot job outcome unresolved; unused maximum remains held.',periodStart:operation.periodStart,operationId:operation.id});
  writeOperation(actor,updated);account.version++;writeAccount(actor,account);return updated;
 }).immediate();
}
