import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import {AppError,getDb} from './db';
import {requireFeature} from './billing';
import {getTransactions,getTransaction} from './transactions';
import {transactionEmailAccounts} from './transaction-correspondence';
import {transactionSearchResult,transactionReviewResult} from './transaction-context';
import {prepareTitleResult} from './transaction-results';
import {getConversation} from './services';
import {fingerprint} from './provider-runtime';
const id=z.string().min(1).max(150);
export const transactionToolSchemas={
 transaction_search:z.object({query:z.string().max(200),limit:z.number().int().min(1).max(12)}).strict(),
 transaction_review:z.object({transactionId:id}).strict(),
 prepare_title_email:z.object({transactionId:id,accountId:id,transactionAccessReference:z.string().min(1).max(240)}).strict(),
};
export const transactionToolDescriptions={
 transaction_search:'Find this employee’s private saved transactions by property, investor or ID. Employee reports are unverified. No shared-office mailbox access, new record, verified milestone or sending. Select an exact current record before preparing title work.',
 transaction_review:'Read one current private transaction: reported milestones and sources, parties, financing, closing target, unresolved issues, missing information, current preparation reference and owned email account options. File metadata only, no file text. Reports never establish signatures, payment, title clearance or inventory reservation.',
 prepare_title_email:'Save or reopen current title preparation as a private Inbox draft only when the actual employee explicitly asks to prepare/draft a title email for this exact transaction. Use the current reference and the employee’s selected owned account, or primary company account by default. Server validates employee intent/target/account and exact sources. Missing data requires clarification. Cannot approve, send, alter milestones or choose a fallback mailbox. Employee reviews exact text, recipients and files separately in Inbox.',
};
export interface TransactionCommand {conversationId:string;requestId:string;message:string;receivedAt?:string}
const normalized=(value:string)=>value.toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function requestsTitleDraft(message:string){
 const text=message.trim();
 return /^(?:(?:please|can you|could you|would you)\s+)?(?:prepare|draft|compose|write|save|open)\s+(?:(?:an?|the|my|this|that)\s+)?(?:title\b|(?:email|message|draft|package)\b[^.!?\n]{0,50}\btitle\b)/i.test(text)&&!/\b(?:do not|don't|never|without|not yet)\b/i.test(text);
}
function focusedTransaction(actor:Actor,command:TransactionCommand){
 const conversation=getConversation(actor,command.conversationId),message=[...conversation.messages].reverse().find(m=>m.role==='assistant');if(!message)return null;
 if(command.receivedAt){const receipt=getDb().prepare("SELECT 1 FROM messaging_outbox o JOIN messaging_links l ON l.id=o.link_id WHERE o.reference_id=? AND o.kind='reply' AND o.status IN ('accepted','delivered') AND o.updated_at<=? AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND l.active=1 AND l.opted_out=0").get(message.id,command.receivedAt,actor.organizationId,actor.officeId,actor.id);if(!receipt)return null;}
 const ids=[...new Set(message.artifacts.filter(a=>a.type==='transaction'&&a.id).map(a=>a.id!))];return ids.length===1?ids[0]:null;
}
export function resolveTransactionRequest(actor:Actor,message:string,command?:TransactionCommand){
 const items=getTransactions(actor).items,explicit=message.match(/\btransaction_[\w-]+\b/g);if(explicit){const ids=[...new Set(explicit)],matches=ids.map(id=>items.find(item=>item.id===id));return matches.some(item=>!item)?[]:matches.filter(item=>item!==undefined);}
 const text=` ${normalized(message)} `,matches=items.filter(item=>text.includes(` ${normalized(item.property)} `)||text.includes(` ${normalized(item.investor)} `));if(matches.length)return matches;
 if(command&&/\b(?:this|that|it|same|selected)\b/i.test(message)){const id=focusedTransaction(actor,command);return items.filter(item=>item.id===id);}
 return [];
}
export function resolveTitleCommand(actor:Actor,command:TransactionCommand){
 if(!requestsTitleDraft(command.message))throw new AppError(422,'Ask explicitly to prepare a title email for a named transaction. Quoted statements do not authorize a draft.');
 const matches=resolveTransactionRequest(actor,command.message,command);if(matches.length!==1)throw new AppError(422,'Choose one transaction by its property address or transaction ID before preparing title email.');
 const transaction=matches[0],accounts=transactionEmailAccounts(actor,transaction.id),text=command.message.toLowerCase();
 const explicit=accounts.filter(a=>text.includes(a.id.toLowerCase())||text.includes(a.address.toLowerCase()));
 const providers=([['gmail',/\bgmail\b/],['outlook',/\boutlook\b/],['salesforce',/\b(?:company|salesforce)\b/]] as const).filter(([,pattern])=>pattern.test(text)).map(([provider])=>provider);
 const sender=text.match(/\bfrom\s+([^\s,;]+@[^\s,;]+)/)?.[1].replace(/[.!?]+$/,'');
 const accountIds=text.match(/\binbox_account_[\w-]+\b/g)??[];
 if(providers.length>1||sender&&!accounts.some(a=>a.address.toLowerCase()===sender)||accountIds.some(id=>!accounts.some(a=>a.id.toLowerCase()===id)))throw new AppError(422,'Choose one available owned email account for this title draft. No mailbox fallback was selected.');
 const provider=providers[0]??null;
 const candidates=explicit.length?explicit:provider?accounts.filter(a=>a.provider===provider):accounts.filter(a=>a.primary);
 const primary=candidates.filter(a=>a.primary),selected=candidates.length===1?candidates[0]:primary.length===1?primary[0]:null;
 if(!selected||provider&&selected.provider!==provider||new Set(explicit.map(a=>a.address.toLowerCase())).size>1)throw new AppError(422,'Choose one available owned email account for this title draft. No mailbox fallback was selected.');
 return {transactionId:transaction.id,accountId:selected.id};
}
export function dispatchTransactionTool(actor:Actor,name:string,raw:unknown,command?:TransactionCommand):ToolResult {
 requireFeature(actor,'transaction-coordinator');
 if(name==='transaction_search'){const input=transactionToolSchemas.transaction_search.parse(raw);return transactionSearchResult(actor,input.query,input.limit);}
 if(name==='transaction_review'){const {transactionId}=transactionToolSchemas.transaction_review.parse(raw),result=transactionReviewResult(actor,transactionId);result.data={...(result.data as object),emailAccounts:transactionEmailAccounts(actor,transactionId).map(a=>({id:a.id,label:a.label,address:a.address,primary:a.primary,provider:a.provider,simulateSend:a.capabilities.simulateSend}))};return result;}
 const input=transactionToolSchemas.prepare_title_email.parse(raw);
 if(!command)throw new AppError(422,'Title preparation must be attached to the current employee request.');
 const selected=resolveTitleCommand(actor,command);
 if(selected.transactionId!==input.transactionId||selected.accountId!==input.accountId)throw new AppError(422,'The proposed transaction or email account does not match the employee request.');
 return prepareTitleResult(actor,input,`title-chat:${fingerprint({conversationId:command.conversationId,requestId:command.requestId,...selected})}`);
}
export function localTransactionReply(actor:Actor,message:string,command:TransactionCommand):ToolResult|null {
 if(/\binbox_thread_[\w-]+\b/.test(message))return null;
 if(!requestsTitleDraft(message)&&!/\b(?:transactions?|closings|title[- ]opening|open title|title (?:status|clearance|work)|closing (?:date|target|status)|(?:missing|needed)[^.?!]*\btitle)\b/i.test(message))return null;
 requireFeature(actor,'transaction-coordinator');
 const broad=/^(?:(?:please|can you|could you)\s+)?(?:show|list|find|review|check)(?: me)? (?:my |the )?(?:transactions|closings|transaction work)[?.!]?$/i.test(message.trim());
 if(broad)return dispatchTransactionTool(actor,'transaction_search',{query:'',limit:12});
 if(requestsTitleDraft(message)){
  const target=resolveTitleCommand(actor,command),detail=getTransaction(actor,target.transactionId);
  if(!detail.preparation.ready)return dispatchTransactionTool(actor,'transaction_review',{transactionId:target.transactionId});
  return dispatchTransactionTool(actor,'prepare_title_email',{...target,transactionAccessReference:detail.preparation.reference},command);
 }
 const matches=resolveTransactionRequest(actor,message,command);
 if(matches.length===1)return dispatchTransactionTool(actor,'transaction_review',{transactionId:matches[0].id});
 if(/\b(?:prepare|draft|compose|write|send|open|review|show|missing|status|closing|milestones)\b/i.test(message))return {...transactionSearchResult(actor,'',12),message:'Choose the transaction by its property address or ID so I can use the right reports. Title requests can prepare a private draft; review delivery separately in Inbox. Nothing was sent or reported as completed.'};
 return null;
}
