import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
import {getDb,closeDb} from '../src/server/db';

describe('concurrent disk database initialization',()=>{
 it('adds connection preparation to a version 50 database without changing existing records',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-v51-upgrade-'));
  try{
   vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'upgrade.sqlite'));const db=getDb();
   // Recreate the previous schema boundary only in this disposable fixture database.
   db.exec('DROP TABLE connection_sync_batches; DROP TABLE connection_sync_records; DROP TABLE capability_connections; DROP TABLE company_identity_bindings; DROP TABLE worker_health; DELETE FROM schema_migrations WHERE version=51');
   const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_migrations' ORDER BY name").all() as {name:string}[]).map(row=>row.name);
   const before=Object.fromEntries(tables.map(name=>[name,JSON.stringify(db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all())]));
   closeDb();const upgraded=getDb();
   for(const name of tables)expect(JSON.stringify(upgraded.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()),name).toBe(before[name]);
   expect(upgraded.prepare('SELECT COUNT(*) n FROM schema_migrations').get()).toEqual({n:51});
   expect(upgraded.pragma('integrity_check')).toEqual([{integrity_check:'ok'}]);expect(upgraded.pragma('foreign_key_check')).toEqual([]);
  }finally{closeDb();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
 });
 it('can reopen the original path after a replacement connection fails',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-startup-failure-'));
  try{vi.stubEnv('AGENTDESK_DB_PATH',':memory:');getDb();vi.stubEnv('AGENTDESK_DB_PATH',directory);expect(()=>getDb()).toThrow();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');expect(getDb().prepare('SELECT COUNT(*) n FROM schema_migrations').get()).toEqual({n:51});}
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
    for(const result of results){expect(result.code,result.stderr).toBe(0);expect(JSON.parse(result.stdout)).toEqual({migrations:51,organizations:2,privateFixture:1,integrity:[{integrity_check:'ok'}],foreignKeys:[]});}
   }
  }finally{rmSync(directory,{recursive:true,force:true});}
 },30000);
});
