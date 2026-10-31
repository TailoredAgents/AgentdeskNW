import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {UsageUnits} from '../lib/metered-work-contracts';
import {fingerprint} from './provider-runtime';
import {AppError} from './db';
import {admitMeteredAttempt,recordMeteredReceipt,textReceiptUnits} from './metered-work';

const responseSchema=z.object({id:z.string().min(1).max(150),status:z.enum(['completed','incomplete','failed','canceled']),usage:z.unknown()}).passthrough();
/** Internal test transport boundary. A host supplies a stable root and trusted current scope, never model prices.
 * It deliberately enables no network/provider. Production adapters/rates require separate acceptance.
 */
export async function executeMeteredTextTest(actor:Actor,input:{assignmentId:string;revision:number;scopeHash:string;attemptId:string;partKey:string;bounds:UsageUnits;request:unknown},adapter:(request:unknown)=>Promise<{status:number;body:unknown}>) {
 const snapshot=structuredClone(input.request),claim=admitMeteredAttempt(actor,{assignmentId:input.assignmentId,revision:input.revision,scopeHash:input.scopeHash,attemptId:input.attemptId,partKey:input.partKey,requestHash:fingerprint(snapshot),bounds:input.bounds});
 if(!claim.dispatch)return {dispatched:false,assignment:claim.assignment};
 if(claim.attempt.rate.id!=='test-text-v1'){
  recordMeteredReceipt(actor,{assignmentId:input.assignmentId,attemptId:input.attemptId,status:'failed',responseId:null,usage:{},providerCostMicros:0});
  throw new AppError(409,'This adapter only supports the fictional text test rate.');
 }
 let recorded=false;
 try {
  const response=await adapter(snapshot);
  if(response.status<200||response.status>=300){
   const rejected=[400,401,403,404,429].includes(response.status),assignment=recordMeteredReceipt(actor,{assignmentId:input.assignmentId,attemptId:input.attemptId,status:rejected?'failed':'unknown',responseId:null,usage:rejected?{}:null,providerCostMicros:rejected?0:null});recorded=true;
   return {dispatched:true,assignment};
  }
  const parsed=responseSchema.parse(response.body),usage=textReceiptUnits(parsed.usage),assignment=recordMeteredReceipt(actor,{assignmentId:input.assignmentId,attemptId:input.attemptId,status:parsed.status==='completed'?'succeeded':parsed.status==='canceled'?'canceled':'failed',responseId:parsed.id,usage,providerCostMicros:null});recorded=true;
  return {dispatched:true,assignment};
 }catch(error){
  if(!recorded)recordMeteredReceipt(actor,{assignmentId:input.assignmentId,attemptId:input.attemptId,status:'unknown',responseId:null,usage:null,providerCostMicros:null});
  throw error;
 }
}
