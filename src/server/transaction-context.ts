import {createHash} from 'node:crypto';
import type {Actor,ToolResult} from '../lib/contracts';
import {transactionMilestones,transactionMilestoneLabels} from '../lib/transaction-contracts';
import {AppError} from './db';
import {getTransactions,getTransaction} from './transactions';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function transactionContextReference(actor:Actor){
 const items=getTransactions(actor).items;
 return `board@${hash(items.map(item=>getTransaction(actor,item.id).preparation.reference))}`;
}
export function transactionReferenceCurrent(actor:Actor,reference:string){
 try{const id=reference.split('@')[0];return reference===(id==='board'?transactionContextReference(actor):getTransaction(actor,id).preparation.reference);}
 catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}
}
/** Current reports are unverified data. Do not supply file contents or private revision history to the model. */
export function transactionReviewResult(actor:Actor,id:string):ToolResult {
 const detail=getTransaction(actor,id),{record,preparation,property,investor}=detail;
 const transactionAccessReference=preparation.reference;
 const data={transactionId:id,transactionAccessReference,propertyId:property.id,investorId:investor.id,version:record.version,review:detail.review,address:property.address,investor:investor.name,reports:record.input,
  preparation:{...preparation,files:preparation.files.map(({textContent,...metadata})=>{void textContent;return metadata;})},notice:detail.notice};
 const reports=transactionMilestones.map(key=>{const report=record.input.milestones[key];return report?`${transactionMilestoneLabels[key]}: employee reported ${report.date}; source: ${report.source}. ${report.note}`:`${transactionMilestoneLabels[key]}: not reported.`;});
 return {specialistIds:['transaction-coordinator'],data,message:[`${property.address} · ${investor.name} · transaction version ${record.version}`,`Proposed closing: ${record.input.closingDate??'not recorded'}. Financing: ${record.input.financing.replaceAll('_',' ')}.`,...(detail.review?[`Next action: ${detail.review.nextAction}`,...detail.review.inconsistencies]:[]),...reports,...record.input.issues.map(issue=>`${issue.resolved?'Reported resolved':'Open issue'}: ${issue.description} (source: ${issue.source}${issue.dueDate?`; follow-up ${issue.dueDate}`:''}).`),preparation.ready?'Current title preparation is ready to save as a private Inbox draft. Nothing has been sent.':`Before title preparation: ${preparation.gaps.join(' ')}`,...preparation.cautions,detail.notice].join('\n'),artifacts:[{type:'transaction',id,title:`Review ${property.address}`,data:{transactionAccessReference}}]};
}
export function transactionSearchResult(actor:Actor,query:string,limit=12):ToolResult {
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean),items=getTransactions(actor).items.filter(item=>words.every(word=>`${item.property} ${item.investor} ${item.id}`.toLowerCase().includes(word))).slice(0,limit),transactionAccessReference=transactionContextReference(actor);
 return {specialistIds:['transaction-coordinator'],data:{items,transactionAccessReference},message:items.length?`Your private transaction records:\n${items.map(item=>`${item.property} · ${item.investor} · closing target ${item.closingDate??'missing'} · ${item.openIssues} open issue(s) · ${item.id}`).join('\n')}\nMilestones are employee reports. Choose a transaction for its missing information and next steps.`:'No matching private transactions are saved. Open Transactions to add a sourced record; no deal or outcome was invented.',artifacts:items.length?items.map(item=>({type:'transaction',id:item.id,title:`Review ${item.property}`,data:{transactionAccessReference}})):[{type:'transaction',title:'Open Transactions',data:{transactionAccessReference}}]};
}
