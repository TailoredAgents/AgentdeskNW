import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {prepareEvaluation,runEvaluation,inspectEvaluation,inspectEvaluationCampaign,prepareToolRehearsal,executeToolRehearsalRequest,finishToolRehearsal,evaluationPolicy,type EvaluationTransport,type EvaluationLedger,type EvaluationPlan,type ToolRehearsalScenario} from '../evaluations/specialists/runner';

const roots:string[]=[];
const json=<T=Record<string,unknown>>(path:string):T=>JSON.parse(readFileSync(path,'utf8')) as T;
const save=(path:string,value:unknown)=>writeFileSync(path,JSON.stringify(value));
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function setup(){const root=mkdtempSync(join(tmpdir(),'agentdesk-eval-test-'));roots.push(root);const prepared=prepareEvaluation(root,'compare','a'.repeat(40));return {root,...prepared,approval:{planHash:prepared.planHash,maximumCents:999}};}
const scenarios:ToolRehearsalScenario[]=[{id:'buyers',role:'dispositions',request:'Match current fictional buyers.'},{id:'intake',role:'acquisitions',request:'Review the fictional intake gaps.'},{id:'workload',role:'manager',request:'Review fictional office blockers.'}];
function fake(options:{count?:number;change?:(raw:Record<string,unknown>,index:number)=>void;failCreate?:boolean}={}){
 const counts:Record<string,unknown>[]=[],requests:Record<string,unknown>[]=[],requestIds:string[]=[];
 const transport:EvaluationTransport={count:async body=>{counts.push(JSON.parse(body));return {status:200,body:JSON.stringify({object:'response.input_tokens',input_tokens:options.count??120})};},create:async(body,id)=>{
  const request=JSON.parse(body) as Record<string,unknown>;requests.push(request);requestIds.push(id);if(options.failCreate)throw new Error('Synthetic transport failure.');
  const index=requests.length,raw:Record<string,unknown>={id:`response-${index}`,model:request.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:80}},output:[{type:'reasoning',id:`reason-${index}`,summary:[],encrypted_content:`opaque-${index}`},{type:'message',role:'assistant',status:'completed',phase:null,content:[{type:'output_text',text:`Synthetic advisory answer ${index}.`}]}]};options.change?.(raw,index);
  return {status:200,requestId:`provider-${index}`,body:JSON.stringify(raw)};
 }};return {transport,counts,requests,requestIds};
}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

describe('frozen model comparison and whole campaign',()=>{
 it('prepares 24 calls, equal specialist inputs and a conservative $5.10912 plan inside one $9.99 campaign',()=>{
  const state=setup(),plan=json<EvaluationPlan>(join(state.directory,'plan.json'));
  expect(state).toMatchObject({maximumCalls:24,maximumUsd:5.10912,minimumApprovalCents:511,comparison:'model_comparison',status:'prepared'});
  expect(evaluationPolicy.maximumNanos).toBe(5_109_120_000);
  for(let i=0;i<12;i+=2)expect(plan.packets[i].payload).toEqual(plan.packets[i+1].payload);
  const key=json<{assignments:{model:string}[]}>(join(state.directory,'model-key.json'));expect(key.assignments.filter(a=>a.model==='gpt-6-astra')).toHaveLength(6);expect(key.assignments.filter(a=>a.model==='gpt-6.1-sol')).toHaveLength(6);
  expect(inspectEvaluationCampaign(state.root)).toMatchObject({maximumUsd:9.99,committedMaximumUsd:5.10912,accountedUsd:0,unresolved:[]});
  expect(statSync(join(state.directory,'plan.json')).mode&0o777).toBe(0o600);
  expect(()=>prepareEvaluation(state.root,'compare','a'.repeat(40))).toThrow('already exists');
 });
 it('requires exact whole-plan approval before even counting and forbids a higher campaign cap',async()=>{
  const state=setup(),model=fake();for(const approval of [{...state.approval,planHash:'b'.repeat(64)},{...state.approval,maximumCents:510},{...state.approval,maximumCents:1000}])await expect(runEvaluation(state.root,'compare',approval,model.transport)).rejects.toThrow('approval');
  expect(model.counts).toHaveLength(0);expect(model.requests).toHaveLength(0);
 });
 it('rejects a second full planned run rather than splitting past the campaign maximum',()=>{
  const state=setup();expect(()=>prepareEvaluation(state.root,'second','a'.repeat(40))).toThrow('$9.99');expect(existsSync(join(state.root,'second'))).toBe(false);
  const tool=prepareToolRehearsal(state.root,'tools','a'.repeat(40),scenarios);expect(tool.maximumUsd).toBe(1.26864);expect(inspectEvaluationCampaign(state.root).committedMaximumUsd).toBe(6.37776);
 });
 it('does not accept altered paired instructions before a provider call',async()=>{
  const state=setup(),path=join(state.directory,'plan.json'),plan=json<EvaluationPlan>(path);plan.packets[1].payload.instructions+=' Different method.';const {planHash:ignored,...rest}=plan;void ignored;plan.planHash=digest(rest);save(path,plan);
  const model=fake();await expect(runEvaluation(state.root,'compare',{...state.approval,planHash:plan.planHash},model.transport)).rejects.toThrow('same specialist');expect(model.counts).toHaveLength(0);
 });
 it('rejects a duplicated model-key label before any provider call',async()=>{
  const state=setup(),path=join(state.directory,'plan.json'),keyPath=join(state.directory,'model-key.json'),plan=json<EvaluationPlan>(path),key=json<{assignments:{label:string}[]}>(keyPath);key.assignments[1].label=key.assignments[0].label;save(keyPath,key);plan.modelKeyHash=digest(key);const {planHash:ignored,...rest}=plan;void ignored;plan.planHash=digest(rest);save(path,plan);
  const model=fake();await expect(runEvaluation(state.root,'compare',{...state.approval,planHash:plan.planHash},model.transport)).rejects.toThrow('model key');expect(model.counts).toHaveLength(0);
 });
 it('fails closed when registered evidence is deleted instead of freeing its cap',()=>{const state=setup();rmSync(join(state.directory,'ledger.json'));expect(()=>inspectEvaluationCampaign(state.root)).toThrow('evidence');});
 it('does not release a falsely completed unfinished plan',()=>{const state=setup(),path=join(state.directory,'ledger.json'),ledger=json<EvaluationLedger>(path);ledger.status='completed';save(path,ledger);expect(()=>inspectEvaluationCampaign(state.root)).toThrow('24 completed');});
});

describe('sequential actual transport contract with synthetic responses',()=>{
 it('counts the effective request and preserves only the same arm’s complete previous output',async()=>{
  const state=setup(),model=fake();const result=await runEvaluation(state.root,'compare',state.approval,model.transport);
  expect(result).toMatchObject({status:'completed',completedCalls:24,attemptedCalls:24});expect(model.requests).toHaveLength(24);expect(model.counts).toHaveLength(24);expect(new Set(model.requestIds).size).toBe(24);
  for(let i=0;i<24;i++){
   const {max_output_tokens,service_tier,store,include,...counted}=model.requests[i];void max_output_tokens;void service_tier;void store;void include;expect(model.counts[i]).toEqual(counted);
   expect(model.requests[i]).toMatchObject({tools:[],reasoning:{effort:'high'},max_output_tokens:4096,service_tier:'default',store:false,include:['reasoning.encrypted_content'],parallel_tool_calls:false});
   const input=model.requests[i].input as Record<string,unknown>[];
   if(i%2===0)expect(input).toHaveLength(1);else{expect(input).toHaveLength(4);expect(input[1]).toMatchObject({type:'reasoning',encrypted_content:`opaque-${i}`});expect(input[2]).toMatchObject({type:'message',phase:null});}
  }
  expect(model.requests.filter(r=>r.model==='gpt-6-astra')).toHaveLength(12);expect(model.requests.filter(r=>r.model==='gpt-6.1-sol')).toHaveLength(12);
  const blind=readFileSync(join(state.directory,'blind-answers.json'),'utf8');expect(blind).not.toContain('gpt-6');expect(blind).not.toContain('Apply this provisional working method');expect(blind).not.toContain('opaque-');expect(JSON.parse(blind).transcripts).toHaveLength(12);
  const first=json<EvaluationLedger>(join(state.directory,'ledger.json')).attempts[0];expect(first.providerRequestId).toBe('provider-1');expect(first.usage).toEqual({inputTokens:100,cachedInputTokens:20,outputTokens:200,reasoningTokens:80});expect(first.accountedNanos).toBe(first.model==='gpt-6-astra'?12_500_000:2_500_000);
  expect(statSync(join(state.directory,'requests','answer-01.json')).mode&0o777).toBe(0o600);
  const noRepeat=fake();await runEvaluation(state.root,'compare',state.approval,noRepeat.transport);expect(noRepeat.counts).toHaveLength(0);expect(noRepeat.requests).toHaveLength(0);
 });
 it('pauses after sample one and completes only remaining calls on explicit continuation',async()=>{
  const state=setup(),model=fake();expect(await runEvaluation(state.root,'compare',{...state.approval,throughSample:1},model.transport)).toMatchObject({status:'paused',completedCalls:12});expect(model.requests).toHaveLength(12);
  expect(await runEvaluation(state.root,'compare',state.approval,model.transport)).toMatchObject({status:'completed',completedCalls:24});expect(model.requests).toHaveLength(24);
 });
 it('saves the dispatch claim before awaiting a potentially unknown response, then prevents both retry and fresh spending',async()=>{
  const state=setup(),model=fake({failCreate:true}),create=model.transport.create;model.transport.create=async(body,id)=>{expect(json<EvaluationLedger>(join(state.directory,'ledger.json')).attempts[0].status).toBe('dispatching');return create(body,id);};
  await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('stopped');expect(model.requests).toHaveLength(1);expect(inspectEvaluation(state.root,'compare')).toMatchObject({status:'stopped',unresolved:['answer-01']});
  await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('unresolved');expect(()=>prepareToolRehearsal(state.root,'other','a'.repeat(40),scenarios)).toThrow('unresolved');expect(model.requests).toHaveLength(1);
 });
 it('blocks oversized counted input without making a generation call',async()=>{const state=setup(),model=fake({count:6001});await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('Input counting');expect(model.requests).toHaveLength(0);expect(inspectEvaluation(state.root,'compare')).toMatchObject({status:'paused',attemptedCalls:0});});
 it('retains a private count rejection for diagnosis without sending or retrying a generation',async()=>{
  const state=setup(),model=fake();model.transport.count=async()=>({status:400,body:'{"error":{"message":"Unsupported count field."}}',requestId:'count-rejection-1'});
  await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('input_count_http_400');expect(model.requests).toHaveLength(0);expect(inspectEvaluation(state.root,'compare')).toMatchObject({status:'paused',attemptedCalls:0,lastCountFailure:{attemptId:'answer-01',code:'input_count_http_400'}});
  const files=readdirSync(join(state.directory,'counts'));expect(files).toHaveLength(1);const path=join(state.directory,'counts',files[0]);expect(json(path)).toMatchObject({httpStatus:400,providerRequestId:'count-rejection-1',responseBody:'{"error":{"message":"Unsupported count field."}}',failureCode:'input_count_http_400'});expect(statSync(path).mode&0o777).toBe(0o600);
 });
 it.each(['model','tier','missing_usage','invalid_cache','malformed'] as const)('retains uncertainty for an invalid %s receipt',async kind=>{
  const state=setup(),model=fake({change:raw=>{if(kind==='model')raw.model='wrong';if(kind==='tier')raw.service_tier='priority';if(kind==='missing_usage')delete raw.usage;if(kind==='invalid_cache')raw.usage={input_tokens:100,output_tokens:200,input_tokens_details:{cached_tokens:101}};}});
  if(kind==='malformed')model.transport.create=async()=>({status:200,body:'{broken'});
  await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('stopped');expect(inspectEvaluation(state.root,'compare').unresolved).toEqual(['answer-01']);
 });
 it.each(['incomplete','function_call','usage_overrun','no_final'] as const)('records and stops %s without grading partial output',async kind=>{
  const state=setup(),model=fake({change:raw=>{if(kind==='incomplete')raw.status='incomplete';if(kind==='function_call')raw.output=[{type:'function_call',name:'send_email',arguments:'{}'}];if(kind==='usage_overrun')raw.usage={input_tokens:121,output_tokens:200};if(kind==='no_final')raw.output=[{type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'Still thinking.'}]}];}});
  await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('stopped');expect(model.requests).toHaveLength(1);expect(json<{transcripts:unknown[]}>(join(state.directory,'blind-answers.json')).transcripts).toHaveLength(0);expect(inspectEvaluation(state.root,'compare').status).toBe('stopped');
 });
 it('never automatically retries an HTTP rejection',async()=>{const state=setup(),model=fake();model.transport.create=async()=>({status:429,body:'{"error":"not printed"}'});await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('stopped');expect(inspectEvaluation(state.root,'compare')).toMatchObject({attemptedCalls:1,accountedMaximumUsd:0,unresolved:[]});});
 it('rejects duplicate provider response identity before continuing',async()=>{const state=setup(),model=fake({change:raw=>{raw.id='same-response';}});await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('stopped');expect(model.requests).toHaveLength(2);expect(inspectEvaluation(state.root,'compare').unresolved).toEqual(['answer-02']);});
 it('uses an exclusive root lock so competing runners cannot dispatch',async()=>{
  const state=setup(),model=fake();let release!:()=>void;let entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;}),count=model.transport.count;let first=true;
  model.transport.count=async body=>{if(first){first=false;entered();await gate;}return count(body);};const running=runEvaluation(state.root,'compare',state.approval,model.transport);await ready;
  await expect(runEvaluation(state.root,'compare',state.approval,model.transport)).rejects.toThrow('lock');release();await running;expect(model.requests).toHaveLength(24);
 });
});

function toolBody(overrides:Record<string,unknown>={}){return JSON.stringify({model:'gpt-6.1-sol',reasoning:{effort:'high'},input:[{role:'developer',content:'Fictional approved tool rehearsal.'},{role:'user',content:'Read the current fictional record.'}],tools:[{type:'function',name:'get_record',description:'Read a local fictional record.',parameters:{type:'object',properties:{},required:[],additionalProperties:false},strict:true}],max_output_tokens:4096,service_tier:'default',store:false,include:['reasoning.encrypted_content'],parallel_tool_calls:false,...overrides});}
describe('bounded real-chat transport bridge',()=>{
 it('shares the campaign, returns tool envelopes without invoking tools, and reuses exact saved calls',async()=>{
  const state=setup(),tool=prepareToolRehearsal(state.root,'tools','a'.repeat(40),scenarios),approval={planHash:tool.planHash,maximumCents:999},model=fake({count:20_000,change:raw=>{raw.output=[{type:'function_call',name:'get_record',arguments:'{}',call_id:'read-1',status:'completed'}];}});
  const request={scenarioId:'buyers',requestId:'trusted-request-1',body:toolBody()},result=await executeToolRehearsalRequest(state.root,'tools',approval,request,model.transport);expect(result.output).toEqual([{type:'function_call',name:'get_record',arguments:'{}',call_id:'read-1',status:'completed'}]);
  expect(await executeToolRehearsalRequest(state.root,'tools',approval,request,model.transport)).toEqual(result);expect(model.requests).toHaveLength(1);
  for(const scenario of scenarios.slice(1))await executeToolRehearsalRequest(state.root,'tools',approval,{scenarioId:scenario.id,requestId:`trusted-${scenario.id}`,body:toolBody()},model.transport);
  expect(finishToolRehearsal(state.root,'tools',tool.planHash)).toMatchObject({status:'completed',attemptedCalls:3});expect(inspectEvaluationCampaign(state.root).runs).toHaveLength(2);
 });
 it('bounds each scenario to three calls and blocks changed retry bodies',async()=>{
  const state=setup(),tool=prepareToolRehearsal(state.root,'tools','a'.repeat(40),scenarios),approval={planHash:tool.planHash,maximumCents:999},model=fake();
  for(let index=0;index<3;index++)await executeToolRehearsalRequest(state.root,'tools',approval,{scenarioId:'buyers',requestId:`round-${index}`,body:toolBody()},model.transport);
  await expect(executeToolRehearsalRequest(state.root,'tools',approval,{scenarioId:'buyers',requestId:'round-3',body:toolBody()},model.transport)).rejects.toThrow('round limit');
  await expect(executeToolRehearsalRequest(state.root,'tools',approval,{scenarioId:'buyers',requestId:'round-0',body:toolBody({instructions:'changed'})},model.transport)).rejects.toThrow('differs');expect(model.requests).toHaveLength(3);
 });
 it('rejects paid built-in tools and non-text inputs before any count',async()=>{
  const state=setup(),tool=prepareToolRehearsal(state.root,'tools','a'.repeat(40),scenarios),approval={planHash:tool.planHash,maximumCents:999},model=fake();
  for(const body of [toolBody({tools:[{type:'web_search'}]}),toolBody({input:[{role:'user',content:[{type:'input_image',image_url:'https://example.test/image.png'}]}]}),toolBody({model:'gpt-6-astra'}),toolBody({max_output_tokens:5000})])await expect(executeToolRehearsalRequest(state.root,'tools',approval,{scenarioId:'buyers',requestId:'invalid',body},model.transport)).rejects.toThrow();
  expect(model.counts).toHaveLength(0);expect(model.requests).toHaveLength(0);
 });
 it('preserves unknown tool usage across the whole campaign',async()=>{
  const state=setup(),tool=prepareToolRehearsal(state.root,'tools','a'.repeat(40),scenarios),model=fake({failCreate:true});await expect(executeToolRehearsalRequest(state.root,'tools',{planHash:tool.planHash,maximumCents:999},{scenarioId:'buyers',requestId:'unknown',body:toolBody()},model.transport)).rejects.toThrow('stopped');
  await expect(runEvaluation(state.root,'compare',state.approval,fake().transport)).rejects.toThrow('unresolved');expect(inspectEvaluationCampaign(state.root).unresolved).toHaveLength(1);
 });
});
