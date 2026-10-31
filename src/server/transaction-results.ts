import type {Actor,ToolResult} from '../lib/contracts';
import {prepareTransactionEmail} from './transaction-correspondence';
import {inboxAccessReference} from './communications-context';
import {getTransaction} from './transactions';
export function prepareTitleResult(actor:Actor,input:{transactionId:string;accountId:string;transactionAccessReference:string},eventKey:string):ToolResult {
 const detail=prepareTransactionEmail(actor,input.transactionId,{accountId:input.accountId,reference:input.transactionAccessReference,eventKey});
 const transactionAccessReference=getTransaction(actor,input.transactionId).preparation.reference;
 return {specialistIds:['transaction-coordinator'],message:detail.draft?.transactionSource?.current===false?'The earlier title draft is now out of date. Review the current transaction before preparing it again.':detail.draft?`Your private title draft is saved in ${detail.account.label}. Review its exact text, recipients and files in Inbox. Existing edits are preserved. Nothing was sent and no title milestone changed.`:'This preparation already has an Inbox record. Its earlier draft was consumed or discarded; it was not recreated. Review the existing conversation. No title milestone changed.',data:{transactionId:input.transactionId,transactionAccessReference,threadId:detail.thread.id,hasDraft:!!detail.draft,liveDelivery:false},artifacts:[{type:'inbox',id:detail.thread.id,title:'Review title email in Inbox',data:{inboxAccessReference:inboxAccessReference(actor,detail.thread.id),transactionAccessReference}},{type:'transaction',id:input.transactionId,title:'Review transaction reports',data:{transactionAccessReference}}]};
}
