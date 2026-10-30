import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Actor} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {assignEnterpriseSeat,billingPolicy,saveBillingPolicy,simulateLifecycle,subscription} from '../src/server/billing';
import {estimateWalletWork,getWalletState,resolveWalletWork,simulateWalletWork,topUpWallet,updateWalletSettings} from '../src/server/wallet';
import type {WalletScenarioId} from '../src/lib/wallet-contracts';

let actor:Actor,admin:Actor,sequence=0;
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const next=()=>`wallet-test-${++sequence}`;
const current=()=>getWalletState(actor);
function topup(amountCents:1000|2500|5000|10000=1000){return topUpWallet(actor,{amountCents,expectedVersion:current().version,eventKey:next()});}
function work(scenarioId:WalletScenarioId='reply-draft',outcome:'reserve'|'success'|'cancel'|'unknown'='success'){
 const quote=estimateWalletWork(actor,{scenarioId});return simulateWalletWork(actor,{quoteId:quote.id,outcome,expectedVersion:current().version,eventKey:next()});
}
function resolve(operationId:string,outcome:'success'|'cancel'){return resolveWalletWork(actor,{operationId,outcome,expectedVersion:current().version,eventKey:next()});}
function lifecycle(action:'cancel_now'|'resume'|'renew'|'payment_failed'|'payment_recovered'){
 return simulateLifecycle(admin,{userId:actor.id,action,expectedVersion:subscription(actor).version,eventKey:next()});
}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T14:00:00Z'));actor=demoActor();admin=demoActor('manager');sequence=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('demonstration credit wallet',()=>{
 it('grants $15 once for the period and clearly separates sample balance from live usage',()=>{
  const first=current(),second=current();expect(second).toEqual(first);
  expect(first).toMatchObject({monthlyIncludedCents:1500,includedCents:1500,purchasedCents:0,availableCents:1500,reservedCents:0,monthlySpendLimitCents:2500,mode:'demonstration',liveUsageDebiting:false});
  expect(first.ledger.filter(entry=>entry.kind==='monthly_credit')).toHaveLength(1);
  expect(first.notice).toMatch(/do not collect payment/);expect(first.notice).toMatch(/do not debit this wallet/);
 });
 it('persists purchased credits with idempotent topups and rejects conflicting or stale requests',()=>{
  const input={amountCents:2500 as const,expectedVersion:current().version,eventKey:'same-topup'};
  const first=topUpWallet(actor,input);expect(first.purchasedCents).toBe(2500);expect(topUpWallet(actor,input)).toEqual(first);
  expect(()=>topUpWallet(actor,{...input,amountCents:1000})).toThrow('different action');
  expect(()=>topUpWallet(actor,{...input,eventKey:'stale'})).toThrow('Wallet changed');
  expect(current().ledger.filter(entry=>entry.kind==='topup')).toHaveLength(1);
 });
 it('accepts only server-defined topups and prevents fabricated cost or recipient fields',()=>{
  const input={amountCents:1000 as const,expectedVersion:current().version,eventKey:next()};
  expect(()=>topUpWallet(actor,{...input,amountCents:1 as 1000})).toThrow();
  expect(()=>topUpWallet(actor,{...input,userId:other.id} as typeof input)).toThrow();
  expect(()=>estimateWalletWork(actor,{scenarioId:'reply-draft',successCents:0} as {scenarioId:'reply-draft'})).toThrow();
  expect(current().availableCents).toBe(1500);
 });
 it('reserves a disclosed maximum, settles sample usage, and returns the unused amount',()=>{
  const held=work('investor-research','reserve'),operation=held.operations[0];
  expect(held).toMatchObject({includedCents:1000,reservedCents:500,reservedThisPeriodCents:500,spentThisPeriodCents:0});
  expect(operation.quote).toMatchObject({rateVersion:1,markupMultiplier:5,costBasis:'fictional_sample',maximumCents:500,successCents:350});
  const settled=resolve(operation.id,'success');expect(settled).toMatchObject({includedCents:1150,reservedCents:0,spentThisPeriodCents:350});
  expect(settled.operations[0]).toMatchObject({status:'settled',chargedCents:350});
  expect(settled.ledger[0]).toMatchObject({kind:'settlement',includedDeltaCents:150,chargedCents:350});
 });
 it('consumes included credits first then returns unused purchased reservation',()=>{
  topup();for(let count=0;count<4;count++)work('investor-research');
  expect(current()).toMatchObject({includedCents:100,purchasedCents:1000,spentThisPeriodCents:1400});
  const held=work('investor-research','reserve');expect(held).toMatchObject({includedCents:0,purchasedCents:600,reservedCents:500});
  expect(held.operations[0]).toMatchObject({includedReservedCents:100,purchasedReservedCents:400});
  const settled=resolve(held.operations[0].id,'success');expect(settled).toMatchObject({includedCents:0,purchasedCents:750,reservedCents:0,spentThisPeriodCents:1750});
 });
 it('keeps uncertain work reserved until explicitly reconciled as a fictional result',()=>{
  const held=work('relationship-briefing','unknown');expect(held.reservedCents).toBe(150);expect(held.operations[0].status).toBe('unknown');
  expect(current().reservedCents).toBe(150);
  const released=resolve(held.operations[0].id,'cancel');expect(released).toMatchObject({includedCents:1500,reservedCents:0,spentThisPeriodCents:0});
  expect(released.operations[0].status).toBe('released');
  expect(()=>resolve(held.operations[0].id,'success')).toThrow('already finished');
 });
 it('keeps older unresolved holds visible and resolvable beyond the completed-history window',()=>{
  topup();const held=work('reply-draft','unknown'),operation=held.operations[0];
  for(let count=0;count<51;count++)work('reply-draft','success');
  const state=current();expect(state.reservedCents).toBe(50);
  expect(state.operations.filter(item=>item.status==='settled')).toHaveLength(50);
  expect(state.operations.find(item=>item.id===operation.id)?.status).toBe('unknown');
  expect(resolve(operation.id,'cancel').reservedCents).toBe(0);
 });
 it('cannot reuse a quote to reserve or charge work twice',()=>{
  const quote=estimateWalletWork(actor,{scenarioId:'reply-draft'}),input={quoteId:quote.id,outcome:'success' as const,expectedVersion:current().version,eventKey:next()};
  const first=simulateWalletWork(actor,input);expect(simulateWalletWork(actor,input)).toEqual(first);
  expect(()=>simulateWalletWork(actor,{...input,eventKey:next(),expectedVersion:current().version})).toThrow('already has sample work');
  expect(first.spentThisPeriodCents).toBe(40);
 });
 it('deduplicates resolution without changing balances a second time',()=>{
  const held=work('reply-draft','reserve'),input={operationId:held.operations[0].id,outcome:'success' as const,expectedVersion:held.version,eventKey:next()};
  const first=resolveWalletWork(actor,input);expect(resolveWalletWork(actor,input)).toEqual(first);
  expect(()=>resolveWalletWork(actor,{...input,outcome:'cancel'})).toThrow('different action');
  expect(current().spentThisPeriodCents).toBe(40);
 });
 it('enforces monthly limits against spent plus reserved amounts before sample work',()=>{
  updateWalletSettings(actor,{monthlySpendLimitCents:500,expectedVersion:current().version,eventKey:next()});
  const held=work('investor-research','reserve');expect(held.spendRemainingCents).toBe(0);
  expect(()=>work('reply-draft')).toThrow('monthly spending limit');
  expect(()=>updateWalletSettings(actor,{monthlySpendLimitCents:499,expectedVersion:current().version,eventKey:next()})).toThrow('spent or reserved');
  resolve(held.operations[0].id,'success');expect(current().spendRemainingCents).toBe(150);
  work('relationship-briefing');expect(current().spentThisPeriodCents).toBe(450);
 });
 it('blocks spending beyond available credit even with a high spend limit',()=>{
  updateWalletSettings(actor,{monthlySpendLimitCents:100000,expectedVersion:current().version,eventKey:next()});
  work('investor-research','reserve');work('investor-research','reserve');work('investor-research','reserve');
  expect(current()).toMatchObject({availableCents:0,lowBalance:true,reservedCents:1500});
  expect(()=>work('reply-draft')).toThrow('Not enough available credits');
 });
 it('expires unspent monthly credits and carries purchased credits without duplicate grants',()=>{
  topup(2500);work();lifecycle('renew');
  const renewed=current();expect(renewed).toMatchObject({includedCents:1500,purchasedCents:2500,spentThisPeriodCents:0});
  expect(renewed.ledger.filter(entry=>entry.kind==='expiration')[0].expiredCents).toBe(1460);
  expect(renewed.ledger.filter(entry=>entry.kind==='monthly_credit')).toHaveLength(2);
  expect(current()).toEqual(renewed);
 });
 it('does not refill monthly credits when the company takes over a retail seat',()=>{
  work();const before=current();
  assignEnterpriseSeat(admin,{userId:actor.id,enabled:true,agreementLabel:'Fictional pilot seat',expectedVersion:subscription(actor).version,eventKey:next()});
  expect(current()).toMatchObject({includedCents:before.includedCents,periodStart:before.periodStart,monthlyIncludedCents:1500});
  expect(current().ledger.filter(entry=>entry.kind==='monthly_credit')).toHaveLength(1);
 });
 it('renews included credits for independently company-sponsored access after personal cancellation',()=>{
  const policy=billingPolicy(admin);policy.required.dispositions=['core'];saveBillingPolicy(admin,policy);work();lifecycle('cancel_now');
  vi.setSystemTime(new Date('2026-11-30T14:00:00Z'));
  expect(current()).toMatchObject({canSpend:true,includedCents:1500,spentThisPeriodCents:0});
  expect(current().ledger.filter(entry=>entry.kind==='monthly_credit')).toHaveLength(2);
  expect(subscription(actor).status).toBe('canceled');
 });
 it('does not return expired monthly credits when an old hold is canceled in a new period',()=>{
  topup();for(let count=0;count<4;count++)work('investor-research');
  const held=work('investor-research','unknown');expect(held.operations[0]).toMatchObject({includedReservedCents:100,purchasedReservedCents:400});
  lifecycle('renew');expect(current()).toMatchObject({includedCents:1500,purchasedCents:600,reservedCents:500,spentThisPeriodCents:0});
  const released=resolve(held.operations[0].id,'cancel');expect(released).toMatchObject({includedCents:1500,purchasedCents:1000,reservedCents:0,spentThisPeriodCents:0});
  expect(released.ledger[0]).toMatchObject({expiredCents:100,includedDeltaCents:0,purchasedDeltaCents:400});
 });
 it('settles old-period holds without consuming a new period grant or counting twice',()=>{
  const held=work('investor-research','reserve');lifecycle('renew');
  const settled=resolve(held.operations[0].id,'success');expect(settled).toMatchObject({includedCents:1500,reservedCents:0,spentThisPeriodCents:0});
  expect(settled.ledger[0]).toMatchObject({expiredCents:150,chargedCents:350});
 });
 it('preserves history and purchased credits while blocking new work after cancellation',()=>{
  topup();const held=work('reply-draft','reserve');lifecycle('cancel_now');
  expect(current()).toMatchObject({canSpend:false,canTopUp:false,purchasedCents:1000});
  expect(()=>topup()).toThrow();expect(()=>estimateWalletWork(actor,{scenarioId:'reply-draft'})).toThrow();
  expect(resolve(held.operations[0].id,'cancel')).toMatchObject({includedCents:1500,purchasedCents:1000,reservedCents:0});
  lifecycle('resume');expect(current().ledger.filter(entry=>entry.kind==='monthly_credit')).toHaveLength(1);
 });
 it('blocks disabled personal purchases while retaining existing credits for permitted work',()=>{
  const policy=billingPolicy(admin);policy.purchasesEnabled=false;saveBillingPolicy(admin,policy);
  expect(current()).toMatchObject({canSpend:true,canTopUp:false});expect(()=>topup()).toThrow('disabled');
  expect(work().spentThisPeriodCents).toBe(40);
 });
 it('rechecks company restrictions after an estimate was prepared',()=>{
  const quote=estimateWalletWork(actor,{scenarioId:'investor-research'});const policy=billingPolicy(admin);policy.restricted=['investor-hunter'];saveBillingPolicy(admin,policy);
  expect(()=>simulateWalletWork(actor,{quoteId:quote.id,outcome:'success',expectedVersion:current().version,eventKey:next()})).toThrow('Restricted');
  expect(current().reservedCents).toBe(0);
 });
 it('expires estimates without reserving anything',()=>{
  const quote=estimateWalletWork(actor,{scenarioId:'reply-draft'});vi.advanceTimersByTime(15*60_000);
  expect(()=>simulateWalletWork(actor,{quoteId:quote.id,outcome:'reserve',expectedVersion:current().version,eventKey:next()})).toThrow('expired');
  expect(current().availableCents).toBe(1500);
 });
 it('keeps wallets, estimates and resolutions private even from another organization or manager',()=>{
  const quote=estimateWalletWork(actor,{scenarioId:'reply-draft'}),held=work('reply-draft','reserve');
  for(const stranger of [other,admin]){
   const state=getWalletState(stranger);
   expect(()=>simulateWalletWork(stranger,{quoteId:quote.id,outcome:'reserve',expectedVersion:state.version,eventKey:next()})).toThrow('not found');
   expect(()=>resolveWalletWork(stranger,{operationId:held.operations[0].id,outcome:'cancel',expectedVersion:state.version,eventKey:next()})).toThrow('not found');
   expect(state.operations).toHaveLength(0);
  }
  expect(()=>getWalletState({...actor,officeId:'office-other'})).toThrow('not authorized');
 });
 it('uses one employee wallet across authorized offices without repeating grants or event keys',()=>{
  const db=getDb();db.prepare('INSERT INTO offices(id,organization_id,name) VALUES(?,?,?)').run('office-second',actor.organizationId,'Second demo office');
  db.prepare('INSERT INTO memberships(organization_id,office_id,user_id,role) VALUES(?,?,?,?)').run(actor.organizationId,'office-second',actor.id,actor.role);
  const secondOffice={...actor,officeId:'office-second'},initial=current();
  expect(getWalletState(secondOffice)).toEqual(initial);
  const input={amountCents:1000 as const,expectedVersion:initial.version,eventKey:'cross-office-topup'};
  const funded=topUpWallet(actor,input);expect(topUpWallet(secondOffice,input)).toEqual(funded);
  const quote=estimateWalletWork(actor,{scenarioId:'reply-draft'});
  simulateWalletWork(secondOffice,{quoteId:quote.id,outcome:'success',expectedVersion:funded.version,eventKey:next()});
  expect(current()).toMatchObject({includedCents:1460,purchasedCents:1000,spentThisPeriodCents:40});
  expect(current().ledger.filter(entry=>entry.kind==='monthly_credit')).toHaveLength(1);
  expect(db.prepare('SELECT COUNT(*) n FROM wallet_accounts WHERE organization_id=? AND user_id=?').get(actor.organizationId,actor.id)).toEqual({n:1});
  expect(db.prepare("SELECT office_id FROM wallet_ledger WHERE event_key LIKE 'reserve:%'").get()).toEqual({office_id:'office-second'});
 });
 it('makes financial history append-only and never calls an external provider',()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);topup();work();
  expect(fetch).not.toHaveBeenCalled();
  expect(()=>getDb().prepare('UPDATE wallet_ledger SET data=data').run()).toThrow('append-only');
  expect(()=>getDb().prepare('DELETE FROM wallet_ledger').run()).toThrow('append-only');
  expect(()=>getDb().prepare('DELETE FROM wallet_events').run()).toThrow('append-only');
 });
 it('fails closed outside demo mode',()=>{vi.stubEnv('AGENTDESK_DEMO','false');expect(()=>getWalletState(actor)).toThrow('demo');});
 it('persists balance, pending holds and idempotency after a database restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-wallet-restart-'));closeDb();vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'wallet.sqlite'));
  try{
   actor=demoActor();admin=demoActor('manager');const input={amountCents:1000 as const,expectedVersion:current().version,eventKey:'durable-topup'};
   topUpWallet(actor,input);work('reply-draft','unknown');const before=current();closeDb();actor=demoActor();
   expect(current()).toEqual(before);expect(topUpWallet(actor,input)).toEqual(before);
  }finally{closeDb();rmSync(directory,{recursive:true,force:true});}
 });
});
