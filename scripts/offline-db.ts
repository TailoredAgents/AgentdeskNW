import Database from 'better-sqlite3';
import {isAbsolute} from 'node:path';

/** Maintenance previews must never create, seed or migrate a database implicitly. */
export function requireCurrentOfflineDatabase(){
 const path=process.env.AGENTDESK_DB_PATH;
 if(!path||!isAbsolute(path))throw new Error('Select an existing database using an absolute AGENTDESK_DB_PATH.');
 const db=new Database(path,{readonly:true,fileMustExist:true});
 try{
  const rows=db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {version:number}[];
  if(rows.length!==54||rows.some((row,index)=>row.version!==index+1))throw new Error('Upgrade a verified database copy through schema 054 before running this maintenance command.');
 }finally{db.close();}
}
