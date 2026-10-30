import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Bootstrap,Conversation,Task,ToolResult } from '../src/lib/contracts';
import type { InvestorJourney } from '../src/lib/journey-contracts';
import type { ProviderStatus } from '../src/lib/provider-contracts';

const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3000';
const runId=`conversation-smoke-${randomUUID()}`;
let cookie='',checks=0,turn=0;
type ChatResult={conversation:Conversation;result:ToolResult};
async function request<T>(path:string,method='GET',value?:unknown,expected=200):Promise<T>{
 const response=await fetch(`${base}/api/${path}`,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:value===undefined?undefined:JSON.stringify(value)});
 const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];
 const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text}`);checks++;return text?JSON.parse(text) as T:undefined as T;
}
function check(condition:unknown,message:string){assert.ok(condition,message);checks++;}

// Disposable compiled-server test. No provider or messaging delivery is enabled.
await request('tasks','GET',undefined,401);
const initial=await request<Bootstrap>('bootstrap');
check(!initial.integrations.openai&&!initial.integrations.voice,'Provider calls must be disabled for the conversation smoke');
const beforeProviders=await request<ProviderStatus>('providers');assert.equal(beforeProviders.usage.operations,0);
const investor=initial.investors.find(item=>item.id==='investor-mike');assert.ok(investor?.synthetic);
const employeeCookie=cookie;
const {conversationId}=await request<{conversationId:string}>('messaging/conversation','POST',{});
assert.equal((await request<{conversationId:string}>('messaging/conversation','POST',{})).conversationId,conversationId);
const chat=(message:string,requestId=`${runId}-${++turn}`)=>request<ChatResult>('chat','POST',{conversationId,requestId,message});
const task=(id:string)=>request<Task>(`tasks/${id}`);
const create=(title:string)=>request<Task>('tasks','POST',{title,investorId:'investor-mike',dueAt:new Date(Date.now()+86400000).toISOString()},201);
const first=await create(`Call Morgan about inspection ${runId}`);
const second=await create(`Call Morgan about paperwork ${runId}`);
const canceled=await create(`Review sample repairs ${runId}`);
for(const created of [first,second,canceled])assert.equal(created.version,1);

const ambiguous=await chat(`Complete Call Morgan`);
assert.match(ambiguous.result.message,/more than one|which/i);assert.match(ambiguous.result.message,/reply with the number/i);
const candidates=ambiguous.result.artifacts.filter(item=>item.type==='task');assert.equal(candidates.length,2);
assert.deepEqual(new Set(candidates.map(item=>item.id)),new Set([first.id,second.id]));
check((await task(first.id)).status==='open'&&(await task(second.id)).status==='open','Ambiguous action performs no mutation');
const selectedId=candidates[1].id!;
const selected=await chat('2');assert.match(selected.result.message,/marked complete/i);assert.equal((await task(selectedId)).status,'completed');
const remaining=selectedId===first.id?second:first;
check((await task(remaining.id)).status==='open','Numbered clarification changes only the selected task');

const beforeSnooze=Date.now();
const snoozed=await chat(`Snooze ${remaining.title} for two hours`);assert.match(snoozed.result.message,/snoozed/i);
const snoozedTask=await task(remaining.id);assert.equal(snoozedTask.version,2);assert.ok(snoozedTask.dueAt);
check(Math.abs(Date.parse(snoozedTask.dueAt)-beforeSnooze-120*60000)<15000,'Snooze uses a duration from the current time');
const moved=await chat('Move it to tomorrow at 9am');assert.match(moved.result.message,/moved/i);
const movedTask=await task(remaining.id);assert.equal(movedTask.version,3);assert.ok(movedTask.dueAt);
assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',hourCycle:'h23'}).format(new Date(movedTask.dueAt)),'09:00');
check(Date.parse(movedTask.dueAt)>Date.now(),'Rescheduling retains the referenced task and a future Eastern deadline');
const finishId=`${runId}-done`;
const finished=await chat('Done',finishId);assert.match(finished.result.message,/marked complete/i);
const replay=await chat('Done',finishId);assert.equal(replay.conversation.messages.length,finished.conversation.messages.length);
assert.deepEqual(await task(remaining.id),{...await task(remaining.id),status:'completed',version:4});

const cancelResult=await chat(`Cancel ${canceled.title}`);assert.match(cancelResult.result.message,/canceled/i);
const canceledTask=await task(canceled.id);assert.equal(canceledTask.status,'canceled');assert.equal(canceledTask.version,2);assert.ok(canceledTask.canceledAt);
await request(`tasks/${canceled.id}`,'PATCH',{action:'complete',expectedVersion:1,eventKey:`${runId}-stale`},409);
await request(`tasks/${canceled.id}`,'PATCH',{action:'snooze',minutes:30,expectedVersion:2,eventKey:`${runId}-closed`},409);
await request(`tasks/${canceled.id}`,'PATCH',{action:'cancel',expectedVersion:2,ownerId:initial.actor.id},400);
assert.deepEqual(await task(canceled.id),canceledTask);
check((await request<Task[]>('tasks')).some(item=>item.id===canceled.id&&item.status==='canceled'),'Canceled task remains inspectable in history');

const recorded=await chat('Remember an objection for Mike: Repair scope was unclear');assert.match(recorded.result.message,/recorded your objection/i);
const beforeJourney=await request<InvestorJourney>('investors/investor-mike/journey');
const concern=beforeJourney.openIssues.find(item=>item.text==='Repair scope was unclear');assert.ok(concern);
const resolved=await chat("Resolve Mike's repair concern: he confirmed the breakdown answered his question.");assert.match(resolved.result.message,/concern resolved/i);
const afterJourney=await request<InvestorJourney>('investors/investor-mike/journey');
const original=afterJourney.observations.find(item=>item.id===concern.id);assert.equal(original?.status,'resolved');assert.ok(original.resolvedById);
check(afterJourney.observations.some(item=>item.id===original.resolvedById&&item.verification==='employee_reported'),'Conversational resolution retains employee-reported provenance');
check(!afterJourney.openIssues.some(item=>item.id===concern.id),'Resolved concern leaves the active concern list');

await request('session','POST',{role:'manager'});
await request(`tasks/${remaining.id}`,'GET',undefined,404);
await request(`tasks/${remaining.id}`,'PATCH',{action:'cancel',expectedVersion:4,eventKey:`${runId}-manager-denied`},404);
await request(`conversations/${conversationId}`,'GET',undefined,404);
check(!(await request<Task[]>('tasks')).some(item=>item.id===remaining.id),'Manager personal task endpoint does not expose employee tasks');
cookie=employeeCookie;
const persisted=await request<Conversation>(`conversations/${conversationId}`);check(persisted.messages.some(item=>item.content.includes('Marked Mike')),'Shared conversation preserves the completed work');
const final=await request<Bootstrap>('bootstrap');
assert.deepEqual(final.investors.find(item=>item.id==='investor-mike'),investor);assert.equal(final.approvals.length,initial.approvals.length);
assert.equal(final.tasks.length,initial.tasks.length+3);
const providers=await request<ProviderStatus>('providers');assert.equal(providers.usage.operations,0);
console.info(`PASS: ${checks} conversation HTTP checks. Ambiguous task → numbered choice; snooze → reschedule → done with replay; cancellation/history; concern resolution; private task scope and version conflicts. No CRM changes, investor messages or AI provider calls.`);
