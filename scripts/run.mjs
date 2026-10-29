import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const mode=process.argv[2]==='start'?'start':'dev';
const children=[
  spawn(process.execPath,['node_modules/next/dist/bin/next',mode,'--hostname','127.0.0.1'],{stdio:'inherit',env:process.env}),
  spawn(process.execPath,['--import','tsx','scripts/worker.ts'],{stdio:'inherit',env:process.env}),
];
let stopping=false;
function shutdown(code=0){if(stopping)return;stopping=true;children.forEach(child=>child.kill('SIGTERM'));process.exitCode=code;}
children.forEach(child=>{child.on('error',error=>{console.error(error.message);shutdown(1);});child.on('exit',code=>shutdown(code??0));});
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
