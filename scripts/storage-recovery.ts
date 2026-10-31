import {createStorageBackup,restoreStorageBackup,verifyStorageBackup} from '../src/server/storage-recovery';
// Deliberately does not load .env.local or initialize/migrate/seed an application database.
const [operation,source,destination,...extra]=process.argv.slice(2);
try{
 if(extra.length||!source||!['backup','verify','restore'].includes(operation))throw new Error('Usage: storage-recovery.ts backup <absolute-existing-db> <new-directory> | verify <backup-directory> | restore <backup-directory> <new-offline-directory>');
 if(operation==='verify'){if(destination)throw new Error('Verify takes one directory.');const result=await verifyStorageBackup(source);console.log(JSON.stringify({verified:true,migrations:result.migrations.length,createdAt:result.createdAt}));}
 else{if(!destination)throw new Error('A new destination directory is required.');const result=operation==='backup'?await createStorageBackup(source,destination):await restoreStorageBackup(source,destination);console.log(JSON.stringify('format' in result?{verified:true,migrations:result.migrations.length,createdAt:result.createdAt}:result));}
}catch(error){console.error(error instanceof Error?error.message:'Storage recovery failed.');process.exitCode=1;}
