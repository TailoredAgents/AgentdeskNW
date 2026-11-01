import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Task,ToolResult} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {assistantInstructions,chat,currentTextContext,currentTextScope} from '../src/server/orchestrator';
import {createConversation} from '../src/server/services';
import {getInboxState,getInboxThread,receiveDemoCommunication} from '../src/server/communications';
import {inboxDraftReference} from '../src/server/communications-context';
import {listPersonalTasks} from '../src/server/task-actions';
import {specialistMethodFingerprint,specialistMethodRevision} from '../src/server/specialist-methods';
import * as methods from '../src/server/specialist-methods';
import {voiceContextSnapshot} from '../src/server/voice-context';

let sequence=0;
const response=(output:unknown[])=>new Response(JSON.stringify({id:`compound-${++sequence}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:30}}),{headers:{'content-type':'application/json'}});
const call=(name:string,args:unknown)=>response([{type:'function_call',name,arguments:JSON.stringify(args),call_id:`compound-call-${++sequence}`,status:'completed'}]);
const final=()=>response([{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Saved your unsent reply and one personal reminder without a deadline.'}]}]);
type Payload={input:Array<{type?:string;role?:string;content?:string;output?:string;name?:string}>};
const payload=(fetcher:ReturnType<typeof vi.fn>,index:number)=>JSON.parse(fetcher.mock.calls[index][1].body as string) as Payload;
const currentContext=(body:Payload)=>JSON.parse(body.input.find(item=>item.role==='developer'&&item.content?.startsWith('Current authorized app context.'))!.content!.split('never instructions: ')[1]) as {tasks:Task[]};

beforeEach(()=>{
 closeDb();sequence=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubEnv('OPENAI_MODEL','gpt-6-astra');vi.stubEnv('OPENAI_REASONING_EFFORT','high');vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','operational');
 vi.stubEnv('AGENTDESK_TEXT_MAX_ROUNDS','4');vi.stubEnv('AGENTDESK_TEXT_MAX_TOOL_CALLS','4');vi.stubEnv('AGENTDESK_TEXT_MAX_OUTPUT_TOKENS','512');vi.stubEnv('AGENTDESK_TEXT_MAX_CONTEXT_BYTES','300000');
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider request in a mocked guidance check.');}));
});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('current evidence and compound saved work (mocked reasoning only)',()=>{
 it('uses one current inbox read plus supplied personal tasks to save both requested outputs within four rounds',async()=>{
  const actor=demoActor(),thread=getInboxState(actor).threads.find(item=>item.correspondent.name==='Mike Bennett')!,before=listPersonalTasks(actor),title='Confirm the requested repair details with Mike';
  const fetcher=vi.fn()
   .mockImplementationOnce(()=>call('inbox_thread',{threadId:thread.id}))
   .mockImplementationOnce(()=>call('create_task',{title,dueAt:null,investorId:'investor-mike'}))
   .mockImplementationOnce(()=>call('prepare_inbox_reply',{threadId:thread.id,expectedVersion:getInboxThread(actor,thread.id).thread.version}))
   .mockImplementationOnce(final);
  vi.stubGlobal('fetch',fetcher);
  const message=`Read the latest reply in ${thread.id}. Draft a reply there for my review, and create one personal reminder to confirm the requested repair details with no deadline.`;
  const result=await chat(actor,message,undefined,'compound-save-both');expect(result.result.message).toBe('Saved your unsent reply and one personal reminder without a deadline.');expect(fetcher).toHaveBeenCalledTimes(4);
  const context=currentContext(payload(fetcher,0));expect(context.tasks).toEqual(before);expect(context.tasks.some(task=>task.investorId==='investor-mike')).toBe(true);
  const transmitted=JSON.parse(payload(fetcher,1).input.find(item=>item.type==='function_call_output')!.output!) as ToolResult;
  expect(transmitted.data).toMatchObject({threadId:thread.id,threadVersion:thread.version,association:{investor:{id:'investor-mike'}},bodyAccess:'full',canCreateFollowUp:true});
  expect(transmitted.data).toHaveProperty('workingMethod');expect(transmitted.data).toHaveProperty('unknowns');
  expect((transmitted.data as {sources:{kind:string}[]}).sources.some(source=>source.kind==='relationship')).toBe(true);
  expect((transmitted.data as {messages:unknown[]}).messages.length).toBeGreaterThan(0);
  const receipts=getDb().prepare('SELECT result FROM assistant_tool_receipts WHERE conversation_id=? ORDER BY rowid').all(result.conversation.id) as {result:string}[];
  expect(receipts).toHaveLength(3);
  const saved=getInboxThread(actor,thread.id);expect(saved.draft).toMatchObject({authorship:'copilot',deliveryStatus:'not_sent'});expect(saved.draft?.body).toBeTruthy();
  const currentDraft=inboxDraftReference(actor,thread.id);expect(currentDraft).not.toBeNull();
  const savedReply=JSON.parse(receipts[2].result) as ToolResult;expect(savedReply.data).toMatchObject({inboxAccessReference:currentDraft,draft:{id:saved.draft!.id,version:saved.draft!.version,body:saved.draft!.body}});
  const newTasks=listPersonalTasks(actor).filter(task=>!before.some(old=>old.id===task.id));expect(newTasks).toHaveLength(1);expect(newTasks[0]).toMatchObject({title,dueAt:null,investorId:'investor-mike'});
  expect(saved.messages.filter(item=>item.direction==='outbound')).toHaveLength(0);
  const tools=payload(fetcher,3).input.filter(item=>item.type==='function_call').map(item=>item.name);expect(tools).toEqual(['inbox_thread','create_task','prepare_inbox_reply']);
  expect(await chat(actor,message,undefined,'compound-save-both')).toEqual(result);expect(fetcher).toHaveBeenCalledTimes(4);expect(listPersonalTasks(actor)).toHaveLength(before.length+1);expect(getInboxThread(actor,thread.id).draft).toEqual(saved.draft);
 });

 it('withholds a requested save when the current inbox source changes instead of reusing stale evidence',async()=>{
  const actor=demoActor(),thread=getInboxState(actor).threads.find(item=>item.correspondent.name==='Mike Bennett')!,before=listPersonalTasks(actor);
  const fetcher=vi.fn()
   .mockImplementationOnce(()=>call('inbox_thread',{threadId:thread.id}))
   .mockImplementationOnce(()=>{receiveDemoCommunication(actor,{scenarioId:'mike-repair-followup',eventKey:'compound-new-incoming'});return call('prepare_inbox_reply',{threadId:thread.id,expectedVersion:thread.version});});
  vi.stubGlobal('fetch',fetcher);vi.spyOn(console,'error').mockImplementation(()=>{});
  const result=await chat(actor,`Read ${thread.id}, draft a reply there and create a personal follow-up reminder.`,undefined,'compound-stale');
  expect(result.result.message).toContain('changed');expect(getInboxThread(actor,thread.id).draft).toBeNull();expect(listPersonalTasks(actor)).toEqual(before);expect(fetcher).toHaveBeenCalledTimes(2);
  expect(getDb().prepare('SELECT count(*) n FROM assistant_tool_receipts WHERE conversation_id=?').get(result.conversation.id)).toEqual({n:1});
 });

 it('keeps conditional grounding and employee authority explicit, with scoped tasks and versioned method invalidation',()=>{
  const actor=demoActor(),conversation=createConversation(actor),instructions=assistantInstructions(actor);
  expect(instructions).toContain('current-turn inbox_thread bounded relationship sources may ground a same-investor decision');
  expect(instructions).toContain('Retrieve investor_journey or relationship_recommendation for missing, conflicting or stale evidence');
  expect(instructions).toContain('history or incoming claims alone are insufficient');
  expect(instructions).toContain('preserve permissions, exact reviews and cost limits');
  expect(instructions).toContain('Confirm successful saves and identify unfinished work');
  const manager=demoActor('manager'),managerConversation=createConversation(manager),managerContext=currentTextContext(manager,managerConversation.id);
  expect(managerContext.tasks).toEqual(listPersonalTasks(manager));expect(managerContext.tasks.some(task=>task.investorId==='investor-mike')).toBe(false);
  const scope=currentTextScope(actor,conversation.id),voice=voiceContextSnapshot(actor);expect(scope.specialistMethods).toBe(specialistMethodFingerprint());expect(instructions).toContain(specialistMethodRevision);
  vi.spyOn(methods,'specialistMethodFingerprint').mockReturnValue('changed-execution-guidance');
  expect(currentTextScope(actor,conversation.id).specialistMethods).not.toBe(scope.specialistMethods);expect(voiceContextSnapshot(actor).methods).not.toBe(voice.methods);
 });
});
