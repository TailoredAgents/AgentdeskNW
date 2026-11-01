import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {listAssignmentReviews,decideAssignmentReview} from '../src/server/assignment-reviews';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {reconcileStoppedTextUsage} from '../src/server/text-reconciliation';
import {getWalletState} from '../src/server/wallet';
import {listTasks} from '../src/server/services';
import {createVoiceSession} from '../src/server/voice';
import {createResearchJob} from '../src/server/services';
let directory='';const actor=()=>demoActor(),requestId='receipt-recovery-test';
beforeEach(()=>{closeDb();for(const [key,value] of Object.entries({AGENTDESK_DB_PATH:':memory:',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'never-sent',OPENAI_MODEL:'gpt-6-astra',AGENTDESK_TEXT_SPENDING_MODE:'admitted_demo',AGENTDESK_TEXT_MAX_ROUNDS:'2',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'300000',AGENTDESK_TEXT_CUSTOMER_TARIFFS:JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional stopped-text reconciliation tariff',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000000,cached_input_tokens:0,output_tokens:1000000}}])}))vi.stubEnv(key,value);vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();if(directory){rmSync(directory,{recursive:true,force:true});directory='';}});
async function interrupted(){
 vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>{if(String(url).endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40}));throw new Error('ambiguous transport');}));
 await chat(actor(),'Review my next useful task.',undefined,requestId);const review=listAssignmentReviews(actor())[0];decideAssignmentReview(actor(),review.id,{quoteId:review.quoteId,revision:review.revision,decision:'approve',eventKey:'approve-stopped'});await processApprovedTextRequests(actor());
 const row=getDb().prepare('SELECT data FROM provider_operations WHERE operation_id=?').get(`text:${requestId}:0`) as {data:string};const requestHash=JSON.parse(row.data).requestHash as string;
 return {requestHash,source:'Trusted fictional adapter evidence for the original request',receipt:{id:'late-confirmed-response',model:'gpt-6-astra',service_tier:'default',status:'completed',usage:{input_tokens:10,output_tokens:5},output:[{type:'function_call',name:'create_task',arguments:'{"title":"Do not execute this late output"}'}]}};
}
describe('trusted stopped-text usage reconciliation',()=>{
 it('settles a late receipt exactly once, releases unused credit and never executes returned output',async()=>{
  const input=await interrupted(),before=listTasks(actor()).length;expect(getWalletState(actor()).reservedCents).toBeGreaterThan(0);
  expect(reconcileStoppedTextUsage(actor(),requestId,input)).toMatchObject({status:'canceled',budget:{spentCents:2,reservedCents:0}});
  expect(reconcileStoppedTextUsage(actor(),requestId,input).budget.spentCents).toBe(2);expect(listTasks(actor())).toHaveLength(before);expect(getDb().prepare('SELECT phase FROM text_executions WHERE request_id=?').get(requestId)).toEqual({phase:'failed'});expect(await processApprovedTextRequests(actor())).toBe(0);
 });
 it('rejects mismatched request, response processing identity, malformed usage and other employees',async()=>{
  const input=await interrupted();expect(()=>reconcileStoppedTextUsage(actor(),requestId,{...input,requestHash:'0'.repeat(64)})).toThrow('original dispatched request');expect(()=>reconcileStoppedTextUsage(actor(),requestId,{...input,receipt:{...input.receipt,model:'other'}})).toThrow('model');expect(()=>reconcileStoppedTextUsage(actor(),requestId,{...input,receipt:{...input.receipt,usage:null}})).toThrow('usage receipt');expect(()=>reconcileStoppedTextUsage(demoActor('manager'),requestId,input)).toThrow();expect(getWalletState(actor()).reservedCents).toBeGreaterThan(0);
 });
 it('rejects a conflicting late receipt after final settlement',async()=>{
  const input=await interrupted();reconcileStoppedTextUsage(actor(),requestId,input);expect(()=>reconcileStoppedTextUsage(actor(),requestId,{...input,receipt:{...input.receipt,usage:{input_tokens:11,output_tokens:5}}})).toThrow('conflicts');expect(getWalletState(actor()).spentThisPeriodCents).toBe(2);
 });
 it('caps unexpected overrun usage without restarting the stopped work',async()=>{
  const input=await interrupted();const result=reconcileStoppedTextUsage(actor(),requestId,{...input,receipt:{...input.receipt,usage:{input_tokens:100000,output_tokens:100000}}});expect(result.budget.spentCents).toBe(result.budget.approvedMaximumCents);expect(result.unbilledMicros).toBeGreaterThan(0);expect(result.status).toBe('canceled');expect(result.attempts[0].discrepancy).toBeTruthy();
 });
 it('offers an offline rollback-only preview before an operator explicitly applies the evidence',async()=>{
  directory=mkdtempSync(join(tmpdir(),'agentdesk-reconcile-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'test.sqlite'));const input=await interrupted(),employee=actor(),file=join(directory,'evidence.json');writeFileSync(file,JSON.stringify(input));closeDb();
  const args=['--import','tsx','scripts/reconcile-text-usage.ts','--organization',employee.organizationId,'--office',employee.officeId,'--user',employee.id,'--request',requestId,'--evidence',file];
  const preview=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:''}}));expect(preview).toMatchObject({applied:false,status:'canceled',spentCents:2,heldCents:0,executionResumed:false});expect(getWalletState(actor()).reservedCents).toBeGreaterThan(0);closeDb();
  const applied=JSON.parse(execFileSync(process.execPath,[...args,'--apply'],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:''}}));expect(applied.applied).toBe(true);expect(getWalletState(actor()).reservedCents).toBe(0);
 });
 it('does not let admitted work bypass the root cap through unsupported continuous voice or unconfigured external research',async()=>{
  await expect(createVoiceSession(actor())).rejects.toThrow('dictation');expect(()=>createResearchJob(actor(),{address:'123 Example Street',county:'Cobb',price:150000,strategy:'flip',limit:1,provider:'openai-web-search-v1',propertyType:'single family',maxCostCents:1000})).toThrow('External research is disconnected');
 });
});
