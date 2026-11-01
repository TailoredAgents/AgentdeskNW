import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError,getDb} from './db';
import {requirePreparedCapability,stageConnectionBatch} from './connection-preparation';
import {salesforceMappingSchema} from './crm';
import {fingerprint} from './provider-runtime';

const field=z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/);
export const sourceMappingSchema=salesforceMappingSchema.omit({phone:true}).extend({revision:field,deleted:field}).strict();
export type SourceMapping=z.infer<typeof sourceMappingSchema>;
const pageSchema=z.object({done:z.boolean(),records:z.array(z.record(z.string(),z.unknown())).max(100),nextRecordsUrl:z.string().max(300).optional()}).strict();
export interface SalesforcePageReader {readPage:(next:string|null)=>Promise<unknown>}
interface SyncInput {connectionId:string;version:number;batchId:string;previousCursor:string|null;nextCursor:string;mapping:SourceMapping}
/** Trusted transport seam. No URL, mapping, credential or receipt is accepted from a model/client.
 * This bounded demo import commits only after every page is validated; not a live downloader. */
export async function synchronizeSalesforceSource(actor:Actor,input:SyncInput,reader:SalesforcePageReader){
 const mapping=sourceMappingSchema.parse(input.mapping);
 const fields=Object.entries(mapping).filter(([name])=>name!=='investorObject').map(([,value])=>value);
 if(new Set(fields).size!==fields.length)throw new AppError(422,'Each source field must have one unambiguous mapping.');
 const source=requirePreparedCapability(actor,input.connectionId,input.version,'crm.read');
 if(source.provider!=='salesforce')throw new AppError(422,'This source is not Salesforce.');
 const sourceHash=fingerprint(source.data);
 if((JSON.parse(source.data) as {cursor:string|null}).cursor!==input.previousCursor)throw new AppError(409,'The source has advanced. Reload before refreshing.');
 const records:{externalId:string;revision:number;deleted:boolean;fields:{displayName?:string;company?:string;email?:string}}[]=[];
 const identities=new Set<string>(),continuations=new Set<string>();let next:string|null=null;
 for(let index=0;index<10;index++){
  const current=requirePreparedCapability(actor,input.connectionId,input.version,'crm.read');
  if(fingerprint(current.data)!==sourceHash)throw new AppError(409,'The source changed while refreshing. Reload its current state.');
  const page=pageSchema.parse(await reader.readPage(next));
  for(const raw of page.records){
   const externalId=z.string().min(1).max(160).parse(raw[mapping.id]);
   // Owner/field filtering is checked after transport too, never inferred from a query.
   if(raw[mapping.owner]!==source.remote_user)throw new AppError(403,'The provider returned a record outside this employee’s source scope.');
   if(identities.has(externalId))throw new AppError(409,'Duplicate source identity across pages; refresh was not saved.');identities.add(externalId);
   const revision=z.number().int().positive().safe().parse(raw[mapping.revision]),deleted=z.boolean().parse(raw[mapping.deleted]);
   const values:{displayName?:string;company?:string;email?:string}={};
   if(!deleted){
    values.displayName=z.string().trim().min(1).max(240).parse(raw[mapping.displayName]);
    if(mapping.company&&raw[mapping.company]!=null)values.company=z.string().max(240).parse(raw[mapping.company]);
    if(mapping.email&&raw[mapping.email]!=null)values.email=z.string().email().max(320).parse(raw[mapping.email]);
   }
   records.push({externalId,revision,deleted,fields:values});
   if(records.length>100)throw new AppError(422,'This rehearsal is limited to 100 records. No partial refresh was saved.');
  }
  if(page.done){
   if(page.nextRecordsUrl)throw new AppError(422,'The provider returned inconsistent pagination.');
   return getDb().transaction(()=>{
    const latest=requirePreparedCapability(actor,input.connectionId,input.version,'crm.read');
    if(fingerprint(latest.data)!==sourceHash)throw new AppError(409,'The source changed before the refresh could be saved.');
    return stageConnectionBatch(actor,input.connectionId,{expectedVersion:input.version,batchId:`${input.batchId}:${fingerprint(mapping)}`,previousCursor:input.previousCursor,nextCursor:input.nextCursor,records});
   }).immediate();
  }
  // Never follow an arbitrary provider-supplied origin, query or URL.
  if(!page.nextRecordsUrl||!/^\/services\/data\/v\d{2,3}\.0\/query\/[A-Za-z0-9-]+$/.test(page.nextRecordsUrl)||continuations.has(page.nextRecordsUrl))throw new AppError(422,'The provider returned an invalid or repeated page reference.');
  continuations.add(page.nextRecordsUrl);next=page.nextRecordsUrl;
 }
 throw new AppError(422,'The source exceeded the page limit. No partial refresh was saved.');
}
