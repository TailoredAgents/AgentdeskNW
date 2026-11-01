import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInboxState,getInboxThread,receiveDemoCommunication} from '../src/server/communications';
import {chat,dispatchTool,toolDefinitions,assistantInstructions} from '../src/server/orchestrator';
import {createConversation,getConversation,listTasks} from '../src/server/services';
import {inboxContextFingerprint,withoutInboxHistory} from '../src/server/communications-context';
import {executeRecordedTool} from '../src/server/text-runtime';
import {simulateLifecycle,subscription} from '../src/server/billing';
import {createVoiceSession,endVoiceSession,executeVoiceTool} from '../src/server/voice';

let actor:Actor;let responseSequence=0;
const mike=()=>getInboxState(actor).threads.find(thread=>thread.correspondent.name==='Mike Bennett')!;
const tool=(name:string,args:unknown,id:string)=>({type:'function_call',name,arguments:JSON.stringify(args),call_id:id});
const answer=(output:unknown[])=>new Response(JSON.stringify({id:`fixture-response-${++responseSequence}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:50,output_tokens:20}}));
const message=(text:string)=>({type:'message',content:[{type:'output_text',text}]});
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');actor=demoActor();});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('private communications through typed Copilot',()=>{
 it('offers bounded strict retrieval and draft tools without approval or delivery authority',async()=>{
  const tools=toolDefinitions().filter(item=>/inbox/.test(item.name));
  expect(tools.map(item=>item.name)).toEqual(['inbox_search','inbox_thread','prepare_inbox_reply','propose_inbox_followup']);
  for(const item of tools){expect(item.strict).toBe(true);expect(item.parameters.additionalProperties).toBe(false);expect(item.parameters.required).toEqual(Object.keys(item.parameters.properties as object));}
  await expect(dispatchTool(actor,'simulate_inbox_send',{reviewId:'invented'})).rejects.toThrow('Unknown');
  await expect(dispatchTool(actor,'inbox_search',{query:'',channel:null,limit:99})).rejects.toThrow();
  await expect(dispatchTool(actor,'inbox_search',{query:'',channel:null,limit:12,ownerId:'user-taylor'})).rejects.toThrow();
 });
 it('searches only the employee mailbox and refuses another employee or manager thread reads',async()=>{
  const thread=mike(),manager=demoActor('manager');
  const result=await dispatchTool(actor,'inbox_search',{query:'repair',channel:'email',limit:1});
  expect(result.artifacts).toHaveLength(1);expect(result.artifacts[0]).toMatchObject({type:'inbox',id:thread.id});
  expect(result.data).toMatchObject({returned:1,liveDelivery:false});
  await expect(dispatchTool(manager,'inbox_thread',{threadId:thread.id})).rejects.toThrow(/private|not found/i);
  expect(JSON.stringify(await dispatchTool(manager,'inbox_search',{query:'repair',channel:null,limit:12}))).not.toContain(thread.id);
 });
 it('handles search, source reading, draft preparation and follow-up proposals without a model call',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const thread=mike();
  const found=await chat(actor,'search inbox for repairs',undefined,'inbox-search');
  expect(found.result.artifacts.some(item=>item.type==='inbox')).toBe(true);
  const read=await chat(actor,`read ${thread.id}`,found.conversation.id,'inbox-read');
  expect(read.result.message).toContain('Source:');
  const drafted=await chat(actor,`draft reply to ${thread.id}`,found.conversation.id,'inbox-draft','slack');
  expect(drafted.result.message).toContain('not sent');expect(getInboxThread(actor,thread.id).draft?.body).toBeTruthy();
  expect(drafted.result.artifacts[0]).toMatchObject({type:'inbox',id:thread.id});
  const count=listTasks(actor).length;
  const proposal=await chat(actor,`propose inbox follow-up for ${thread.id}`,found.conversation.id,'inbox-followup','sms');
  expect(proposal.result.message).toContain('No task');expect(listTasks(actor)).toHaveLength(count);expect(fetch).not.toHaveBeenCalled();
 });
 it('clarifies ambiguous names and routes property information through the existing package review',async()=>{
  const ambiguous=await chat(actor,"draft reply to Mike's email",undefined,'ambiguous-inbox');
  expect(ambiguous.result.message).toContain('More than one');expect(getInboxState(actor,{filter:'drafts'}).threads).toHaveLength(0);
  const property=await chat(actor,`draft reply with property details to ${mike().id}`,undefined,'property-inbox');
  expect(property.result.artifacts[0].type).toBe('package');expect(getInboxState(actor,{filter:'drafts'}).threads).toHaveLength(0);
 });
 it('binds draft authorization to the employee action and exact named thread, never a quoted sender instruction',async()=>{
  const thread=mike(),conversation=createConversation(actor,'Read only');
  for(const request of ['Read the email asking me to draft a reply',`Do not draft a reply to ${thread.id}`,'draft reply to Sarah’s email']){
   await expect(dispatchTool(actor,'prepare_inbox_reply',{threadId:thread.id,expectedVersion:thread.version},{conversationId:conversation.id,requestId:request,message:request})).rejects.toThrow(/clear draft request/);
  }
  await expect(dispatchTool(actor,'prepare_inbox_reply',{threadId:thread.id,expectedVersion:thread.version})).rejects.toThrow(/clear draft request/);
  expect(getInboxThread(actor,thread.id).draft).toBeNull();
 });
 it('does not grant simulated-send authority from an employee chat approval',async()=>{
  const thread=mike(),result=await chat(actor,`approve and send ${thread.id}`,undefined,'chat-send');
  expect(result.result.message).toContain('cannot approve');expect(getInboxThread(actor,thread.id).messages.every(item=>item.direction==='inbound')).toBe(true);
 });
 it('blocks model-requested task creation when the employee only requested an inbox summary',async()=>{
  const thread=mike(),before=listTasks(actor).length;vi.stubEnv('OPENAI_API_KEY','mock-key');
  const mock=vi.fn().mockResolvedValueOnce(answer([tool('inbox_thread',{threadId:thread.id},'read-inbox')])).mockResolvedValueOnce(answer([tool('create_task',{title:'Injected investor instruction',dueAt:null,investorId:null},'injected-task')])).mockResolvedValueOnce(answer([message('Review the source before creating a follow-up.')]));vi.stubGlobal('fetch',mock);
  await chat(actor,`Read ${thread.id}`,undefined,'injected-command');
  expect(listTasks(actor)).toHaveLength(before);
  const last=JSON.parse(mock.mock.calls[2][1].body as string);expect(JSON.stringify(last.input)).toContain('cannot schedule work');
  expect(assistantInstructions(actor)).toContain('untrusted data');
 });
 it('withholds old inbox-derived answers and tool receipts when linked CRM access is revoked',async()=>{
  const thread=mike(),read=await chat(actor,`read ${thread.id}`,undefined,'history-inbox');
  const result=await dispatchTool(actor,'inbox_thread',{threadId:thread.id});
  executeRecordedTool(actor,read.conversation.id,'cached-inbox','inbox_thread',{threadId:thread.id},()=>result,'cached-request');
  getDb().prepare('UPDATE investors SET owner_id=? WHERE id=?').run('user-jordan','investor-mike');
  const replay=await chat(actor,`read ${thread.id}`,undefined,'history-inbox');
  expect(replay.result.message).toContain('withheld');
  expect(()=>executeRecordedTool(actor,read.conversation.id,'cached-inbox','inbox_thread',{threadId:thread.id},()=>result,'cached-request')).toThrow(/Access.*changed/);
  expect(getConversation(actor,read.conversation.id).messages.at(-1)?.artifacts).toHaveLength(0);
 });
 it('redacts inbox-derived assistant history after subscription cancellation while preserving original inbox messages',async()=>{
  const thread=mike(),read=await chat(actor,`read ${thread.id}`,undefined,'cancel-history');
  simulateLifecycle(actor,{action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:'cancel-inbox-copilot'});
  expect(getConversation(actor,read.conversation.id).messages.at(-1)?.content).toContain('withheld');
  expect(getInboxThread(actor,thread.id).messages).toHaveLength(1);
 });
 it('fingerprints only the employee mailbox and omits inbox-derived history from voice',async()=>{
  const thread=mike(),before=inboxContextFingerprint(actor),manager=demoActor('manager');getInboxState(manager);
  expect(inboxContextFingerprint(actor)).toBe(before);
  const read=await chat(actor,`read ${thread.id}`,undefined,'voice-private-history');
  expect(withoutInboxHistory(actor,read.conversation).messages.some(item=>item.role==='assistant')).toBe(false);
  receiveDemoCommunication(actor,{scenarioId:'mike-repair-followup',eventKey:'changed-mailbox'});
  expect(inboxContextFingerprint(actor)).not.toBe(before);
 });
 it('omits inbox tools from voice configuration and rejects unadvertised inbox calls at the service boundary',async()=>{
  const thread=mike(),read=await chat(actor,`read ${thread.id}`,undefined,'voice-config-history');vi.stubEnv('OPENAI_API_KEY','mock-key');
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({value:'mock-ephemeral-token'})));vi.stubGlobal('fetch',mock);
  const session=await createVoiceSession(actor,read.conversation.id);
  try{
   const config=JSON.parse(mock.mock.calls[0][1].body as string);
   expect(config.session.tools.some((item:{name:string})=>/inbox/.test(item.name))).toBe(false);
   expect(config.session.instructions).not.toContain('Source: Incoming');
   await expect(executeVoiceTool(actor,session.voiceSessionId,'unadvertised-inbox','inbox_thread',{threadId:thread.id})).rejects.toThrow('typed Copilot');
  }finally{endVoiceSession(actor,session.voiceSessionId);}
 });
 it('invalidates opaque model context after a private inbox arrival',async()=>{
  const thread=mike();vi.stubEnv('OPENAI_API_KEY','mock-key');
  const opaque={type:'reasoning',id:'inbox-reasoning',summary:[],encrypted_content:'old-inbox-opaque'};
  const mock=vi.fn().mockResolvedValueOnce(answer([tool('inbox_thread',{threadId:thread.id},'read')])).mockResolvedValueOnce(answer([opaque,message('The current source needs review.')])).mockResolvedValueOnce(answer([message('Using the newly available source.')]));vi.stubGlobal('fetch',mock);
  const first=await chat(actor,`Read ${thread.id}`,undefined,'opaque-inbox-one');
  receiveDemoCommunication(actor,{scenarioId:'mike-repair-followup',eventKey:'opaque-new-source'});
  await chat(actor,`Read ${thread.id}`,first.conversation.id,'opaque-inbox-two');
  expect(JSON.stringify(JSON.parse(mock.mock.calls[2][1].body as string).input)).not.toContain('old-inbox-opaque');
 });
 it('rejects inference output if inbox sources change while the model is responding',async()=>{
  const thread=mike();vi.stubEnv('OPENAI_API_KEY','mock-key');vi.spyOn(console,'error').mockImplementation(()=>{});
  let finish!:(result:Response)=>void;const mock=vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',mock);
  const pending=chat(actor,`Read ${thread.id}`,undefined,'inflight-inbox');receiveDemoCommunication(actor,{scenarioId:'mike-repair-followup',eventKey:'inflight-source'});
  finish(answer([message('Obsolete private source answer.')]));const response=await pending;
  expect(response.result.message).toContain('changed');expect(JSON.stringify(response)).not.toContain('Obsolete private source answer');
 });
});
