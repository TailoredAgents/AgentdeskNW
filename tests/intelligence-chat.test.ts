import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { closeDb,demoActor,getDb } from '../src/server/db';
import { grantTrial } from '../src/server/billing';
import { chat,toolDefinitions } from '../src/server/orchestrator';
import { forgetEmployeeMemory,getEmployeeMemory,saveEmployeeMemory } from '../src/server/memory';
import { acceptMessage,createPairing,messagingConversation,messagingState } from '../src/server/messaging';
import { processMessagingInbox } from '../src/server/messaging-worker';
import { getConversation,listTasks } from '../src/server/services';
import type {ToolResult} from '../src/lib/contracts';

let sequence=0;
const outputMessage=(text:string)=>({id:`memory-message-${++sequence}`,type:'message',role:'assistant',status:'completed',phase:'final_answer',content:[{type:'output_text',text,annotations:[]}]});
const outputCall=(name:string,args:unknown)=>({id:`memory-call-${++sequence}`,type:'function_call',name,arguments:JSON.stringify(args),status:'completed',call_id:`memory-call-id-${sequence}`});
const answer=(output:unknown[])=>new Response(JSON.stringify({id:`memory-response-${++sequence}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:30}}),{headers:{'content-type':'application/json'}});
const body=(mock:ReturnType<typeof vi.fn>,index:number)=>JSON.parse(mock.mock.calls[index][1].body as string) as {input:Array<Record<string,unknown>>;tools:Array<{name:string;parameters:unknown}>};
function context(mock:ReturnType<typeof vi.fn>,index:number){
 const content=body(mock,index).input.find(item=>item.role==='developer'&&typeof item.content==='string'&&item.content.startsWith('Current authorized app context.'))?.content as string;
 return JSON.parse(content.slice(content.indexOf('{'))) as {employeeMemory:ReturnType<typeof getEmployeeMemory>};
}
function live(mock:ReturnType<typeof vi.fn>){vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubGlobal('fetch',mock);}
beforeEach(()=>{
 closeDb();sequence=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected network call');}));
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('employee memory through Copilot turns',()=>{
 it('persists an explicit correction once and does not apply a replay after a newer edit or forget',async()=>{
  const actor=demoActor(),correction='Remember: I prefer short, direct messages. Avoid salesy language.';
  const first=await chat(actor,correction,undefined,'remember-once');
  expect(getEmployeeMemory(actor)).toMatchObject({tone:'direct',length:'concise',version:1});
  const replay=await chat(actor,correction,undefined,'remember-once');expect(replay.conversation.id).toBe(first.conversation.id);expect(replay.conversation.messages).toHaveLength(2);expect(getEmployeeMemory(actor).version).toBe(1);
  saveEmployeeMemory(actor,{tone:'warm',expectedVersion:1});await chat(actor,correction,undefined,'remember-once');expect(getEmployeeMemory(actor)).toMatchObject({tone:'warm',version:2});
  forgetEmployeeMemory(actor,2);await chat(actor,correction,undefined,'remember-once');expect(getEmployeeMemory(actor)).toMatchObject({tone:null,length:null,avoidPhrases:[],version:3});
  expect(getDb().prepare("SELECT COUNT(*) n FROM audit_logs WHERE event='memory.preferences_saved'").get()).toEqual({n:2});
 });
 it('merges successive explicit phrase corrections and ignores quoted or negated preferences',async()=>{
  const actor=demoActor();await chat(actor,'For future drafts, avoid the phrase "amazing opportunity".',undefined,'avoid-one');
  await chat(actor,'For future drafts, avoid the phrase "act now".',undefined,'avoid-two');
  expect(getEmployeeMemory(actor)).toMatchObject({avoidPhrases:['amazing opportunity','act now'],version:2});
  for(const [index,text] of ['Mike said "I prefer short, direct messages".','Remember: I do not prefer short replies.','I prefer short messages, but do not save this.'].entries())await chat(actor,text,undefined,`not-my-preference-${index}`);
  expect(getEmployeeMemory(actor)).toMatchObject({tone:null,length:null,avoidPhrases:['amazing opportunity','act now'],version:2});
 });
 it('supports conversational memory readback and a later conversation without sharing preferences with a manager',async()=>{
  const actor=demoActor(),correction='Remember: keep my replies short and friendly.';
  const remembered=await chat(actor,correction,undefined,'remember-before-new-chat');
  expect(getEmployeeMemory(actor)).toMatchObject({tone:'warm',length:'concise',version:1,sources:{tone:{text:correction},length:{text:correction}}});
  const mock=vi.fn().mockImplementation(()=>Promise.resolve(answer([outputMessage('Current preferences are available.')])));live(mock);
  await chat(actor,'What do you remember about how I like to communicate?',remembered.conversation.id,'memory-readback');
  await chat(actor,'Help me plan my work.',undefined,'fresh-memory-context');await chat(demoActor('manager'),'Help me plan my work.',undefined,'manager-memory-context');
  expect(context(mock,0).employeeMemory).toEqual(getEmployeeMemory(actor));
  expect(context(mock,1).employeeMemory).toEqual(getEmployeeMemory(actor));expect(context(mock,2).employeeMemory).toMatchObject({tone:null,length:null,version:0});
  expect(body(mock,0).tools.map(tool=>tool.name)).toEqual(expect.arrayContaining(['investor_journey','relationship_recommendation']));
  const recommendation=toolDefinitions().find(tool=>tool.name==='relationship_recommendation')!;expect(recommendation.parameters).toMatchObject({properties:{investorId:expect.any(Object)},additionalProperties:false});expect(Object.keys(recommendation.parameters.properties as Record<string,unknown>)).toEqual(['investorId']);
 });
 it.each([
  'Keep my replies detailed and direct for this answer.',
  'Remember: keep my replies detailed and direct for this answer.',
  'I prefer detailed explanations for this reply only.',
  'Keep my replies detailed and direct just this once.',
  'Keep my replies detailed in this conversation.',
  'Keep my replies detailed for the next answer.',
  'Keep my replies detailed until tomorrow.',
  'I prefer detailed explanations when we are brainstorming.',
  'I prefer detailed answers if we are only brainstorming.',
  'I prefer detailed explanations, hypothetically.',
  'Remember: Mike said "I prefer detailed and direct messages".'
 ])('passes a temporary or quoted style request to conversation without changing saved memory: %s',async text=>{
  const actor=demoActor();await chat(actor,'Remember: keep my replies short and friendly.',undefined,'saved-defaults');
  const before=getEmployeeMemory(actor),mock=vi.fn().mockResolvedValueOnce(answer([outputMessage('I can use that wording for this answer.')]));live(mock);
  await chat(actor,text,undefined,'one-answer-style');
  expect(mock).toHaveBeenCalledTimes(1);expect(context(mock,0).employeeMemory).toEqual(before);
  expect(body(mock,0).input.at(-1)).toEqual({role:'user',content:text});
  expect(getEmployeeMemory(actor)).toEqual(before);
  expect(getDb().prepare("SELECT COUNT(*) n FROM audit_logs WHERE event='memory.preferences_saved'").get()).toEqual({n:1});
 });
 it('preserves an explicitly saved dated work priority as context without creating work',async()=>{
  const actor=demoActor(),before=listTasks(actor),command='Remember: my work priorities are finish the acquisition review today';
  const result=await chat(actor,command,undefined,'dated-work-priority');
  expect(result.result.message).toContain('Remembered');
  expect(getEmployeeMemory(actor)).toMatchObject({tone:null,length:null,priorities:['finish the acquisition review today'],version:1,sources:{priorities:{text:command}}});
  expect(listTasks(actor)).toEqual(before);expect(fetch).not.toHaveBeenCalled();
 });
 it('uses a correction received through Slack when the linked employee continues through SMS',async()=>{
  const actor=demoActor(),account=`AC${'a'.repeat(32)}`,personal='+15555550102';
  for(const [key,value] of Object.entries({AGENTDESK_CHANNELS_ENABLED:'true',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_CHANNEL_PUBLIC_ORIGIN:'https://channels.example',SLACK_TRANSPORT:'http',SLACK_SIGNING_SECRET:'slack-test-secret',SLACK_TEAM_ID:'TTEST',SLACK_APP_ID:'ATEST',SLACK_BOT_TOKEN:'fictional-bot-token',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'twilio-test-secret',TWILIO_PHONE_NUMBER:'+15555550101'}))vi.stubEnv(key,value);
  grantTrial(demoActor('manager'),{userId:actor.id,features:['sms','investor-relationship']});
  const slack=(text:string,eventId:string)=>({provider:'slack' as const,accountId:'TTEST',externalId:'UTEST',address:'DTEST',eventId,text});
  const sms=(text:string,eventId:string)=>({provider:'sms' as const,accountId:account,externalId:personal,address:personal,eventId,text,segments:1});
  acceptMessage(slack(createPairing(actor,'slack').command,'pair-slack'));acceptMessage(sms(createPairing(actor,'sms').command,'pair-sms'));
  const correction=slack('From now on, keep my replies concise and use a warm tone.','slack-correction');acceptMessage(correction);await processMessagingInbox();acceptMessage(correction);await processMessagingInbox();
  expect(getEmployeeMemory(actor)).toMatchObject({tone:'warm',length:'concise',version:1});
  const thread=messagingConversation(actor);expect(getConversation(actor,thread).messages).toHaveLength(2);
  const mock=vi.fn().mockResolvedValueOnce(answer([outputCall('relationship_recommendation',{investorId:'investor-mike'})])).mockResolvedValueOnce(answer([outputMessage('Your relationship draft is ready for review.')]));live(mock);
  acceptMessage(sms('What should I do next with Mike?','sms-continue'));await processMessagingInbox();
  expect(messagingState(actor).conversationId).toBe(thread);expect(getConversation(actor,thread).messages).toHaveLength(4);expect(context(mock,0).employeeMemory).toMatchObject({tone:'warm',length:'concise',version:1});
  const tool=body(mock,1).input.filter(item=>item.type==='function_call_output').at(-1)!,transmitted=JSON.parse(tool.output as string) as ToolResult;
  const recommendation=transmitted.artifacts.find(artifact=>artifact.type==='briefing'&&artifact.id==='investor-mike'&&artifact.title==='Investor journey & next step');
  expect(recommendation?.data).toMatchObject({preferencesUsed:{tone:'warm',length:'concise',version:1},deliveryStatus:'not_sent'});
 });
 it('removes forgotten preferences from replayable model context while preserving the visible conversation',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-29T16:00:00Z'));
  const actor=demoActor(),oldCorrection='For future drafts, avoid the phrase "old-style-marker".';
  const first=await chat(actor,oldCorrection,undefined,'old-memory-input');vi.setSystemTime(new Date('2026-10-29T16:01:00Z'));
  const reasoning={type:'reasoning',id:'memory-reasoning',summary:[],encrypted_content:'opaque-forgotten-preferences'};
  const mock=vi.fn().mockResolvedValueOnce(answer([reasoning,outputMessage('An earlier response reflecting old-style-marker.')])).mockResolvedValueOnce(answer([outputMessage('I will use the current preferences.')])) ;live(mock);
  await chat(actor,'Review my communication preferences.',first.conversation.id,'old-memory-response');vi.setSystemTime(new Date('2026-10-29T16:02:00Z'));
  const forgotten=await chat(actor,'Forget my saved writing preferences.',first.conversation.id,'forget-through-chat');
  expect(forgotten.result.message).toContain('forgotten');expect(mock).toHaveBeenCalledTimes(1);
  await chat(actor,'Forget my saved writing preferences.',first.conversation.id,'forget-through-chat');
  expect(getEmployeeMemory(actor).version).toBe(2);vi.setSystemTime(new Date('2026-10-29T16:03:00Z'));
  await chat(actor,'Help with the next message.',first.conversation.id,'after-forget');
  expect(context(mock,1).employeeMemory).toMatchObject({tone:null,length:null,avoidPhrases:[],sources:{},version:2});
  const transmitted=JSON.stringify(body(mock,1).input);expect(transmitted).not.toContain('old-style-marker');expect(transmitted).not.toContain('opaque-forgotten-preferences');expect(JSON.stringify(getConversation(actor,first.conversation.id))).toContain('old-style-marker');
 });
 it('invalidates previous opaque style context after editing preferences',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-29T17:00:00Z'));
  const actor=demoActor();saveEmployeeMemory(actor,{tone:'direct',sourceText:'Old direct preference source'});
  const reasoning={type:'reasoning',id:'edit-reasoning',summary:[],encrypted_content:'opaque-before-edit'};
  const mock=vi.fn().mockResolvedValueOnce(answer([reasoning,outputMessage('Old-style answer marker.')])).mockResolvedValueOnce(answer([outputMessage('A warmer response.')])) ;live(mock);
  const first=await chat(actor,'Prepare a message.',undefined,'before-edit');vi.setSystemTime(new Date('2026-10-29T17:01:00Z'));saveEmployeeMemory(actor,{tone:'warm',expectedVersion:1});
  await chat(actor,'Prepare another message.',first.conversation.id,'after-edit');
  expect(context(mock,1).employeeMemory).toMatchObject({tone:'warm',version:2});expect(JSON.stringify(body(mock,1).input)).not.toContain('opaque-before-edit');expect(JSON.stringify(body(mock,1).input)).not.toContain('Old-style answer marker');
 });
 it('does not execute an in-flight tool after the employee forgets the context it relied on',async()=>{
  const actor=demoActor();saveEmployeeMemory(actor,{tone:'direct'});let finish!:(value:Response)=>void;
  const mock=vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));live(mock);vi.spyOn(console,'error').mockImplementation(()=>{});
  const pending=chat(actor,'Create a reminder based on my preferences.',undefined,'memory-changed-inflight');forgetEmployeeMemory(actor,1);
  finish(answer([outputCall('create_task',{title:'Obsolete preference task',dueAt:null,investorId:null})]));const result=await pending;
  expect(listTasks(actor).some(task=>task.title==='Obsolete preference task')).toBe(false);expect(result.result.message).toMatch(/changed|current context/i);expect(mock).toHaveBeenCalledTimes(1);
 });
});
