import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {SalesforceSourceView} from '../lib/salesforce-source-contracts';
import {AppError,assertActor,getDb} from './db';
import {requireFeature} from './billing';
import {prepareCapabilityConnection,requirePreparedCapability,disconnectCapabilityConnection} from './connection-preparation';
import {listInvestors} from './services';
import {fingerprint} from './provider-runtime';
import {synchronizeSalesforceSource,type SourceMapping} from './salesforce-sync';

const tenant='agentdesk-fictional-source-v1';
const mapping:SourceMapping={investorObject:'FictionalInvestor__c',id:'Id',displayName:'Name',company:'Company__c',email:'Email__c',owner:'OwnerId',revision:'FictionalRevision__c',deleted:'IsDeleted'};
function source(actor:Actor){assertActor(actor);requireFeature(actor,'salesforce-assistant');return getDb().prepare("SELECT id,version,state,data FROM capability_connections WHERE organization_id=? AND office_id=? AND user_id=? AND provider='salesforce' AND remote_tenant=? AND remote_user=? AND mode='demo'").get(actor.organizationId,actor.officeId,actor.id,tenant,actor.id) as {id:string;version:number;state:string;data:string}|undefined;}
const snapshot=(row:{id:string;version:number;data:string})=>fingerprint({id:row.id,version:row.version,data:row.data});
export function readSalesforceSource(actor:Actor):SalesforceSourceView {
 const row=source(actor),empty={snapshot:null,stage:'empty' as const,records:[],withdrawn:0,lastSyncedAt:null};
 if(!row)return {...empty,state:'not_prepared',notice:'Preview a fictional Salesforce source. No company account, records or delivery are connected.'};
 if(row.state!=='prepared')return {...empty,state:'disconnected',notice:'This preview source is disconnected. Its saved fields are no longer available.'};
 requirePreparedCapability(actor,row.id,row.version,'crm.read');
 const cursor=(JSON.parse(row.data) as {cursor:string|null}).cursor;
 const rows=getDb().prepare('SELECT external_id,revision,deleted,data FROM connection_sync_records WHERE connection_id=? AND connection_version=? ORDER BY external_id').all(row.id,row.version) as {external_id:string;revision:number;deleted:number;data:string}[];
 const investors=listInvestors(actor),normalize=(s:string)=>s.trim().toLowerCase();
 const records=rows.filter(item=>!item.deleted).map(item=>{const value=JSON.parse(item.data) as {displayName?:string;company?:string;email?:string};const matches=investors.filter(investor=>value.email&&investor.email&&normalize(value.email)===normalize(investor.email)||value.displayName&&normalize(value.displayName)===normalize(investor.name));return {externalId:item.external_id,revision:item.revision,name:value.displayName??'Unnamed source record',company:value.company??null,email:value.email??null,match:matches.length>1?'ambiguous' as const:matches.length===1?'possible_match' as const:'unmatched' as const};});
 const latest=getDb().prepare('SELECT created_at FROM connection_sync_batches WHERE connection_id=? ORDER BY rowid DESC LIMIT 1').get(row.id) as {created_at:string}|undefined;
 return {state:'ready',snapshot:snapshot(row),stage:cursor==='fixture-changes'?'changes':cursor==='fixture-initial'?'initial':'empty',records,withdrawn:rows.filter(item=>item.deleted).length,lastSyncedAt:latest?.created_at??null,notice:'Fictional source preview. Matches are suggestions, not verified identities. Refreshing never replaces reviewed CRM facts or authorizes outreach.'};
}
/** Explicit fixed demo setup only; no caller source, capabilities, mapping or credentials. */
export function prepareSalesforceSourceDemo(actor:Actor){
 source(actor);if(process.env.AGENTDESK_DEMO!=='true'||process.env.AGENTDESK_AUTH_MODE==='company_oidc')throw new AppError(403,'Fictional source setup is available only in the demonstration workspace.');
 prepareCapabilityConnection(actor,{provider:'salesforce',remoteTenant:tenant,remoteUser:actor.id,mode:'demo',capabilities:['crm.read']});return readSalesforceSource(actor);
}
export const refreshSourceSchema=z.object({snapshot:z.string().min(1).max(100),step:z.enum(['initial','changes'])}).strict();
export async function refreshSalesforceSource(actor:Actor,raw:unknown){
 const input=refreshSourceSchema.parse(raw),row=source(actor);
 if(!row||row.state!=='prepared'||snapshot(row)!==input.snapshot)throw new AppError(409,'The source changed. Reload its current state before refreshing.');
 const previousCursor=(JSON.parse(row.data) as {cursor:string|null}).cursor;
 if(input.step==='initial'&&previousCursor!==null||input.step==='changes'&&previousCursor!=='fixture-initial')throw new AppError(409,'Reload the source and choose the next available refresh.');
 const record=(id:string,revision:number,name:string,company:string,email:string,deleted=false)=>({Id:id,Name:name,Company__c:company,Email__c:email,OwnerId:actor.id,FictionalRevision__c:revision,IsDeleted:deleted});
 const initial=[record('fictional-001',1,'Mike Bennett','Bennett Property Group','mike@example.com'),record('fictional-002',1,'Jordan Ellis','Ellis Renovations','jordan@example.com'),record('fictional-003',1,'Riley Parker','Parker Homes','riley@example.com')];
 const changes=[record('fictional-001',2,'Mike Bennett','Bennett Property Group — updated sample','mike@example.com'),record('fictional-002',2,'','','',true),record('fictional-004',1,'Morgan Lee','Lee Homes','morgan@example.com')];
 const records=input.step==='initial'?initial:changes;
 await synchronizeSalesforceSource(actor,{connectionId:row.id,version:row.version,batchId:`fixture-${input.step}`,previousCursor,nextCursor:`fixture-${input.step}`,mapping},{readPage:async next=>next?{done:true,records:records.slice(2)}:{done:false,records:records.slice(0,2),nextRecordsUrl:'/services/data/v66.0/query/fictional-page-2'}});
 return readSalesforceSource(actor);
}
export function disconnectSalesforceSource(actor:Actor,raw:unknown){
 const input=z.object({snapshot:z.string().min(1).max(100)}).strict().parse(raw),row=source(actor);
 if(!row||row.state!=='prepared'||snapshot(row)!==input.snapshot)throw new AppError(409,'The source changed. Reload its current state.');
 disconnectCapabilityConnection(actor,row.id,row.version);return readSalesforceSource(actor);
}
