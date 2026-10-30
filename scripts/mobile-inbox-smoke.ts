import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Bootstrap} from '../src/lib/contracts';
import type {MobilePairing,MobilePairResult} from '../src/lib/mobile-contracts';
import type {InboxAssistance,InboxFollowUpResult,InboxObservationResult,InboxSendResult,InboxSendReview,InboxState,InboxThreadDetail} from '../src/lib/communications-contracts';
import {closeDb,getDb} from '../src/server/db';
if(process.env.AGENTDESK_MOBILE_SMOKE_ISOLATED!=='true'||!process.env.AGENTDESK_DB_PATH||!process.env.SMOKE_BASE_URL||process.env.OPENAI_API_KEY)throw new Error('Use the isolated mobile Inbox runner with providers disabled.');
const base=process.env.SMOKE_BASE_URL;assert.equal(new URL(base).hostname,'127.0.0.1');
let cookie='',token='',checks=0;
async function request<T>(path:string,method='GET',value?:unknown,expected=200,web=false):Promise<T>{
 const response=await fetch(`${base}/api/${path}`,{method,headers:{...(web?{Cookie:cookie}:{Authorization:`Bearer ${token}`}), 'X-AgentDesk-Request':'1','Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)});
 if(web&&response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];
 const text=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${text}`);checks++;return text?JSON.parse(text) as T:undefined as T;
}
const check=(value:unknown,message:string)=>{assert.ok(value,message);checks++;};
const mutation=(detail:InboxThreadDetail)=>({expectedVersion:detail.thread.version,eventKey:randomUUID()});
const detail=(id:string)=>request<InboxThreadDetail>(`inbox/${id}`);
const count=(table:string)=>(getDb().prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n;
async function pair(role:'dispositions'|'acquisitions'|'manager'){
 await request('session','POST',{role},200,true);
 const code=await request<MobilePairing>('mobile/pairing','POST',{},200,true);
 const paired=await request<MobilePairResult>('mobile/pair','POST',{code:code.code,deviceName:`Inbox ${role} preview`},201,true);token=paired.token;return paired;
}
try{
 await request<Bootstrap>('bootstrap','GET',undefined,200,true);const alex=await pair('dispositions'),alexCookie=cookie;
 const untouched={providers:count('provider_operations'),wallet:count('wallet_operations'),messages:count('messages'),crm:getDb().prepare('SELECT id,data FROM investors ORDER BY id').all()};
 const inbox=await request<InboxState>('inbox'),company=inbox.threads.find(item=>item.accountId===inbox.preferredAccountId)!;assert.ok(company);
 check(inbox.accounts[0].primary&&inbox.accounts[0].provider==='salesforce','Phone starts with company email before optional inboxes');
 const primary=await request<InboxState>(`inbox?accountId=${company.accountId}&filter=needs_reply`);check(primary.threads.every(item=>item.accountId===company.accountId),'Phone source and handling filters use scoped records');
 let current=await detail(company.id);check(current.bodyAccess==='full'&&current.messages.length>0&&!current.liveDelivery,'Phone sees fictional source body and explicit delivery state');
 let help=await request<InboxAssistance>(`inbox/${company.id}/assist`);check(help.workingMethod?.method.id==='objections'&&help.workingMethod.method.authority==='provisional','Incoming repair question uses the sourced provisional objection method');
 const beforeDraft=current,save={...mutation(current),subject:'My saved reply',body:'I will review the information you requested before suggesting next steps.'};
 current=await request<InboxThreadDetail>(`inbox/${company.id}/draft`,'POST',save);await request(`inbox/${company.id}/draft`,'POST',save);check(current.draft?.body===save.body&&current.draft?.deliveryStatus==='not_sent','Phone saves one manual draft without sending');
 check((await request<InboxThreadDetail>(`inbox/${company.id}`,'GET',undefined,200,true)).draft?.body===save.body,'Desktop reads the same saved mobile draft');
 await request(`inbox/${company.id}/draft`,'POST',{...mutation(beforeDraft),body:'Stale overwrite'},409);check((await detail(company.id)).draft?.body===save.body,'Stale editor cannot overwrite another saved revision');
 await request(`inbox/${company.id}/review-send`,'POST',mutation(current),409);
 current=await request<InboxThreadDetail>(`inbox/${company.id}/prepare-reply`,'POST',mutation(current));
 let review=await request<InboxSendReview>(`inbox/${company.id}/review-send`,'POST',mutation(current));
 check(review.body===current.draft?.body&&review.to.address===current.thread.correspondent.address&&review.attachments.length===0,'Phone review binds exact saved sender, recipient, body and empty attachment set');
 current=await request<InboxThreadDetail>(`inbox/${company.id}/draft`,'POST',{...mutation(current),body:'An edited draft requiring another review'},200,true);
 await request(`inbox/${company.id}/simulate-send`,'POST',{reviewId:review.id,eventKey:randomUUID()},409);
 current=await request<InboxThreadDetail>(`inbox/${company.id}/prepare-reply`,'POST',mutation(current));review=await request<InboxSendReview>(`inbox/${company.id}/review-send`,'POST',mutation(current));
 const send={reviewId:review.id,eventKey:randomUUID()},sent=await request<InboxSendResult>(`inbox/${company.id}/simulate-send`,'POST',send),retry=await request<InboxSendResult>(`inbox/${company.id}/simulate-send`,'POST',send);
 check(sent.receipt.id===retry.receipt.id&&sent.receipt.liveDelivery===false&&sent.detail.draft===null,'Uncertain mobile retry returns one simulated receipt without duplicate delivery');
 current=sent.detail;help=await request<InboxAssistance>(`inbox/${company.id}/assist`);assert.ok(help.suggestedFollowUp);const taskInput={...mutation(current),...help.suggestedFollowUp,title:'Check repair evidence after the phone review',dueAt:null};
 const tasksBefore=count('tasks'),follow=await request<InboxFollowUpResult>(`inbox/${company.id}/follow-up`,'POST',taskInput),again=await request<InboxFollowUpResult>(`inbox/${company.id}/follow-up`,'POST',taskInput);
 check(follow.task.id===again.task.id&&count('tasks')===tasksBefore+1&&follow.task.dueAt===null,'Explicit phone follow-up is saved once without an inferred due date');
 current=follow.detail;assert.ok(help.suggestedObservation);const note=await request<InboxObservationResult>(`inbox/${company.id}/record-observation`,'POST',{...mutation(current),...help.suggestedObservation});
 check(note.observation.verification==='employee_reported'&&!JSON.stringify(note.observation).includes(help.suggestedObservation.messageId),'Reviewed journey note carries minimal provenance without the private message identifier');
 current=await request<InboxThreadDetail>(`inbox/${company.id}`,'PATCH',{...mutation(note.detail),status:'done',unread:false});check(current.thread.status==='done'&&!current.thread.unread,'Native PATCH updates inbox handling status only');
 const headers=inbox.threads.find(item=>inbox.accounts.find(account=>account.id===item.accountId)?.source.coverage==='headers_only')!,header=await detail(headers.id);
 check(header.bodyAccess==='headers_only'&&!header.draft,'Metadata-only phone thread cannot imply body or draft access');check((await request<InboxAssistance>(`inbox/${headers.id}/assist`)).workingMethod===null,'No relationship method is inferred from header-only metadata');
 await request(`inbox/${headers.id}/prepare-reply`,'POST',mutation(header),403);
 const activity=inbox.threads.find(item=>inbox.accounts.find(account=>account.id===item.accountId)?.source.coverage==='crm_activity')!;let captured=await detail(activity.id);
 captured=await request<InboxThreadDetail>(`inbox/${activity.id}/draft`,'POST',{...mutation(captured),body:'Saved from captured activity.'});await request(`inbox/${activity.id}/review-send`,'POST',mutation(captured),403);
 for(const role of ['acquisitions','manager'] as const){await pair(role);const own=await request<InboxState>('inbox');check(own.threads.every(item=>item.id!==company.id),`${role} keeps a separate private inbox`);await request(`inbox/${company.id}`,'GET',undefined,404);await request(`inbox/${company.id}/draft`,'POST',save,404);}
 cookie=alexCookie;token=alex.token;
 current=await detail(company.id);current=await request<InboxThreadDetail>(`inbox/${company.id}/prepare-reply`,'POST',mutation(current));review=await request<InboxSendReview>(`inbox/${company.id}/review-send`,'POST',mutation(current));
 await request('inbox/receive-demo','POST',{scenarioId:'company-revoke-access',eventKey:randomUUID()},200,true);
 const withheld=await detail(company.id);check(withheld.bodyAccess==='revoked'&&withheld.draft===null&&withheld.investorContext===null,'Revoked source clears phone correspondence context and draft');
 await request(`inbox/${company.id}/simulate-send`,'POST',{reviewId:review.id,eventKey:randomUUID()},403);
 await request('inbox/receive-demo','POST',{scenarioId:'company-restore-access',eventKey:randomUUID()},200,true);await request(`inbox/${company.id}/simulate-send`,'POST',{reviewId:review.id,eventKey:randomUUID()},409);
 await request(`mobile/devices/${alex.sessionId}/revoke`,'POST',{},200,true);await request(`inbox/${company.id}`,'GET',undefined,401);
 check(count('provider_operations')===untouched.providers&&count('wallet_operations')===untouched.wallet,'Phone Inbox performs no provider call or wallet debit');
 check(count('messages')===untouched.messages,'Investor correspondence never enters the employee Copilot conversation');
 assert.deepEqual(getDb().prepare('SELECT id,data FROM investors ORDER BY id').all(),untouched.crm);checks++;
 console.info(`PASS: ${checks} mobile Inbox HTTP checks. Shared saved drafts, exact reviewed simulation, follow-up/note review, stale versions, source capabilities, role isolation and device revocation; no live providers or wallet charges.`);
}finally{closeDb();}
