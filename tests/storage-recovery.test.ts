import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync,appendFileSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {closeDb,getDb} from '../src/server/db';
import {createStorageBackup,restoreStorageBackup,verifyStorageBackup} from '../src/server/storage-recovery';
let dir:string,path:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'agentdesk-recovery-'));path=join(dir,'source.sqlite');vi.stubEnv('AGENTDESK_DB_PATH',path);closeDb();getDb();});
afterEach(()=>{closeDb();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
describe('verified offline storage recovery',()=>{
 it('backs up committed WAL contents and restores every row to a new offline directory',async()=>{const db=getDb();db.prepare("INSERT INTO users VALUES('backup-sentinel','Fictional backup sentinel')").run();const backup=join(dir,'backup'),restore=join(dir,'restore');const manifest=await createStorageBackup(path,backup);expect(manifest.migrations.at(-1)).toBe(54);expect(await verifyStorageBackup(backup)).toEqual(manifest);const result=await restoreStorageBackup(backup,restore);expect(result.serviceChanged).toBe(false);const restored=new Database(result.database,{readonly:true});try{expect(restored.prepare("SELECT name FROM users WHERE id='backup-sentinel'").get()).toEqual({name:'Fictional backup sentinel'});expect(restored.prepare('SELECT COUNT(*) n FROM schema_migrations').get()).toEqual({n:54});}finally{restored.close();}expect(statSync(result.database).mode&0o777).toBe(0o600);expect(readFileSync(join(restore,'RESTORE_REVIEW_REQUIRED.txt'),'utf8')).toContain('Keep external providers');expect(db.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({n:manifest.tableCounts.users});});
 it('rejects overwritten destinations and never changes the active source',async()=>{const backup=join(dir,'backup');await createStorageBackup(path,backup);const before=getDb().prepare('SELECT COUNT(*) n FROM users').get();await expect(createStorageBackup(path,backup)).rejects.toThrow();await expect(restoreStorageBackup(backup,dir)).rejects.toThrow('new absolute');expect(getDb().prepare('SELECT COUNT(*) n FROM users').get()).toEqual(before);});
 it('rejects corrupt backup bytes before restoration',async()=>{const backup=join(dir,'backup');await createStorageBackup(path,backup);appendFileSync(join(backup,'database.sqlite'),'changed');await expect(verifyStorageBackup(backup)).rejects.toThrow('checksum');await expect(restoreStorageBackup(backup,join(dir,'restore'))).rejects.toThrow('checksum');});
 it('refuses missing or non-database sources without creating an application database',async()=>{await expect(createStorageBackup(join(dir,'missing.sqlite'),join(dir,'backup'))).rejects.toThrow();});
});
