import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {requireFeature} from './billing';
import {fingerprint} from './provider-runtime';
import {getMeteredAssignment,admitMeteredAttempt,recordMeteredReceipt,finishMeteredAssignment} from './metered-work';
import {responsesReceipt} from './responses-receipt';

/** Injected offline transport only. Strings prevent transport mutation of an admitted payload. */
export interface ResponsesTestTransport {
 count:(body:string)=>Promise<unknown>;
 create:(body:string)=>Promise<{status:number;body:unknown}>;
}
const functionTool=z.object({type:z.literal('function'),name:z.string().min(1),description:z.string().optional(),parameters:z.record(z.string(),z.unknown()),strict:z.boolean().optional()}).strict();
const request=z.object({
 model:z.literal('fictional-text'),input:z.array(z.record(z.string(),z.unknown())).min(1).max(200),
 instructions:z.string().optional(),tools:z.array(functionTool).max(100).optional(),
 reasoning:z.object({effort:z.enum(['low','medium','high','xhigh','max'])}).strict().optional(),
 max_output_tokens:z.number().int().positive().max(16000),service_tier:z.literal('default'),store:z.literal(false),
 parallel_tool_calls:z.literal(false).optional(),include:z.array(z.literal('reasoning.encrypted_content')).optional(),
}).strict();

/** Exercises the real host sequence with fictional rates and an injected transport.
 * It enables no provider network path. The host retains one assignment across all model rounds.
 * Output is available only after a final, scoped, admitted receipt; no tools run here.
 */
export async function executeResponsesAdmissionTest(actor:Actor,input:{assignmentId:string;revision:number;scopeHash:string;attemptId:string;partKey:string;payload:unknown;currentScope:()=>string},transport:ResponsesTestTransport) {
 const payload=request.parse(input.payload),body=JSON.stringify(payload),requestHash=fingerprint(payload);
 if(Buffer.byteLength(body)>300000)throw new AppError(413,'The Responses request exceeds the supported input bound.');
 // This host supports text, retained reasoning, function calls and function outputs only.
 // Recursive content-type checks also reject images/audio/files nested in message content.
 const allowedTypes=new Set(['message','input_text','output_text','refusal','reasoning','summary_text','reasoning_text','function_call','function_call_output']);
 function checkItems(value:unknown):void {
  if(Array.isArray(value)){value.forEach(checkItems);return;}
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
   if(key==='type'&&typeof item==='string'&&!allowedTypes.has(item))throw new AppError(400,'This admitted host supports text and local function tools only.');
   checkItems(item);
  }
 }
 checkItems(payload.input);
 const current=()=>{
  const assignment=getMeteredAssignment(actor,input.assignmentId);
  if(input.currentScope()!==input.scopeHash||assignment.scopeHash!==input.scopeHash||assignment.revision!==input.revision)throw new AppError(409,'Assignment context changed before the request could continue.');
  const part=assignment.parts.find(p=>p.key===input.partKey),rate=assignment.rates.find(r=>r.id===part?.rateId);
  if(!part||rate?.id!=='test-text-v1'||rate.model!==payload.model)throw new AppError(409,'This offline adapter requires its fictional text rate.');
  requireFeature(actor,'core');requireFeature(actor,part.feature);
  return assignment;
 };
 let assignment=current();
 const prior=assignment.attempts.find(a=>a.id===input.attemptId);
 if(prior){if(prior.requestHash!==requestHash||prior.partKey!==input.partKey)throw new AppError(409,'This attempt identity belongs to different work.');return {dispatched:false,assignment,output:null};}
 if(assignment.stopRequested||!['quoted','active'].includes(assignment.status)||!['approved','reserved'].includes(assignment.budget.status))throw new AppError(409,'Review and approve the current whole-assignment maximum before requesting a response.');
 // Count exactly the same supported token-bearing fields that generation will receive.
 const {max_output_tokens,service_tier,store,include,...countPayload}=payload;
 void service_tier;void store;void include;
 const counted=z.object({input_tokens:z.number().int().nonnegative().max(300000)}).parse(await transport.count(JSON.stringify(countPayload)));
 assignment=current();
 // Reserve both possible cache classes conservatively. Actual receipt separates them once.
 const bounds={input_tokens:counted.input_tokens,cached_input_tokens:counted.input_tokens,output_tokens:max_output_tokens};
 const claim=admitMeteredAttempt(actor,{assignmentId:input.assignmentId,revision:input.revision,scopeHash:input.scopeHash,attemptId:input.attemptId,partKey:input.partKey,requestHash,bounds});
 if(!claim.dispatch)return {dispatched:false,assignment:claim.assignment,output:null};
 let recorded=false;
 try {
  const response=await transport.create(body);
  if(response.status<200||response.status>=300){
   const rejected=[400,401,403,404,429].includes(response.status);
   assignment=recordMeteredReceipt(actor,{assignmentId:input.assignmentId,attemptId:input.attemptId,status:rejected?'failed':'unknown',responseId:null,usage:rejected?{}:null,providerCostMicros:rejected?0:null});recorded=true;
   assignment=finishMeteredAssignment(actor,assignment.id,'canceled');
   return {dispatched:true,assignment,output:null};
  }
  const result=responsesReceipt(response.body,{model:payload.model,serviceTier:payload.service_tier});
  assignment=recordMeteredReceipt(actor,{assignmentId:input.assignmentId,attemptId:input.attemptId,status:result.status==='completed'?'succeeded':result.status==='canceled'?'canceled':'failed',responseId:result.id,usage:result.units,providerCostMicros:null});recorded=true;
  const combinedInputOverrun=result.units.input_tokens+result.units.cached_input_tokens>counted.input_tokens;
  if(result.status!=='completed'||assignment.status!=='active'||assignment.stopRequested||combinedInputOverrun){
   if(!assignment.stopRequested)assignment=finishMeteredAssignment(actor,assignment.id,'canceled');
   return {dispatched:true,assignment,output:null};
  }
  if(input.currentScope()!==input.scopeHash){
   finishMeteredAssignment(actor,assignment.id,'canceled');
   throw new AppError(409,'Assignment context changed while the response was running. Its usage is recorded; its output is withheld.');
  }
  current();
  return {dispatched:true,assignment,output:result.raw.output??null};
 }catch(error){
  if(!recorded){recordMeteredReceipt(actor,{assignmentId:input.assignmentId,attemptId:input.attemptId,status:'unknown',responseId:null,usage:null,providerCostMicros:null});finishMeteredAssignment(actor,input.assignmentId,'canceled');}
  else if(!getMeteredAssignment(actor,input.assignmentId).stopRequested)finishMeteredAssignment(actor,input.assignmentId,'canceled');
  throw error;
 }
}
