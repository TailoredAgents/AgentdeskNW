import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat,dispatchTool,toolDefinitions} from '../src/server/orchestrator';
import {getConversation,listTasks} from '../src/server/services';
import {getWorkRun,listWorkRuns,processWorkRuns} from '../src/server/work-runs';
import {getWalletState} from '../src/server/wallet';
import {dispatchWorkTool} from '../src/server/work-tooling';

let seq=0;
const call=(name:string,args:unknown,callId=`call-${++seq}`)=>({id:`fc-${++seq}`,type:'function_call',status:'completed',name,arguments:JSON.stringify(args),call_id:callId});
const response=(output:unknown[])=>new Response(JSON.stringify({id:`resp-${++seq}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:40}}),{headers:{'content-type':'application/json'}});
const message=(text:string)=>({id:`msg-${++seq}`,type:'message',role:'assistant',status:'completed',phase:'final_answer',content:[{type:'output_text',text,annotations:[]}]});
const plan={title:'Review Mike and the property',steps:[{key:'property',capabilityId:'inspect_property',inputJson:JSON.stringify({propertyId:'property-maple'}),dependsOn:[]},{key:'relationship',capabilityId:'relationship_next_step',inputJson:JSON.stringify({investorId:'investor-mike'}),dependsOn:['property']}]};
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','mock-work-key');vi.stubEnv('OPENAI_MODEL','gpt-6-astra');seq=0;});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('Copilot durable work integration',()=>{
 it('accepts a model-composed plan, returns a saved job and completes it without additional model calls',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(response([call('start_work',plan)])).mockResolvedValueOnce(response([message('Your job is saved and queued, not completed yet.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor(),tasksBefore=listTasks(actor).length;
  const result=await chat(actor,'Prepare a saved job to review this property and Mike’s relationship.',undefined,'work-model-one');
  expect(result.result.artifacts.some(a=>a.type==='work_run')).toBe(true);const run=listWorkRuns(actor)[0];expect(run.status).toBe('queued');expect(run.steps.every(s=>s.status==='pending')).toBe(true);
  processWorkRuns(actor,10);expect(getWorkRun(actor,run.id).status).toBe('completed');expect(getWorkRun(actor,run.id).budget.spentCents).toBe(35);expect(listTasks(actor)).toHaveLength(tasksBefore);expect(mock).toHaveBeenCalledTimes(2);
  await chat(actor,'Prepare a saved job to review this property and Mike’s relationship.',undefined,'work-model-one');expect(listWorkRuns(actor)).toHaveLength(1);expect(mock).toHaveBeenCalledTimes(2);
 });
 it('binds all start calls in one employee turn to one assignment instead of splitting the budget',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(response([call('start_work',plan,'first')])).mockResolvedValueOnce(response([call('start_work',{...plan,title:'Second job to evade the first budget'},'second')])).mockResolvedValueOnce(response([message('The original job remains saved.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();await chat(actor,'Prepare one saved review job.',undefined,'work-model-split');expect(listWorkRuns(actor)).toHaveLength(1);
  const last=JSON.parse(mock.mock.calls[2][1].body as string) as {input:Array<{type:string;output?:string}>};expect(last.input.filter(v=>v.type==='function_call_output').at(-1)?.output).toMatch(/different work/);
 });
 it('does not expose model spending approval, wallet purchasing or arbitrary step charges',async()=>{
  const actor=demoActor();for(const name of ['approve_work_cost','decide_work_cost','top_up_work_wallet'])await expect(dispatchTool(actor,name,{})).rejects.toThrow(/Unknown/);
  expect(()=>dispatchWorkTool(actor,'start_work',{...plan,steps:[{...plan.steps[1],dependsOn:[],inputJson:JSON.stringify({investorId:'investor-mike',maximumCents:1})}]},{conversationId:'fake',requestId:'price-injection',message:'Review a relationship job'})).toThrow();
  expect(listWorkRuns(actor)).toHaveLength(0);
 });
 it('does not save a task from a model plan unless the actual employee asked for it',()=>{
  const actor=demoActor(),before=listTasks(actor).length;
  const input={title:'Unrequested follow-up',steps:[{key:'followup',capabilityId:'create_followup',inputJson:JSON.stringify({title:'Unrequested task',dueAt:null,investorId:null}),dependsOn:[]}]};
  expect(()=>dispatchWorkTool(actor,'start_work',input,{conversationId:'unused',requestId:'unsolicited',message:'What are my priorities?'})).toThrow(/not explicitly requested/);
  expect(()=>dispatchWorkTool(actor,'start_work',input,{conversationId:'unused',requestId:'declined',message:'Review priorities without creating a task.'})).toThrow();expect(listTasks(actor)).toHaveLength(before);
 });
 it('redacts saved job conversation and replay after source ownership is revoked',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(response([call('start_work',plan)])).mockResolvedValueOnce(response([message('Private work-result marker for Mike.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor(),first=await chat(actor,'Prepare a private relationship review job.',undefined,'work-private');const run=listWorkRuns(actor)[0];
  getDb().prepare('UPDATE investors SET owner_id=? WHERE id=?').run('user-jordan','investor-mike');
  expect(getWorkRun(actor,run.id).contentRestricted).toBe(true);expect(JSON.stringify(getConversation(actor,first.conversation.id))).not.toContain('Private work-result marker');
  const replay=await chat(actor,'Prepare a private relationship review job.',undefined,'work-private');expect(JSON.stringify(replay)).not.toContain('Private work-result marker');expect(mock).toHaveBeenCalledTimes(2);
 });
 it('offers an honest offline starter and preserves the same job across read-only status requests',async()=>{
  vi.stubEnv('OPENAI_API_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const actor=demoActor();
  const first=await chat(actor,'Start a job for 123 Example Street and Mike Bennett and create a follow-up task.',undefined,'offline-work');const run=listWorkRuns(actor)[0];expect(run.budget.maximumCents).toBe(100);expect(first.result.message).toContain('fictional cost');
  processWorkRuns(actor,10);const next=await chat(actor,'Show my Copilot jobs',first.conversation.id,'offline-status');expect(next.result.message).toContain('completed');expect(next.result.artifacts[0].id).toBe(run.id);expect(fetch).not.toHaveBeenCalled();expect(getWalletState(actor).spentThisPeriodCents).toBe(75);
 });
 it('keeps new strict model tool envelopes closed and every field required',()=>{
  const definitions=toolDefinitions().filter(t=>['start_work','work_status','work_capabilities'].includes(t.name));expect(definitions).toHaveLength(3);
  const check=(value:unknown)=>{if(!value||typeof value!=='object')return;const item=value as {type?:string;properties?:Record<string,unknown>;required?:string[];additionalProperties?:boolean};if(item.type==='object'){expect(item.additionalProperties).toBe(false);expect(new Set(item.required??[])).toEqual(new Set(Object.keys(item.properties??{})));}Object.values(value).forEach(check);};
  definitions.forEach(tool=>{expect(tool.strict).toBe(true);check(tool.parameters);});
 });
});
