import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { createHmac } from 'node:crypto';
import twilio from 'twilio';
import type { Actor } from '../src/lib/contracts';
import { closeDb,demoActor,getDb,now } from '../src/server/db';
import { grantTrial } from '../src/server/billing';
import { usageBalances } from '../src/server/metering';
import { addMessage,createConversation,createTask,getConversation,listConversations,listTasks,processNotifications,updateSettings } from '../src/server/services';
import { acceptMessage,createPairing,getMessagingLink,messagingConversation,messagingState,queueOutbound,updateMessagingLink,type Outbox } from '../src/server/messaging';
import { acceptSlackEvent,applyTwilioReceipt,DeliveryRejected,slackWebhook,twilioWebhook,type sendChannelMessage } from '../src/server/messaging-providers';
import { processMessagingInbox,processMessagingOutbox,queueMessagingReminders,smsReservation } from '../src/server/messaging-worker';
import { assignInvestor } from '../src/server/intelligence';
import { POST as slackPOST } from '../src/app/api/webhooks/slack/route';
import { POST as smsPOST } from '../src/app/api/webhooks/twilio/route';
import { POST as statusPOST } from '../src/app/api/webhooks/twilio/status/route';
const origin='https://channels.example',account=`AC${'a'.repeat(32)}`,phone='+15555550101',personal='+15555550102';
let actor:Actor,manager:Actor,event=0;
function eventId(){return `SM${(++event).toString(16).padStart(32,'0')}`;}
function slackInput(text:string,eventId=`Ev${++event}`){return {provider:'slack' as const,accountId:'TTEST',externalId:'UTEST',address:'DTEST',eventId,text};}
function linkSlack(){acceptMessage(slackInput(createPairing(actor,'slack').command));return getMessagingLink(messagingState(actor).links.find(l=>l.provider==='slack')!.id);}
function smsInput(text:string,id=eventId()){return {provider:'sms' as const,accountId:account,externalId:personal,address:personal,eventId:id,text,segments:1};}
function linkSms(){grantTrial(manager,{userId:actor.id,features:['sms','daily-coordinator']});acceptMessage(smsInput(createPairing(actor,'sms').command));return getMessagingLink(messagingState(actor).links.find(l=>l.provider==='sms')!.id);}
function outbox(){return getDb().prepare('SELECT * FROM messaging_outbox ORDER BY rowid').all() as Outbox[];}
function clearOutbox(){getDb().prepare('DELETE FROM messaging_outbox').run();}
function slackRequest(body:unknown,age=0){const raw=JSON.stringify(body),ts=String(Math.floor(Date.now()/1000)-age),signature=`v0=${createHmac('sha256','slack-test-secret').update(`v0:${ts}:${raw}`).digest('hex')}`;return new Request(`${origin}/api/webhooks/slack`,{method:'POST',headers:{'x-slack-request-timestamp':ts,'x-slack-signature':signature},body:raw});}
function slackEvent(text:string){return {type:'event_callback',api_app_id:'ATEST',team_id:'TTEST',event_id:`Ev${++event}`,event:{type:'message',channel_type:'im',channel:'DTEST',user:'UTEST',text}};}
function smsRequest(form:Record<string,string>,path='/api/webhooks/twilio',signOrigin=origin){return new Request(`${origin}${path}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature('twilio-test-secret',`${signOrigin}${path}`,form)},body:new URLSearchParams(form)});}
function form(text:string){return {AccountSid:account,MessageSid:eventId(),From:personal,To:phone,Body:text,NumSegments:'1'};}
beforeEach(()=>{
 closeDb();event=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_CHANNELS_ENABLED','true');vi.stubEnv('AGENTDESK_CHANNEL_SEND_ENABLED','true');vi.stubEnv('AGENTDESK_CHANNEL_PUBLIC_ORIGIN',origin);vi.stubEnv('AGENTDESK_CHANNEL_DAILY_LIMIT','50');
 vi.stubEnv('SLACK_TRANSPORT','http');vi.stubEnv('SLACK_SIGNING_SECRET','slack-test-secret');vi.stubEnv('SLACK_TEAM_ID','TTEST');vi.stubEnv('SLACK_APP_ID','ATEST');vi.stubEnv('SLACK_BOT_TOKEN','fictional-bot-token');vi.stubEnv('TWILIO_ACCOUNT_SID',account);vi.stubEnv('TWILIO_AUTH_TOKEN','twilio-test-secret');vi.stubEnv('TWILIO_PHONE_NUMBER',phone);
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected live network call in test');}));
 actor=demoActor();manager=demoActor('manager');getDb().prepare("UPDATE tasks SET data=json_set(data,'$.status','done')").run();updateSettings(actor,{quietHoursStart:0,quietHoursEnd:0});grantTrial(manager,{userId:actor.id,features:['daily-coordinator']});
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('verified messaging ingress and account binding',()=>{
 it('accepts only recent signed Slack requests and the configured workspace/app',async()=>{
  expect(await slackWebhook(slackRequest({type:'url_verification',challenge:'challenge'}))).toEqual({challenge:'challenge'});
  expect((await slackPOST(slackRequest(slackEvent('hello'),301))).status).toBe(401);
  const request=slackRequest(slackEvent('hello'));request.headers.set('x-slack-signature','v0=invalid');expect((await slackPOST(request)).status).toBe(401);
  expect(()=>acceptSlackEvent({...slackEvent('hello'),team_id:'TOTHER'})).toThrow('workspace');
  expect(()=>acceptSlackEvent({...slackEvent('hello'),api_app_id:'AOTHER'})).toThrow('workspace');
 });
 it('ignores group messages, bots and message edits',()=>{
  linkSlack();const base=slackEvent('create a task to do something');
  for(const change of [{channel_type:'channel'},{subtype:'message_changed'},{bot_id:'BTEST'}])expect(acceptSlackEvent({...base,event:{...base.event,...change}})).toEqual({status:'ignored'});
  expect(getDb().prepare("SELECT COUNT(*) n FROM messaging_inbox WHERE status='queued'").get()).toEqual({n:0});
 });
 it('links possession to the employee who requested the code; never stores the code in message history',()=>{
  expect(acceptMessage(slackInput('hello'))).toEqual({status:'ignored'});
  const code=createPairing(actor,'slack');acceptMessage(slackInput(code.command));
  expect(messagingState(actor).links).toHaveLength(1);expect(messagingState(manager).links).toHaveLength(0);
  const saved=JSON.stringify(getDb().prepare('SELECT * FROM messaging_inbox').all());expect(saved).not.toContain(code.command);expect(saved).toContain('[Account linking]');
  expect(acceptMessage({...slackInput(code.command),externalId:'UOTHER',address:'DOTHER'})).toEqual({status:'ignored'});
  expect(()=>acceptMessage(slackInput(createPairing(manager,'slack').command))).toThrow('different employee');
  expect(()=>updateMessagingLink(manager,messagingState(actor).links[0].id,{active:false})).toThrow('not found');
 });
 it('expires codes and invalidates earlier unused codes',()=>{
  const first=createPairing(actor,'slack');const second=createPairing(actor,'slack');expect(acceptMessage(slackInput(first.command)).status).toBe('ignored');
  vi.useFakeTimers();vi.setSystemTime(Date.now()+11*60_000);expect(acceptMessage(slackInput(second.command)).status).toBe('ignored');
 });
 it('deduplicates deliveries and rejects conflicting event bodies',()=>{
  linkSlack();const input=slackInput('hello');expect(acceptMessage(input).status).toBe('queued');expect(acceptMessage(input).status).toBe('duplicate');expect(()=>acceptMessage({...input,text:'different'})).toThrow('Conflicting');
 });
 it('verifies Twilio against the configured canonical URL and account, not proxy headers',async()=>{
  const code=(()=>{grantTrial(manager,{userId:actor.id,features:['sms']});return createPairing(actor,'sms');})();
  expect((await smsPOST(smsRequest(form(code.command),'/api/webhooks/twilio','https://forged.example'))).status).toBe(401);
  expect((await smsPOST(smsRequest({...form(code.command),AccountSid:`AC${'b'.repeat(32)}`}))).status).toBe(403);
  expect((await smsPOST(smsRequest({...form(code.command),To:'+15555550103'}))).status).toBe(403);
  const response=await smsPOST(smsRequest(form(code.command)));expect(response.status).toBe(200);expect(await response.text()).toContain('<Response/>');expect(messagingState(actor).links).toHaveLength(1);
 });
 it('rejects oversized bodies and fails closed with connections disabled',async()=>{
  const response=await slackPOST(slackRequest(slackEvent('x'.repeat(65000))));expect(response.status).toBe(413);
  vi.stubEnv('AGENTDESK_CHANNELS_ENABLED','false');expect((await slackPOST(slackRequest(slackEvent('hello')))).status).toBe(503);expect(()=>createPairing(actor,'slack')).toThrow('Configure');
 });
 it('requires the SMS add-on before linking and never turns it on implicitly',()=>{expect(()=>createPairing(actor,'sms')).toThrow();expect(messagingState(actor).providers.find(p=>p.id==='sms')?.entitled).toBe(false);});
});

describe('shared Copilot work and durable delivery',()=>{
 it('creates real saved work from Slack once and shares the same thread with SMS',async()=>{
  linkSlack();linkSms();clearOutbox();const input=slackInput('create a task to Review the Monday presentation');acceptMessage(input);await processMessagingInbox();acceptMessage(input);await processMessagingInbox();
  expect(listTasks(actor).filter(task=>task.title==='Review the Monday presentation')).toHaveLength(1);
  const conversationId=messagingConversation(actor),conversation=getConversation(actor,conversationId);expect(conversation.messages).toHaveLength(2);expect(conversation.messages[1].content).toContain('Created your task');
  acceptMessage(smsInput('What should I focus on today?'));await processMessagingInbox();expect(getConversation(actor,conversationId).messages).toHaveLength(4);
  expect(messagingState(actor).conversationId).toBe(conversationId);expect(outbox()).toHaveLength(2);
 });
 it('finishes one channel turn before starting the next, so replies are not held behind a batch',async()=>{
  linkSlack();clearOutbox();acceptMessage(slackInput('create a task to First queued task'));acceptMessage(slackInput('create a task to Second queued task'));await processMessagingInbox();expect(outbox()).toHaveLength(1);expect(listTasks(actor).filter(t=>t.title.includes('queued task'))).toHaveLength(1);await processMessagingInbox();expect(outbox()).toHaveLength(2);
 });
 it('keeps an active shared conversation visible after more than fifty newer conversations exist',()=>{
  vi.useFakeTimers();const thread=messagingConversation(actor);for(let i=0;i<55;i++){vi.advanceTimersByTime(1000);createConversation(actor,`Other conversation ${i}`);}vi.advanceTimersByTime(1000);messagingConversation(actor);expect(listConversations(actor)[0].id).toBe(thread);
 });
 it('exposes interrupted incoming work for review without silently repeating its tools',async()=>{
  linkSlack();clearOutbox();acceptMessage(slackInput('create a task to Interrupted task'));getDb().prepare("UPDATE messaging_inbox SET status='processing',updated_at=? WHERE status='queued'").run(new Date(Date.now()-26*60_000).toISOString());await processMessagingInbox();expect(messagingState(actor).activity).toEqual(expect.arrayContaining([expect.objectContaining({kind:'request',status:'unknown'})]));expect(listTasks(actor).some(t=>t.title==='Interrupted task')).toBe(false);expect(messagingState(manager).activity).toHaveLength(0);
 });
 it('sends once and records Slack acceptance without claiming read/delivery',async()=>{
  linkSlack();const send=vi.fn<typeof sendChannelMessage>(async()=>({id:'slack:receipt',status:'accepted'}));await processMessagingOutbox(send);await processMessagingOutbox(send);expect(send).toHaveBeenCalledTimes(1);expect(outbox()[0].status).toBe('accepted');
 });
 it('does not send or call providers while outbound delivery is disabled',async()=>{
  linkSlack();vi.stubEnv('AGENTDESK_CHANNEL_SEND_ENABLED','false');const send=vi.fn();await processMessagingOutbox(send);expect(send).not.toHaveBeenCalled();expect(outbox()[0].status).toBe('queued');
 });
 it('does not retry an ambiguous provider timeout or an interrupted dispatch',async()=>{
  linkSlack();const send=vi.fn<typeof sendChannelMessage>(async()=>{throw new Error('timeout');});await processMessagingOutbox(send);await processMessagingOutbox(send);expect(send).toHaveBeenCalledTimes(1);expect(outbox()[0].status).toBe('unknown');
  getDb().prepare("UPDATE messaging_outbox SET status='dispatching',updated_at=?").run(new Date(Date.now()-120_000).toISOString());await processMessagingOutbox(send);expect(send).toHaveBeenCalledTimes(1);expect(outbox()[0].status).toBe('unknown');
 });
 it('cancels queued work when a link disconnects, and requires a new pairing to reconnect',async()=>{
  const link=linkSlack();acceptMessage(slackInput('create a task to Should not run'));updateMessagingLink(actor,link.id,{active:false});await processMessagingInbox();const send=vi.fn();await processMessagingOutbox(send);expect(send).not.toHaveBeenCalled();expect(outbox()[0].status).toBe('canceled');expect(listTasks(actor).some(t=>t.title==='Should not run')).toBe(false);
  expect(()=>updateMessagingLink(actor,link.id,{active:true})).toThrow('new linking');acceptMessage(slackInput(createPairing(actor,'slack').command));expect(getMessagingLink(link.id).active).toBe(1);expect(outbox().at(-1)?.status).toBe('queued');
 });
 it('redacts an answer immediately before sending if CRM access has changed',async()=>{
  const link=linkSlack();clearOutbox();const thread=messagingConversation(actor);const message=addMessage(actor,thread,{role:'assistant',content:'Private details about Mike',artifacts:[]},{investors:[{id:'investor-mike'}],properties:[]});queueOutbound(link,'restricted','reply','',message.id);
  assignInvestor(manager,'investor-mike',manager.id);const send=vi.fn<typeof sendChannelMessage>(async()=>({id:'slack:redacted',status:'accepted'}));await processMessagingOutbox(send);expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0]?.[2]).not.toContain('Private details');
 });
 it('caps daily outbound deliveries and leaves later work queued',async()=>{
  const link=linkSlack();queueOutbound(link,'second','system','Second message');vi.stubEnv('AGENTDESK_CHANNEL_DAILY_LIMIT','1');const send=vi.fn<typeof sendChannelMessage>(async()=>({id:'slack:first',status:'accepted'}));await processMessagingOutbox(send);expect(send).toHaveBeenCalledTimes(1);expect(outbox().map(o=>o.status)).toEqual(['accepted','queued']);
 });
});

describe('SMS consent and trusted segment receipts',()=>{
 it('honors STOP/START without creating AI turns and keeps reminders off after restart',async()=>{
  const link=linkSms();updateMessagingLink(actor,link.id,{reminders:true});const stop=form('STOP');await twilioWebhook(smsRequest(stop));await twilioWebhook(smsRequest(stop));expect(getMessagingLink(link.id)).toMatchObject({opted_out:1,reminders:0});expect(outbox()[0].status).toBe('canceled');
  expect(acceptMessage(smsInput('hello')).status).toBe('canceled');expect(()=>updateMessagingLink(actor,link.id,{reminders:true})).toThrow();
  await twilioWebhook(smsRequest(form('START')));expect(getMessagingLink(link.id)).toMatchObject({opted_out:0,reminders:0});expect(getConversation(actor,messagingConversation(actor)).messages).toHaveLength(0);
 });
 it('uses conservative reservations then reconciles actual segments and verified delivery',async()=>{
  const link=linkSms();const receiptId=eventId();const send=vi.fn<typeof sendChannelMessage>(async()=>({id:receiptId,status:'queued',segments:'0'}));await processMessagingOutbox(send);const row=outbox()[0];expect(row.status).toBe('accepted');expect(row.segments_actual).toBeNull();expect(usageBalances(actor).find(b=>b.category==='sms_segments')!.reserved).toBeGreaterThan(0);
  const callback={AccountSid:account,MessageSid:receiptId,From:phone,To:link.address,MessageStatus:'delivered',NumSegments:'2'};const path=`/api/webhooks/twilio/status?delivery=${row.id}`;
  expect((await statusPOST(smsRequest(callback,path))).status).toBe(200);expect((await statusPOST(smsRequest(callback,path))).status).toBe(200);expect(outbox()[0]).toMatchObject({status:'delivered',segments_actual:2});expect(usageBalances(actor).find(b=>b.category==='sms_segments')).toMatchObject({reserved:0,consumed:3});
  applyTwilioReceipt(row.id,{sid:receiptId,accountSid:account,from:phone,to:personal,status:'sent'});expect(outbox()[0].status).toBe('delivered');expect(smsReservation('😀'.repeat(40))).toBe(2);
 });
 it('cannot apply a callback to a different destination or unsent delivery',async()=>{
  linkSms();const row=outbox()[0],receiptId=eventId();applyTwilioReceipt(row.id,{sid:receiptId,accountSid:account,from:phone,to:personal,status:'delivered',numSegments:'1'});expect(outbox()[0].status).toBe('queued');
  await processMessagingOutbox(async()=>({id:receiptId,status:'queued'}));expect(()=>applyTwilioReceipt(row.id,{sid:receiptId,accountSid:account,from:phone,to:'+15555550999',status:'delivered',numSegments:'1'})).toThrow('match');
 });
 it('releases reservations on definitive rejection and blocks sends when SMS access expires',async()=>{
  linkSms();await processMessagingOutbox(async()=>{throw new DeliveryRejected('rejected');});expect(outbox()[0].status).toBe('failed');expect(usageBalances(actor).find(b=>b.category==='sms_segments')!.reserved).toBe(0);
  const link=getMessagingLink(messagingState(actor).links[0].id);queueOutbound(link,'expired','system','Will not send');vi.useFakeTimers();vi.setSystemTime(Date.now()+15*86400_000);const send=vi.fn();await processMessagingOutbox(send);expect(send).not.toHaveBeenCalled();expect(outbox()[1].status).toBe('failed');
 });
});

describe('optional reminders',()=>{
 it('delivers opted-in due tasks once, and does not backfill old notifications',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T14:00:00Z'));const link=linkSlack();clearOutbox();createTask(actor,{title:'Old reminder',dueAt:new Date(Date.now()-1000).toISOString(),investorId:null});processNotifications(actor);vi.advanceTimersByTime(2000);updateMessagingLink(actor,link.id,{reminders:true});queueMessagingReminders();expect(outbox()).toHaveLength(0);
  createTask(actor,{title:'Call about Monday',dueAt:now(),investorId:null});processNotifications(actor);queueMessagingReminders();queueMessagingReminders();expect(outbox()).toHaveLength(1);
  const send=vi.fn<typeof sendChannelMessage>(async()=>({id:'slack:reminder',status:'accepted'}));await processMessagingOutbox(send);expect(send.mock.calls[0]?.[2]).toContain('Call about Monday');
 });
 it('defers quiet-hour reminders and cancels reminders after preferences are disabled',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T02:00:00Z'));const link=linkSlack();clearOutbox();updateMessagingLink(actor,link.id,{reminders:true});updateSettings(actor,{quietHoursStart:21,quietHoursEnd:8});createTask(actor,{title:'Morning reminder',dueAt:now(),investorId:null});processNotifications(actor);queueMessagingReminders();expect(outbox()).toHaveLength(0);
  vi.setSystemTime(new Date('2026-10-30T13:00:00Z'));processNotifications(actor);queueMessagingReminders();expect(outbox()).toHaveLength(1);updateMessagingLink(actor,link.id,{reminders:false});const send=vi.fn();await processMessagingOutbox(send);expect(send).not.toHaveBeenCalled();expect(outbox()[0].status).toBe('canceled');
 });
 it('does not send a reminder after its task is completed',async()=>{
  const link=linkSlack();clearOutbox();updateMessagingLink(actor,link.id,{reminders:true});const task=createTask(actor,{title:'Finish presentation',dueAt:now(),investorId:null});processNotifications(actor);queueMessagingReminders();getDb().prepare("UPDATE tasks SET data=json_set(data,'$.status','done') WHERE id=?").run(task.id);const send=vi.fn();await processMessagingOutbox(send);expect(send).not.toHaveBeenCalled();expect(outbox().every(row=>row.status==='canceled')).toBe(true);
 });
});
