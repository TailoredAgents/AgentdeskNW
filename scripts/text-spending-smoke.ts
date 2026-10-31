import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn,type ChildProcess} from 'node:child_process';
import type {AssignmentReview} from '../src/lib/assignment-review-contracts';
import type {Conversation,ToolResult} from '../src/lib/contracts';

const directory=mkdtempSync(join(tmpdir(),'agentdesk-text-http-')),log=join(directory,'transport.log');writeFileSync(log,'');
const port=await new Promise<number>((resolve,reject)=>{const socket=createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=(socket.address() as {port:number}).port;socket.close(()=>resolve(port));});});
const env={...process.env,AGENTDESK_DB_PATH:join(directory,'test.sqlite'),AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',AGENTDESK_HOSTED_DEMO:'false',AGENTDESK_SESSION_SECRET:randomBytes(32).toString('hex'),AGENTDESK_TEXT_HTTP_ISOLATED:'true',AGENTDESK_TEXT_MOCK_LOG:log,OPENAI_API_KEY:'mock-key-never-sent',OPENAI_MODEL:'gpt-6-astra',OPENAI_REASONING_EFFORT:'high',AGENTDESK_TEXT_SPENDING_MODE:'admitted_demo',AGENTDESK_TEXT_MAX_ROUNDS:'2',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'300000',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_MOBILE_PUSH_SEND_ENABLED:'false',AGENTDESK_TEXT_CUSTOMER_TARIFFS:JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional local HTTP acceptance tariff, not provider pricing',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000000,cached_input_tokens:0,output_tokens:1000000}}])};
let app:ChildProcess|undefined,worker:ChildProcess|undefined,cookie='',checks=0;
const origin=`http://127.0.0.1:${port}`;
async function stop(child:ChildProcess|undefined){if(!child||child.exitCode!==null||child.signalCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');});}
async function start(){app=spawn(process.execPath,['--import','./scripts/fixtures/text-provider.mjs','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','ignore','inherit']});for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Isolated text server did not become ready.');}
async function request<T>(path:string,body?:unknown,status=200):Promise<T>{const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];const text=await response.text();assert.equal(response.status,status,`${path}: ${text}`);checks++;return text?JSON.parse(text) as T:undefined as T;}
const check=(value:unknown,message:string)=>{assert.ok(value,message);checks++;};
try{
 await start();await request('/assignment-reviews',undefined,401);await request('/bootstrap');
 const result=await request<{conversation:Conversation;result:ToolResult}>('/chat',{message:'Explain the fictional context and useful next questions.',requestId:'http-cost-continuation'});
 check(result.result.message.includes('needs your spending decision'),'The actual HTTP chat pauses for the quote');
 const review=(await request<{reviews:AssignmentReview[]}>('/assignment-reviews')).reviews[0];check(review.canDecide&&review.maximumCents===205,'The complete bounded text maximum is shown');check(readFileSync(log,'utf8')==='','No provider request precedes the required approval');
 await stop(app);await start();check((await request<AssignmentReview>('/assignment-reviews/'+review.id)).quoteId===review.quoteId,'The same quote survives a server restart');
 const input={quoteId:review.quoteId,revision:review.revision,decision:'approve',eventKey:'http-cost-decision'};
 check((await request<AssignmentReview>('/assignment-reviews/'+review.id+'/decision',input)).state==='ready','HTTP approval records readiness');
 worker=spawn(process.execPath,['--import','./scripts/fixtures/text-provider.mjs','--import','tsx','scripts/worker.ts'],{env,stdio:['ignore','ignore','inherit']});
 let conversation:Conversation|undefined;
 for(let i=0;i<80;i++){conversation=await request<Conversation>('/conversations/'+result.conversation.id);if(conversation.messages.some(m=>m.content==='Your fictional reasoning result is saved after approval.'))break;await new Promise(resolve=>setTimeout(resolve,250));}
 check(conversation?.messages.filter(m=>m.role==='user').length===1,'Continuation keeps the original user request');
 check(conversation?.messages.filter(m=>m.content==='Your fictional reasoning result is saved after approval.').length===1,'The worker publishes one final result');
 const completed=await request<AssignmentReview>('/assignment-reviews/'+review.id);check(completed.spentCents===3&&completed.heldCents===0,'Authoritative usage settles three fictional cents and releases the rest');
 await request('/assignment-reviews/'+review.id+'/decision',input);
 check(readFileSync(log,'utf8')==='count\ngeneration\n','Exactly one input count and one generation used mock transport');
 await stop(worker);worker=undefined;await stop(app);app=undefined;await start();
 check((await request<Conversation>('/conversations/'+result.conversation.id)).messages.filter(m=>m.content==='Your fictional reasoning result is saved after approval.').length===1,'The final result survives another process restart');
 console.info(`PASS: ${checks} admitted-text HTTP/worker checks; paused quote, exact approval, restart, original-turn continuation and settled mock usage. No external provider call.`);
}finally{await stop(worker);await stop(app);rmSync(directory,{recursive:true,force:true});}
