import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Actor, Investor, NoteSummary, ProposedAction } from '../lib/contracts';
import { AppError, assertActor } from './db';
import { getInvestor, listInvestors, proposeNote } from './services';

/** CRM business operations have a provider-independent shape. Writes are always proposals. */
export interface CrmAdapter {
 id:string;
 mode:'demo'|'live';
 searchInvestors(actor:Actor,query?:string):Promise<Investor[]>;
 getInvestor(actor:Actor,id:string):Promise<Investor>;
 proposeNote(actor:Actor,id:string,summary:NoteSummary):Promise<ProposedAction>;
}
export class DemoCrmAdapter implements CrmAdapter {
 id='local-demo-crm';mode='demo' as const;
 async searchInvestors(actor:Actor,query='') {
  const needle=z.string().max(200).parse(query).toLowerCase();
  return listInvestors(actor).filter(investor=>`${investor.name} ${investor.company} ${investor.counties.join(' ')}`.toLowerCase().includes(needle));
 }
 async getInvestor(actor:Actor,id:string){return getInvestor(actor,id);}
 async proposeNote(actor:Actor,id:string,summary:NoteSummary){return proposeNote(actor,id,summary);}
}

const identifier=z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/,'Use administrator-verified Salesforce object and field API names.');
export const salesforceMappingSchema=z.object({
 investorObject:identifier,
 id:identifier,
 displayName:identifier,
 company:identifier.optional(),
 email:identifier.optional(),
 phone:identifier.optional(),
 owner:identifier,
}).strict();
export type SalesforceMapping=z.infer<typeof salesforceMappingSchema>;
export interface SalesforceConnection {
 organizationId:string;officeId:string;userId:string;
 instanceUrl:string;
 /** Supply a fresh token from a server-side encrypted store; never from browser input. */
 getAccessToken:()=>Promise<string>;
 apiVersion:string;
 mapping:SalesforceMapping;
 salesforceUserId:string;
}
function approvedSalesforceOrigin(input:string):string {
 const url=new URL(input);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!/^([a-z0-9-]+\.)+(salesforce\.com|force\.com)$/i.test(url.hostname))throw new AppError(422,'Use an administrator-verified HTTPS Salesforce instance URL.');
 return url.origin;
}
/** The live read boundary is deliberately not selected by the application until sandbox authorization is verified. */
export class SalesforceReadAdapter {
 readonly id='salesforce-oauth-read-boundary';readonly mode='live';
 private mapping:SalesforceMapping;
 private origin:string;
 constructor(private connection:SalesforceConnection){
  this.mapping=salesforceMappingSchema.parse(connection.mapping);
  this.origin=approvedSalesforceOrigin(connection.instanceUrl);
  z.string().regex(/^v\d{2,3}\.0$/).parse(connection.apiVersion);
  z.string().regex(/^[A-Za-z0-9]{15,18}$/).parse(connection.salesforceUserId);
 }
 async readAssignedInvestorRecords(actor:Actor):Promise<{records:Record<string,unknown>[];done:boolean}> {
  assertActor(actor);
  const connection=this.connection;
  if(actor.organizationId!==connection.organizationId||actor.officeId!==connection.officeId||actor.id!==connection.userId)throw new AppError(403,'This Salesforce connection belongs to another employee or office.');
  const fields=[...new Set(Object.values(this.mapping).filter((value):value is string=>!!value&&value!==this.mapping.investorObject))];
  const query=`SELECT ${fields.join(',')} FROM ${this.mapping.investorObject} WHERE ${this.mapping.owner} = '${connection.salesforceUserId}' LIMIT 100`;
  const token=await connection.getAccessToken();
  if(!token)throw new AppError(503,'Salesforce authorization is missing.');
  const response=await fetch(`${this.origin}/services/data/${connection.apiVersion}/query?q=${encodeURIComponent(query)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw new AppError(response.status===401?401:502,response.status===401?'Salesforce authorization expired. Reconnect after administrator approval.':'The authorized Salesforce read failed; no records were changed.');
  return z.object({records:z.array(z.record(z.string(),z.unknown())).max(100),done:z.boolean()}).parse(await response.json());
 }
}

/** Persist verifier/state encrypted and bind to the authenticated initiating session before redirecting. */
export function prepareSalesforceOAuth(input:{clientId:string;redirectUri:string;sandbox:boolean}) {
 const clientId=z.string().min(1).max(500).parse(input.clientId);
 const redirect=new URL(input.redirectUri);
 if(redirect.protocol!=='https:'&&!(redirect.protocol==='http:'&&['127.0.0.1','localhost'].includes(redirect.hostname)))throw new AppError(422,'OAuth callbacks require HTTPS or a loopback development address.');
 const verifier=randomBytes(48).toString('base64url');
 const state=randomBytes(32).toString('base64url');
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 const url=new URL('/services/oauth2/authorize',input.sandbox?'https://test.salesforce.com':'https://login.salesforce.com');
 url.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirect.toString(),scope:'api refresh_token',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
 return {authorizationUrl:url.toString(),state,verifier,expiresAt:new Date(Date.now()+10*60000).toISOString()};
}
