import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor} from '../src/server/db';
import {fingerprint} from '../src/server/provider-runtime';
import {quoteMeteredAssignment,getMeteredAssignment,decideMeteredAssignment,finishMeteredAssignment} from '../src/server/metered-work';
import {executeResponsesAdmissionTest,type ResponsesTestTransport} from '../src/server/responses-admission';
import {getWalletState} from '../src/server/wallet';
import {simulateLifecycle,subscription} from '../src/server/billing';

let sequence=0;
const actor=()=>demoActor(),scope=fingerprint('current fictional sources'),key=()=>`responses-${++sequence}`;
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');sequence=0;});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();});
function setup(expensive=false){
 const assignment=quoteMeteredAssignment(actor(),{assignmentKey:key(),title:'Fictional bounded model work',scopeHash:scope,revision:1,parts:[{key:'reasoning',rateId:'test-text-v1',feature:'core',maximumCalls:3,maximumUnits:{input_tokens:1000,cached_input_tokens:1000,output_tokens:expensive?22000:10000},estimatedUnits:{input_tokens:100,output_tokens:100}}]});
 const payload={model:'fictional-text',service_tier:'default',store:false,max_output_tokens:512,instructions:'Use authorized fictional records.',input:[{role:'user',content:'Review my work.'}],tools:[{type:'function',name:'local_lookup',description:'Only local records.',parameters:{type:'object',properties:{},additionalProperties:false},strict:true}],reasoning:{effort:'low'},include:['reasoning.encrypted_content']};
 const input={assignmentId:assignment.id,revision:1,scopeHash:scope,attemptId:key(),partKey:'reasoning',payload,currentScope:()=>scope};
 return {assignment,input};
}
function response(extra:Record<string,unknown>={}){return {status:200,body:{id:key(),model:'fictional-text',service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:40,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:30}},output:[{type:'message',content:[{type:'output_text',text:'Fictional result.'}]}],...extra}};}
function transport():ResponsesTestTransport {return {count:vi.fn(async()=>({input_tokens:100})),create:vi.fn(async()=>response())};}
const run=(input:ReturnType<typeof setup>['input'],t:ResponsesTestTransport)=>executeResponsesAdmissionTest(actor(),input,t);
describe('Responses host admission using an offline transport',()=>{
 it('counts the same token-bearing context and settles a bounded final response before exposing output',async()=>{
  const {input}=setup(),t=transport(),result=await run(input,t);
  const counted=JSON.parse(vi.mocked(t.count).mock.calls[0][0]),generated=JSON.parse(vi.mocked(t.create).mock.calls[0][0]);
  const {max_output_tokens,service_tier,store,include,...common}=generated;void max_output_tokens;void service_tier;void store;void include;
  expect(counted).toEqual(common);expect(counted).toMatchObject({instructions:input.payload.instructions,input:input.payload.input,tools:input.payload.tools});
  expect(result.output).not.toBeNull();expect(result.assignment.attempts[0]).toMatchObject({status:'succeeded',usage:{input_tokens:80,cached_input_tokens:20,output_tokens:40},providerCostMicros:null});
  expect(result.assignment.budget.spentCents).toBe(1);expect(getWalletState(actor()).reservedCents).toBeGreaterThan(0);
 });
 it('requires whole-assignment approval before either count or inference, not one approval per round',async()=>{
  const {assignment,input}=setup(true),t=transport();
  expect(assignment.budget.maximumCents).toBeGreaterThan(100);await expect(run(input,t)).rejects.toThrow('approve');expect(t.count).not.toHaveBeenCalled();expect(t.create).not.toHaveBeenCalled();
  decideMeteredAssignment(actor(),{assignmentId:assignment.id,revision:1,quoteId:assignment.budget.quoteId,decision:'approve',eventKey:key()});
  await run(input,t);await run({...input,attemptId:key()},t);
  expect(getMeteredAssignment(actor(),assignment.id).attempts).toHaveLength(2);expect(t.create).toHaveBeenCalledTimes(2);
 });
 it('commits once across concurrent count responses and never redispatches or recounts an admitted retry',async()=>{
  const {input}=setup(),t=transport();let resolve!:(value:unknown)=>void;
  t.count=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValueOnce({input_tokens:100});
  const first=run(input,t),second=await run(input,t);resolve({input_tokens:100});const firstResult=await first;
  expect(second.dispatched).toBe(true);expect(firstResult.dispatched).toBe(false);expect(t.create).toHaveBeenCalledTimes(1);
  expect((await run(input,t)).dispatched).toBe(false);expect(t.count).toHaveBeenCalledTimes(2);
  await expect(run({...input,payload:{...input.payload,instructions:'Changed work'}},t)).rejects.toThrow('different work');
 });
 it('rejects changed source context after counting without reserving or sending the prompt',async()=>{
  const {input}=setup(),t=transport();let current=scope;input.currentScope=()=>current;t.count=vi.fn(async()=>{current=fingerprint('changed');return {input_tokens:100};});
  await expect(run(input,t)).rejects.toThrow('context changed');expect(t.create).not.toHaveBeenCalled();expect(getMeteredAssignment(actor(),input.assignmentId).attempts).toHaveLength(0);expect(getWalletState(actor()).reservedCents).toBe(0);
 });
 it('cancellation during counting cannot dispatch after the cancellation',async()=>{
  const {input}=setup(),t=transport();t.count=vi.fn(async()=>{finishMeteredAssignment(actor(),input.assignmentId,'canceled');return {input_tokens:100};});
  await expect(run(input,t)).rejects.toThrow('cannot dispatch');expect(t.create).not.toHaveBeenCalled();
 });
 it('withholds an in-flight answer after source change while retaining its incurred usage',async()=>{
  const {input}=setup(),t=transport();let current=scope;input.currentScope=()=>current;t.create=vi.fn(async()=>{current=fingerprint('changed');return response();});
  await expect(run(input,t)).rejects.toThrow('output is withheld');expect(getMeteredAssignment(actor(),input.assignmentId)).toMatchObject({status:'canceled',budget:{spentCents:1,reservedCents:0}});
 });
 it('cancellation during inference keeps its hold until the original receipt and never exposes late output',async()=>{
  const {input}=setup(),t=transport();t.create=vi.fn(async()=>{expect(finishMeteredAssignment(actor(),input.assignmentId,'canceled').status).toBe('reconciling');expect(getWalletState(actor()).reservedCents).toBeGreaterThan(0);return response();});
  expect(await run(input,t)).toMatchObject({output:null,assignment:{status:'canceled',budget:{spentCents:1,reservedCents:0}}});
 });
 it.each([{usage:undefined},{model:'other'},{service_tier:'priority'},{status:'in_progress'},{id:undefined},{usage:{input_tokens:1,output_tokens:1,input_tokens_details:{cached_tokens:2}}}])('retains uncertain holds and prevents further calls for %j',async extra=>{
  const {input}=setup(),t=transport();t.create=vi.fn(async()=>response(extra));await expect(run(input,t)).rejects.toThrow();
  const state=getMeteredAssignment(actor(),input.assignmentId);expect(state.status).toBe('reconciling');expect(state.attempts[0].status).toBe('unknown');expect(state.budget.reservedCents).toBeGreaterThan(0);
  await expect(run({...input,attemptId:key()},t)).rejects.toThrow('approve');expect((await run(input,t)).dispatched).toBe(false);expect(t.create).toHaveBeenCalledTimes(1);
 });
 it('a timed-out request is never treated as free or automatically retried',async()=>{
  const {input}=setup(),t=transport();t.create=vi.fn(async()=>{throw new Error('timeout');});await expect(run(input,t)).rejects.toThrow('timeout');
  expect((await run(input,t)).dispatched).toBe(false);expect(getMeteredAssignment(actor(),input.assignmentId).budget.reservedCents).toBeGreaterThan(0);
 });
 it.each([400,401,403,404,429,500])('handles HTTP %i without returning output',async status=>{
  const {input}=setup(),t=transport();t.create=vi.fn(async()=>({status,body:{}}));
  const result=await run(input,t);expect(result.output).toBeNull();expect(result.assignment.budget.spentCents).toBe(0);
  expect(result.assignment.status).toBe(status===500?'reconciling':'canceled');expect(result.assignment.budget.reservedCents>0).toBe(status===500);
 });
 it.each(['incomplete','failed','canceled','cancelled'])('settles %s consumed usage, stops the assignment and returns no partial output',async status=>{
  const {input}=setup(),t=transport();t.create=vi.fn(async()=>response({status}));expect(await run(input,t)).toMatchObject({output:null,assignment:{status:'canceled',budget:{spentCents:1,reservedCents:0}}});
 });
 it('refuses built-in tools, files, production models and caller pricing before any transport',async()=>{
  const {input}=setup(),t=transport();
  for(const payload of [{...input.payload,model:'gpt-6-astra'},{...input.payload,tools:[{type:'web_search'}]},{...input.payload,input:[{role:'user',content:[{type:'input_file',file_id:'unpriced'}]}]},{...input.payload,price:0}])await expect(executeResponsesAdmissionTest(actor(),{...input,payload},t)).rejects.toThrow();
  expect(t.count).not.toHaveBeenCalled();expect(t.create).not.toHaveBeenCalled();
 });
 it('uses the counted input to enforce aggregate quotas before inference and never trusts a forged caller bound',async()=>{
  const {input}=setup(),t=transport();t.count=vi.fn(async()=>({input_tokens:1001}));await expect(run(input,t)).rejects.toThrow('allocation');expect(t.create).not.toHaveBeenCalled();expect(getWalletState(actor()).reservedCents).toBe(0);
 });
 it('records excessive receipt usage but withholds its output and caps the customer debit',async()=>{
  const {input}=setup(),t=transport();t.create=vi.fn(async()=>response({usage:{input_tokens:100,output_tokens:30000}}));const result=await run(input,t);
  expect(result.output).toBeNull();expect(result.assignment.attempts[0].discrepancy).toContain('exceeded');expect(result.assignment.unbilledMicros).toBeGreaterThan(0);expect(result.assignment.budget.spentCents).toBe(result.assignment.budget.maximumCents);
 });
 it('stops when total input exceeds the count even if each cache class fits its separate conservative allowance',async()=>{
  const {input}=setup(),t=transport();t.create=vi.fn(async()=>response({usage:{input_tokens:150,output_tokens:40,input_tokens_details:{cached_tokens:75}}}));
  expect(await run(input,t)).toMatchObject({output:null,assignment:{status:'canceled',budget:{spentCents:1,reservedCents:0}}});
  await expect(run({...input,attemptId:key()},t)).rejects.toThrow('approve');
 });
 it('enforces private assignment ownership before counting',async()=>{
  const {input}=setup(),t=transport();await expect(executeResponsesAdmissionTest(demoActor('manager'),input,t)).rejects.toThrow('not found');expect(t.count).not.toHaveBeenCalled();
 });
 it.each(['before_count','during_inference'])('rechecks subscription access %s without erasing incurred usage',async when=>{
  const {input}=setup(),t=transport();const cancel=()=>simulateLifecycle(demoActor('manager'),{userId:actor().id,action:'cancel_now',expectedVersion:subscription(actor()).version,eventKey:key()});
  if(when==='before_count')cancel();else t.create=vi.fn(async()=>{cancel();return response();});
  await expect(run(input,t)).rejects.toThrow();
  if(when==='before_count'){expect(t.count).not.toHaveBeenCalled();expect(t.create).not.toHaveBeenCalled();}
  else expect(getMeteredAssignment(actor(),input.assignmentId)).toMatchObject({status:'canceled',budget:{spentCents:1,reservedCents:0}});
 });
});
