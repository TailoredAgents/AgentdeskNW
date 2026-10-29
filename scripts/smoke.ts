import assert from 'node:assert/strict';
import type { Bootstrap,ResearchJob,ProposedAction,NoteSummary,Conversation,Task } from '../src/lib/contracts';

const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3000';
let cookie='';let checks=0;
async function request<T>(path:string,method='GET',value?:unknown,expected=200):Promise<T>{
 const response=await fetch(`${base}/api/${path}`,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:value===undefined?undefined:JSON.stringify(value)});
 const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];
 const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text}`);checks++;return text?JSON.parse(text) as T:undefined as T;
}
const start=await request<Bootstrap>('bootstrap');assert.equal(start.specialists.length,16);assert.equal(start.integrations.crm,'demo');
const badOrigin=await fetch(`${base}/api/tasks`,{method:'POST',headers:{Cookie:cookie,Origin:'https://untrusted.example','X-AgentDesk-Request':'1','Content-Type':'application/json'},body:JSON.stringify({title:'Must not be created'})});assert.equal(badOrigin.status,403);checks++;
const badCsrf=await fetch(`${base}/api/tasks`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({title:'Must not be created'})});assert.equal(badCsrf.status,403);checks++;
await request('research','POST',{address:'too short',county:'Cobb',price:-1,strategy:'Fix & flip',limit:1000},400);
const conversation=await request<Conversation>('conversations','POST',{title:'Smoke: workflow continuity'},201);
if(!start.integrations.openai){const chat=await request<{conversation:Conversation}>('chat','POST',{conversationId:conversation.id,message:'What should I focus on today?'});assert.equal(chat.conversation.messages.length,2);assert.match(chat.conversation.messages[1].content,/open task/);}
let job=await request<ResearchJob>('research','POST',{address:'123 Example Street',county:'Cobb',price:235000,strategy:'Fix & flip',limit:100},201);
for(let attempt=0;attempt<35&&job.status!=='completed';attempt++){await new Promise(resolve=>setTimeout(resolve,500));job=await request<ResearchJob>(`research/${job.id}`);}
assert.equal(job.status,'completed');assert.equal(job.prospects.length,12);assert(job.prospects.every(p=>p.synthetic&&p.phone===null));assert(job.prospects.some(p=>p.duplicateStatus==='existing'));
const csv=await fetch(`${base}/api/research/${job.id}/export`,{headers:{Cookie:cookie}});assert.equal(csv.status,200);assert.match(await csv.text(),/fictional demonstration/);checks++;
const candidate=job.prospects.find(p=>p.duplicateStatus==='net_new')!;
const importAction=await request<ProposedAction>(`research/${job.id}/import`,'POST',{prospectIds:[candidate.id]},201);assert.equal(importAction.status,'pending');
const before=await request<Bootstrap>('bootstrap');assert.equal(before.investors.length,start.investors.length);
const imported=await request<ProposedAction>(`approvals/${importAction.id}`,'POST',{decision:'approve'});assert.equal(imported.status,'executed');
await request(`approvals/${importAction.id}`,'POST',{decision:'approve'});
const after=await request<Bootstrap>('bootstrap');assert.equal(after.investors.length,start.investors.length+1);
assert.equal((await request<ResearchJob>(`research/${job.id}`)).prospects.find(p=>p.id===candidate.id)!.duplicateStatus,'existing');
const summary=await request<NoteSummary>('notes','POST',{transcript:'Agent: What counties work for you?\nMike: I have a $300,000 cash budget. I prefer Cobb County flips with light rehab.\nAgent: I will send you the property details tomorrow.'});assert(summary.commitments.length>0);assert.equal(summary.mode,'local_extraction');
const note=await request<ProposedAction>('notes/propose','POST',{investorId:'investor-mike',summary},201);
assert.equal((await request<ProposedAction>(`approvals/${note.id}`,'POST',{decision:'approve'})).status,'executed');
const updated=await request<Bootstrap>('bootstrap');assert(updated.investors.find(i=>i.id==='investor-mike')!.notes.includes('property details tomorrow'));
const qualification=await request<ProposedAction>('investors/investor-mike','PATCH',{changes:{timeframe:'Within 30 days'}},201);assert.equal(qualification.status,'pending');
assert.equal((await request<Bootstrap>('bootstrap')).investors.find(i=>i.id==='investor-mike')!.timeframe,null);
assert.equal((await request<ProposedAction>(`approvals/${qualification.id}`,'POST',{decision:'approve'})).status,'executed');
assert.equal((await request<Bootstrap>('bootstrap')).investors.find(i=>i.id==='investor-mike')!.timeframe,'Within 30 days');
const task=await request<Task>('tasks','POST',{title:'Smoke: review synthetic prospects',dueAt:new Date(Date.now()-1000).toISOString()},201);
assert.equal((await request<Task>(`tasks/${task.id}/complete`,'POST',{})).status,'completed');
if(!start.integrations.voice)await request('voice/session','POST',{},503);
const ownCookie=cookie;
await request('session','POST',{role:'acquisitions'});
await request('research','POST',{address:'123 Example Street',county:'Cobb',price:235000,strategy:'Fix & flip',limit:10},403);
await request(`conversations/${conversation.id}`,'GET',undefined,404);
cookie=ownCookie;
assert.equal((await request<Conversation>(`conversations/${conversation.id}`)).id,conversation.id);
console.info(`PASS: ${checks} HTTP checks. Persistent research → duplicate check → approval → CRM write, transcript notes, tasks, conversations, role boundaries, request protection, CSV, and voice configuration.`);
