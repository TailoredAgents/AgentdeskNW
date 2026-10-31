import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
import {getDb,closeDb} from '../src/server/db';

describe('concurrent disk database initialization',()=>{
 it('can reopen the original path after a replacement connection fails',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-startup-failure-'));
  try{vi.stubEnv('AGENTDESK_DB_PATH',':memory:');getDb();vi.stubEnv('AGENTDESK_DB_PATH',directory);expect(()=>getDb()).toThrow();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');expect(getDb().prepare('SELECT COUNT(*) n FROM schema_migrations').get()).toEqual({n:37});}
  finally{closeDb();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
 });
 it('serializes fresh migrations and seeding across app and worker processes',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-startup-test-'));
  const script=`import {getDb,closeDb} from ${JSON.stringify(resolve('src/server/db.ts'))};
   const db=getDb();console.log(JSON.stringify({migrations:db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n,
   organizations:db.prepare('SELECT COUNT(*) n FROM organizations').get().n,
   privateFixture:db.prepare("SELECT COUNT(*) n FROM investors WHERE id='investor-jordan-private'").get().n,
   integrity:db.pragma('integrity_check'),foreignKeys:db.pragma('foreign_key_check')}));closeDb();`;
  try{
   for(let round=0;round<3;round++){
    const results=await Promise.all(Array.from({length:6},()=>new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
     const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:{...process.env,AGENTDESK_DB_PATH:join(directory,`${round}.sqlite`),OPENAI_API_KEY:''}});
     let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));
    })));
    for(const result of results){expect(result.code,result.stderr).toBe(0);expect(JSON.parse(result.stdout)).toEqual({migrations:37,organizations:2,privateFixture:1,integrity:[{integrity_check:'ok'}],foreignKeys:[]});}
   }
  }finally{rmSync(directory,{recursive:true,force:true});}
 },30000);
});
