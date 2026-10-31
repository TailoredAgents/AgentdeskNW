import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {UsageUnits} from '../lib/metered-work-contracts';
import {AppError,getDb,newId,now} from './db';
import {currentAssignment} from './assignment-roots';
import {currentMeteredAssignment,admitCurrentAssignmentAttempt} from './assignment-metering';
import {recordMeteredReceipt} from './metered-work';
import {fingerprint} from './provider-runtime';

const id=z.string().min(1).max(150),hash=z.string().regex(/^[a-f0-9]{64}$/);
const units=z.record(z.string().min(1).max(80),z.number().int().min(0).max(1_000_000_000));
const inputSchema=z.object({key:id,partKey:id,revision:z.number().int().positive(),scopeHash:hash,bounds:units,request:z.unknown()}).strict();
const receiptSchema=z.object({status:z.enum(['succeeded','failed','canceled','unknown']),responseId:id.nullable(),usage:units.nullable(),result:z.unknown().optional()}).strict();
export type SimulatedOperationInput=z.input<typeof inputSchema>;
export type SimulatedOperationReceipt=z.input<typeof receiptSchema>;
/** A trusted in-process fake, never a client-selected provider or receipt endpoint. */
export interface SimulatedAssignmentAdapter {
 id:string; rateId:string;
 execute(request:unknown):Promise<SimulatedOperationReceipt>;
}
interface Row {
 assignment_id:string; operation_key:string; binding_id:string; identity_hash:string;
 adapter_id:string; attempt_id:string; scope_hash:string; state:'dispatched'|'unknown'|'received';
 receipt_hash:string|null; result:string|null;
}
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function read(actor:Actor,key:string):Row|undefined {
 const binding=currentAssignment(actor),assignment=currentMeteredAssignment(actor);
 const row=getDb().prepare('SELECT * FROM assignment_operations WHERE assignment_id=? AND operation_key=? AND organization_id=? AND office_id=? AND user_id=?').get(assignment.id,id.parse(key),...owner(actor)) as Row|undefined;
 if(row&&row.binding_id!==binding.id)throw new AppError(409,'Return to the original operation host; a sibling cannot take over its receipt or output.');
 return row;
}
function snapshot(value:unknown):unknown {
 let encoded:string|undefined;
 try{encoded=JSON.stringify(value);}catch{throw new AppError(400,'Operation data must be JSON.');}
 if(encoded===undefined||Buffer.byteLength(encoded)>250_000)throw new AppError(400,'Operation data exceeds its supported saved-result size.');
 return JSON.parse(encoded);
}
function result(actor:Actor,row:Row,currentScope:()=>string){
 const assignment=currentMeteredAssignment(actor),attempt=assignment.attempts.find(a=>a.id===row.attempt_id)!;
 // Accounting may reconcile after access changes/cancellation. Neither permits using the old output.
 const withheld=currentScope()!==row.scope_hash||assignment.stopRequested==='canceled'||assignment.status==='paused';
 return {state:row.state,status:attempt.status,withheld,result:!withheld&&row.state==='received'&&attempt.status==='succeeded'&&row.result!==null?JSON.parse(row.result) as unknown:null,assignment};
}

/** Read-only saved outcome. Never executes, advances a business record or implies delivery. */
export function readSimulatedAssignmentOperation(actor:Actor,key:string,currentScope:()=>string){
 const row=read(actor,key);if(!row)throw new AppError(404,'Saved assignment operation not found.');
 return result(actor,row,currentScope);
}

/** Trusted fixture receipt ingestion. Also supports a late receipt after restart/timeout.
 * It settles only the original admitted attempt. It cannot resume tools or authorize more work.
 * Production provider reconciliation requires its own authenticated evidence adapter.
 */
export function reconcileSimulatedAssignmentOperation(actor:Actor,key:string,adapterId:string,raw:SimulatedOperationReceipt){
 const receipt=receiptSchema.parse(raw);
 if(receipt.status==='unknown'&&(receipt.usage!==null||receipt.result!==undefined))throw new AppError(400,'Unknown work cannot supply settled usage or a result.');
 if(receipt.status!=='succeeded'&&receipt.result!==undefined)throw new AppError(400,'Only a confirmed successful operation may publish a result.');
 const savedResult=receipt.result===undefined?null:JSON.stringify(snapshot(receipt.result));
 const receiptHash=fingerprint({...receipt,result:savedResult});
 return getDb().transaction(()=>{
  const row=read(actor,key);if(!row)throw new AppError(404,'Admitted assignment operation not found.');
  if(row.adapter_id!==id.parse(adapterId))throw new AppError(409,'The receipt adapter does not match the original dispatch.');
  if(row.state==='received'){
   if(row.receipt_hash!==receiptHash)throw new AppError(409,'This receipt conflicts with the original saved output.');
   return currentMeteredAssignment(actor);
  }
  const assignment=currentMeteredAssignment(actor),attempt=assignment.attempts.find(a=>a.id===row.attempt_id);
  if(attempt?.rate.basis!=='test_fixture'||attempt.rate.provider!=='test-double')throw new AppError(409,'Only explicitly fictional adapter receipts are supported.');
  const updated=recordMeteredReceipt(actor,{assignmentId:assignment.id,attemptId:row.attempt_id,status:receipt.status,responseId:receipt.responseId,usage:receipt.usage,providerCostMicros:null});
  getDb().prepare('UPDATE assignment_operations SET state=?,receipt_hash=?,result=?,updated_at=? WHERE assignment_id=? AND operation_key=?').run(receipt.status==='unknown'?'unknown':'received',receiptHash,savedResult,now(),row.assignment_id,key);
  return updated;
 }).immediate();
}

/** Shared simulated dispatch lifecycle for reasoning, research, delegated reasoning and audio.
 * The host must already have a server-owned root, a whole-assignment quote and current sources.
 * Request identity/admission commit before the fake transport. Receipt and output commit together.
 * Restoring a dispatched/unknown operation never calls its adapter again.
 */
export async function runSimulatedAssignmentOperation(actor:Actor,raw:SimulatedOperationInput,adapter:SimulatedAssignmentAdapter,currentScope:()=>string){
 const input=inputSchema.parse(raw),request=snapshot(input.request),adapterId=id.parse(adapter.id);
 const identity=fingerprint({...input,request,adapterId,rateId:adapter.rateId});
 const claim=getDb().transaction(()=>{
  const binding=currentAssignment(actor),assignment=currentMeteredAssignment(actor),prior=read(actor,input.key);
  if(prior){if(prior.identity_hash!==identity)throw new AppError(409,'This operation already represents different work.');return {dispatch:false,row:prior};}
  if(currentScope()!==input.scopeHash)throw new AppError(409,'Assignment sources changed before dispatch. Prepare a current scope.');
  const part=assignment.parts.find(p=>p.key===input.partKey),rate=assignment.rates.find(r=>r.id===part?.rateId);
  if(!rate||rate.id!==adapter.rateId||rate.basis!=='test_fixture'||rate.provider!=='test-double')throw new AppError(409,'The simulated adapter does not match its quoted fictional rate.');
  const attemptId=newId('operation_attempt');
  admitCurrentAssignmentAttempt(actor,{revision:input.revision,scopeHash:input.scopeHash,attemptId,partKey:input.partKey,requestHash:fingerprint({adapterId,request}),bounds:input.bounds as UsageUnits});
  const stamp=now();
  getDb().prepare('INSERT INTO assignment_operations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(assignment.id,input.key,binding.id,...owner(actor),identity,adapterId,attemptId,input.scopeHash,'dispatched',null,null,stamp,stamp);
  return {dispatch:true,row:read(actor,input.key)!};
 }).immediate();
 if(!claim.dispatch)return {dispatched:false,...result(actor,claim.row,currentScope)};
 let responseId:string|null=null;
 try{
  const receipt=await adapter.execute(request);
  const responseIdentity=id.safeParse(receipt?.responseId);if(responseIdentity.success)responseId=responseIdentity.data;
  reconcileSimulatedAssignmentOperation(actor,input.key,adapterId,receipt);
 }catch(error){
  // A malformed receipt is not zero-cost failure. Preserve the original response identity
  // if a prior trustworthy uncertain receipt already recorded it.
  const row=read(actor,input.key)!;
  if(row.state!=='received'){
   const attempt=currentMeteredAssignment(actor).attempts.find(a=>a.id===row.attempt_id)!;
   // If a response ID is already claimed elsewhere, leave the original dispatch
   // unresolved instead of claiming the other operation's usage or output.
   try{reconcileSimulatedAssignmentOperation(actor,input.key,adapterId,{status:'unknown',responseId:attempt.responseId??responseId,usage:null});}
   catch{reconcileSimulatedAssignmentOperation(actor,input.key,adapterId,{status:'unknown',responseId:attempt.responseId,usage:null});}
  }
  throw error;
 }
 return {dispatched:true,...readSimulatedAssignmentOperation(actor,input.key,currentScope)};
}
