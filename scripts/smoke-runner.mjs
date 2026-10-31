import { spawn } from 'node:child_process';
import { existsSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
const suite=process.argv[2]||'workflows';
if(!['workflows','intelligence','conversation','wallet','inbox','communications','company-email','relationship','work','mobile','mobile-inbox','mobile-followthrough','handoffs','work-questions','opportunities','analysis','auto-topup'].includes(suite))throw new Error('Unknown smoke suite.');
const script=suite==='auto-topup'?'scripts/auto-topup-smoke.ts':suite==='analysis'?'scripts/analysis-smoke.ts':suite==='opportunities'?'scripts/opportunities-smoke.ts':suite==='work-questions'?'scripts/work-questions-smoke.ts':suite==='handoffs'?'scripts/handoffs-smoke.ts':suite==='mobile-followthrough'?'scripts/mobile-followthrough-smoke.ts':suite==='mobile-inbox'?'scripts/mobile-inbox-smoke.ts':suite==='mobile'?'scripts/mobile-smoke.ts':suite==='work'?'scripts/work-smoke.ts':suite==='relationship'?'scripts/relationship-smoke.ts':suite==='company-email'?'scripts/company-email-smoke.ts':suite==='communications'?'scripts/communications-workflow-smoke.ts':suite==='inbox'?'scripts/inbox-smoke.ts':suite==='wallet'?'scripts/wallet-smoke.ts':suite==='conversation'?'scripts/conversation-smoke.ts':suite==='intelligence'?'scripts/intelligence-smoke.ts':'scripts/smoke.ts';

if(process.env.SMOKE_BASE_URL){
 if(['work','mobile','mobile-inbox','mobile-followthrough','handoffs','work-questions','opportunities','analysis','auto-topup'].includes(suite))throw new Error('The work suite requires its own disposable database. Run without SMOKE_BASE_URL.');
 const child=spawn(process.execPath,['--import','tsx',script],{stdio:'inherit',env:process.env});
 process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
}else{
 if(!existsSync('.next/BUILD_ID'))throw new Error('Build the application first with npm run build. The smoke suite uses a disposable local database and the built app.');
 const port=await new Promise((resolve,reject)=>{const listener=createServer();listener.once('error',reject);listener.listen(0,'127.0.0.1',()=>{const address=listener.address();listener.close(()=>resolve(address.port));});});
 const directory=mkdtempSync(join(tmpdir(),'agentdesk-smoke-'));
 const env={...process.env,AGENTDESK_DB_PATH:join(directory,'smoke.sqlite'),AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_WORK_SMOKE_ISOLATED:suite==='work'?'true':'false',AGENTDESK_MOBILE_SMOKE_ISOLATED:suite.startsWith('mobile')||(suite==='handoffs'||suite==='work-questions'||suite==='opportunities'||suite==='analysis'||suite==='auto-topup')?'true':'false',AGENTDESK_MOBILE_PUSH_SEND_ENABLED:'false',SMOKE_BASE_URL:`http://127.0.0.1:${port}`};
 // The work suite advances bounded worker steps itself to inspect exact partial/paused states.
 const children=[spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:['ignore','ignore','inherit'],env}),...(['work','mobile','mobile-inbox','mobile-followthrough','handoffs','work-questions','opportunities','analysis','auto-topup'].includes(suite)?[]:[spawn(process.execPath,['--import','tsx','scripts/worker.ts'],{stdio:['ignore','ignore','inherit'],env})])];
 try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(`${env.SMOKE_BASE_URL}/api/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  if(!ready)throw new Error('The isolated smoke server did not become ready.');
  const test=spawn(process.execPath,['--import','tsx',script],{stdio:'inherit',env});
  process.exitCode=await new Promise(resolve=>test.on('exit',code=>resolve(code??1)));
 }finally{
  await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null){resolve();return;}child.once('exit',resolve);child.kill('SIGTERM');})));
  rmSync(directory,{recursive:true,force:true});
 }
}
