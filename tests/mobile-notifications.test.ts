import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {Actor} from '../src/lib/contracts';
import type {WorkStepInput} from '../src/lib/work-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {createMobilePairing,pairMobileDevice,revokeMobileSession} from '../src/server/mobile-auth';
import {createWorkRun,getWorkRun,processWorkRuns,controlWorkRun,decideWorkCost} from '../src/server/work-runs';
import {mobileNotificationState,registerPushDevice,queueMobileJobNotifications,processMobilePushOutbox,reconcileMobilePushReceipts,type MobilePushTransport,type MobilePushPayload} from '../src/server/mobile-notifications';
import {updateSettings} from '../src/server/services';

let actor:Actor,sessionId:string,sequence:number;
const pushToken='ExpoPushToken[fictionaldevice000001]';
const inspect:WorkStepInput={key:'property',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]};
const relation:WorkStepInput={key:'relationship',capabilityId:'relationship_next_step',input:{investorId:'investor-mike'},dependsOn:[]};
const session=(owner=actor)=>pairMobileDevice({code:createMobilePairing(owner).code,deviceName:'Fictional phone'}).sessionId;
const enable=()=>registerPushDevice(actor,sessionId,{enabled:true,expoPushToken:pushToken,platform:'ios'});
const make=(steps:WorkStepInput[]=[inspect])=>createWorkRun(actor,{requestId:`notice-job-${++sequence}`,title:'PRIVATE investor detail must not enter push',instructions:'Inspect the fictional record.',steps});
const finish=()=>{const run=make();processWorkRuns(actor,20);return getWorkRun(actor,run.id);};
const notices=()=>getDb().prepare('SELECT * FROM mobile_push_outbox ORDER BY rowid').all() as {id:string;status:string;work_run_id:string;ticket_id:string|null;error_code:string|null}[];
const transport=()=>({send:vi.fn(async(payload:MobilePushPayload)=>{void payload;return {ticketId:`ticket-${++sequence}`};}),receipt:vi.fn(async()=> 'service_received' as const)}) satisfies MobilePushTransport;
beforeEach(()=>{
 closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','false');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider call');}));vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T16:00:00Z'));actor=demoActor();sequence=0;
 // The root registers these migrations during integration; keep this isolated service test usable during parallel implementation.
 if(!getDb().prepare("SELECT 1 FROM sqlite_master WHERE name='mobile_sessions'").get())getDb().exec(readFileSync('src/server/migrations/023_mobile_sessions.sql','utf8'));
 if(!getDb().prepare("SELECT 1 FROM sqlite_master WHERE name='mobile_push_devices'").get())getDb().exec(readFileSync('src/server/migrations/024_mobile_notifications.sql','utf8'));
 sessionId=session();
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('private mobile job notifications',()=>{
 it('starts off, binds registration to the current employee session, and never returns a push token',()=>{
  expect(mobileNotificationState(actor,sessionId)).toMatchObject({registered:false,enabled:false,sendingEnabled:false,recent:[]});
  expect(enable()).toMatchObject({registered:true,enabled:true,platform:'ios',sendingEnabled:false});
  expect(JSON.stringify(mobileNotificationState(actor,sessionId))).not.toContain(pushToken);
  expect(()=>registerPushDevice(demoActor('manager'),sessionId,{enabled:true,expoPushToken:pushToken,platform:'ios'})).toThrow('not found');
  expect(()=>mobileNotificationState(demoActor('acquisitions'),sessionId)).toThrow('not found');
 });
 it('requires a valid token and platform for opt-in and rejects caller identity fields',()=>{
  expect(()=>registerPushDevice(actor,sessionId,{enabled:true})).toThrow();
  expect(()=>registerPushDevice(actor,sessionId,{enabled:true,expoPushToken:'someone@example.com',platform:'ios'})).toThrow();
  expect(()=>registerPushDevice(actor,sessionId,{enabled:true,expoPushToken:pushToken,platform:'ios',sessionId:'forged'} as never)).toThrow();
 });
 it('does not steal another active employee token and permits reuse only after that connection is revoked',()=>{
  enable();const manager=demoActor('manager'),managerSession=session(manager);
  expect(()=>registerPushDevice(manager,managerSession,{enabled:true,expoPushToken:pushToken,platform:'android'})).toThrow('another active');
  revokeMobileSession(actor,sessionId);expect(registerPushDevice(manager,managerSession,{enabled:true,expoPushToken:pushToken,platform:'android'}).enabled).toBe(true);
  expect(getDb().prepare('SELECT expo_push_token,enabled FROM mobile_push_devices WHERE session_id=?').get(sessionId)).toEqual({expo_push_token:null,enabled:0});
 });
 it('queues one current notification per plan/kind without replaying pre-opt-in jobs',()=>{
  const old=finish();vi.advanceTimersByTime(1000);enable();const current=finish();
  expect(queueMobileJobNotifications()).toBe(1);expect(queueMobileJobNotifications()).toBe(0);
  expect(notices()[0]).toMatchObject({work_run_id:current.id,status:'queued'});expect(notices().some(row=>row.work_run_id===old.id)).toBe(false);
  enable();expect(queueMobileJobNotifications()).toBe(0);
 });
 it('keeps completion independent from disabled remote delivery',async()=>{
  enable();const run=finish();queueMobileJobNotifications();const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(0);expect(sender.send).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(getWorkRun(actor,run.id).status).toBe('completed');expect(notices()[0].status).toBe('queued');
 });
 it('sends only generic content and records Expo acceptance separately from device delivery',async()=>{
  enable();const run=finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(1);
  const payload=sender.send.mock.calls[0]?.[0];expect(JSON.stringify(payload)).not.toContain('PRIVATE');expect(payload).toMatchObject({title:'AgentDesk',data:{url:`agentdesknw://work/${run.id}`,workRunId:run.id},channelId:'work'});expect(notices()[0].status).toBe('accepted');
  await processMobilePushOutbox(sender);expect(sender.send).toHaveBeenCalledTimes(1);
 });
 it('holds quiet-hour and disabled-notification notices until allowed',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();updateSettings(actor,{notifications:false});expect(await processMobilePushOutbox(sender)).toBe(0);
  updateSettings(actor,{notifications:true,quietHoursStart:11,quietHoursEnd:13});expect(await processMobilePushOutbox(sender)).toBe(0);
  updateSettings(actor,{quietHoursStart:0,quietHoursEnd:0});expect(await processMobilePushOutbox(sender)).toBe(1);
 });
 it('disables and cancels pending notices without losing completed work',async()=>{
  enable();const run=finish();queueMobileJobNotifications();expect(registerPushDevice(actor,sessionId,{enabled:false})).toMatchObject({registered:true,enabled:false});expect(notices()[0].status).toBe('canceled');vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(0);expect(getWorkRun(actor,run.id).status).toBe('completed');
 });
 it('cancels queued notices after logout, expiry, or role change before any send',async()=>{
  enable();finish();queueMobileJobNotifications();revokeMobileSession(actor,sessionId);vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(0);expect(notices()[0].status).toBe('canceled');expect(sender.send).not.toHaveBeenCalled();
  sessionId=session();registerPushDevice(actor,sessionId,{enabled:true,expoPushToken:pushToken,platform:'ios'});finish();queueMobileJobNotifications();getDb().prepare("UPDATE mobile_sessions SET expires_at='2020-01-01T00:00:00Z' WHERE id=?").run(sessionId);expect(await processMobilePushOutbox(sender)).toBe(0);
  sessionId=session();registerPushDevice(actor,sessionId,{enabled:true,expoPushToken:pushToken,platform:'ios'});finish();queueMobileJobNotifications();getDb().prepare("UPDATE memberships SET role='manager' WHERE user_id=? AND office_id=?").run(actor.id,actor.officeId);expect(await processMobilePushOutbox(sender)).toBe(0);expect(sender.send).not.toHaveBeenCalled();
 });
 it('rechecks original source access and never sends a stale cost request',async()=>{
  enable();const run=make([relation]);processWorkRuns(actor,20);queueMobileJobNotifications();getDb().prepare("UPDATE investors SET owner_id='user-jordan' WHERE id='investor-mike'").run();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(0);expect(notices()[0].status).toBe('canceled');expect(getWorkRun(actor,run.id).contentRestricted).toBe(true);
 });
 it('cancels a no-longer-current approval notice after the employee denies the job',async()=>{
  enable();const run=make([relation,{...relation,key:'second'},{...relation,key:'third'}]);expect(run.status).toBe('waiting_cost_approval');queueMobileJobNotifications();decideWorkCost(actor,run.id,{expectedVersion:run.version,eventKey:'deny',quoteId:run.budget.quoteId,decision:'deny'});vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(0);expect(notices()[0].status).toBe('canceled');
 });
 it('expires delayed notices rather than sending an old alert',async()=>{
  enable();finish();queueMobileJobNotifications();vi.advanceTimersByTime(86400_001);vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(0);expect(notices()[0].status).toBe('expired');
 });
 it('keeps network ambiguity unknown and never automatically sends it again',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();sender.send.mockRejectedValueOnce(new Error('Timed out after acceptance'));expect(await processMobilePushOutbox(sender)).toBe(0);expect(notices()[0].status).toBe('unknown');await processMobilePushOutbox(sender);queueMobileJobNotifications();expect(sender.send).toHaveBeenCalledTimes(1);expect(notices()).toHaveLength(1);
 });
 it('marks interrupted dispatch as unknown after restart without resending it',async()=>{
  enable();finish();queueMobileJobNotifications();getDb().prepare("UPDATE mobile_push_outbox SET status='dispatching'").run();vi.advanceTimersByTime(61_000);vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();await processMobilePushOutbox(sender);expect(notices()[0]).toMatchObject({status:'unknown',error_code:'interrupted_send'});expect(sender.send).not.toHaveBeenCalled();
 });
 it('records APNs/FCM service acceptance without claiming a phone displayed the notice',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();await processMobilePushOutbox(sender);expect(await reconcileMobilePushReceipts(sender)).toBe(0);vi.advanceTimersByTime(15*60_000+1);expect(await reconcileMobilePushReceipts(sender)).toBe(1);expect(notices()[0].status).toBe('service_received');expect(mobileNotificationState(actor,sessionId).notice).toContain('does not confirm');expect(sender.send).toHaveBeenCalledTimes(1);
 });
 it('validates actual-shaped Expo tickets and receipts through the default adapter without live network',async()=>{
  enable();const run=finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');vi.stubEnv('EXPO_ACCESS_TOKEN','fictional-expo-test-access');
  const requests=vi.fn().mockResolvedValueOnce(Response.json({data:[{status:'ok',id:'expo-ticket-fixture'}]})).mockResolvedValueOnce(Response.json({data:{'expo-ticket-fixture':{status:'ok'}}}));vi.stubGlobal('fetch',requests);
  expect(await processMobilePushOutbox()).toBe(1);expect(requests.mock.calls[0][0]).toBe('https://exp.host/--/api/v2/push/send');
  const options=requests.mock.calls[0][1] as RequestInit;expect(options.headers).toMatchObject({Authorization:'Bearer fictional-expo-test-access'});expect(JSON.parse(options.body as string).data.workRunId).toBe(run.id);
  vi.advanceTimersByTime(15*60_000+1);expect(await reconcileMobilePushReceipts()).toBe(1);expect(requests.mock.calls[1][0]).toBe('https://exp.host/--/api/v2/push/getReceipts');expect(notices()[0]).toMatchObject({status:'service_received',ticket_id:'expo-ticket-fixture'});
 });
 it('keeps missing provider receipts pending, then marks them unknown without repeating the send',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();await processMobilePushOutbox(sender);const pending={...sender,receipt:vi.fn(async()=> 'pending' as const)};
  vi.advanceTimersByTime(15*60_000+1);await reconcileMobilePushReceipts(pending);expect(notices()[0].status).toBe('accepted');vi.advanceTimersByTime(24*3600_000);await reconcileMobilePushReceipts(pending);expect(notices()[0]).toMatchObject({status:'unknown',error_code:'receipt_unavailable'});await processMobilePushOutbox(sender);expect(sender.send).toHaveBeenCalledTimes(1);
 });
 it('treats malformed success responses as unknown rather than fabricating acceptance or retrying',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const requests=vi.fn(async()=>Response.json({data:{status:'ok'}}));vi.stubGlobal('fetch',requests);expect(await processMobilePushOutbox()).toBe(0);expect(notices()[0]).toMatchObject({status:'unknown',ticket_id:null});await processMobilePushOutbox();expect(requests).toHaveBeenCalledTimes(1);
 });
 it('turns off invalid device tokens from an actual-shaped Expo error response',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{status:'error',details:{error:'DeviceNotRegistered'}}})));expect(await processMobilePushOutbox()).toBe(0);expect(mobileNotificationState(actor,sessionId).enabled).toBe(false);expect(notices()[0]).toMatchObject({status:'failed',error_code:'device_not_registered'});
 });
 it('reconciles a receipt failure and disables further notifications for that token',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();await processMobilePushOutbox(sender);vi.advanceTimersByTime(15*60_000+1);const failed={...sender,receipt:vi.fn(async()=> 'device_not_registered' as const)};expect(await reconcileMobilePushReceipts(failed)).toBe(1);expect(notices()[0].status).toBe('failed');expect(mobileNotificationState(actor,sessionId).enabled).toBe(false);
 });
 it('does not poll another provider receipt after its session is revoked',async()=>{
  enable();finish();queueMobileJobNotifications();vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();await processMobilePushOutbox(sender);revokeMobileSession(actor,sessionId);vi.advanceTimersByTime(15*60_000+1);expect(await reconcileMobilePushReceipts(sender)).toBe(0);expect(sender.receipt).not.toHaveBeenCalled();expect(notices()[0].status).toBe('unknown');
 });
 it('bounds per-device notifications and preserves pending jobs without duplicate sends',async()=>{
  enable();for(let i=0;i<16;i++)finish();expect(queueMobileJobNotifications()).toBe(16);vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','true');const sender=transport();expect(await processMobilePushOutbox(sender)).toBe(12);expect(await processMobilePushOutbox(sender)).toBe(0);expect(sender.send).toHaveBeenCalledTimes(12);expect(notices().filter(row=>row.status==='queued')).toHaveLength(4);
 });
 it('emits attention once when a job stops while retaining its actual failure',()=>{
  enable();const run=make();getDb().prepare("UPDATE properties SET data=json_set(data,'$.status','Sold') WHERE id='property-maple'").run(); // An explicit source-access change stops execution.
  getDb().prepare("UPDATE work_runs SET status='failed',data=json_set(data,'$.status','failed','$.lastError','Private error body') WHERE id=?").run(run.id);expect(queueMobileJobNotifications()).toBe(1);expect(queueMobileJobNotifications()).toBe(0);expect(mobileNotificationState(actor,sessionId).recent[0].kind).toBe('needs_attention');expect(JSON.stringify(mobileNotificationState(actor,sessionId))).not.toContain('Private error body');controlWorkRun(actor,run.id,{action:'cancel',expectedVersion:getWorkRun(actor,run.id).version,eventKey:'stop'});expect(getWorkRun(actor,run.id).status).toBe('canceled');
 });
});
