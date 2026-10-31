import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {WorkBudget} from '../lib/wallet-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {requireFeature} from './billing';
import {assertBillingDemo} from './billing-provider';
import {settleRecordedWorkWalletUsage,consumeWorkWallet,markWorkWalletUnknown,releaseWorkWallet,reserveWorkWallet} from './wallet';

const id=z.string().trim().min(1).max(150);
const cents=z.number().int().nonnegative().max(100000);
const version=z.number().int().positive();
const quoteSchema=z.object({runId:id,planVersion:version,planHash:z.string().min(1).max(128),estimatedCents:cents,maximumCents:cents,costBasis:z.enum(['fictional_sample','metered_simulation']).default('fictional_sample')}).strict();
const decisionSchema=z.object({runId:id,quoteId:id,planVersion:version,decision:z.enum(['approve','deny']),eventKey:id}).strict();
const consumeSchema=z.object({runId:id,stepKey:id,amountCents:cents}).strict();
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const approvalThresholdCents=100;

function read(actor:Actor,runId:string):WorkBudget {
 assertActor(actor);assertBillingDemo();
 const row=getDb().prepare('SELECT data FROM work_budgets WHERE run_id=? AND organization_id=? AND office_id=? AND user_id=?').get(id.parse(runId),...scope(actor)) as {data:string}|undefined;
 if(!row)throw new AppError(404,'Job budget not found in your workspace.');
 return JSON.parse(row.data) as WorkBudget;
}
function write(actor:Actor,budget:WorkBudget){
 getDb().prepare('UPDATE work_budgets SET data=? WHERE run_id=? AND organization_id=? AND office_id=? AND user_id=?').run(JSON.stringify(budget),budget.runId,...scope(actor));
}
function event(actor:Actor,budget:WorkBudget,eventKey:string,payload:unknown):boolean {
 const hash=digest(payload),db=getDb();
 const old=db.prepare('SELECT payload_hash FROM work_budget_events WHERE run_id=? AND event_key=? AND organization_id=? AND office_id=? AND user_id=?').get(budget.runId,eventKey,...scope(actor)) as {payload_hash:string}|undefined;
 if(old){if(old.payload_hash!==hash)throw new AppError(409,'This job budget event already represents different work.');return false;}
 db.prepare('INSERT INTO work_budget_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('work_budget_event'),budget.runId,...scope(actor),eventKey,hash,JSON.stringify(payload),now());
 return true;
}
function validQuote(budget:WorkBudget){if(Date.parse(budget.expiresAt)<=Date.now())throw new AppError(409,'This job estimate expired. Refresh the estimate before continuing.');}

/** Internal server-priced quote. Callers derive these figures from validated capabilities, never HTTP/model prices. */
export function quoteWorkBudget(actor:Actor,input:z.input<typeof quoteSchema>):WorkBudget {
 assertActor(actor);assertBillingDemo();requireFeature(actor,'core');const parsed=quoteSchema.parse(input);
 if(parsed.estimatedCents>parsed.maximumCents)throw new AppError(400,'The estimate cannot exceed its maximum.');
 return getDb().transaction(()=>{
  const db=getDb();const row=db.prepare('SELECT organization_id,office_id,user_id,data FROM work_budgets WHERE run_id=?').get(parsed.runId) as {organization_id:string;office_id:string;user_id:string;data:string}|undefined;
  if(row&&(row.organization_id!==actor.organizationId||row.office_id!==actor.officeId||row.user_id!==actor.id))throw new AppError(404,'Job budget not found in your workspace.');
  const previous=row?JSON.parse(row.data) as WorkBudget:undefined;
  if(previous){
   if(parsed.planVersion<previous.planVersion)throw new AppError(409,'The job plan changed. Use its current estimate.');
   if(parsed.planVersion===previous.planVersion){
    if(parsed.costBasis!==previous.costBasis||parsed.planHash!==previous.planHash||parsed.estimatedCents!==previous.estimatedCents||parsed.maximumCents!==previous.maximumCents)throw new AppError(409,'Changed work requires a new plan version.');
    if(previous.status==='unknown')throw new AppError(409,'The job outcome is unresolved; reconcile it before revising work.');
    if(previous.status==='denied')return previous;
    if(previous.status==='reserved'||(Date.parse(previous.expiresAt)>Date.now()&&['awaiting_approval','approved'].includes(previous.status)))return previous;
   }
   if(previous.status==='unknown')throw new AppError(409,'The job outcome is unresolved; reconcile it before revising work.');
   if(parsed.maximumCents<previous.spentCents||parsed.estimatedCents<previous.spentCents)throw new AppError(409,'The revised total cannot erase work already performed.');
   if(previous.operationId)releaseWorkWallet(actor,{runId:previous.runId,operationId:previous.operationId});
  }
  const budget:WorkBudget={...parsed,quoteId:newId('work_quote'),spentCents:previous?.spentCents??0,reservedCents:0,approvedMaximumCents:parsed.maximumCents<=approvalThresholdCents?parsed.maximumCents:null,status:parsed.maximumCents<=approvalThresholdCents?'approved':'awaiting_approval',expiresAt:new Date(Date.now()+15*60_000).toISOString(),createdAt:previous?.createdAt??now(),updatedAt:now(),rateVersion:1,costBasis:parsed.costBasis,operationId:null};
  if(previous)write(actor,budget);else db.prepare('INSERT INTO work_budgets VALUES(?,?,?,?,?)').run(budget.runId,...scope(actor),JSON.stringify(budget));
  event(actor,budget,`quote:${budget.quoteId}`,{kind:'quote',...budget});
  audit(actor,'work.budget_quoted',budget.runId,{planVersion:budget.planVersion,maximumCents:budget.maximumCents,simulated:true});
  return budget;
 }).immediate();
}

export function getWorkBudget(actor:Actor,runId:string):WorkBudget {return read(actor,runId);}

/** Only explicit employee action services may call this; no model approval tool is exposed. */
export function decideWorkBudget(actor:Actor,input:z.input<typeof decisionSchema>):WorkBudget {
 const parsed=decisionSchema.parse(input);assertActor(actor);assertBillingDemo();
 return getDb().transaction(()=>{
  const budget=read(actor,parsed.runId);
  if(budget.quoteId!==parsed.quoteId||budget.planVersion!==parsed.planVersion)throw new AppError(409,'This job estimate changed. Review the current scope and maximum.');
  if(!event(actor,budget,`decision:${parsed.eventKey}`,parsed))return budget;
  if(budget.status!=='awaiting_approval')throw new AppError(409,'This job estimate is not awaiting a decision.');
  validQuote(budget);
  if(parsed.decision==='approve')requireFeature(actor,'core');
  const updated:WorkBudget={...budget,status:parsed.decision==='approve'?'approved':'denied',approvedMaximumCents:parsed.decision==='approve'?budget.maximumCents:null,updatedAt:now()};
  write(actor,updated);audit(actor,`work.cost_${parsed.decision}`,budget.runId,{quoteId:budget.quoteId,maximumCents:budget.maximumCents,simulated:true});return updated;
 }).immediate();
}

export function reserveWorkBudget(actor:Actor,runId:string):WorkBudget {
 assertActor(actor);assertBillingDemo();requireFeature(actor,'core');
 return getDb().transaction(()=>{
  const budget=read(actor,runId);
  if(budget.status==='reserved')return budget;
  if(budget.status==='unknown')throw new AppError(409,'The prior job outcome is unresolved; do not repeat its work.');
  if(budget.status!=='approved'||budget.approvedMaximumCents===null||budget.maximumCents>budget.approvedMaximumCents)throw new AppError(409,'Review and approve the current job maximum before starting.');
  validQuote(budget);const remaining=budget.maximumCents-budget.spentCents;
  const operation=remaining?reserveWorkWallet(actor,{runId:budget.runId,quoteId:budget.quoteId,maximumCents:remaining,expiresAt:budget.expiresAt,costBasis:budget.costBasis}):null;
  const updated:WorkBudget={...budget,status:'reserved',reservedCents:remaining,operationId:operation?.id??null,updatedAt:now()};
  write(actor,updated);event(actor,updated,`reserve:${budget.quoteId}`,{kind:'reserve',quoteId:budget.quoteId,remainingCents:remaining});return updated;
 }).immediate();
}

/** Settle only after the corresponding local step and its receipt succeed in the SAME outer transaction. */
export function consumeWorkBudget(actor:Actor,input:z.input<typeof consumeSchema>):WorkBudget {requireFeature(actor,'core');return consumeBudget(actor,input,false);}
/** Internal receipt reconciliation only. Never exposes execution or approval authority. */
export function settleRecordedWorkBudgetUsage(actor:Actor,input:z.input<typeof consumeSchema>):WorkBudget {return consumeBudget(actor,input,true);}
function consumeBudget(actor:Actor,input:z.input<typeof consumeSchema>,receipt:boolean):WorkBudget {
 assertActor(actor);assertBillingDemo();const parsed=consumeSchema.parse(input);
 return getDb().transaction(()=>{
  const budget=read(actor,parsed.runId);
  if(receipt&&budget.costBasis!=='metered_simulation')throw new AppError(409,'Receipt settlement requires a metered assignment.');
  if(!event(actor,budget,`step:${parsed.stepKey}`,{kind:'step',stepKey:parsed.stepKey,amountCents:parsed.amountCents}))return budget;
  if(budget.status!=='reserved')throw new AppError(409,'Reserve the approved job maximum before performing a step.');
  if(budget.approvedMaximumCents===null||budget.spentCents+parsed.amountCents>budget.approvedMaximumCents||parsed.amountCents>budget.reservedCents)throw new AppError(409,'This step would exceed the approved job maximum. Request a revised estimate.');
  if(parsed.amountCents){
   if(!budget.operationId)throw new AppError(409,'This job has no outstanding credit reservation.');
   (receipt?settleRecordedWorkWalletUsage:consumeWorkWallet)(actor,{runId:budget.runId,operationId:budget.operationId,stepKey:parsed.stepKey,amountCents:parsed.amountCents});
  }
  const updated:WorkBudget={...budget,spentCents:budget.spentCents+parsed.amountCents,reservedCents:budget.reservedCents-parsed.amountCents,updatedAt:now()};
  write(actor,updated);return updated;
 }).immediate();
}

/** Cancel/failure/final completion releases unused credit, not settled work. Unknown work stays held. */
export function releaseWorkBudget(actor:Actor,runId:string):WorkBudget {
 assertActor(actor);assertBillingDemo();return getDb().transaction(()=>{
  const budget=read(actor,runId);
  if(budget.status==='unknown')throw new AppError(409,'The job outcome is unresolved; its reservation must remain held.');
  if(budget.status==='released'||budget.status==='settled')return budget;
  if(budget.operationId)releaseWorkWallet(actor,{runId:budget.runId,operationId:budget.operationId});
  const updated:WorkBudget={...budget,reservedCents:0,status:budget.spentCents?'settled':'released',updatedAt:now()};
  write(actor,updated);event(actor,updated,`release:${budget.quoteId}`,{kind:'release',quoteId:budget.quoteId,spentCents:budget.spentCents});return updated;
 }).immediate();
}

export function markWorkBudgetUnknown(actor:Actor,runId:string):WorkBudget {
 assertActor(actor);assertBillingDemo();return getDb().transaction(()=>{
  const budget=read(actor,runId);if(budget.status==='unknown')return budget;
  if(budget.status!=='reserved'||!budget.operationId)throw new AppError(409,'Only an outstanding job reservation can have an unresolved outcome.');
  markWorkWalletUnknown(actor,{runId:budget.runId,operationId:budget.operationId});
  const updated:WorkBudget={...budget,status:'unknown',updatedAt:now()};write(actor,updated);
  event(actor,updated,`unknown:${budget.quoteId}`,{kind:'unknown',quoteId:budget.quoteId});return updated;
 }).immediate();
}

export type {WorkBudget};
