import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {MeteredAssignment,MeteredAttempt,MeteredPart,MeteredRate,UsageUnits} from '../lib/metered-work-contracts';
import {AppError,assertActor,getDb,newId,now} from './db';
import {assertBillingDemo} from './billing-provider';
import {requireFeature} from './billing';
import {fingerprint} from './provider-runtime';
import {quoteWorkBudget,getWorkBudget,decideWorkBudget,reserveWorkBudget,releaseWorkBudget,settleRecordedWorkBudgetUsage} from './work-budget';

import {meteredRate,assertMeteredRateCurrent} from './metered-rates';

const id=z.string().trim().min(1).max(150),hash=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().min(0).max(1_000_000_000);
const units=z.record(z.string().min(1).max(80),count);
const part=z.object({key:id,parentKey:id.optional(),feature:id,rateId:id,maximumCalls:z.number().int().min(1).max(100),maximumUnits:units,estimatedUnits:units}).strict();
const quote=z.object({assignmentKey:id,title:z.string().trim().min(1).max(200),scopeHash:hash,revision:z.number().int().positive(),parts:z.array(part).min(1).max(40)}).strict();
const admit=z.object({assignmentId:id,revision:z.number().int().positive(),scopeHash:hash,attemptId:id,partKey:id,requestHash:hash,bounds:units}).strict();
const receipt=z.object({assignmentId:id,attemptId:id,status:z.enum(['succeeded','failed','canceled','unknown']),responseId:id.nullable(),usage:units.nullable(),providerCostMicros:count.nullable()}).strict();
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const unresolved=(attempt:MeteredAttempt)=>attempt.status==='dispatched'||attempt.status==='unknown';
const ceilCents=(nanos:number)=>Math.ceil(nanos/10_000_000);
function authorized(actor:Actor){assertActor(actor);assertBillingDemo();}
function priceNanos(value:UsageUnits,rate:MeteredRate):number {
 const prices=rate.customerNanosPerUnit??Object.fromEntries(Object.entries(rate.customerMicrosPerUnit).map(([key,n])=>[key,n*1000]));
 if(Object.keys(value).some(key=>prices[key]===undefined))throw new AppError(400,'Usage includes an unpriced unit; do not dispatch.');
 const total=Object.entries(value).reduce((sum,[key,n])=>sum+n*prices[key],0);
 if(!Number.isSafeInteger(total)||total>10_000_000_000_000)throw new AppError(400,'The usage bound is too large. Prepare a smaller bounded scope.');return total;
}
function within(value:UsageUnits,bound:UsageUnits){return Object.entries(value).every(([key,n])=>n<=(bound[key]??0));}
function sumUnits(values:UsageUnits[]):UsageUnits {const total:UsageUnits={};for(const value of values)for(const [key,n] of Object.entries(value))total[key]=(total[key]??0)+n;return total;}
function read(actor:Actor,assignmentId:string):MeteredAssignment {
 authorized(actor);const row=getDb().prepare('SELECT data FROM metered_assignments WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id.parse(assignmentId),...owner(actor)) as {data:string}|undefined;
 if(!row)throw new AppError(404,'Metered assignment not found in your workspace.');const value=JSON.parse(row.data) as MeteredAssignment;return {...value,budget:getWorkBudget(actor,value.id)};
}
function write(actor:Actor,value:MeteredAssignment){getDb().prepare('INSERT INTO metered_assignments VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id,...owner(actor),value.assignmentKey,JSON.stringify({...value,updatedAt:now()}));}
function event(actor:Actor,value:MeteredAssignment,key:string,payload:unknown){getDb().prepare('INSERT INTO metered_assignment_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('metered_event'),value.id,...owner(actor),key,fingerprint(payload),JSON.stringify(payload),now());}
function partTotals(value:MeteredAssignment,key:string){return sumUnits(value.attempts.filter(a=>a.partKey===key).map(a=>unresolved(a)?a.bounds:a.usage??{}));}
function assertParts(parts:MeteredPart[],attempts:MeteredAttempt[],rates:MeteredRate[]){
 const keys=new Set(parts.map(p=>p.key));if(keys.size!==parts.length)throw new AppError(400,'Assignment part keys must be unique.');
 for(const p of parts){const r=rates.find(rate=>rate.id===p.rateId)!;priceNanos(p.maximumUnits,r);priceNanos(p.estimatedUnits,r);if(!within(p.estimatedUnits,p.maximumUnits))throw new AppError(400,'Estimated usage exceeds its maximum.');
  const visited=new Set([p.key]);let parent=p.parentKey;while(parent){if(visited.has(parent)||!keys.has(parent))throw new AppError(400,'Delegated parts need an existing parent without a cycle.');visited.add(parent);parent=parts.find(item=>item.key===parent)!.parentKey;}
  const used=attempts.filter(a=>a.partKey===p.key);if(used.length>p.maximumCalls||!within(sumUnits(used.map(a=>a.usage??a.bounds)),p.maximumUnits)||used.some(a=>a.rate.id!==p.rateId))throw new AppError(409,'A revision cannot erase admitted work or change its rate.');
 }
 if(attempts.some(a=>!keys.has(a.partKey)))throw new AppError(409,'A revision must preserve every previously dispatched part.');
}
/** Server-only whole-assignment preparation. Never accept caller/model prices or a new root for delegated work. */
export function quoteMeteredAssignment(actor:Actor,raw:z.input<typeof quote>):MeteredAssignment {
 authorized(actor);requireFeature(actor,'core');const input=quote.parse(raw);input.parts.forEach(p=>requireFeature(actor,p.feature));
 return getDb().transaction(()=>{
  const row=getDb().prepare('SELECT id FROM metered_assignments WHERE organization_id=? AND office_id=? AND user_id=? AND assignment_key=?').get(...owner(actor),input.assignmentKey) as {id:string}|undefined;
  const prior=row?read(actor,row.id):undefined;
  if(prior&&(['completed','canceled'].includes(prior.status)||prior.stopRequested))throw new AppError(409,'This assignment is closed to further execution.');
  if(prior?.attempts.some(unresolved))throw new AppError(409,'Reconcile outstanding provider calls before revising the whole assignment.');
  if(prior?.attempts.some(a=>a.discrepancy))throw new AppError(409,'A receipt exceeded its bounds. Operator reconciliation is required.');
  if(prior&&input.revision<prior.revision)throw new AppError(409,'Use the current assignment revision.');
  const planHash=fingerprint(input);if(prior&&input.revision===prior.revision&&prior.budget.planHash!==planHash)throw new AppError(409,'Changed scope requires a new assignment revision.');
  // A retired tariff may remain only on a part with every call already consumed.
  // Receipts keep that original rate; future parts need a currently configured tariff.
  const snapshots=input.parts.map(p=>{
   const used=prior?.attempts.filter(a=>a.partKey===p.key)??[],saved=prior?.rates.find(r=>r.id===p.rateId);
   return saved&&used.length===p.maximumCalls?structuredClone(saved):meteredRate(p.rateId);
  }).filter((rate,index,all)=>all.findIndex(r=>r.id===rate.id)===index);
  assertParts(input.parts,prior?.attempts??[],snapshots);
  const maximum=ceilCents(input.parts.reduce((sum,p)=>sum+priceNanos(p.maximumUnits,snapshots.find(r=>r.id===p.rateId)!),0)),estimate=Math.max(prior?.budget.spentCents??0,ceilCents(input.parts.reduce((sum,p)=>sum+priceNanos(p.estimatedUnits,snapshots.find(r=>r.id===p.rateId)!),0)));
  const assignmentId=prior?.id??newId('metered'),budget=quoteWorkBudget(actor,{runId:assignmentId,planVersion:input.revision,planHash,estimatedCents:estimate,maximumCents:maximum,costBasis:'metered_simulation'});
  const value:MeteredAssignment={...input,id:assignmentId,rates:snapshots,attempts:prior?.attempts??[],status:budget.status==='reserved'?'active':'quoted',budget,customerMicros:prior?.customerMicros??0,providerCostMicros:prior?.providerCostMicros??null,unbilledMicros:0,createdAt:prior?.createdAt??now(),updatedAt:now(),simulation:true};
  if(!prior||prior.budget.quoteId!==budget.quoteId){write(actor,value);event(actor,value,`quote:${budget.quoteId}`,{kind:'quote',revision:value.revision,scopeHash:value.scopeHash,parts:value.parts,rates:value.rates,budget});}return read(actor,assignmentId);
 }).immediate();
}
export function getMeteredAssignment(actor:Actor,id:string){return read(actor,id);}
/** Called only by an authenticated employee decision, never by an AI/provider adapter. */
export function decideMeteredAssignment(actor:Actor,input:{assignmentId:string;quoteId:string;revision:number;decision:'approve'|'deny';eventKey:string}) {
 authorized(actor);return getDb().transaction(()=>{const value=read(actor,input.assignmentId);if(value.revision!==input.revision)throw new AppError(409,'Review the current assignment revision.');decideWorkBudget(actor,{runId:value.id,quoteId:input.quoteId,planVersion:input.revision,decision:input.decision,eventKey:input.eventKey});return read(actor,value.id);}).immediate();
}
/** Dispatch claims commit BEFORE the adapter sends. An exact retry never sends a second request. */
export function admitMeteredAttempt(actor:Actor,raw:z.input<typeof admit>):{dispatch:boolean;assignment:MeteredAssignment;attempt:MeteredAttempt} {
 authorized(actor);const input=admit.parse(raw);return getDb().transaction(()=>{
  const value=read(actor,input.assignmentId),prior=value.attempts.find(a=>a.id===input.attemptId);
  if(prior){if(prior.partKey!==input.partKey||prior.requestHash!==input.requestHash||fingerprint(prior.bounds)!==fingerprint(input.bounds))throw new AppError(409,'This attempt identity belongs to different work.');return {dispatch:false,assignment:value,attempt:prior};}
  requireFeature(actor,'core');if(value.revision!==input.revision||value.scopeHash!==input.scopeHash)throw new AppError(409,'Assignment scope changed. Review its current maximum.');
  if(value.stopRequested||['completed','canceled','paused','reconciling'].includes(value.status)||value.attempts.some(a=>a.status==='unknown'))throw new AppError(409,'This assignment cannot dispatch additional work.');
  const p=value.parts.find(p=>p.key===input.partKey);if(!p)throw new AppError(404,'This part is not included in the approved assignment.');requireFeature(actor,p.feature);
  const r=value.rates.find(r=>r.id===p.rateId)!;assertMeteredRateCurrent(r);priceNanos(input.bounds,r);
  if(value.attempts.filter(a=>a.partKey===p.key).length>=p.maximumCalls||!within(sumUnits([partTotals(value,p.key),input.bounds]),p.maximumUnits))throw new AppError(409,'This call exceeds the quoted whole-assignment allocation. Revise the scope before dispatch.');
  const budget=reserveWorkBudget(actor,value.id),stamp=now(),attempt:MeteredAttempt={id:input.attemptId,partKey:p.key,requestHash:input.requestHash,bounds:input.bounds,rate:r,status:'dispatched',usage:null,responseId:null,customerMicros:null,providerCostMicros:null,receiptHash:null,discrepancy:null,createdAt:stamp,updatedAt:stamp};
  const updated={...value,budget,status:'active' as const,attempts:[...value.attempts,attempt]};write(actor,updated);event(actor,updated,`dispatch:${attempt.id}`,{kind:'dispatch',attempt});return {dispatch:true,assignment:read(actor,value.id),attempt};
 }).immediate();
}
/** Trusted adapter boundary only; no client/model route can provide usage, prices or success. */
export function recordMeteredReceipt(actor:Actor,raw:z.input<typeof receipt>):MeteredAssignment {
 authorized(actor);const input=receipt.parse(raw);return getDb().transaction(()=>{
  const value=read(actor,input.assignmentId),attempt=value.attempts.find(a=>a.id===input.attemptId);if(!attempt)throw new AppError(404,'Admitted provider call not found.');
  const receiptHash=fingerprint(input);
  if(!unresolved(attempt)){if(attempt.receiptHash!==receiptHash)throw new AppError(409,'This receipt conflicts with the saved final outcome.');return value;}
  if(input.status!=='unknown'&&input.usage===null)throw new AppError(400,'A final outcome requires authoritative usage, including zero for a known rejection.');
  if(input.status==='unknown'&&(input.usage!==null||input.providerCostMicros!==null))throw new AppError(400,'Uncertain usage cannot be settled or treated as zero.');
  if(attempt.responseId&&input.responseId!==attempt.responseId)throw new AppError(409,'Reconciliation must retain the original provider response identity.');
  if(input.responseId){const claim=getDb().prepare('SELECT assignment_id,attempt_id FROM metered_response_claims WHERE provider=? AND response_id=?').get(attempt.rate.provider,input.responseId) as {assignment_id:string;attempt_id:string}|undefined;if(claim&&(claim.assignment_id!==value.id||claim.attempt_id!==attempt.id))throw new AppError(409,'This provider receipt is already assigned to other work.');if(!claim)getDb().prepare('INSERT INTO metered_response_claims VALUES(?,?,?,?)').run(attempt.rate.provider,input.responseId,value.id,attempt.id);}
  const customerMicros=input.usage===null?null:priceNanos(input.usage,attempt.rate)/1000,discrepancy=input.usage&&!within(input.usage,attempt.bounds)?'Provider usage exceeded the admitted unit bounds. No further dispatch; customer debit remains capped.':null;
  const updatedAttempt:MeteredAttempt={...attempt,status:input.status,usage:input.usage,responseId:input.responseId,customerMicros,providerCostMicros:input.providerCostMicros,receiptHash,discrepancy,updatedAt:now()};
  if(attempt.receiptHash===receiptHash)return value;
  const attempts=value.attempts.map(a=>a.id===attempt.id?updatedAttempt:a),total=attempts.reduce((sum,a)=>sum+(a.usage?priceNanos(a.usage,a.rate):0),0),cap=value.budget.approvedMaximumCents;
  if(!Number.isSafeInteger(total))throw new AppError(409,'Aggregate provider usage exceeds supported accounting precision. Keep the reservation for operator reconciliation.');
  if(cap===null)throw new AppError(409,'This call has no original cost authority.');
  const charge=Math.min(ceilCents(total),cap)-value.budget.spentCents;if(charge<0)throw new AppError(409,'A receipt cannot erase settled usage.');
  if(charge)settleRecordedWorkBudgetUsage(actor,{runId:value.id,stepKey:`receipt:${attempt.id}`,amountCents:charge});
  const outstanding=attempts.some(unresolved),paused=attempts.some(a=>a.discrepancy),status=outstanding&&attempts.some(a=>a.status==='unknown')?'reconciling':paused?'paused':'active';
  const updated:MeteredAssignment={...value,attempts,status,customerMicros:total/1000,providerCostMicros:attempts.some(a=>a.providerCostMicros===null)?null:attempts.reduce((sum,a)=>sum+(a.providerCostMicros??0),0),unbilledMicros:Math.max(0,total-cap*10_000_000)/1000,budget:getWorkBudget(actor,value.id)};
  write(actor,updated);event(actor,updated,`receipt:${attempt.id}:${receiptHash}`,{kind:'receipt',attempt:updatedAttempt,customerMicros:total/1000,unbilledMicros:updated.unbilledMicros});
  if(!outstanding&&updated.stopRequested)return finishMeteredAssignment(actor,value.id,updated.stopRequested);
  return read(actor,value.id);
 }).immediate();
}
export function finishMeteredAssignment(actor:Actor,assignmentId:string,outcome:'completed'|'canceled'):MeteredAssignment {
 authorized(actor);if(!['completed','canceled'].includes(outcome))throw new AppError(400,'Invalid completion outcome.');return getDb().transaction(()=>{
  const value=read(actor,assignmentId);if(['completed','canceled'].includes(value.status)){if(value.status!==outcome)throw new AppError(409,'The assignment already has a different final outcome.');return value;}
  if(value.stopRequested&&value.stopRequested!==outcome)throw new AppError(409,'The assignment already has a different stopping decision.');
  if(value.attempts.some(unresolved)){if(!value.stopRequested){write(actor,{...value,status:'reconciling',stopRequested:outcome});event(actor,value,`stop:${outcome}`,{kind:'stop',outcome});}return read(actor,value.id);}
  const budget=releaseWorkBudget(actor,value.id);write(actor,{...value,budget,status:outcome,stopRequested:outcome});event(actor,value,`finish:${outcome}`,{kind:'finish',outcome});return read(actor,value.id);
 }).immediate();
}
/** Normalize a Responses receipt without double-counting cached or reasoning subsets. No price inference. */
export function textReceiptUnits(raw:unknown):UsageUnits {
 const parsed=z.object({input_tokens:count,output_tokens:count,input_tokens_details:z.object({cached_tokens:count.optional()}).optional(),output_tokens_details:z.object({reasoning_tokens:count.optional()}).optional()}).parse(raw),cached=parsed.input_tokens_details?.cached_tokens??0,reasoning=parsed.output_tokens_details?.reasoning_tokens??0;
 if(cached>parsed.input_tokens||reasoning>parsed.output_tokens)throw new AppError(400,'Provider usage subsets exceed their parent totals.');return {input_tokens:parsed.input_tokens-cached,cached_input_tokens:cached,output_tokens:parsed.output_tokens};
}
