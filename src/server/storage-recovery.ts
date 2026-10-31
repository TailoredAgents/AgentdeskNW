import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {createReadStream,chmodSync,existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,writeFileSync,copyFileSync,constants,rmSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {z} from 'zod';

const manifestSchema=z.object({format:z.literal('agentdesk-sqlite-backup-v1'),createdAt:z.string().datetime(),sha256:z.string().regex(/^[a-f0-9]{64}$/),migrations:z.array(z.number().int().positive()),tableCounts:z.record(z.string(),z.number().int().nonnegative())}).strict();
function file(path:string){if(!isAbsolute(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())throw new Error('Use an existing absolute regular file path.');return realpathSync(path);}
async function sha(path:string){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
function inspect(path:string){
 const db=new Database(file(path),{readonly:true,fileMustExist:true});
 try{
  if(JSON.stringify(db.pragma('integrity_check'))!==JSON.stringify([{integrity_check:'ok'}])||(db.pragma('foreign_key_check') as unknown[]).length)throw new Error('Database integrity verification failed.');
  const migrations=(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {version:number}[]).map(row=>row.version);
  if(!migrations.length||migrations.some((value,index)=>value!==index+1))throw new Error('Database migration history is incomplete.');
  const tables=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[]).map(row=>row.name);
  const tableCounts=Object.fromEntries(tables.map(name=>[name,(db.prepare(`SELECT COUNT(*) n FROM "${name.replaceAll('"','""')}"`).get() as {n:number}).n]));
  return {migrations,tableCounts};
 }finally{db.close();}
}
/** SQLite online backup includes committed WAL data. Never copies a running database file directly. */
export async function createStorageBackup(sourcePath:string,newDirectory:string){
 const source=file(sourcePath);if(!isAbsolute(newDirectory))throw new Error('Use an absolute new backup directory.');
 mkdirSync(newDirectory,{mode:0o700});const target=join(newDirectory,'database.sqlite');
 const db=new Database(source,{readonly:true,fileMustExist:true});
 try{
  await db.backup(target);chmodSync(target,0o600);
  const info=inspect(target),manifest=manifestSchema.parse({format:'agentdesk-sqlite-backup-v1',createdAt:new Date().toISOString(),sha256:await sha(target),...info});
  writeFileSync(join(newDirectory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return manifest;
 }catch(error){rmSync(newDirectory,{recursive:true,force:true});throw error;}finally{db.close();}
}
export async function verifyStorageBackup(directory:string){
 const path=join(directory,'database.sqlite'),manifest=manifestSchema.parse(JSON.parse(readFileSync(file(join(directory,'manifest.json')),'utf8')));
 if(await sha(file(path))!==manifest.sha256)throw new Error('Backup checksum does not match its manifest.');
 const info=inspect(path);if(JSON.stringify(info.migrations)!==JSON.stringify(manifest.migrations)||JSON.stringify(info.tableCounts)!==JSON.stringify(manifest.tableCounts))throw new Error('Backup contents do not match the manifest.');
 return manifest;
}
/** Restore into a NEW offline directory only; never overwrite an active application database. */
export async function restoreStorageBackup(directory:string,newDirectory:string){
 const manifest=await verifyStorageBackup(directory);if(!isAbsolute(newDirectory)||existsSync(newDirectory)||resolve(directory)===resolve(newDirectory))throw new Error('Restore requires a new absolute offline directory.');
 mkdirSync(newDirectory,{mode:0o700});const target=join(newDirectory,'database.sqlite');
 try{copyFileSync(join(directory,'database.sqlite'),target,constants.COPYFILE_EXCL);chmodSync(target,0o600);
  if(await sha(target)!==manifest.sha256)throw new Error('Restored checksum does not match.');inspect(target);
  writeFileSync(join(newDirectory,'RESTORE_REVIEW_REQUIRED.txt'),'Offline recovery copy. Keep external providers, messaging and payments disabled. Reconcile uncertain operations before selecting this database for a service. No service configuration was changed.\n',{mode:0o600,flag:'wx'});
  return {database:target,migrations:manifest.migrations.length,serviceChanged:false as const};
 }catch(error){rmSync(newDirectory,{recursive:true,force:true});throw error;}
}
