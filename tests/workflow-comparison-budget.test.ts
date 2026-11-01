import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {executeWorkflowComparisonRequest,finishWorkflowComparison,inspectEvaluationCampaign,inspectWorkflowComparison,prepareWorkflowComparison,recordWorkflowComparisonOutcome,workflowComparisonPolicy,prepareToolRehearsal,executeToolRehearsalRequest,finishToolRehearsal,prepareEvaluation,runEvaluation,type EvaluationTransport,type WorkflowComparisonSlot,type WorkflowComparisonBindings,type EvaluationLedger} from '../evaluations/specialists/runner';

const roots:string[]=[];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=<T=Record<string,unknown>>(path:string):T=>JSON.parse(readFileSync(path,'utf8')) as T;
const write=(path:string,value:unknown)=>writeFileSync(path,JSON.stringify(value));
function root(){const value=mkdtempSync(join(tmpdir(),'agentdesk-workflow-budget-'));roots.push(value);return value;}
function slots():WorkflowComparisonSlot[]{return (['dispositions','acquisitions','manager'] as const).flatMap(role=>(['guided','generic'] as const).flatMap(arm=>([0,1] as const).map(turn=>({id:`${role}-${arm}-${turn}`,role,arm,turn,conversationId:`conversation-${role}`,employeeRequestId:`employee-${role}-${arm}-${turn}`,request:turn===0?`Prepare the fictional ${role} work.`:`Update the fictional ${role} work using the correction and artifact {{id}}.`,maxCalls:role==='dispositions'?4:3}))));}
function body(request:string,changes:Record<string,unknown>={}){return JSON.stringify({model:'gpt-6.1-sol',reasoning:{effort:'high'},input:[{role:'developer',content:'Use the current fictional scoped tool data.'},{role:'user',content:request}],tools:[{type:'function',name:'read_record',parameters:{type:'object',properties:{},required:[],additionalProperties:false},strict:true}],max_output_tokens:4096,service_tier:'default',store:false,include:['reasoning.encrypted_content'],parallel_tool_calls:false,...changes});}
function fake(options:{count?:number;fail?:boolean;change?:(response:Record<string,unknown>)=>void}={}):EvaluationTransport&{count:ReturnType<typeof vi.fn>;create:ReturnType<typeof vi.fn>}{
 let calls=0;
 return {count:vi.fn(async()=>({status:200,body:JSON.stringify({object:'response.input_tokens',input_tokens:options.count??1000})})),create:vi.fn(async(text:string)=>{
  if(options.fail)throw new Error('Uncertain transport');const request=JSON.parse(text),response:Record<string,unknown>={id:`response-${++calls}`,model:request.model,service_tier:'default',status:'completed',usage:{input_tokens:100,output_tokens:200,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:100}},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Synthetic completed output, not a quality judgment.'}]}]};options.change?.(response);return {status:200,body:JSON.stringify(response)};
 })};
}
async function existingCampaign(){
 const directory=root(),scenarios=(['dispositions','acquisitions','manager'] as const).map(role=>({id:role,role,request:'Read fictional records.'})),old=prepareToolRehearsal(directory,'previous-tools','a'.repeat(40),scenarios),transport=fake();
 for(const scenario of scenarios)await executeToolRehearsalRequest(directory,'previous-tools',{planHash:old.planHash,maximumCents:999},{scenarioId:scenario.id,requestId:`old-${scenario.id}`,body:body(scenario.request)},transport);
 finishToolRehearsal(directory,'previous-tools',old.planHash);
 const bindings:WorkflowComparisonBindings={campaignId:read<{id:string}>(join(directory,'campaign.json')).id,fixtureHash:'b'.repeat(64),sourceHash:'c'.repeat(64),runtimeHash:'d'.repeat(64)};return {root:directory,bindings};
}
async function prepared(){const state=await existingCampaign(),planned=slots(),run=prepareWorkflowComparison(state.root,'workflow','a'.repeat(40),planned,state.bindings);return {...state,...run,planned,approval:{planHash:run.planHash,maximumCents:999}};}
type State=Awaited<ReturnType<typeof prepared>>;
function input(slot:WorkflowComparisonSlot,round=0,renderedRequest=slot.request){return {slotId:slot.id,conversationId:slot.conversationId,employeeRequestId:slot.employeeRequestId,renderedRequest,requestId:`provider-${slot.id}-${round}`,body:body(renderedRequest)};}
function dispatch(state:State,slot:WorkflowComparisonSlot,transport:EvaluationTransport,round=0){return executeWorkflowComparisonRequest(state.root,'workflow',state.approval,input(slot,round),transport);}
function outcome(state:State,slot:WorkflowComparisonSlot,status:'completed'|'quality_failed'|'prerequisite_skipped'='completed'){return recordWorkflowComparisonOutcome(state.root,'workflow',state.planHash,{slotId:slot.id,status,evidenceHash:'f'.repeat(64),...(status!=='completed'?{reason:'Frozen prerequisite/quality assertion failed.'}:{})});}
afterEach(()=>{for(const value of roots.splice(0))rmSync(value,{recursive:true,force:true});});

describe('same-model workflow campaign plan',()=>{
 it('requires existing original campaign evidence and validates all twelve paired bounded slots',async()=>{
  const state=await existingCampaign(),planned=slots();
  expect(()=>prepareWorkflowComparison(root(),'missing','a'.repeat(40),planned,state.bindings)).toThrow('original shared campaign');
  expect(()=>prepareWorkflowComparison(state.root,'changed','a'.repeat(40),planned,{...state.bindings,campaignId:'00000000-0000-4000-8000-000000000001'})).toThrow('identity');
  for(const changed of [planned.slice(1),planned.map((slot,index)=>index===0?{...slot,maxCalls:3 as const}:slot),planned.map((slot,index)=>index===0?{...slot,request:'Unequal task'}:slot),planned.map((slot,index)=>index===1?{...slot,conversationId:'other'}:slot)])expect(()=>prepareWorkflowComparison(state.root,'bad','a'.repeat(40),changed,state.bindings)).toThrow();
  const reused=planned.map((slot,index)=>index===2?{...slot,employeeRequestId:planned[0].employeeRequestId}:slot);expect(()=>prepareWorkflowComparison(state.root,'reused','a'.repeat(40),reused,state.bindings)).toThrow('globally distinct');
  const run=prepareWorkflowComparison(state.root,'good','a'.repeat(40),planned,state.bindings);expect(run).toMatchObject({maximumCalls:40,maximumUsd:7.6384,status:'prepared'});expect(workflowComparisonPolicy.maximumNanos).toBe(7_638_400_000);
  expect(inspectEvaluationCampaign(state.root)).toMatchObject({accountedUsd:0.0075,committedMaximumUsd:7.6459,unresolved:[]});
  rmSync(join(state.root,'campaign.json'));expect(()=>inspectWorkflowComparison(state.root,'good')).toThrow('original shared campaign');
 });
 it('reserves the whole plan alongside earlier commitments and rejects an unknown campaign kind',async()=>{
  const state=await existingCampaign();prepareEvaluation(state.root,'unfinished','a'.repeat(40));expect(()=>prepareWorkflowComparison(state.root,'too-large','a'.repeat(40),slots(),state.bindings)).toThrow('$9.99');expect(existsSync(join(state.root,'too-large'))).toBe(false);
  const path=join(state.root,'campaign.json'),campaign=read<{runs:{kind:string}[]}>(path);campaign.runs[0].kind='unrecognized';write(path,campaign);expect(()=>inspectEvaluationCampaign(state.root)).toThrow('accounting');
 });
 it('preserves both historical completed plan kinds after their recorded runner revision differs',async()=>{
  const state=await existingCampaign(),old=prepareEvaluation(state.root,'previous-models','a'.repeat(40));await runEvaluation(state.root,'previous-models',{planHash:old.planHash,maximumCents:999},fake());
  for(const name of ['previous-models','previous-tools']){
   const planPath=join(state.root,name,'plan.json'),ledgerPath=join(state.root,name,'ledger.json'),plan=read<{planHash:string;runnerSourceHash:string}>(planPath);plan.runnerSourceHash='e'.repeat(64);const {planHash:ignored,...content}=plan;void ignored;plan.planHash=digest(content);write(planPath,plan);
   const ledger=read<EvaluationLedger>(ledgerPath);ledger.planHash=plan.planHash;if(ledger.approval)ledger.approval.planHash=plan.planHash;write(ledgerPath,ledger);
   const campaignPath=join(state.root,'campaign.json'),campaign=read<{runs:{name:string;planHash:string}[]}>(campaignPath);campaign.runs.find(run=>run.name===name)!.planHash=plan.planHash;write(campaignPath,campaign);
  }
  expect(inspectEvaluationCampaign(state.root).runs.every(run=>run.status==='completed')).toBe(true);
  expect(prepareWorkflowComparison(state.root,'new','a'.repeat(40),slots(),state.bindings).maximumUsd).toBe(7.6384);
 });
});

describe('workflow counted requests and identity',()=>{
 it('counts the unchanged effective request, persists rendered instructions, and replays without another provider call',async()=>{
  const state=await prepared(),slot=state.planned[0],transport=fake({count:30_000}),request=input(slot),response=await executeWorkflowComparisonRequest(state.root,'workflow',state.approval,request,transport);
  expect(await executeWorkflowComparisonRequest(state.root,'workflow',state.approval,request,transport)).toEqual(response);expect(transport.create).toHaveBeenCalledTimes(1);
  const {max_output_tokens,service_tier,store,include,...counted}=JSON.parse(request.body);void max_output_tokens;void service_tier;void store;void include;expect(transport.count.mock.calls[0][0]).toBe(JSON.stringify(counted));expect(transport.create.mock.calls[0]).toEqual([request.body,request.requestId]);
  expect(read(join(state.directory,'turns',`${slot.id}.json`))).toMatchObject({renderedRequest:slot.request,conversationId:slot.conversationId,employeeRequestId:slot.employeeRequestId});
  await expect(executeWorkflowComparisonRequest(state.root,'workflow',state.approval,{...request,body:body(slot.request,{instructions:'Changed payload'})},transport)).rejects.toThrow('differs');
  for(const changed of [{conversationId:'other'},{employeeRequestId:'other'},{slotId:state.planned[2].id}])await expect(executeWorkflowComparisonRequest(state.root,'workflow',state.approval,{...request,...changed},transport)).rejects.toThrow();
  expect(transport.create).toHaveBeenCalledTimes(1);
 });
 it('binds dynamic second-turn instructions to their own arm and never permits changing them after first dispatch',async()=>{
  const state=await prepared(),first=state.planned[0],second=state.planned[1],transport=fake();await expect(dispatch(state,second,transport)).rejects.toThrow('first turn');await dispatch(state,first,transport);outcome(state,first);
  const rendered='Update the draft from trusted service result draft-123.',request=input(second,0,rendered);await executeWorkflowComparisonRequest(state.root,'workflow',state.approval,request,transport);
  const changed=input(second,1,'Use a different draft.');await expect(executeWorkflowComparisonRequest(state.root,'workflow',state.approval,changed,transport)).rejects.toThrow('rendered request changed');
  await expect(executeWorkflowComparisonRequest(state.root,'workflow',state.approval,{...input(second,1,rendered),body:body('A different latest employee instruction')},transport)).rejects.toThrow('current employee message');
  expect(transport.create).toHaveBeenCalledTimes(2);
 });
 it('enforces separate 4/3 round caps without borrowing from other turns',async()=>{
  const state=await prepared(),transport=fake();for(const slot of [state.planned[0],state.planned[4]]){for(let round=0;round<slot.maxCalls;round++)await dispatch(state,slot,transport,round);await expect(dispatch(state,slot,transport,slot.maxCalls)).rejects.toThrow('round limit');}expect(transport.create).toHaveBeenCalledTimes(7);
 });
 it('checks exact approval, text-only tools and counted bounds before paid dispatch',async()=>{
  const state=await prepared(),transport=fake(),request=input(state.planned[0]);
  for(const approval of [{...state.approval,planHash:'0'.repeat(64)},{...state.approval,maximumCents:1000},{...state.approval,maximumCents:998}])await expect(executeWorkflowComparisonRequest(state.root,'workflow',approval,request,transport)).rejects.toThrow('authorization');
  for(const changes of [{tools:[{type:'web_search'}]},{model:'gpt-6-astra'},{max_output_tokens:5000},{input:[{role:'user',content:[{type:'input_image',image_url:'https://example.test/file'}]}]}])await expect(executeWorkflowComparisonRequest(state.root,'workflow',state.approval,{...request,body:body(request.renderedRequest,changes)},transport)).rejects.toThrow();
  expect(transport.count).not.toHaveBeenCalled();expect(transport.create).not.toHaveBeenCalled();const over=fake({count:30_001});await expect(dispatch(state,state.planned[0],over)).rejects.toThrow('input_count_limit_exceeded');expect(over.create).not.toHaveBeenCalled();
 });
 it('saves the claim before generation and blocks all further paid work after unknown usage',async()=>{
  const state=await prepared(),transport=fake({fail:true}),create=transport.create;transport.create=vi.fn(async(text:string,id:string)=>{expect(read<EvaluationLedger>(join(state.directory,'ledger.json')).attempts[0].status).toBe('dispatching');return create(text,id);});
  await expect(dispatch(state,state.planned[0],transport)).rejects.toThrow('stopped');expect(inspectEvaluationCampaign(state.root).unresolved).toHaveLength(1);
  await expect(dispatch(state,state.planned[0],transport)).rejects.toThrow('unresolved');await expect(dispatch(state,state.planned[4],transport)).rejects.toThrow('unresolved');expect(()=>outcome(state,state.planned[0],'quality_failed')).toThrow('unresolved');expect(()=>finishWorkflowComparison(state.root,'workflow',state.planHash)).toThrow('settled');expect(transport.create).toHaveBeenCalledTimes(1);
 });
 it.each(['model','tier','usage','incomplete','overrun','unsupported'] as const)('stops an invalid %s receipt without mistaking it for poor task quality',async kind=>{
  const state=await prepared(),transport=fake({change:response=>{if(kind==='model')response.model='gpt-6-astra';if(kind==='tier')response.service_tier='priority';if(kind==='usage')delete response.usage;if(kind==='incomplete')response.status='incomplete';if(kind==='overrun')response.usage={input_tokens:1001,output_tokens:200};if(kind==='unsupported')response.output=[{type:'web_search_call',status:'completed'}];}});
  await expect(dispatch(state,state.planned[0],transport)).rejects.toThrow('stopped');expect(()=>outcome(state,state.planned[0],'quality_failed')).toThrow('stopped');expect(transport.create).toHaveBeenCalledTimes(1);
 });
});

describe('quality evidence remains separate from provider accounting',()=>{
 it('continues other cases after a semantic failure, permits only a defined prerequisite skip, and closes immutable outcomes',async()=>{
  const state=await prepared(),transport=fake(),[first,second]=state.planned;await dispatch(state,first,transport);outcome(state,first,'quality_failed');outcome(state,second,'prerequisite_skipped');
  expect(()=>outcome(state,first,'quality_failed')).not.toThrow();expect(()=>outcome(state,first,'completed')).toThrow('immutable');await expect(dispatch(state,second,transport)).rejects.toThrow('closed');
  for(const slot of state.planned.slice(2)){await dispatch(state,slot,transport);outcome(state,slot);}
  const result=finishWorkflowComparison(state.root,'workflow',state.planHash);expect(result).toMatchObject({status:'completed',attemptedCalls:11});expect(result.outcomes).toHaveLength(12);expect(inspectEvaluationCampaign(state.root).committedMaximumUsd).toBe(0.035);
  expect(finishWorkflowComparison(state.root,'workflow',state.planHash).status).toBe('completed');expect(transport.create).toHaveBeenCalledTimes(11);
 });
 it('does not label an unattempted turn completed or skip without the matching failed prerequisite',async()=>{
  const state=await prepared(),[first,second]=state.planned;expect(()=>outcome(state,first)).toThrow('provider receipt');expect(()=>outcome(state,first,'prerequisite_skipped')).toThrow('second turn');expect(()=>outcome(state,second,'prerequisite_skipped')).toThrow('first turn');expect(()=>finishWorkflowComparison(state.root,'workflow',state.planHash)).toThrow('twelve terminal');
  const transport=fake();await dispatch(state,first,transport);outcome(state,first);expect(()=>outcome(state,second,'prerequisite_skipped')).toThrow('failed first-turn');
 });
 it('requires current original campaign and intact request/receipt evidence after completion',async()=>{
  const state=await prepared(),transport=fake();for(const slot of state.planned){await dispatch(state,slot,transport);outcome(state,slot);}finishWorkflowComparison(state.root,'workflow',state.planHash);
  const ledger=read<EvaluationLedger>(join(state.directory,'ledger.json')),requestPath=join(state.directory,ledger.attempts[0].requestFile),request=read<{conversationId:string}>(requestPath);request.conversationId='another-conversation';write(requestPath,request);expect(()=>inspectEvaluationCampaign(state.root)).toThrow('binding changed');
 });
});
