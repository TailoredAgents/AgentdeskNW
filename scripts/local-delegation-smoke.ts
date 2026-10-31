import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn,type ChildProcess} from 'node:child_process';
import type {AssignmentReview} from '../src/lib/assignment-review-contracts';
import type {WorkRun} from '../src/lib/work-contracts';
import type {Conversation,ToolResult} from '../src/lib/contracts';

const directory=mkdtempSync(join(tmpdir(),'agentdesk-text-http-')),log=join(directory,'transport.log');writeFileSync(log,'');
const port=await new Promise<number>((resolve,reject)=>{const socket=createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=(socket.address() as {port:number}).port;socket.close(()=>resolve(port));});});
const env={...process.env,AGENTDESK_DB_PATH:join(directory,'test.sqlite'),AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',AGENTDESK_HOSTED_DEMO:'false',AGENTDESK_SESSION_SECRET:randomBytes(32).toString('hex'),AGENTDESK_TEXT_HTTP_ISOLATED:'true',AGENTDESK_TEXT_MOCK_DELEGATE:'true',AGENTDESK_TEXT_MOCK_LOG:log,OPENAI_API_KEY:'mock-key-never-sent',OPENAI_MODEL:'gpt-6-astra',OPENAI_REASONING_EFFORT:'high',AGENTDESK_TEXT_SPENDING_MODE:'admitted_demo',AGENTDESK_TEXT_MAX_ROUNDS:'2',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'300000',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_MOBILE_PUSH_SEND_ENABLED:'false',AGENTDESK_TEXT_CUSTOMER_TARIFFS:JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional local HTTP acceptance tariff, not provider pricing',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000000,cached_input_tokens:0,output_tokens:1000000}}])};
let app:ChildProcess|undefined,worker:ChildProcess|undefined,cookie='',checks=0;
const origin=`http://127.0.0.1:${port}`;
async function stop(child:ChildProcess|undefined){if(!child||child.exitCode!==null||child.signalCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');});}
async function start(){app=spawn(process.execPath,['--import','./scripts/fixtures/text-provider.mjs','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Isolated text server did not become ready.');}
async function request<T>(path:string,body?:unknown,status=200):Promise<T>{const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];const text=await response.text();assert.equal(response.status,status,`${path}: ${text}`);checks++;return text?JSON.parse(text) as T:undefined as T;}
const check=(value:unknown,message:string)=>{assert.ok(value,message);checks++;};
try{
 await start();await request('/assignment-reviews',undefined,401);await request('/bootstrap');
 const result=await request<{conversation:Conversation;result:ToolResult}>('/chat',{message:'Find existing buyers for property-maple as a saved job.',requestId:'http-cost-continuation'});
 check(result.result.message.includes('needs your spending decision'),'The actual HTTP chat pauses for the quote');
 const review=(await request<{reviews:AssignmentReview[]}>('/assignment-reviews')).reviews[0];check(review.canDecide&&review.maximumCents===205,'The complete bounded text maximum is shown');check(readFileSync(log,'utf8')==='','No provider request precedes the required approval');
 await stop(app);await start();check((await request<AssignmentReview>('/assignment-reviews/'+review.id)).quoteId===review.quoteId,'The same quote survives a server restart');
 const reference=result.result.message.match(/Review spending (S[0-9A-F]{16})/)?.[1];check(reference,'The original request supplies its spending reference');
 const shown=await request<{result:ToolResult}>('/chat',{conversationId:result.conversation.id,message:`Review spending ${reference}`,requestId:'http-show-spending'});
 const code=shown.result.message.match(/Approve (R[0-9A-F]{16})/)?.[1];check(code&&shown.result.message.includes('maximum $2.05'),'The complete conversation review includes scope, maximum and an exact decision');
 check(readFileSync(log,'utf8')==='','Review commands do not call a model');
 const input={conversationId:result.conversation.id,message:`Approve ${code}`,requestId:'http-approve-spending'};
 check((await request<{result:ToolResult}>('/chat',input)).result.message.includes('Approved the reviewed scope'),'The employee approves through the shared conversation');
 check((await request<AssignmentReview>('/assignment-reviews/'+review.id)).state==='ready','Conversation approval records readiness');
 worker=spawn(process.execPath,['--import','./scripts/fixtures/text-provider.mjs','--import','tsx','scripts/worker.ts'],{env,stdio:['ignore','ignore','inherit']});
 let conversation:Conversation|undefined;
 for(let i=0;i<80;i++){conversation=await request<Conversation>('/conversations/'+result.conversation.id);if(conversation.messages.some(m=>m.content==='Your fictional reasoning result is saved after approval.'))break;await new Promise(resolve=>setTimeout(resolve,250));}
 check(conversation?.messages.filter(m=>m.role==='user'&&m.content==='Find existing buyers for property-maple as a saved job.').length===1,'Continuation keeps the original user request');
 check(conversation?.messages.filter(m=>m.content==='Your fictional reasoning result is saved after approval.').length===1,'The worker publishes one final result');
 const completed=await request<AssignmentReview>('/assignment-reviews/'+review.id);check(completed.spentCents===6&&completed.heldCents===0,'Authoritative usage settles six fictional cents and releases the rest');
 await request('/chat',input);
 let job:WorkRun|undefined;
 for(let i=0;i<80;i++){job=(await request<{runs:WorkRun[]}>('/work')).runs[0];if(job?.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,250));}
 check(job?.status==='completed'&&job.costScope==='included_local','The original saved local job completes under its parent assignment');
 check(job?.budget.spentCents===0&&job.steps.every(step=>step.maximumCents===0),'Local steps do not create another AI wallet charge');
 check((await request<AssignmentReview>('/assignment-reviews/'+review.id)).state==='closed','The assignment closes after its local child finishes');
 check(readFileSync(log,'utf8')==='count\ngeneration\ncount\ngeneration\n','Two reasoning rounds used mock transport; local work needed no extra model call');
 await stop(worker);worker=undefined;await stop(app);app=undefined;await start();
 check((await request<Conversation>('/conversations/'+result.conversation.id)).messages.filter(m=>m.content==='Your fictional reasoning result is saved after approval.').length===1,'The final result survives another process restart');
 const stopped=await request<{conversation:Conversation;result:ToolResult}>('/chat',{message:'Explain the next fictional property step.',requestId:'http-cancel-original'});
 let stopReview=(await request<{reviews:AssignmentReview[]}>('/assignment-reviews')).reviews.find(item=>item.canCancel)!;check(stopReview,'The current original request can be canceled');
 const previousReview=stopReview,renewInput={quoteId:stopReview.quoteId,revision:stopReview.revision,eventKey:'http-renew-scope'};
 stopReview=await request<AssignmentReview>('/assignment-reviews/'+previousReview.id+'/renew',renewInput);
 check(stopReview.id!==previousReview.id&&stopReview.canDecide,'Renewal preserves the request and asks for a fresh exact decision');
 check((await request<AssignmentReview>('/assignment-reviews/'+previousReview.id+'/renew',renewInput)).id===stopReview.id,'Renewal retry returns its same replacement quote');
 await request('/assignment-reviews/'+previousReview.id+'/cancel',{quoteId:previousReview.quoteId,revision:previousReview.revision,eventKey:'obsolete-cancel'},409);
 const stopInput={quoteId:stopReview.quoteId,revision:stopReview.revision,eventKey:'http-cancel-scope'};
 check((await request<AssignmentReview>('/assignment-reviews/'+stopReview.id+'/cancel',stopInput)).executionState==='canceled','Exact employee cancellation closes unstarted work');
 check((await request<AssignmentReview>('/assignment-reviews/'+stopReview.id+'/cancel',stopInput)).heldCents===0,'Cancellation retries preserve released credit');
 await stop(app);app=undefined;await start();
 check((await request<AssignmentReview>('/assignment-reviews/'+stopReview.id)).canCancel===false,'Cancellation survives another process restart');
 const status=await request<{result:ToolResult}>('/chat',{conversationId:stopped.conversation.id,message:'Show my spending',requestId:'http-cancel-status'});check(status.result.message.includes('Remaining work canceled'),'Shared conversation reports the canceled outcome');
 check(readFileSync(log,'utf8')==='count\ngeneration\ncount\ngeneration\n','Cancel/status did not trigger a new provider call');
 console.info(`PASS: ${checks} local-delegation HTTP/worker checks; shared parent, exact approval, zero-charge local work, restart and settled mock reasoning. No external provider call.`);
}finally{await stop(worker);await stop(app);rmSync(directory,{recursive:true,force:true});}
