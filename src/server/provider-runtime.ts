import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import { AppError,assertActor,getDb,now } from './db';
import { requireFeature } from './billing';

export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
import type { ProviderOperation } from '../lib/provider-contracts';
export type { ProviderOperation } from '../lib/provider-contracts';
const startSchema=z.object({operationId:z.string().min(1).max(240),provider:z.string().min(1).max(80),feature:z.string().min(1).max(100),kind:z.string().min(1).max(100),model:z.string().max(150).optional(),requestHash:z.string().max(128).optional(),maxEstimatedCostCents:z.number().finite().nonnegative().optional()}).strict();
const receiptSchema=z.object({operationId:z.string().min(1).max(240),providerResponseId:z.string().min(1).max(240).optional(),status:z.enum(['succeeded','failed','unknown','canceled']),usage:z.record(z.string().max(100),z.number().finite().nonnegative()),actualCostCents:z.number().finite().nonnegative().nullable().optional(),estimatedCostCents:z.number().finite().nonnegative().nullable().optional(),errorCode:z.string().max(150).optional()}).strict();
function read(actor:Actor,id:string):ProviderOperation|undefined{const row=getDb().prepare('SELECT data FROM provider_operations WHERE organization_id=? AND office_id=? AND user_id=? AND operation_id=?').get(actor.organizationId,actor.officeId,actor.id,id) as {data:string}|undefined;return row?JSON.parse(row.data):undefined;}
function write(actor:Actor,value:ProviderOperation){getDb().prepare('INSERT INTO provider_operations VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,office_id,user_id,operation_id) DO UPDATE SET provider_response_id=excluded.provider_response_id,data=excluded.data').run(actor.organizationId,actor.officeId,actor.id,value.operationId,value.providerResponseId??null,JSON.stringify(value));return value;}
export function beginProviderOperation(actor:Actor,input:z.input<typeof startSchema>):ProviderOperation{
 const parsed=startSchema.parse(input);requireFeature(actor,parsed.feature);
 return getDb().transaction(()=>{const prior=read(actor,parsed.operationId);if(prior){for(const key of Object.keys(parsed) as (keyof typeof parsed)[])if(prior[key]!==parsed[key])throw new AppError(409,'Provider operation conflicts with its original request.');return prior;}
 return write(actor,{...parsed,status:'started',usage:{},actualCostCents:null,estimatedCostCents:null,createdAt:now(),updatedAt:now()});}).immediate();
}
export function recordProviderUsage(actor:Actor,input:z.input<typeof receiptSchema>):ProviderOperation{
 assertActor(actor);const parsed=receiptSchema.parse(input);
 return getDb().transaction(()=>{const prior=read(actor,parsed.operationId);if(!prior)throw new AppError(404,'Provider operation not found.');
 const value={...prior,...parsed,actualCostCents:parsed.actualCostCents??prior.actualCostCents,estimatedCostCents:parsed.estimatedCostCents??prior.estimatedCostCents,updatedAt:now()};
 if(prior.status!=='started'&&prior.status!=='unknown'){
  const stable=(v:ProviderOperation)=>({status:v.status,usage:v.usage,providerResponseId:v.providerResponseId,actualCostCents:v.actualCostCents,estimatedCostCents:v.estimatedCostCents,errorCode:v.errorCode});
  if(fingerprint(stable(prior))!==fingerprint(stable(value)))throw new AppError(409,'Provider receipt conflicts with its recorded result.');return prior;
 }
 if(parsed.providerResponseId){const other=getDb().prepare('SELECT operation_id FROM provider_operations WHERE organization_id=? AND office_id=? AND user_id=? AND provider_response_id=? AND operation_id!=?').get(actor.organizationId,actor.officeId,actor.id,parsed.providerResponseId,parsed.operationId);if(other)throw new AppError(409,'Provider response already belongs to another operation.');}
 return write(actor,value);}).immediate();
}
export function providerOperations(actor:Actor):ProviderOperation[]{assertActor(actor);return (getDb().prepare('SELECT data FROM provider_operations WHERE organization_id=? AND office_id=? AND user_id=? ORDER BY rowid DESC LIMIT 100').all(actor.organizationId,actor.officeId,actor.id) as {data:string}[]).map(r=>JSON.parse(r.data));}
// Receipt-only child records inherit an already authorized parent. This never grants tool execution.
export function recordProviderChildUsage(actor:Actor,input:Omit<z.input<typeof receiptSchema>,'operationId'> & {parentOperationId:string;operationId:string;kind:string;model?:string}){
 assertActor(actor);return getDb().transaction(()=>{
 const {parentOperationId,kind,model,...receipt}=input;const parent=read(actor,parentOperationId);
 if(!parent)throw new AppError(404,'Authorized parent provider operation not found.');
 const parsed=startSchema.parse({operationId:receipt.operationId,provider:parent.provider,feature:parent.feature,kind,model,requestHash:fingerprint({parentOperationId})});
 const prior=read(actor,receipt.operationId);if(prior&&prior.requestHash!==parsed.requestHash)throw new AppError(409,'Provider child belongs to another operation.');
 if(!prior)write(actor,{...parsed,status:'started',usage:{},actualCostCents:null,estimatedCostCents:null,createdAt:now(),updatedAt:now()});
 return recordProviderUsage(actor,receipt);
 }).immediate();
}
