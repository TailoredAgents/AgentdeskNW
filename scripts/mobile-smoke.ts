import type {WorkspaceReadiness} from '../src/lib/connection-contracts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import type {Bootstrap,Conversation,ToolResult} from '../src/lib/contracts';
import type {MobileConnection,MobilePairing,MobilePairResult,MobileDevices} from '../src/lib/mobile-contracts';
import type {MobileNotificationState} from '../src/lib/mobile-notification-contracts';
import type {WorkRun} from '../src/lib/work-contracts';
import {closeDb,getDb} from '../src/server/db';
import {queueMobileJobNotifications,processMobilePushOutbox} from '../src/server/mobile-notifications';
import {workConversationReference} from '../src/server/work-conversation';

if(process.env.AGENTDESK_MOBILE_SMOKE_ISOLATED!=='true'||!process.env.AGENTDESK_DB_PATH||!process.env.SMOKE_BASE_URL)throw new Error('Use npm run test:mobile with its disposable compiled workspace.');
const base=process.env.SMOKE_BASE_URL;if(new URL(base).hostname!=='127.0.0.1')throw new Error('Mobile acceptance requires the isolated loopback server.');
if(process.env.OPENAI_API_KEY||process.env.AGENTDESK_MOBILE_PUSH_SEND_ENABLED==='true'||process.env.AGENTDESK_CHANNEL_SEND_ENABLED==='true')throw new Error('Mobile smoke must not use real model or message delivery.');
let cookie='',token='',checks=0;
type Surface='web'|'native'|'anonymous';
async function request<T>(path:string,method='GET',value?:unknown,expected=200,surface:Surface='native'):Promise<T>{
 const response=await fetch(base+'/api/'+path,{method,headers:{...(surface==='native'?{Authorization:`Bearer ${token}`} :surface==='web'?{Cookie:cookie}:{}),'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:value===undefined?undefined:JSON.stringify(value)});
 if(surface==='web'){const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];}
 if(surface==='native')assert.equal(response.headers.get('set-cookie'),null,'Native bearer requests do not create cookie sessions');
 const body=await response.text();assert.equal(response.status,expected,`${surface} ${method} ${path}: ${body}`);checks++;return body?JSON.parse(body) as T:undefined as T;
}
function check(condition:unknown,message:string){assert.ok(condition,message);checks++;}
const count=(table:'provider_operations'|'research_provider_calls'|'messaging_outbox'|'communication_send_receipts')=>(getDb().prepare(`SELECT count(*) n FROM ${table}`).get() as {n:number}).n;
const snapshot=(table:'investors'|'properties')=>getDb().prepare(`SELECT id,data FROM ${table} ORDER BY id`).all();
const chat=(message:string,conversationId:string,requestId=randomUUID(),surface:Surface='native')=>request<{conversation:Conversation;result:ToolResult}>('chat','POST',{message,conversationId,requestId},200,surface);
try{
 await request('work','GET',undefined,401,'anonymous');
 const web=await request<Bootstrap>('bootstrap','GET',undefined,200,'web'),alexCookie=cookie;
 check(!web.integrations.openai&&!web.integrations.voice,'Mobile checks use fictional data without model credentials');
 const original={investors:snapshot('investors'),properties:snapshot('properties')};
 await request('mobile/pair','POST',{code:'00000000',deviceName:'Invalid test'},401,'anonymous');
 const pairing=await request<MobilePairing>('mobile/pairing','POST',{},200,'web');check(/^\d{8}$/.test(pairing.code),'Pairing uses a short one-time code');
 const missingHeader=await fetch(base+'/api/mobile/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:pairing.code,deviceName:'No request marker'})});check(missingHeader.status===403,'Pairing requires the request marker');
 const connected=await request<MobilePairResult>('mobile/pair','POST',{code:pairing.code,deviceName:'Fictional iPhone'},201,'anonymous');token=connected.token;const alexToken=token;
 check(connected.actor.id===web.actor.id&&connected.sessionId&&connected.conversationId&&connected.token.startsWith('adnw_'),'Pairing binds the signed-in employee and ongoing conversation');
 await request('mobile/pair','POST',{code:pairing.code,deviceName:'Duplicate'},401,'anonymous');
 const state=await request<MobileConnection>('mobile/session');check(state.sessionId===connected.sessionId&&state.actor.id===web.actor.id&&state.conversationId===connected.conversationId,'Phone session restores the same private identity and conversation');
 const native=await request<Bootstrap>('bootstrap');check(native.actor.id===web.actor.id,'Bearer bootstrap selects the connected employee');
 await request('session','POST',{role:'manager'},403);await request('access','POST',{code:'0000'},403);await request('mobile/pairing','POST',{},403);await request('mobile/devices','GET',undefined,403);
 await request('mobile/session','GET',undefined,401,'web');await request('mobile/notifications','GET',undefined,401,'web');
 const crossOrigin=await fetch(base+'/api/work',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-AgentDesk-Request':'1',Origin:'https://unrelated.example'},body:JSON.stringify({requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple'})});check(crossOrigin.status===403,'Native bearer does not bypass origin admission');
 const savedToken=token;token='adnw_invalid';await request('bootstrap','GET',undefined,401);token=savedToken;
 const noticesOff=await request<MobileNotificationState>('mobile/notifications');check(!noticesOff.enabled&&!noticesOff.sendingEnabled&&noticesOff.recent.length===0,'Phone notifications begin off and no delivery is claimed');
 const device=await request<MobileNotificationState>('mobile/notifications','POST',{enabled:true,expoPushToken:'ExpoPushToken[fictionalSmoke000001]',platform:'ios'});check(device.registered&&device.enabled&&!device.sendingEnabled,'Explicit opt-in registers this phone while server delivery stays off');
 check(!JSON.stringify(device).includes('fictionalSmoke000001'),'Notification state never returns a device token');
 await request('mobile/notifications','POST',{enabled:true,expoPushToken:'ExpoPushToken[fictionalSmoke000001]',platform:'ios',sessionId:'forged'},400);
 const beforeJobs=(await request<{runs:WorkRun[]}>('work')).runs.length;
 const requestId=randomUUID(),message='Start a job for 123 Example Street and Mike Bennett and create a follow-up task with fictional new-investor research.';
 const started=await chat(message,connected.conversationId,requestId);
 let runs=(await request<{runs:WorkRun[]}>('work')).runs,job=runs.find(run=>run.id===started.result.artifacts.find(item=>item.type==='work_run')?.id);assert.ok(job);
 check(job.status==='waiting_cost_approval'&&job.budget.maximumCents===325&&job.budget.spentCents===0,'Mobile conversation creates one bounded job that waits above $1');
 await chat(message,connected.conversationId,requestId);runs=(await request<{runs:WorkRun[]}>('work')).runs;check(runs.length===beforeJobs+1,'Retried mobile message does not duplicate the job');
 const webConversation=await request<Conversation>('conversations/'+connected.conversationId,'GET',undefined,200,'web');check(webConversation.messages.some(item=>item.id===started.conversation.messages.at(-1)?.id),'Desktop sees the exact same saved mobile conversation');
 const reference=workConversationReference(job.id),review=await chat('Review job '+reference,connected.conversationId);
 const decision=review.result.message.match(/Approve (A[0-9A-F]{8})/);assert.ok(decision,'Current exact review returns an employee decision reference');checks++;
 check(review.result.message.includes('$3.25')&&review.result.message.includes('123 Example Street'),'Review contains the actual property and whole-job maximum');
 await chat('Approve '+decision[1],connected.conversationId,randomUUID(),'web');job=await request<WorkRun>('work/'+job.id);check(job.status==='queued','A desktop decision continues the phone-created job');
 await chat('Pause job '+reference,connected.conversationId);job=await request<WorkRun>('work/'+job.id);check(job.status==='paused','Phone conversation pauses the same job');
 await chat('Resume job '+reference,connected.conversationId);job=await request<WorkRun>('work/'+job.id);check(job.status==='queued','Phone conversation resumes saved work');
 await chat('Cancel job '+reference,connected.conversationId);job=await request<WorkRun>('work/'+job.id);check(job.status==='canceled'&&job.budget.spentCents===0,'Phone cancellation preserves zero execution and zero spending');
 const tasks=await request<{tasks?:unknown[]}>('tasks');check(!!tasks,'Existing scoped services remain available through bearer authentication');
 await request('session','POST',{role:'acquisitions'},200,'web');const jordanCookie=cookie;
 const jordanPair=await request<MobilePairing>('mobile/pairing','POST',{},200,'web'),jordan=await request<MobilePairResult>('mobile/pair','POST',{code:jordanPair.code,deviceName:'Fictional Android'},201,'anonymous');token=jordan.token;
 check((await request<Bootstrap>('bootstrap')).actor.id===jordan.actor.id&&jordan.actor.id!==web.actor.id,'Second phone binds acquisitions rather than the default demo employee');
 await request('work/'+job.id,'GET',undefined,404);await request('conversations/'+connected.conversationId,'GET',undefined,404);check((await request<{runs:WorkRun[]}>('work')).runs.length===0,'Another employee sees no private phone-created jobs');
 await request('mobile/notifications','POST',{enabled:true,expoPushToken:'ExpoPushToken[fictionalSmoke000001]',platform:'android'},409);
 await request('mobile/logout','POST',{});await request('mobile/session','GET',undefined,401);await request('bootstrap','GET',undefined,401);
 token=alexToken;cookie=alexCookie;
 const readiness=await request<WorkspaceReadiness>('workspace-readiness');check(!readiness.companyDataReady&&readiness.mode==='fictional-demonstration','Phone sees truthful connection preparation without company activation');
 await request('workspace-readiness','POST',{live:true},404);

 const devices=await request<MobileDevices>('mobile/devices','GET',undefined,200,'web');check(devices.devices.some(item=>item.id===connected.sessionId)&&!devices.devices.some(item=>item.id===jordan.sessionId),'Web device management is employee-private');
 let unattended=await request<WorkRun>('work','POST',{requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple',investorId:'investor-mike'},201);
 const worker=spawn(process.execPath,['--import','tsx','scripts/worker.ts'],{stdio:['ignore','ignore','inherit'],env:process.env});
 try{
  for(let attempt=0;attempt<50;attempt++){
   unattended=await request<WorkRun>('work/'+unattended.id);const state=await request<MobileNotificationState>('mobile/notifications');if(unattended.status==='completed'&&state.recent.some(item=>item.workRunId===unattended.id))break;
   assert.equal(worker.exitCode,null,'The background worker must remain running');await new Promise(resolve=>setTimeout(resolve,300));
  }
  const queued=await request<MobileNotificationState>('mobile/notifications');check(unattended.status==='completed'&&unattended.budget.spentCents===75&&unattended.budget.reservedCents===0,'Actual worker finishes persisted phone-created work');
  check(queued.recent.some(item=>item.workRunId===unattended.id&&item.kind==='completed'&&item.status==='queued'),'Worker records one generic notification intent without claiming phone delivery');
  check(queued.recent.every(item=>!['accepted','service_received'].includes(item.status)),'No live Expo push request was accepted during the smoke');
 }finally{await new Promise<void>(resolve=>{if(worker.exitCode!==null||worker.signalCode!==null){resolve();return;}worker.once('exit',()=>resolve());worker.kill('SIGTERM');});}
 const pendingCount=(await request<MobileNotificationState>('mobile/notifications')).recent.length;queueMobileJobNotifications();await processMobilePushOutbox();check((await request<MobileNotificationState>('mobile/notifications')).recent.length===pendingCount,'Repeated worker observation cannot duplicate the saved notification');
 await request('mobile/notifications','POST',{enabled:false});check(!(await request<MobileNotificationState>('mobile/notifications')).enabled,'Phone can disable notification delivery');
 await request('mobile/devices/'+connected.sessionId+'/revoke','POST',{},200,'web');await request('mobile/session','GET',undefined,401);await request('work','GET',undefined,401);
 const fallback=await fetch(base+'/api/bootstrap',{headers:{Authorization:`Bearer ${alexToken}`,Cookie:alexCookie,'X-AgentDesk-Request':'1'}});check(fallback.status===401,'Revoked bearer cannot fall back to a valid browser cookie');
 cookie=jordanCookie;const jordanDevices=await request<MobileDevices>('mobile/devices','GET',undefined,200,'web');check(jordanDevices.devices.every(item=>item.id!==connected.sessionId),'Other web employee cannot enumerate the first mobile identity');
 assert.deepEqual(snapshot('investors'),original.investors);assert.deepEqual(snapshot('properties'),original.properties);checks+=2;
 check(count('provider_operations')===0&&count('research_provider_calls')===0&&count('messaging_outbox')===0&&count('communication_send_receipts')===0,'No AI, public research, employee message or investor delivery was performed');
 check((getDb().pragma('foreign_key_check') as unknown[]).length===0&&getDb().pragma('integrity_check',{simple:true})==='ok','Additive mobile records retain database integrity');
 console.info(`PASS: ${checks} mobile HTTP/worker checks. Scoped one-time pairing, native session privacy, shared conversation/job control, exact cost decision, background completion and disabled-by-default generic notifications. No physical device, live push, voice recognition, company connection or payment is claimed.`);
}finally{closeDb();}
