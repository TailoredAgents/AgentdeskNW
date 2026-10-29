import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const render=process.argv[2]==='render';
const mode=render||process.argv[2]==='start'?'start':'dev';
if(render&&process.env.AGENTDESK_HOSTED_DEMO!=='true')throw new Error('Render startup requires explicit hosted demonstration mode.');
// Migrations and optional fixtures run on the mounted disk, before web and worker start.
if(render||process.env.AGENTDESK_PREPARE_DEMO==='true'){
 const init=spawn(process.execPath,['--import','tsx',render?'scripts/initialize-render.ts':'scripts/prepare-demo.ts'],{stdio:'inherit',env:process.env});
 const code=await new Promise(resolve=>{init.once('error',()=>resolve(1));init.once('exit',code=>resolve(code??1));});
 if(code!==0)process.exit(code);
}
const children=[
 spawn(process.execPath,['node_modules/next/dist/bin/next',mode,'--hostname',render?'0.0.0.0':'127.0.0.1','--port',process.env.PORT||'3000'],{stdio:'inherit',env:process.env}),
 spawn(process.execPath,['--import','tsx','scripts/worker.ts'],{stdio:'inherit',env:process.env}),
];
let stopping=false;
function shutdown(code=0){if(stopping)return;stopping=true;children.forEach(child=>child.kill('SIGTERM'));process.exitCode=code;const timer=setTimeout(()=>children.forEach(child=>{if(child.exitCode===null)child.kill('SIGKILL');}),8000);timer.unref();}
children.forEach(child=>{child.on('error',()=>{console.error('An application process could not start.');shutdown(1);});child.on('exit',code=>shutdown(code??1));});
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
