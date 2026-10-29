import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
const port=await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const dir=mkdtempSync(join(tmpdir(),'agentdesk-hosted-smoke-'));
const base=`http://127.0.0.1:${port}`,origin=`https://127.0.0.1:${port}`;
const code='0427'; // Fictional fixture also checks preservation of a leading zero.
const env={...process.env,NODE_ENV:'production',PORT:String(port),AGENTDESK_DB_PATH:join(dir,'demo.sqlite'),AGENTDESK_DEMO:'true',AGENTDESK_HOSTED_DEMO:'true',AGENTDESK_APP_ORIGIN:origin,AGENTDESK_SESSION_SECRET:randomBytes(32).toString('hex'),AGENTDESK_DEMO_ACCESS_CODE:code,AGENTDESK_PREPARE_DEMO:'true',OPENAI_API_KEY:'',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_RESEARCH_PROVIDER:'synthetic-fixtures-v1'};
let child,cookie='',checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function start(){
 child=spawn(process.execPath,['scripts/run.mjs','render'],{stdio:['ignore','ignore','inherit'],env});
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('Hosted startup failed.');
  try{if((await fetch(`${base}/api/health`)).ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw new Error('Hosted app did not become ready.');
}
async function stop(){if(!child||child.exitCode!==null)return;const running=child;await new Promise(resolve=>{running.once('exit',resolve);running.kill('SIGTERM');});}
async function call(path,body,headers={}){return fetch(`${base}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{origin,'x-agentdesk-request':'1','content-type':'application/json',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
try{
 await start();
 check((await fetch(base)).status===200,'Public invitation shell loads');
 check((await call('bootstrap')).status===401,'No automatic hosted session');
 check((await call('session',{role:'manager'})).status===401,'Role switch requires invitation');
 check((await call('chat',{message:'Hello'})).status===401,'AI requires invitation');
 check((await call('access',{code:'wrong'})).status===401,'Wrong invitation is rejected');
 check((await call('access',{code},{origin:'https://untrusted.example'})).status===403,'Foreign origin is rejected');
 check((await call('access',{code},{'x-agentdesk-request':''})).status===403,'Mutation verification is required');
 const login=await call('access',{code});check(login.ok,'Invitation accepted');
 const setCookie=login.headers.get('set-cookie');check(/HttpOnly/i.test(setCookie)&&/Secure/i.test(setCookie)&&/SameSite=strict/i.test(setCookie),'Secure cookie attributes');cookie=setCookie.split(';')[0];
 const bootstrap=await (await call('bootstrap')).json();check(bootstrap.actor.id==='user-alex'&&bootstrap.investors.length===3,'Fictional workspace loaded');
 const billing=await (await call('billing')).json();check(billing.access.find(a=>a.id==='investor-hunter')?.allowed&&billing.trial?.active,'Explicit presentation trial active');
 const endsAt=billing.trial.endsAt;
 const task=await call('tasks',{title:'Hosted restart verification'});check(task.ok,'Task saved');
 await stop();await start();
 const after=await (await call('bootstrap')).json();check(after.tasks.some(t=>t.title==='Hosted restart verification'),'Work survives restart on the same disk');
 const later=await (await call('billing')).json();check(later.trial.endsAt===endsAt,'Restart does not renew the trial');
 const rejectedHost=await new Promise((resolve,reject)=>{const req=httpRequest(`${base}/api/bootstrap`,{headers:{host:'untrusted.example',cookie}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
 check(rejectedHost===403,`Unexpected hostname rejected (received ${rejectedHost})`);
 console.log(`${checks} hosted-demo checks passed, including process restart and data persistence. HTTP proxy simulation only; public HTTPS and Render infrastructure still require deployment verification.`);
}finally{await stop();rmSync(dir,{recursive:true,force:true});}
