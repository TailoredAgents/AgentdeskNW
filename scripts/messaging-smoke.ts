import { spawn,type ChildProcess } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import twilio from 'twilio';
import { closeDb,demoActor } from '../src/server/db';
import { grantTrial } from '../src/server/billing';
import { processMessagingInbox,processMessagingOutbox } from '../src/server/messaging-worker';
import type { MessagingState } from '../src/lib/messaging-contracts';
import type { Bootstrap } from '../src/lib/contracts';
const directory=mkdtempSync(join(tmpdir(),'agentdesk-messaging-'));
const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(()=>resolve(typeof address==='object'&&address?address.port:0));});});
const base=`http://127.0.0.1:${port}`,canonical='https://channels.example',account=`AC${'a'.repeat(32)}`,number='+15555550101',personal='+15555550102';
Object.assign(process.env,{AGENTDESK_DB_PATH:join(directory,'channels.sqlite'),AGENTDESK_DEMO:'true',AGENTDESK_HOSTED_DEMO:'false',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'',AGENTDESK_CHANNELS_ENABLED:'true',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_CHANNEL_PUBLIC_ORIGIN:canonical,AGENTDESK_CHANNEL_DAILY_LIMIT:'50',SLACK_TRANSPORT:'http',SLACK_TEAM_ID:'TTEST',SLACK_APP_ID:'ATEST',SLACK_SIGNING_SECRET:'fictional-slack-secret',SLACK_BOT_TOKEN:'fictional-bot-token',SLACK_APP_TOKEN:'',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'fictional-twilio-secret',TWILIO_PHONE_NUMBER:number});
let server:ChildProcess|undefined,cookie='',checks=0,sequence=0;
function check(condition:unknown,message:string){assert.ok(condition,message);checks++;}
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:['ignore','ignore','inherit'],env:process.env});for(let i=0;i<60;i++){try{if((await fetch(`${base}/api/health`)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Messaging smoke server did not start');}
async function stop(){if(server&&server.exitCode===null)await new Promise<void>(resolve=>{server!.once('exit',()=>resolve());server!.kill('SIGTERM');});}
async function api(path:string,body?:unknown){return fetch(`${base}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{cookie,origin:base,'x-agentdesk-request':'1','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function slack(text:string,eventId=`Ev${++sequence}`,signatureValid=true){const body=JSON.stringify({type:'event_callback',team_id:'TTEST',api_app_id:'ATEST',event_id:eventId,event:{type:'message',channel_type:'im',user:'UTEST',channel:'DTEST',text}}),stamp=String(Math.floor(Date.now()/1000));const signature=`v0=${createHmac('sha256','fictional-slack-secret').update(`v0:${stamp}:${body}`).digest('hex')}`;return fetch(`${base}/api/webhooks/slack`,{method:'POST',headers:{'x-slack-request-timestamp':stamp,'x-slack-signature':signatureValid?signature:'invalid'},body});}
async function sms(body:Record<string,string>,path='/api/webhooks/twilio'){return fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature('fictional-twilio-secret',`${canonical}${path}`,body)},body:new URLSearchParams(body)});}
try{
 await start();check((await api('messaging')).status===401,'Messaging status requires a session');const bootstrap=await api('bootstrap');cookie=bootstrap.headers.get('set-cookie')!.split(';')[0];check(bootstrap.ok,'Workspace starts');
 grantTrial(demoActor('manager'),{userId:demoActor().id,features:['sms','daily-coordinator']});
 const slackCode=await (await api('messaging/pair',{provider:'slack'})).json() as {command:string};check((await slack(slackCode.command,undefined,false)).status===401,'Forged Slack signature rejected');check((await slack(slackCode.command)).ok,'Signed Slack linking accepted');
 const smsCode=await (await api('messaging/pair',{provider:'sms'})).json() as {command:string};check((await sms({AccountSid:account,MessageSid:`SM${'1'.repeat(32)}`,From:personal,To:number,Body:smsCode.command,NumSegments:'1'})).ok,'Signed SMS linking accepted');
 let state=await (await api('messaging')).json() as MessagingState;check(state.links.length===2,'Both channels share employee scope');check(!!state.conversationId,'Shared thread created');
 const task='create a task to Rehearse Monday messaging';check((await slack(task,'EvWork')).ok,'Task message accepted quickly');await processMessagingInbox();check((await slack(task,'EvWork')).ok,'Provider retry acknowledged');await processMessagingInbox();
 const data=await (await api('bootstrap')).json() as Bootstrap;check(data.tasks.filter(t=>t.title==='Rehearse Monday messaging').length===1,'One real task visible in dashboard');check(data.conversations.find(c=>c.id===state.conversationId)?.messages.length===2,'Shared history visible in dashboard');
 const deliveries:{id:string;sid:string}[]=[];process.env.AGENTDESK_CHANNEL_SEND_ENABLED='true';
 await processMessagingOutbox(async(link,row)=>{const id=link.provider==='sms'?`SM${(++sequence).toString(16).padStart(32,'0')}`:`slack:test:${++sequence}`;if(link.provider==='sms')deliveries.push({id:row.id,sid:id});return {id,status:link.provider==='sms'?'queued':'accepted',segments:'0'};});process.env.AGENTDESK_CHANNEL_SEND_ENABLED='false';
 check(deliveries.length===1,'Only the linked employee SMS reply is dispatched through a mock transport');
 const delivery=deliveries[0];check((await sms({AccountSid:account,MessageSid:delivery.sid,From:number,To:personal,MessageStatus:'delivered',NumSegments:'2'},`/api/webhooks/twilio/status?delivery=${delivery.id}`)).ok,'Signed delivery callback accepted');state=await (await api('messaging')).json() as MessagingState;check(state.activity.some(item=>item.id===delivery.id&&item.status==='delivered'),'Actual callback status exposed');
 check((await sms({AccountSid:account,MessageSid:`SM${'2'.repeat(32)}`,From:personal,To:number,Body:'STOP',NumSegments:'1'})).ok,'STOP accepted');state=await (await api('messaging')).json() as MessagingState;check(state.links.some(link=>link.provider==='sms'&&link.optedOut&&!link.reminders),'STOP persists consent state');
 await stop();await start();state=await (await api('messaging')).json() as MessagingState;check(state.links.length===2&&!!state.conversationId,'Connections and thread survive server restart');
 console.info(`${checks} messaging HTTP checks passed. Provider delivery was mocked; no external messages or AI calls were made.`);
}finally{await stop();closeDb();rmSync(directory,{recursive:true,force:true});}
