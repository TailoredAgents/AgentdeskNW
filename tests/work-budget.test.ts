import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Actor} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {simulateLifecycle,subscription} from '../src/server/billing';
import {getWalletState,resolveWalletWork,simulateWalletWork,topUpWallet,updateWalletSettings} from '../src/server/wallet';
import {consumeWorkBudget,decideWorkBudget,getWorkBudget,markWorkBudgetUnknown,quoteWorkBudget,releaseWorkBudget,reserveWorkBudget} from '../src/server/work-budget';

let actor:Actor,admin:Actor;
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const quote=(maximumCents:number,runId='run-budget',planVersion=1)=>quoteWorkBudget(actor,{runId,planVersion,planHash:`plan-${planVersion}`,estimatedCents:maximumCents,maximumCents});
const approve=(runId='run-budget',eventKey='approval')=>{const budget=getWorkBudget(actor,runId);return decideWorkBudget(actor,{runId,quoteId:budget.quoteId,planVersion:budget.planVersion,decision:'approve',eventKey});};
const consumeStep=(amountCents:number,stepKey='step-1',runId='run-budget')=>consumeWorkBudget(actor,{runId,stepKey,amountCents});
const wallet=()=>getWalletState(actor);

beforeEach(()=>{
 closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));actor=demoActor();admin=demoActor('manager');
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('whole-job fictional budgets',()=>{
 it.each([99,100])('allows a %ic whole-job bound without extra cost approval',maximum=>{
  expect(quote(maximum)).toMatchObject({status:'approved',approvedMaximumCents:maximum,costBasis:'fictional_sample'});
  expect(reserveWorkBudget(actor,'run-budget').reservedCents).toBe(maximum);
  consumeStep(maximum);expect(releaseWorkBudget(actor,'run-budget')).toMatchObject({spentCents:maximum,reservedCents:0,status:'settled'});
  expect(wallet()).toMatchObject({availableCents:1500-maximum,reservedCents:0,spentThisPeriodCents:maximum,liveUsageDebiting:false});
 });
 it('requires employee approval before an aggregate $1.01 job begins',()=>{
  const initial=quote(101);expect(initial.status).toBe('awaiting_approval');expect(initial.approvedMaximumCents).toBeNull();
  expect(()=>reserveWorkBudget(actor,initial.runId)).toThrow('approve');expect(wallet().reservedCents).toBe(0);
  approve();reserveWorkBudget(actor,initial.runId);consumeStep(40,'one');consumeStep(40,'two');consumeStep(21,'three');
  expect(getWorkBudget(actor,initial.runId)).toMatchObject({spentCents:101,reservedCents:0});expect(wallet().spentThisPeriodCents).toBe(101);
 });
 it('denial and top-ups cannot authorize work, and stale quotes cannot approve revised scope',()=>{
  const initial=quote(150);decideWorkBudget(actor,{runId:initial.runId,quoteId:initial.quoteId,planVersion:1,decision:'deny',eventKey:'no'});
  const current=wallet();topUpWallet(actor,{amountCents:1000,expectedVersion:current.version,eventKey:'topup'});
  expect(()=>reserveWorkBudget(actor,initial.runId)).toThrow('approve');expect(quote(150).status).toBe('denied');
  const revised=quote(175,initial.runId,2);expect(revised.status).toBe('awaiting_approval');
  expect(()=>decideWorkBudget(actor,{runId:initial.runId,quoteId:initial.quoteId,planVersion:1,decision:'approve',eventKey:'stale'})).toThrow('changed');
  expect(wallet()).toMatchObject({spentThisPeriodCents:0,reservedCents:0});
 });
 it('expires unstarted quotes and requires fresh approval, while reserved work retains its maximum',()=>{
  const initial=quote(125);approve();vi.advanceTimersByTime(16*60_000);
  expect(()=>reserveWorkBudget(actor,initial.runId)).toThrow('expired');
  const refreshed=quote(125);expect(refreshed.quoteId).not.toBe(initial.quoteId);expect(refreshed.status).toBe('awaiting_approval');
  approve('run-budget','refreshed-approval');reserveWorkBudget(actor,initial.runId);vi.advanceTimersByTime(16*60_000);consumeStep(25);expect(getWorkBudget(actor,initial.runId).spentCents).toBe(25);
 });
 it('retains consumed work when a job grows past $1 and pauses until the new total is approved',()=>{
  quote(80);reserveWorkBudget(actor,'run-budget');consumeStep(30);
  const revised=quote(130,'run-budget',2);expect(revised).toMatchObject({spentCents:30,reservedCents:0,maximumCents:130,status:'awaiting_approval'});
  expect(wallet()).toMatchObject({availableCents:1470,reservedCents:0,spentThisPeriodCents:30});
  expect(()=>consumeStep(10,'new')).toThrow('Reserve');approve();reserveWorkBudget(actor,'run-budget');consumeStep(70,'new');
  expect(getWorkBudget(actor,'run-budget')).toMatchObject({spentCents:100,reservedCents:30});
  expect(()=>consumeStep(31,'too-much')).toThrow('exceed');releaseWorkBudget(actor,'run-budget');
  expect(wallet()).toMatchObject({availableCents:1400,reservedCents:0,spentThisPeriodCents:100});
 });
 it('requires renewed approval when an approved job grows, preserving its completed charges',()=>{
  quote(120);approve();reserveWorkBudget(actor,'run-budget');consumeStep(60);
  expect(quote(180,'run-budget',2)).toMatchObject({spentCents:60,approvedMaximumCents:null,status:'awaiting_approval'});
  expect(()=>reserveWorkBudget(actor,'run-budget')).toThrow('approve');
  const current=getWorkBudget(actor,'run-budget');decideWorkBudget(actor,{runId:current.runId,quoteId:current.quoteId,planVersion:2,decision:'deny',eventKey:'deny-more'});
  releaseWorkBudget(actor,'run-budget');expect(wallet()).toMatchObject({availableCents:1440,reservedCents:0,spentThisPeriodCents:60});
 });
 it('cancels only unused credits and leaves partial settled usage charged',()=>{
  quote(100);reserveWorkBudget(actor,'run-budget');consumeStep(35);
  expect(wallet()).toMatchObject({reservedCents:65,reservedThisPeriodCents:65,spentThisPeriodCents:35,availableCents:1400});
  const released=releaseWorkBudget(actor,'run-budget');expect(released).toMatchObject({spentCents:35,reservedCents:0});
  expect(releaseWorkBudget(actor,'run-budget')).toEqual(released);
  expect(wallet()).toMatchObject({reservedCents:0,spentThisPeriodCents:35,availableCents:1465});
 });
 it('retains unknown holds and forbids re-quote, release, dispatch or manual wallet resolution',()=>{
  quote(100);reserveWorkBudget(actor,'run-budget');consumeStep(20);const unknown=markWorkBudgetUnknown(actor,'run-budget');
  expect(unknown).toMatchObject({status:'unknown',spentCents:20,reservedCents:80});
  expect(()=>releaseWorkBudget(actor,unknown.runId)).toThrow('unresolved');expect(()=>quote(150,unknown.runId,2)).toThrow('unresolved');expect(()=>reserveWorkBudget(actor,unknown.runId)).toThrow('unresolved');
  expect(()=>resolveWalletWork(actor,{operationId:unknown.operationId!,outcome:'cancel',expectedVersion:wallet().version,eventKey:'manual'})).toThrow('managed by its work run');
  expect(wallet()).toMatchObject({reservedCents:80,spentThisPeriodCents:20,availableCents:1400});
 });
 it('shares caps and balances with simultaneous jobs and existing sample work',()=>{
  updateWalletSettings(actor,{monthlySpendLimitCents:100,expectedVersion:wallet().version,eventKey:'cap'});
  quote(80,'one');quote(30,'two');reserveWorkBudget(actor,'one');
  expect(()=>reserveWorkBudget(actor,'two')).toThrow('monthly spending limit');consumeStep(20,'first','one');
  expect(wallet()).toMatchObject({spentThisPeriodCents:20,reservedThisPeriodCents:60,spendRemainingCents:20});
  releaseWorkBudget(actor,'one');reserveWorkBudget(actor,'two');expect(wallet().reservedThisPeriodCents).toBe(30);
 });
 it('reserves atomically against available funds even with a large cap',()=>{
  updateWalletSettings(actor,{monthlySpendLimitCents:100000,expectedVersion:wallet().version,eventKey:'cap'});
  quote(1400,'one');approve('one');reserveWorkBudget(actor,'one');quote(150,'two');approve('two');
  expect(()=>reserveWorkBudget(actor,'two')).toThrow('Not enough');expect(wallet().reservedCents).toBe(1400);
  expect(getWorkBudget(actor,'two')).toMatchObject({status:'approved',reservedCents:0,operationId:null});
 });
 it('deduplicates quote, approval, reservation and step settlement while rejecting conflicting receipts',()=>{
  const initial=quote(150);expect(quote(150)).toEqual(initial);const approved=approve();expect(approve()).toEqual(approved);
  const reserved=reserveWorkBudget(actor,initial.runId);expect(reserveWorkBudget(actor,initial.runId)).toEqual(reserved);
  const first=consumeStep(60);expect(consumeStep(60)).toEqual(first);expect(()=>consumeStep(61)).toThrow('different work');
  expect(()=>quoteWorkBudget(actor,{runId:initial.runId,planVersion:1,planHash:'different',estimatedCents:150,maximumCents:150})).toThrow('new plan version');
  expect(wallet()).toMatchObject({spentThisPeriodCents:60,reservedCents:90});
 });
 it('rolls wallet settlement back with the surrounding local mutation receipt',()=>{
  quote(100);reserveWorkBudget(actor,'run-budget');
  expect(()=>getDb().transaction(()=>{consumeStep(40);throw new Error('Local step failed');})()).toThrow('Local step failed');
  expect(getWorkBudget(actor,'run-budget')).toMatchObject({spentCents:0,reservedCents:100});expect(wallet().spentThisPeriodCents).toBe(0);
  consumeStep(40);expect(wallet().spentThisPeriodCents).toBe(40);
 });
 it('keeps budgets private across tenants, employees and offices',()=>{
  quote(90);expect(()=>getWorkBudget(other,'run-budget')).toThrow('not found');expect(()=>getWorkBudget(admin,'run-budget')).toThrow('not found');
  getDb().prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(actor.organizationId,'office-savannah',actor.id,actor.role);
  const moved={...actor,officeId:'office-savannah'};expect(()=>getWorkBudget(moved,'run-budget')).toThrow('not found');
  expect(()=>quoteWorkBudget(moved,{runId:'run-budget',planVersion:2,planHash:'plan-2',estimatedCents:90,maximumCents:90})).toThrow('not found');
 });
 it('rechecks membership and entitlement before consumption but allows historical reads and unused release after cancellation',()=>{
  quote(100);reserveWorkBudget(actor,'run-budget');consumeStep(25);
  simulateLifecycle(admin,{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:'cancel-sub'});
  expect(()=>consumeStep(25,'second')).toThrow();expect(getWorkBudget(actor,'run-budget').spentCents).toBe(25);releaseWorkBudget(actor,'run-budget');
  expect(wallet()).toMatchObject({reservedCents:0,spentThisPeriodCents:25});
  getDb().prepare('UPDATE memberships SET role=? WHERE organization_id=? AND office_id=? AND user_id=?').run('acquisitions',actor.organizationId,actor.officeId,actor.id);
  expect(()=>getWorkBudget(actor,'run-budget')).toThrow('not authorized');
 });
 it('does not restore expired included credits when a previous-period job releases unused funds',()=>{
  quote(150);approve();reserveWorkBudget(actor,'run-budget');consumeStep(30);
  vi.advanceTimersByTime(32*24*60*60_000);simulateLifecycle(admin,{userId:actor.id,action:'renew',expectedVersion:subscription(actor).version,eventKey:'renew'});
  const before=wallet();expect(before.reservedCents).toBe(120);
  releaseWorkBudget(actor,'run-budget');const after=wallet();expect(after.availableCents).toBe(before.availableCents);expect(after.reservedCents).toBe(0);
  expect(after.ledger.some(entry=>entry.expiredCents===120)).toBe(true);
 });
 it('rejects using job quotes through the standalone sample simulator',()=>{
  quote(100);const reserved=reserveWorkBudget(actor,'run-budget');
  expect(()=>simulateWalletWork(actor,{quoteId:reserved.quoteId,outcome:'success',expectedVersion:wallet().version,eventKey:'bypass'})).toThrow('managed by its work run');
  expect(wallet()).toMatchObject({spentThisPeriodCents:0,reservedCents:100});
 });
 it('supports free steps without a fabricated provider cost or wallet charge',()=>{
  quote(0);reserveWorkBudget(actor,'run-budget');consumeStep(0,'one');consumeStep(0,'two');releaseWorkBudget(actor,'run-budget');
  expect(wallet()).toMatchObject({availableCents:1500,reservedCents:0,spentThisPeriodCents:0});
  expect(wallet().operations).toHaveLength(0);
 });
 it('persists unfinished budget and partial receipts across database restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-work-budget-'));
  try{
   closeDb();vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'demo.sqlite'));actor=demoActor();quote(100);reserveWorkBudget(actor,'run-budget');consumeStep(40);
   closeDb();actor=demoActor();expect(getWorkBudget(actor,'run-budget')).toMatchObject({spentCents:40,reservedCents:60,status:'reserved'});consumeStep(40);consumeStep(30,'second');releaseWorkBudget(actor,'run-budget');
   expect(wallet()).toMatchObject({availableCents:1430,reservedCents:0,spentThisPeriodCents:70});
  }finally{closeDb();rmSync(directory,{recursive:true,force:true});}
 });
});
