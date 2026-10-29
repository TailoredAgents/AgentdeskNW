import { spawn } from 'node:child_process';
import { existsSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

if(process.env.SMOKE_BASE_URL){
 const child=spawn(process.execPath,['--import','tsx','scripts/smoke.ts'],{stdio:'inherit',env:process.env});
 process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
}else{
 if(!existsSync('.next/BUILD_ID'))throw new Error('Build the application first with npm run build. The smoke suite uses a disposable local database and the built app.');
 const port=await new Promise((resolve,reject)=>{const listener=createServer();listener.once('error',reject);listener.listen(0,'127.0.0.1',()=>{const address=listener.address();listener.close(()=>resolve(address.port));});});
 const directory=mkdtempSync(join(tmpdir(),'agentdesk-smoke-'));
 const env={...process.env,AGENTDESK_DB_PATH:join(directory,'smoke.sqlite'),AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'',SMOKE_BASE_URL:`http://127.0.0.1:${port}`};
 const children=[spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:['ignore','ignore','inherit'],env}),spawn(process.execPath,['--import','tsx','scripts/worker.ts'],{stdio:['ignore','ignore','inherit'],env})];
 try{
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(`${env.SMOKE_BASE_URL}/api/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  if(!ready)throw new Error('The isolated smoke server did not become ready.');
  const test=spawn(process.execPath,['--import','tsx','scripts/smoke.ts'],{stdio:'inherit',env});
  process.exitCode=await new Promise(resolve=>test.on('exit',code=>resolve(code??1)));
 }finally{
  await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null){resolve();return;}child.once('exit',resolve);child.kill('SIGTERM');})));
  rmSync(directory,{recursive:true,force:true});
 }
}
