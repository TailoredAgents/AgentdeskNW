import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {executeWorkflowComparisonRequest,finishWorkflowComparison,inspectEvaluationCampaign,inspectWorkflowComparison,prepareWorkflowComparison,prepareWorkflowCapacityFollowup,prepareWorkflowCapacityConfirmation,closeWorkflowAfterCountLimit,recordWorkflowComparisonOutcome,workflowComparisonPolicy,workflowCapacityFollowupPolicy,workflowCapacityConfirmationPolicy,prepareToolRehearsal,executeToolRehearsalRequest,finishToolRehearsal,prepareEvaluation,runEvaluation,type EvaluationTransport,type WorkflowComparisonSlot,type WorkflowComparisonBindings,type EvaluationLedger} from '../evaluations/specialists/runner';

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

function capacitySlots(state:State):WorkflowComparisonSlot[]{return state.planned.filter(slot=>slot.role!=='acquisitions').map(slot=>({...slot,id:`follow-${slot.id}`,employeeRequestId:`follow-${slot.employeeRequestId}`,maxCalls:5}));}
function capacityPrepare(state:State,name='capacity',planned=capacitySlots(state),bindings=state.bindings){return prepareWorkflowCapacityFollowup(state.root,name,'b'.repeat(40),planned,bindings,{name:'workflow',planHash:state.planHash});}
async function completedOriginal(){const state=await prepared(),transport=fake({count:30_000});for(const slot of state.planned){await dispatch(state,slot,transport);outcome(state,slot);}finishWorkflowComparison(state.root,'workflow',state.planHash);return state;}

describe('fixed capacity and lossless-output follow-up',()=>{
 it('requires the completed registered original and exactly eight matching fresh disposition/manager turns',async()=>{
  const state=await prepared();expect(()=>capacityPrepare(state)).toThrow('must be completed');const transport=fake();for(const slot of state.planned){await dispatch(state,slot,transport);outcome(state,slot);}finishWorkflowComparison(state.root,'workflow',state.planHash);
  const planned=capacitySlots(state);
  for(const changed of [planned.slice(1),planned.map(slot=>({...slot,maxCalls:4 as const})),planned.map(slot=>slot.role==='dispositions'?{...slot,role:'acquisitions' as const}:slot)])expect(()=>capacityPrepare(state,'invalid',changed)).toThrow();
  expect(()=>capacityPrepare(state,'fixture',planned,{...state.bindings,fixtureHash:'e'.repeat(64)})).toThrow('same immutable fixture');
  expect(()=>capacityPrepare(state,'template',planned.map(slot=>({...slot,request:'A different but paired task.'})))).toThrow('preserve original');
  expect(()=>capacityPrepare(state,'conversation',planned.map(slot=>({...slot,conversationId:`changed-${slot.conversationId}`})))).toThrow('preserve original');
  expect(()=>capacityPrepare(state,'request-reuse',planned.map(slot=>({...slot,employeeRequestId:slot.employeeRequestId.replace('follow-','')})))).toThrow('fresh employee request');
  expect(()=>prepareWorkflowCapacityFollowup(state.root,'wrong-parent','b'.repeat(40),planned,state.bindings,{name:'workflow',planHash:'e'.repeat(64)})).toThrow('original registered');
  const run=capacityPrepare(state);expect(run).toMatchObject({kind:'workflow_capacity_followup',maximumCalls:40,maximumUsd:5.6384,original:{name:'workflow',planHash:state.planHash},policy:{maxInputTokens:20000,maxOutputTokens:4096,correction:'capacity_and_lossless_tool_output_correction'}});expect(run.slots).toHaveLength(8);expect(workflowCapacityFollowupPolicy.maximumNanos).toBe(5_638_400_000);
  expect(inspectEvaluationCampaign(state.root)).toMatchObject({accountedUsd:0.0375,committedMaximumUsd:5.6759});
 });
 it('preserves the original 30k receipts while completing forty bounded calls in eight slots, with exact replay and fresh identities',async()=>{
  const state=await completedOriginal(),originalPlan=readFileSync(join(state.directory,'plan.json'),'utf8'),originalLedger=readFileSync(join(state.directory,'ledger.json'),'utf8'),run=capacityPrepare(state),approval={planHash:run.planHash,maximumCents:999},transport=fake({count:20_000}),planned=capacitySlots(state);
  for(const slot of planned){for(let round=0;round<5;round++)await executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot,round),transport);await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot,5),transport)).rejects.toThrow('round limit');recordWorkflowComparisonOutcome(state.root,'capacity',run.planHash,{slotId:slot.id,status:'completed',evidenceHash:'e'.repeat(64)});}
  expect(finishWorkflowComparison(state.root,'capacity',run.planHash)).toMatchObject({status:'completed',attemptedCalls:40});expect(transport.create).toHaveBeenCalledTimes(40);
  await executeWorkflowComparisonRequest(state.root,'capacity',approval,input(planned[0]),transport);expect(transport.create).toHaveBeenCalledTimes(40);expect(inspectEvaluationCampaign(state.root)).toMatchObject({accountedUsd:0.1375,committedMaximumUsd:0.1375,unresolved:[]});
  expect(readFileSync(join(state.directory,'plan.json'),'utf8')).toBe(originalPlan);expect(readFileSync(join(state.directory,'ledger.json'),'utf8')).toBe(originalLedger);expect(inspectWorkflowComparison(state.root,'workflow')).toMatchObject({status:'completed',policy:{maxInputTokens:30000},attemptedCalls:12});
  expect(()=>capacityPrepare(state,'reused-followup')).toThrow('fresh across the original campaign');
 },20_000);
 it('rejects 20,001 input tokens without generation and prevents changed or unknown retries',async()=>{
  const state=await completedOriginal(),run=capacityPrepare(state),approval={planHash:run.planHash,maximumCents:999},slot=capacitySlots(state)[0],over=fake({count:20_001});
  await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot),over)).rejects.toThrow('input_count_limit_exceeded');expect(over.create).not.toHaveBeenCalled();
  const unknown=fake({count:20_000,fail:true});await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot),unknown)).rejects.toThrow('stopped');
  await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot),unknown)).rejects.toThrow('unresolved');await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,{...input(slot),body:body(slot.request,{instructions:'changed'})},unknown)).rejects.toThrow('unresolved');
  expect(unknown.create).toHaveBeenCalledTimes(1);expect(inspectEvaluationCampaign(state.root).unresolved).toHaveLength(1);expect(()=>finishWorkflowComparison(state.root,'capacity',run.planHash)).toThrow('eight terminal');
 });
 it('reserves the whole new run and fails closed when original proof disappears',async()=>{
  const state=await completedOriginal();prepareEvaluation(state.root,'other-reservation','a'.repeat(40));expect(()=>capacityPrepare(state,'over-cap')).toThrow('$9.99');expect(existsSync(join(state.root,'over-cap'))).toBe(false);
  // A separate completed original can admit the profile, but losing that proof never frees its cost.
  const second=await completedOriginal(),run=capacityPrepare(second);rmSync(join(second.directory,'ledger.json'));expect(()=>inspectWorkflowComparison(second.root,'capacity')).toThrow('evidence');expect(()=>inspectEvaluationCampaign(second.root)).toThrow('evidence');expect(run.maximumUsd).toBe(5.6384);
 });
 it('rejects a follow-up masquerading as its own registered original without recursive validation',async()=>{
  const state=await completedOriginal(),run=capacityPrepare(state),path=join(run.directory,'plan.json'),plan=read<{original:{name:string;planHash:string};planHash:string}>(path);plan.original={name:'capacity',planHash:run.planHash};const {planHash:ignored,...content}=plan;void ignored;plan.planHash=digest(content);write(path,plan);
  const campaignPath=join(state.root,'campaign.json'),campaign=read<{runs:{name:string;kind:string;planHash:string}[]}>(campaignPath),entry=campaign.runs.find(value=>value.name==='capacity')!;entry.kind='workflow_comparison';entry.planHash=run.planHash;write(campaignPath,campaign);
  expect(()=>inspectWorkflowComparison(state.root,'capacity')).toThrow('cannot serve as its own');
 });
});

async function countLimitedCapacity(){
 const state=await completedOriginal(),capacity=capacityPrepare(state),approval={planHash:capacity.planHash,maximumCents:999},slot=capacitySlots(state)[0],transport=fake({count:20_000});
 for(let round=0;round<3;round++)await executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot,round),transport);
 const exceeded=fake({count:20_263});await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot,3),exceeded)).rejects.toThrow('input_count_limit_exceeded');expect(exceeded.create).not.toHaveBeenCalled();
 const countFile=readdirSync(join(capacity.directory,'counts')).find(file=>(read(join(capacity.directory,'counts',file))).failureCode==='input_count_limit_exceeded')!;
 return {state,capacity,approval,slot,transport,countFile:join(capacity.directory,'counts',countFile)};
}
function confirmationSlots(state:State):WorkflowComparisonSlot[]{return capacitySlots(state).map(slot=>({...slot,id:`final-${slot.id}`,employeeRequestId:`final-${slot.employeeRequestId}`,maxCalls:slot.role==='manager'&&slot.turn===0?3:5}));}
function prepareConfirmation(state:State,capacity:{planHash:string},name='confirmation',planned=confirmationSlots(state)){return prepareWorkflowCapacityConfirmation(state.root,name,'c'.repeat(40),planned,state.bindings,{name:'workflow',planHash:state.planHash},{name:'capacity',planHash:capacity.planHash});}
describe('proven preflight closure and final capacity confirmation',()=>{
 it('releases only unused reservation, preserves raw/operator evidence, and permanently closes generation and outcomes',async()=>{
  const {state,capacity,approval,slot,transport}=await countLimitedCapacity(),directory=capacity.directory;write(join(directory,'execution.json'),{status:'stopped'});write(join(directory,'workflow-evidence.json'),{unchanged:'original failed run'});
  const files=['plan.json','execution.json','workflow-evidence.json',...['requests','responses','counts','turns'].flatMap(folder=>readdirSync(join(directory,folder)).map(file=>`${folder}/${file}`))],before=files.map(file=>readFileSync(join(directory,file),'utf8'));
  expect(inspectEvaluationCampaign(state.root).committedMaximumUsd).toBe(5.6759);const closed=closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash);expect(closed).toMatchObject({status:'closed_preflight',attemptedCalls:3,accountedMaximumUsd:0.0075});
  expect(inspectEvaluationCampaign(state.root)).toMatchObject({accountedUsd:0.045,committedMaximumUsd:0.045,unresolved:[]});expect(files.map(file=>readFileSync(join(directory,file),'utf8'))).toEqual(before);
  const ledger=readFileSync(join(directory,'ledger.json'),'utf8'),proof=readFileSync(join(directory,'preflight-closure.json'),'utf8');expect(closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash)).toEqual(closed);expect(readFileSync(join(directory,'ledger.json'),'utf8')).toBe(ledger);expect(readFileSync(join(directory,'preflight-closure.json'),'utf8')).toBe(proof);
  const counts=transport.count.mock.calls.length;await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot),transport)).rejects.toThrow('preflight-closed');await expect(executeWorkflowComparisonRequest(state.root,'capacity',approval,input(slot,4),transport)).rejects.toThrow('preflight-closed');expect(transport.count.mock.calls.length).toBe(counts);expect(transport.create).toHaveBeenCalledTimes(3);
  expect(()=>recordWorkflowComparisonOutcome(state.root,'capacity',capacity.planHash,{slotId:slot.id,status:'quality_failed',reason:'Cannot reopen',evidenceHash:'a'.repeat(64)})).toThrow('preflight-closed');expect(()=>finishWorkflowComparison(state.root,'capacity',capacity.planHash)).toThrow('eight terminal');
  const proofPath=join(directory,'preflight-closure.json');rmSync(proofPath);expect(()=>inspectEvaluationCampaign(state.root)).toThrow('evidence');
 });
 it('refuses unknown/incomplete generation, generation files, mismatched or forged count evidence',async()=>{
  const {state,capacity,countFile}=await countLimitedCapacity(),ledgerPath=join(capacity.directory,'ledger.json'),savedLedger=readFileSync(ledgerPath,'utf8'),savedCount=readFileSync(countFile,'utf8');
  for(const status of ['unknown','incomplete'] as const){const ledger=JSON.parse(savedLedger) as EvaluationLedger;ledger.attempts[0].status=status;write(ledgerPath,ledger);expect(()=>closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash)).toThrow('settled');writeFileSync(ledgerPath,savedLedger);}
  const failed=read<EvaluationLedger>(ledgerPath).lastCountFailure!.attemptId;for(const folder of ['requests','responses']){const path=join(capacity.directory,folder,`${failed}.json`);write(path,{});expect(()=>closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash)).toThrow('dispatch file');rmSync(path);}
  for(const change of [{httpStatus:500},{responseBody:'{"object":"response.input_tokens","input_tokens":20000}'},{responseBody:'{"object":"other","input_tokens":20263}'},{failureCode:'input_count_invalid_response'},{responseBodyTruncated:true}]){write(countFile,{...JSON.parse(savedCount),...change});expect(()=>closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash)).toThrow();writeFileSync(countFile,savedCount);}
  const forgedLedger=JSON.parse(savedLedger) as EvaluationLedger;forgedLedger.lastCountFailure!.attemptId='workflow-'+ 'f'.repeat(32);write(ledgerPath,forgedLedger);expect(()=>closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash)).toThrow('Exactly one');writeFileSync(ledgerPath,savedLedger);
  expect(existsSync(join(capacity.directory,'preflight-closure.json'))).toBe(false);expect(inspectEvaluationCampaign(state.root).committedMaximumUsd).toBe(5.6759);
 });
 it('invalidates released capacity if settled receipts or bound count evidence change',async()=>{
  const {state,capacity,countFile}=await countLimitedCapacity();closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash);const raw=readFileSync(countFile,'utf8');writeFileSync(countFile,raw+' ');expect(()=>inspectEvaluationCampaign(state.root)).toThrow('closure proof changed');writeFileSync(countFile,raw);
  const ledgerPath=join(capacity.directory,'ledger.json'),ledger=read<EvaluationLedger>(ledgerPath);ledger.attempts[0].accountedNanos=0;write(ledgerPath,ledger);expect(()=>inspectEvaluationCampaign(state.root)).toThrow('completed receipt');
 });
 it('admits exactly36 responses at25k with manager3/5 caps only after verified closure',async()=>{
  const {state,capacity}=await countLimitedCapacity();expect(()=>prepareConfirmation(state,capacity)).toThrow('verified preflight closure');closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash);
  expect(()=>prepareConfirmation(state,capacity,'wrong-caps',confirmationSlots(state).map(slot=>({...slot,maxCalls:5})))).toThrow('call limits');
  const run=prepareConfirmation(state,capacity),approval={planHash:run.planHash,maximumCents:999},planned=confirmationSlots(state);expect(run).toMatchObject({kind:'workflow_capacity_confirmation',maximumCalls:36,maximumUsd:5.97456,policy:{maxInputTokens:25000,maxOutputTokens:4096},after:{name:'capacity',planHash:capacity.planHash}});expect(run.after?.closureHash).toBe(inspectWorkflowComparison(state.root,'capacity').closure?.hash);expect(workflowCapacityConfirmationPolicy.maximumNanos).toBe(5_974_560_000);expect(inspectEvaluationCampaign(state.root).committedMaximumUsd).toBe(6.01956);
  const over=fake({count:25_001});await expect(executeWorkflowComparisonRequest(state.root,'confirmation',approval,input(planned[0]),over)).rejects.toThrow('input_count_limit_exceeded');expect(over.create).not.toHaveBeenCalled();
  const transport=fake({count:25_000});for(const slot of planned){for(let round=0;round<slot.maxCalls;round++)await executeWorkflowComparisonRequest(state.root,'confirmation',approval,input(slot,round),transport);await expect(executeWorkflowComparisonRequest(state.root,'confirmation',approval,input(slot,slot.maxCalls),transport)).rejects.toThrow('round limit');recordWorkflowComparisonOutcome(state.root,'confirmation',run.planHash,{slotId:slot.id,status:'completed',evidenceHash:'b'.repeat(64)});}
  expect(finishWorkflowComparison(state.root,'confirmation',run.planHash)).toMatchObject({status:'completed',attemptedCalls:36});expect(transport.create).toHaveBeenCalledTimes(36);expect(inspectEvaluationCampaign(state.root)).toMatchObject({accountedUsd:0.135,committedMaximumUsd:0.135,unresolved:[]});
  const fresh=planned.map(slot=>({...slot,id:`new-${slot.id}`,employeeRequestId:`new-${slot.employeeRequestId}`}));expect(()=>prepareConfirmation(state,capacity,'another-final',fresh)).toThrow('final capacity confirmation is already registered');expect(existsSync(join(state.root,'another-final'))).toBe(false);
 },30_000);
 it('retains campaign-wide reservations and closure provenance when preparing the final profile',async()=>{
  const {state,capacity}=await countLimitedCapacity();closeWorkflowAfterCountLimit(state.root,'capacity',capacity.planHash);prepareEvaluation(state.root,'other-reservation','a'.repeat(40));expect(()=>prepareConfirmation(state,capacity)).toThrow('$9.99');expect(existsSync(join(state.root,'confirmation'))).toBe(false);
  rmSync(join(capacity.directory,'preflight-closure.json'));expect(()=>prepareConfirmation(state,capacity)).toThrow('evidence');
 });
});
