import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { closeDb,demoActor } from '../src/server/db';
import { billingPolicy,saveBillingPolicy } from '../src/server/billing';
import { textProviderConfig } from '../src/server/provider-config';
import { beginProviderOperation,fingerprint,providerOperations,recordProviderChildUsage,recordProviderUsage } from '../src/server/provider-runtime';
import { reconcileTextUsage,reserveUsage,usageBalances } from '../src/server/metering';

const operation={operationId:'provider-test',provider:'openai',feature:'core',kind:'text',model:'gpt-6-astra',requestHash:fingerprint({message:'A fictional test'})};
beforeEach(()=>{
 closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 for(const name of ['OPENAI_MODEL','OPENAI_REASONING_EFFORT','AGENTDESK_TEXT_MAX_ROUNDS','AGENTDESK_TEXT_MAX_TOOL_CALLS','AGENTDESK_TEXT_MAX_OUTPUT_TOKENS','AGENTDESK_TEXT_TIMEOUT_MS','AGENTDESK_TEXT_MAX_CONTEXT_BYTES'])vi.stubEnv(name,'');
});
afterEach(()=>{closeDb();vi.unstubAllEnvs();});

describe('provider configuration',()=>{
 it('selects the documented Astra model and a bounded high-effort request',()=>{
  expect(textProviderConfig()).toMatchObject({model:'gpt-6-astra',reasoning:'high',maxRounds:5,maxToolCalls:8,maxOutputTokens:8000,requestTimeoutMs:90000});
  for(const effort of ['low','medium','high','xhigh','max']){vi.stubEnv('OPENAI_REASONING_EFFORT',effort);expect(textProviderConfig().reasoning).toBe(effort);}
 });
 it('rejects undocumented effort names and unbounded spending controls',()=>{
  for(const effort of ['ultra','none','minimal']){vi.stubEnv('OPENAI_REASONING_EFFORT',effort);expect(()=>textProviderConfig()).toThrow();}
  vi.stubEnv('OPENAI_REASONING_EFFORT','high');
  for(const [name,value] of [['AGENTDESK_TEXT_MAX_ROUNDS','100'],['AGENTDESK_TEXT_MAX_TOOL_CALLS','0'],['AGENTDESK_TEXT_MAX_OUTPUT_TOKENS','Infinity'],['AGENTDESK_TEXT_TIMEOUT_MS','120001'],['AGENTDESK_TEXT_MAX_CONTEXT_BYTES','-1']]){
   vi.stubEnv(name,value);expect(()=>textProviderConfig()).toThrow();vi.stubEnv(name,'');
  }
 });
});

describe('durable provider receipts',()=>{
 it('starts an authorized operation once and rejects conflicting request reuse',()=>{
  const actor=demoActor();const first=beginProviderOperation(actor,operation);
  expect(beginProviderOperation(actor,operation)).toEqual(first);expect(providerOperations(actor)).toHaveLength(1);
  expect(()=>beginProviderOperation(actor,{...operation,requestHash:fingerprint('different request')})).toThrow('conflict');
  expect(first).toMatchObject({status:'started',usage:{},actualCostCents:null,estimatedCostCents:null});
 });
 it('enforces company restrictions before beginning provider work',()=>{
  const admin=demoActor('manager'),policy=billingPolicy(admin);policy.restricted=['investor-hunter'];saveBillingPolicy(admin,policy);
  expect(()=>beginProviderOperation(demoActor(),{...operation,feature:'investor-hunter'})).toThrow('Restricted');
  expect(providerOperations(demoActor())).toHaveLength(0);
 });
 it('isolates operations and response identifiers by the authenticated employee',()=>{
  const actor=demoActor(),manager=demoActor('manager');beginProviderOperation(actor,operation);
  recordProviderUsage(actor,{operationId:operation.operationId,providerResponseId:'resp-scoped',status:'succeeded',usage:{input_tokens:20,output_tokens:10}});
  expect(providerOperations(manager)).toEqual([]);
  expect(()=>recordProviderUsage(manager,{operationId:operation.operationId,status:'succeeded',usage:{}})).toThrow('not found');
  expect(()=>providerOperations({...actor,organizationId:'forged-org'})).toThrow('not authorized');
 });
 it('replays an identical receipt and rejects changed results or duplicated response IDs',()=>{
  const actor=demoActor();beginProviderOperation(actor,operation);
  const receipt={operationId:operation.operationId,providerResponseId:'resp-unique',status:'succeeded' as const,usage:{input_tokens:20,output_tokens:10,cached_input_tokens:5,reasoning_tokens:3}};
  const first=recordProviderUsage(actor,receipt);expect(recordProviderUsage(actor,receipt)).toEqual(first);
  expect(()=>recordProviderUsage(actor,{...receipt,usage:{input_tokens:20,output_tokens:11}})).toThrow('conflict');
  beginProviderOperation(actor,{...operation,operationId:'second'});
  expect(()=>recordProviderUsage(actor,{...receipt,operationId:'second'})).toThrow('another operation');
  expect(first.actualCostCents).toBeNull();
 });
 it('retains an unknown outcome until an authoritative late receipt arrives',()=>{
  const actor=demoActor();beginProviderOperation(actor,operation);
  recordProviderUsage(actor,{operationId:operation.operationId,status:'unknown',usage:{},errorCode:'timeout'});
  expect(providerOperations(actor)[0]).toMatchObject({status:'unknown',usage:{},actualCostCents:null});
  recordProviderUsage(actor,{operationId:operation.operationId,providerResponseId:'resp-late',status:'succeeded',usage:{input_tokens:90,output_tokens:20}});
  expect(providerOperations(actor)[0]).toMatchObject({status:'succeeded',providerResponseId:'resp-late',usage:{input_tokens:90,output_tokens:20},actualCostCents:null});
 });
 it('rejects invalid provider numbers instead of converting them to free work',()=>{
  const actor=demoActor();beginProviderOperation(actor,operation);
  for(const value of [-1,Infinity,NaN])expect(()=>recordProviderUsage(actor,{operationId:operation.operationId,status:'succeeded',usage:{input_tokens:value}})).toThrow();
  expect(providerOperations(actor)[0].status).toBe('started');
 });
 it('accepts a late child receipt after cancellation without authorizing a new operation',()=>{
  const actor=demoActor();beginProviderOperation(actor,operation);recordProviderUsage(actor,{operationId:operation.operationId,status:'canceled',usage:{}});
  const receipt={parentOperationId:operation.operationId,operationId:'late-voice-receipt',kind:'realtime_response',providerResponseId:'resp-after-cancel',status:'succeeded' as const,usage:{input_audio_tokens:30,output_audio_tokens:20}};
  const first=recordProviderChildUsage(actor,receipt);expect(recordProviderChildUsage(actor,receipt)).toEqual(first);expect(first).toMatchObject({provider:'openai',feature:'core',status:'succeeded',actualCostCents:null});expect(providerOperations(actor)).toHaveLength(2);
  expect(()=>recordProviderChildUsage(demoActor('manager'),receipt)).toThrow('parent');
 });
 it('requires a scoped parent and rejects reparenting an existing receipt',()=>{
  const actor=demoActor();const receipt={parentOperationId:operation.operationId,operationId:'child-receipt',kind:'realtime_response',providerResponseId:'resp-child',status:'succeeded' as const,usage:{input_tokens:5,output_tokens:3}};
  expect(()=>recordProviderChildUsage(actor,receipt)).toThrow('parent');beginProviderOperation(actor,operation);recordProviderChildUsage(actor,receipt);
  beginProviderOperation(actor,{...operation,operationId:'another-parent'});expect(()=>recordProviderChildUsage(actor,{...receipt,parentOperationId:'another-parent'})).toThrow('another operation');
 });
});

describe('authoritative text usage reconciliation',()=>{
 it('records actual usage above the estimate exactly once',()=>{
  const actor=demoActor();reserveUsage(actor,{category:'text_tokens',operationId:operation.operationId,quantity:10,source:'Test admission estimate'});beginProviderOperation(actor,operation);
  recordProviderUsage(actor,{operationId:operation.operationId,providerResponseId:'resp-over-estimate',status:'succeeded',usage:{input_tokens:20,output_tokens:15}});
  const first=reconcileTextUsage(actor,operation.operationId);expect(first.quantity).toBe(35);expect(reconcileTextUsage(actor,operation.operationId)).toEqual(first);
  expect(usageBalances(actor).find(b=>b.category==='text_tokens')).toMatchObject({consumed:35,reserved:0,remaining:99965});expect(first.providerCostCents).toBeNull();
 });
 it('keeps unresolved usage reserved and prevents another employee from settling it',()=>{
  const actor=demoActor();reserveUsage(actor,{category:'text_tokens',operationId:operation.operationId,quantity:50,source:'Test unknown usage'});beginProviderOperation(actor,operation);
  recordProviderUsage(actor,{operationId:operation.operationId,status:'unknown',usage:{}});
  expect(()=>reconcileTextUsage(actor,operation.operationId)).toThrow('unresolved');
  expect(()=>reconcileTextUsage(demoActor('manager'),operation.operationId)).toThrow('not found');
  expect(usageBalances(actor).find(b=>b.category==='text_tokens')).toMatchObject({consumed:0,reserved:50});
 });
 it('debits a response that exhausted output tokens even though it produced no final answer',()=>{
  const actor=demoActor();reserveUsage(actor,{category:'text_tokens',operationId:operation.operationId,quantity:500,source:'Test incomplete response'});beginProviderOperation(actor,operation);
  recordProviderUsage(actor,{operationId:operation.operationId,providerResponseId:'resp-incomplete',status:'failed',usage:{input_tokens:120,output_tokens:300,reasoning_tokens:300},errorCode:'max_output_tokens'});
  expect(reconcileTextUsage(actor,operation.operationId)).toMatchObject({quantity:420,status:'consumed'});
 });
});
