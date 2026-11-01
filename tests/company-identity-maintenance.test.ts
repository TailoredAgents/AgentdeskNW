import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {getDb,closeDb} from '../src/server/db';

describe('trusted offline membership command',()=>{
 it('previews without writes, applies explicitly and never initializes or upgrades a selected file',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-identity-maintenance-')),path=join(directory,'fixture.sqlite'),file=join(directory,'membership.json');
  const input={organizationId:'org-demo',officeId:'office-atlanta',userId:'user-alex',issuer:'https://fixture.example',subject:'operator-fixture',action:'bind'};
  const run=(apply=false,database=path)=>spawnSync(process.execPath,['--import','tsx',resolve('scripts/manage-company-identity.ts'),'--file',file,...(apply?['--apply']:[])],{encoding:'utf8',env:{...process.env,AGENTDESK_DB_PATH:database,AGENTDESK_AUTH_MODE:'demo',OPENAI_API_KEY:''}});
  try{
   vi.stubEnv('AGENTDESK_DB_PATH',path);const db=getDb();writeFileSync(file,JSON.stringify(input));
   const before=JSON.stringify(db.prepare('SELECT * FROM audit_logs ORDER BY rowid').all());
   const preview=run();expect(preview.status,preview.stderr).toBe(0);expect(JSON.parse(preview.stdout)).toMatchObject({applied:false,networkUsed:false});
   expect(db.prepare('SELECT COUNT(*) n FROM company_identity_bindings').get()).toEqual({n:0});expect(JSON.stringify(db.prepare('SELECT * FROM audit_logs ORDER BY rowid').all())).toBe(before);
   const apply=run(true);expect(apply.status,apply.stderr).toBe(0);expect(db.prepare('SELECT version,revoked_at FROM company_identity_bindings').get()).toEqual({version:1,revoked_at:null});
   writeFileSync(file,JSON.stringify({...input,action:'revoke'}));expect(run().status).toBe(0);expect(db.prepare('SELECT revoked_at FROM company_identity_bindings').get()).toEqual({revoked_at:null});
   expect(run(true).status).toBe(0);expect(db.prepare('SELECT version FROM company_identity_bindings').get()).toEqual({version:2});
   const missing=join(directory,'missing.sqlite');expect(run(false,missing).status).not.toBe(0);expect(existsSync(missing)).toBe(false);
   db.prepare('DELETE FROM schema_migrations WHERE version=54').run();expect(run().status).not.toBe(0);expect(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get()).toEqual({n:53});
  }finally{closeDb();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});}
 },30000);
});
