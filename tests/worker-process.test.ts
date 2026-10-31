import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,it,vi} from 'vitest';
import {getDb,closeDb} from '../src/server/db';
import {workerHealth} from '../src/server/worker-health';
it('records every real worker lane and drains cleanly on process termination',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'agentdesk-worker-process-')),database=join(directory,'worker.sqlite');
 vi.stubEnv('AGENTDESK_DB_PATH',database);closeDb();getDb();
 const child=spawn(process.execPath,['--import','tsx','scripts/worker.ts'],{env:{...process.env,AGENTDESK_DB_PATH:database,OPENAI_API_KEY:'',AGENTDESK_CHANNELS_ENABLED:'false',AGENTDESK_CHANNEL_SEND_ENABLED:'false',AGENTDESK_MOBILE_PUSH_SEND_ENABLED:'false',AGENTDESK_RESEARCH_PROVIDER:'synthetic-fixtures-v1'},stdio:['ignore','ignore','pipe']});
 let errors='';child.stderr.on('data',chunk=>errors+=chunk);const exited=new Promise<number|null>(resolve=>child.once('exit',resolve));
 try{
  const deadline=Date.now()+12000;while(workerHealth().some(lane=>!lane.lastSuccessAt)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  expect(workerHealth().every(lane=>lane.lastSuccessAt),errors).toBe(true);
  child.kill('SIGTERM');expect(await exited).toBe(0);
  const states=getDb().prepare('SELECT state FROM worker_health').all() as {state:string}[];expect(states).toHaveLength(4);expect(states.every(row=>row.state==='stopped')).toBe(true);expect(errors).toBe('');
 }finally{if(child.exitCode===null)child.kill('SIGKILL');await exited;closeDb();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
},20000);
