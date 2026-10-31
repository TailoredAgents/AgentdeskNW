import type {Actor} from '../lib/contracts';
import type {CommunicationDraft,InboxThread} from '../lib/communications-contracts';
import {getTransaction} from './transactions';
export function transactionThreadContext(actor:Actor,thread:Pick<InboxThread,'transactionId'>):string|null {
 return thread.transactionId?getTransaction(actor,thread.transactionId).preparation.reference:null;
}
export function visibleTransactionDraft(actor:Actor,draft:CommunicationDraft|null):CommunicationDraft|null {
 if(!draft?.transactionSource)return draft;
 const current=getTransaction(actor,draft.transactionSource.transactionId).preparation.reference===draft.transactionSource.reference;
 const projected={...draft,transactionSource:{...draft.transactionSource,current}};
 return current||draft.deliveryStatus==='simulated_sent'?projected:{...projected,subject:'Transaction preparation changed',body:'This unsent preparation is out of date. Open Transactions and prepare the current version.',cc:[],documents:[],documentFiles:[]};
}
