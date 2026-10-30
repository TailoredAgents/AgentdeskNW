import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Actor,Task } from '../src/lib/contracts';
import { closeDb,demoActor,getDb,now } from '../src/server/db';
import { grantTrial } from '../src/server/billing';
import { createConversation,createTask,getConversation,listTasks,processNotifications,updateSettings } from '../src/server/services';
import { getPersonalTask,mutateTask } from '../src/server/task-actions';
import { clearConversationFocus,readConversationFocus,saveConversationChoices,setConversationFocus } from '../src/server/conversation-focus';
import { acceptMessage,createPairing,getMessagingLink,messagingConversation,messagingState,updateMessagingLink,type Outbox } from '../src/server/messaging';
import { formatChannelReply,processMessagingInbox,processMessagingOutbox,queueMessagingReminders,recordConfirmedReminderFocus } from '../src/server/messaging-worker';
import { assignInvestor } from '../src/server/intelligence';
import { DeliveryRejected } from '../src/server/messaging-providers';

let actor:Actor,manager:Actor,sequence=0;
const account=`AC${'a'.repeat(32)}`;
const reference=(task:Task)=>({id:task.id,version:task.version??0});
const tick=()=>vi.advanceTimersByTime(10);
const rows=()=>getDb().prepare('SELECT * FROM messaging_outbox ORDER BY rowid').all() as Outbox[];
function link(provider:'slack'|'sms'='slack'){
 const command=createPairing(actor,provider).command;
 acceptMessage({provider,accountId:provider==='slack'?'TTEST':account,externalId:provider==='slack'?'UTEST':'+15555550102',address:provider==='slack'?'DTEST':'+15555550102',eventId:`link-${provider}-${++sequence}`,text:command,segments:1});
 const result=getMessagingLink(messagingState(actor).links.find(item=>item.provider===provider)!.id);
 updateMessagingLink(actor,result.id,{reminders:true});return result;
}
function due(title:string,investorId:string|null=null){const task=createTask(actor,{title,dueAt:now(),investorId});processNotifications(actor);queueMessagingReminders();return task;}
const accepted=async()=>({id:`slack:receipt-${++sequence}`,status:'accepted'});
const sendAccepted=async(channel:{provider:'slack'|'sms'})=>channel.provider==='slack'?accepted():{id:`SM${(++sequence).toString(16).padStart(32,'0')}`,status:'queued',segments:'1'};
function incoming(provider:'slack'|'sms',text:string){tick();return acceptMessage({provider,accountId:provider==='slack'?'TTEST':account,externalId:provider==='slack'?'UTEST':'+15555550102',address:provider==='slack'?'DTEST':'+15555550102',eventId:`message-${++sequence}`,text,segments:1});}
beforeEach(()=>{
 closeDb();sequence=0;vi.useFakeTimers({toFake:['Date','setTimeout','setInterval','clearTimeout','clearInterval']});vi.setSystemTime(new Date('2026-10-29T14:00:00Z'));
 for(const [name,value] of Object.entries({AGENTDESK_DB_PATH:':memory:',OPENAI_API_KEY:'',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',AGENTDESK_CHANNELS_ENABLED:'true',AGENTDESK_CHANNEL_SEND_ENABLED:'true',AGENTDESK_CHANNEL_PUBLIC_ORIGIN:'https://channels.example',SLACK_TRANSPORT:'http',SLACK_SIGNING_SECRET:'fictional-signing',SLACK_TEAM_ID:'TTEST',SLACK_APP_ID:'ATEST',SLACK_BOT_TOKEN:'fictional-bot',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'fictional-auth',TWILIO_PHONE_NUMBER:'+15555550101'}))vi.stubEnv(name,value);
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected network call');}));actor=demoActor();manager=demoActor('manager');grantTrial(manager,{userId:actor.id,features:['sms','daily-coordinator']});updateSettings(actor,{quietHoursStart:0,quietHoursEnd:0});
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('private, durable conversation task references',()=>{
 it('scopes task and conversation references to the employee and rejects conflicting event replay',()=>{
  const conversation=createConversation(actor),task=createTask(actor,{title:'Call Mike'});
  const input={kind:'task' as const,...reference(task),source:'assistant_result' as const,eventKey:'task-created',turnKey:'turn1'};
  setConversationFocus(actor,conversation.id,input);tick();setConversationFocus(actor,conversation.id,input);
  expect(getDb().prepare('SELECT COUNT(*) n FROM conversation_focus_events').get()).toEqual({n:1});
  expect(readConversationFocus(actor,conversation.id)).toMatchObject({status:'ready',candidates:[{...reference(task),title:'Call Mike'}]});
  expect(()=>readConversationFocus(manager,conversation.id)).toThrow('not found');
  const managerConversation=createConversation(manager);expect(()=>setConversationFocus(manager,managerConversation.id,input)).toThrow('not found');
  expect(()=>readConversationFocus({...actor,role:'manager'},conversation.id)).toThrow('identity');
  const other=createTask(actor,{title:'Other follow-up'});expect(()=>setConversationFocus(actor,conversation.id,{...input,...reference(other)})).toThrow('different work');
 });
 it('preserves version freshness, explicit clear and expiration without reviving old work on replay',()=>{
  const conversation=createConversation(actor),task=createTask(actor,{title:'Call Mike'});
  const input={kind:'task' as const,...reference(task),source:'assistant_result' as const,eventKey:'initial',turnKey:'turn'};
  setConversationFocus(actor,conversation.id,input);tick();
  const changed=mutateTask(actor,task.id,{action:'snooze',minutes:120,expectedVersion:task.version});
  expect(readConversationFocus(actor,conversation.id)).toMatchObject({status:'stale',candidates:[]});
  setConversationFocus(actor,conversation.id,{...input,...reference(changed),eventKey:'changed'});
  expect(readConversationFocus(actor,conversation.id)).toMatchObject({status:'ready',candidates:[reference(changed)]});
  tick();clearConversationFocus(actor,conversation.id,'clear');expect(readConversationFocus(actor,conversation.id).status).toBe('none');
  tick();setConversationFocus(actor,conversation.id,{...input,...reference(changed),eventKey:'again'});
  vi.advanceTimersByTime(25*60*60_000);setConversationFocus(actor,conversation.id,{...input,...reference(changed),eventKey:'again'});
  expect(readConversationFocus(actor,conversation.id).status).toBe('none');
 });
 it('keeps multiple task results ambiguous and uses a versioned, expiring numbered choice',()=>{
  const conversation=createConversation(actor),one=createTask(actor,{title:'Call Mike'}),two=createTask(actor,{title:'Call Sarah'});
  for(const task of [one,two]){setConversationFocus(actor,conversation.id,{kind:'task',...reference(task),source:'assistant_result',eventKey:task.id,turnKey:'same-turn'});tick();}
  expect(readConversationFocus(actor,conversation.id)).toMatchObject({status:'ambiguous',candidates:expect.arrayContaining([expect.objectContaining(reference(one)),expect.objectContaining(reference(two))])});
  const intent={action:'reschedule' as const,dateText:'tomorrow at 9am',requestId:'which-task'};
  saveConversationChoices(actor,conversation.id,{tasks:[reference(one),reference(two)],intent});
  expect(readConversationFocus(actor,conversation.id)).toMatchObject({status:'ambiguous',candidates:[reference(one),reference(two)],pending:intent});
  vi.advanceTimersByTime(16*60_000);expect(readConversationFocus(actor,conversation.id)).toMatchObject({status:'stale',candidates:[]});
 });
 it('does not bind a message received before or at the context timestamp',()=>{
  const conversation=createConversation(actor),task=createTask(actor,{title:'Later task'}),receivedAt=now();tick();
  setConversationFocus(actor,conversation.id,{kind:'task',...reference(task),source:'assistant_result',eventKey:'later'});
  expect(readConversationFocus(actor,conversation.id,receivedAt).status).toBe('none');
  expect(readConversationFocus(actor,conversation.id,now()).status).toBe('none');
  tick();expect(readConversationFocus(actor,conversation.id,now()).status).toBe('ready');
 });
 it('keeps confirmed focus across a database reopen',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-focus-'));
  try{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'focus.sqlite'));actor=demoActor();const conversation=createConversation(actor),task=createTask(actor,{title:'Persistent next step'});
   setConversationFocus(actor,conversation.id,{kind:'task',...reference(task),source:'assistant_result',eventKey:'persistent'});closeDb();
   expect(readConversationFocus(actor,conversation.id)).toMatchObject({status:'ready',candidates:[reference(task)]});
  }finally{closeDb();rmSync(directory,{recursive:true,force:true});}
 });
});

describe('paired employee conversation actions',()=>{
 it('creates through SMS, receives a reminder, reschedules through Slack, snoozes and completes through the same conversation',async()=>{
  getDb().prepare("UPDATE tasks SET data=json_set(data,'$.status','completed')").run();
  link();link('sms');getDb().prepare('DELETE FROM messaging_outbox').run();
  incoming('sms','create a task to Call Mike about contractor scope');await processMessagingInbox();
  const task=listTasks(actor).find(item=>item.title==='Call Mike about contractor scope')!,conversationId=messagingConversation(actor);expect(task).toBeDefined();
  expect(readConversationFocus(actor,conversationId).status).toBe('none');
  tick();await processMessagingOutbox(sendAccepted);expect(readConversationFocus(actor,conversationId)).toMatchObject({status:'ready',candidates:[reference(task)]});
  incoming('sms','move that to tomorrow at 9am');await processMessagingInbox();tick();await processMessagingOutbox(sendAccepted);
  const scheduled=getPersonalTask(actor,task.id);expect(scheduled).toMatchObject({status:'open',version:2,dueAt:'2026-10-30T13:00:00.000Z'});
  vi.setSystemTime(new Date(scheduled.dueAt!));processNotifications(actor);queueMessagingReminders();tick();await processMessagingOutbox(sendAccepted);
  const initialNotices=rows().filter(item=>item.kind==='notice'&&item.status==='accepted');expect(initialNotices).toHaveLength(2);
  incoming('slack','move it to tomorrow');await processMessagingInbox();tick();await processMessagingOutbox(sendAccepted);
  const moved=getPersonalTask(actor,task.id);expect(moved).toMatchObject({status:'open',version:3,dueAt:'2026-10-31T13:00:00.000Z'});
  vi.setSystemTime(new Date(moved.dueAt!));processNotifications(actor);queueMessagingReminders();tick();await processMessagingOutbox(sendAccepted);
  const newNotices=rows().filter(item=>item.kind==='notice'&&item.status==='accepted'&&!initialNotices.some(previous=>previous.id===item.id));expect(newNotices).toHaveLength(2);
  incoming('slack','snooze it for two hours');const snoozeAt=Date.now();await processMessagingInbox();tick();await processMessagingOutbox(sendAccepted);
  expect(getPersonalTask(actor,task.id)).toMatchObject({status:'open',version:4,dueAt:new Date(snoozeAt+120*60_000).toISOString()});
  incoming('sms','done');await processMessagingInbox();tick();await processMessagingOutbox(sendAccepted);
  expect(getPersonalTask(actor,task.id)).toMatchObject({status:'completed',version:5});expect(getConversation(actor,conversationId).messages).toHaveLength(10);
  expect(getConversation(actor,conversationId).messages.at(-1)?.content).toContain('marked complete');
 });
 it('does not use a newly created task as a bare-reply target until its reply is accepted',async()=>{
  link();link('sms');getDb().prepare('DELETE FROM messaging_outbox').run();
  incoming('sms','create a task to Review the latest release');await processMessagingInbox();
  const task=listTasks(actor).find(item=>item.title==='Review the latest release')!,conversationId=messagingConversation(actor);
  incoming('slack','done');await processMessagingInbox();
  expect(getPersonalTask(actor,task.id).status).toBe('open');expect(getConversation(actor,conversationId).messages.at(-1)?.content).toContain('Which task');
  tick();await processMessagingOutbox(sendAccepted);expect(readConversationFocus(actor,conversationId).pending).toMatchObject({action:'complete'});
 });
});

describe('confirmed reminder reply context',()=>{
 it('creates focus only after acceptance, deduplicates it, and expires it when access changes',async()=>{
  link();getDb().prepare('DELETE FROM messaging_outbox').run();const task=due('Call Mike about repairs','investor-mike'),conversationId=messagingConversation(actor),receivedAt=now();
  recordConfirmedReminderFocus();expect(readConversationFocus(actor,conversationId).status).toBe('none');
  tick();await processMessagingOutbox(accepted);recordConfirmedReminderFocus();
  expect(readConversationFocus(actor,conversationId)).toMatchObject({status:'ready',candidates:[{...reference(task),source:'reminder'}]});
  expect(readConversationFocus(actor,conversationId,receivedAt).status).toBe('none');
  expect(getDb().prepare('SELECT COUNT(*) n FROM conversation_focus_events').get()).toEqual({n:1});
  assignInvestor(manager,'investor-mike',manager.id);expect(readConversationFocus(actor,conversationId)).toMatchObject({status:'stale',candidates:[]});
 });
 it.each(['failed','unknown'] as const)('never selects a %s delivery',async(status)=>{
  link();getDb().prepare('DELETE FROM messaging_outbox').run();const task=due('Call about timing'),conversationId=messagingConversation(actor);
  await processMessagingOutbox(async()=>{throw status==='failed'?new DeliveryRejected('rejected'):new Error('timeout');});
  expect(rows()[0].status).toBe(status);recordConfirmedReminderFocus();expect(readConversationFocus(actor,conversationId).status).toBe('none');
  expect(()=>setConversationFocus(actor,conversationId,{kind:'task',...reference(task),source:'reminder',sourceEventId:rows()[0].id,eventKey:'forged-confirmation'})).toThrow('confirmed');
 });
 it('keeps multiple accepted reminders ambiguous, but identical cross-channel reminders identify one task',async()=>{
  link();link('sms');getDb().prepare('DELETE FROM messaging_outbox').run();const task=due('One shared task'),conversationId=messagingConversation(actor);
  await processMessagingOutbox(async(channel)=>channel.provider==='slack'?accepted():{id:`SM${(++sequence).toString(16).padStart(32,'0')}`,status:'queued',segments:'1'});
  expect(rows()).toHaveLength(2);expect(readConversationFocus(actor,conversationId)).toMatchObject({status:'ready',candidates:[reference(task)]});
  tick();const other=due('Another task');await processMessagingOutbox(async(channel)=>channel.provider==='slack'?accepted():{id:`SM${(++sequence).toString(16).padStart(32,'0')}`,status:'queued',segments:'1'});
  expect(readConversationFocus(actor,conversationId)).toMatchObject({status:'ambiguous',candidates:expect.arrayContaining([expect.objectContaining(reference(task)),expect.objectContaining(reference(other))])});
 });
 it('does not focus a reminder whose task changed during provider delivery',async()=>{
  link();getDb().prepare('DELETE FROM messaging_outbox').run();const task=due('Move while sending'),conversationId=messagingConversation(actor);
  await processMessagingOutbox(async()=>{mutateTask(actor,task.id,{action:'snooze',minutes:120});return accepted();});
  expect(rows()[0].status).toBe('accepted');expect(readConversationFocus(actor,conversationId).status).toBe('none');
 });
 it('invalidates accepted focus after a later failure or disconnect',async()=>{
  const channel=link();getDb().prepare('DELETE FROM messaging_outbox').run();due('Review follow-up');const conversationId=messagingConversation(actor);await processMessagingOutbox(accepted);
  getDb().prepare("UPDATE messaging_outbox SET status='failed'").run();expect(readConversationFocus(actor,conversationId).status).toBe('stale');
  getDb().prepare("UPDATE messaging_outbox SET status='accepted'").run();updateMessagingLink(actor,channel.id,{active:false});expect(readConversationFocus(actor,conversationId).status).toBe('stale');
 });
 it('does not fall back to an older task when a newer task reminder has an uncertain delivery',async()=>{
  link();getDb().prepare('DELETE FROM messaging_outbox').run();due('Earlier accepted reminder');const conversationId=messagingConversation(actor);await processMessagingOutbox(accepted);
  tick();due('Newer uncertain reminder');await processMessagingOutbox(async()=>{throw new Error('timeout');});
  expect(readConversationFocus(actor,conversationId)).toMatchObject({status:'stale',candidates:[]});
 });
});

describe('useful bounded channel replies',()=>{
 it('retains complete useful content and explicitly links the remainder',()=>{
  const reply=formatChannelReply(`Your reminder moved to Friday at 9am Eastern.\n\n${'Additional background. '.repeat(100)}`,'sms','conversation-test');
  expect(reply).toContain('Your reminder moved to Friday at 9am Eastern.');expect(reply).toContain('Excerpt:');expect(reply).toContain('Full reply: https://channels.example/?conversation=conversation-test');expect(reply.length).toBeLessThanOrEqual(700);
 });
 it('does not split an oversized first sentence or a long token',()=>{
  const reply=formatChannelReply(`${'😀'.repeat(400)} is a long first sentence. Later detail.`,'sms','conversation-test');
  expect(reply).not.toContain('😀');expect(reply).toContain('Full reply:');expect(reply.length).toBeLessThanOrEqual(700);
  expect(formatChannelReply('Saved.','slack','conversation-test')).toContain('Saved.');
 });
});
