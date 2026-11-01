import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
import {actorForMember} from '../src/server/services';
import {bindCompanyIdentity,revokeCompanyIdentity,refreshCompanyIdentityBinding} from '../src/server/company-identity';
import {getDb,closeDb} from '../src/server/db';
import {requireCurrentOfflineDatabase} from './offline-db';

// Trusted offline operator boundary. Preview rolls back by default; no network calls.
const args=process.argv.slice(2),apply=args.includes('--apply'),fileIndex=args.indexOf('--file');
if(!process.env.AGENTDESK_DB_PATH||fileIndex!==0||!args[1]||args.length!==(apply?3:2)||apply&&args[2]!=='--apply')throw new Error('Set AGENTDESK_DB_PATH and use --file reviewed-membership.json [--apply].');
const raw=readFileSync(resolve(args[1]),'utf8');if(Buffer.byteLength(raw)>10000)throw new Error('Membership input is too large.');
const input=z.object({organizationId:z.string().min(1),officeId:z.string().min(1),userId:z.string().min(1),issuer:z.string().url(),subject:z.string().min(1),action:z.enum(['bind','revoke','refresh']),expectedVersion:z.number().int().positive().optional()}).strict().parse(JSON.parse(raw));
requireCurrentOfflineDatabase();const db=getDb({initialize:false});
try{
 db.exec('BEGIN IMMEDIATE');const actor=actorForMember(input.organizationId,input.officeId,input.userId),identity={issuer:input.issuer,subject:input.subject};
 if(input.action==='bind')bindCompanyIdentity(actor,identity);
 else if(input.action==='revoke')revokeCompanyIdentity(actor,identity);
 else {if(input.expectedVersion===undefined)throw new Error('Reprovisioning requires the reviewed expectedVersion.');refreshCompanyIdentityBinding(actor,{...identity,expectedVersion:input.expectedVersion});}
 db.exec(apply?'COMMIT':'ROLLBACK');console.log(JSON.stringify({applied:apply,action:input.action,networkUsed:false}));
}catch(error){if(db.inTransaction)db.exec('ROLLBACK');console.error(error instanceof Error?error.message:'Membership update failed.');process.exitCode=1;}finally{closeDb();}
