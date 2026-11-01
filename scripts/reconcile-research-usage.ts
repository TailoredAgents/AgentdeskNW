import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actorForMember} from '../src/server/services';
import {reconcileStoppedResearchUsage} from '../src/server/research-reconciliation';
import {closeDb,getDb} from '../src/server/db';
import {requireCurrentOfflineDatabase} from './offline-db';

// Operator-only offline maintenance. No network access, receipt inference or automatic retry.
// The provider evidence must first be independently matched to the saved request hash.
const args=process.argv.slice(2),flags=new Map<string,string>();let apply=false;
for(let i=0;i<args.length;i++){
 if(args[i]==='--apply'){if(apply)throw new Error('Duplicate --apply');apply=true;continue;}
 if(!['--organization','--office','--user','--job','--operation','--evidence'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||flags.has(args[i]))throw new Error('Use --organization, --office, --user, --job, --operation, --evidence and optional --apply.');
 flags.set(args[i],args[++i]);
}
if(flags.size!==6||!process.env.AGENTDESK_DB_PATH)throw new Error('Explicit AGENTDESK_DB_PATH and all six identity/evidence arguments are required. Default is a rollback-only preview.');
const file=readFileSync(resolve(flags.get('--evidence')!),'utf8');if(Buffer.byteLength(file)>2_000_000)throw new Error('Evidence file is too large.');
requireCurrentOfflineDatabase();const evidence=JSON.parse(file),db=getDb({initialize:false});
try{
 db.exec('BEGIN IMMEDIATE');const actor=actorForMember(flags.get('--organization')!,flags.get('--office')!,flags.get('--user')!);
 const result=reconcileStoppedResearchUsage(actor,flags.get('--job')!,flags.get('--operation')!,evidence);
 const summary={applied:apply,status:result.status,spentCents:result.budget.spentCents,heldCents:result.budget.reservedCents,executionResumed:false};
 db.exec(apply?'COMMIT':'ROLLBACK');console.log(JSON.stringify(summary));
}catch(error){if(db.inTransaction)db.exec('ROLLBACK');console.error(error instanceof Error?error.message:'Reconciliation failed; no changes applied.');process.exitCode=1;}
finally{closeDb();}
