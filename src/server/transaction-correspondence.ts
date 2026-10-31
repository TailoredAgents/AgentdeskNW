import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError,getDb,newId} from './db';
import {requireFeature} from './billing';
import {getTransaction} from './transactions';
import {composeCommunication,getInboxState,getInboxThread} from './communications';
export const prepareTransactionEmailSchema=z.object({accountId:z.string().min(1).max(150),reference:z.string().min(1).max(240),eventKey:z.string().min(1).max(150)}).strict();
export function transactionEmailAccounts(actor:Actor,id:string){
 getTransaction(actor,id);requireFeature(actor,'core');
 return getInboxState(actor).accounts.filter(a=>a.channel==='email'&&a.access==='available'&&a.capabilities.localDraft&&a.capabilities.localTextAttachments);
}
/** Saving preparation is a private draft, never approval or a reported transaction outcome. */
export function prepareTransactionEmail(actor:Actor,id:string,input:z.infer<typeof prepareTransactionEmailSchema>){
 const parsed=prepareTransactionEmailSchema.parse(input),scope=[actor.organizationId,actor.officeId,actor.id];
 return getDb().transaction(()=>{
  const detail=getTransaction(actor,id);requireFeature(actor,'core');
  const hash=createHash('sha256').update(JSON.stringify({id,...parsed})).digest('hex');
  const prior=getDb().prepare('SELECT payload_hash,thread_id FROM transaction_correspondence_events WHERE organization_id=? AND office_id=? AND owner_id=? AND event_key=?').get(...scope,parsed.eventKey) as {payload_hash:string;thread_id:string}|undefined;
  if(prior){if(prior.payload_hash!==hash)throw new AppError(409,'This request key belongs to a different title preparation.');return getInboxThread(actor,prior.thread_id);}
  const existing=getDb().prepare('SELECT thread_id FROM transaction_correspondence WHERE organization_id=? AND office_id=? AND owner_id=? AND transaction_id=? AND account_id=? AND reference=?').get(...scope,id,parsed.accountId,parsed.reference) as {thread_id:string}|undefined;
  let threadId=existing?.thread_id;
  if(!threadId){
   const prep=detail.preparation;
   if(prep.reference!==parsed.reference||!prep.ready||!prep.to)throw new AppError(409,'Transaction preparation changed or is incomplete. Reopen the transaction and review its current requirements.');
   if(!transactionEmailAccounts(actor,id).some(a=>a.id===parsed.accountId))throw new AppError(403,'Choose an available email account in your private workspace.');
   const result=composeCommunication(actor,{accountId:parsed.accountId,eventKey:newId('title_compose'),to:{name:prep.to.name,address:prep.to.email},cc:prep.cc.map(p=>({name:p.name,address:p.email})),subject:prep.subject,body:prep.body,documents:prep.files.map(f=>f.document!)},{transactionId:id,reference:prep.reference,version:detail.record.version});
   threadId=result.thread.id;
   getDb().prepare('INSERT INTO transaction_correspondence VALUES(?,?,?,?,?,?,?)').run(...scope,id,parsed.accountId,parsed.reference,threadId);
  }
  const result=getInboxThread(actor,threadId);
  getDb().prepare('INSERT INTO transaction_correspondence_events VALUES(?,?,?,?,?,?)').run(...scope,parsed.eventKey,hash,threadId);
  return result;
 }).immediate();
}
