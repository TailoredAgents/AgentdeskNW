import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import type {TransactionTeamItem} from '../lib/transaction-team-contracts';
import {transactionMilestoneLabels} from '../lib/transaction-contracts';
import {AppError} from './db';
import {requireFeature} from './billing';
import {getTransactionTeams,getTransactionTeam} from './transaction-team';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function transactionTeamContextReference(actor:Actor){return `board@${hash(getTransactionTeams(actor).items.map(item=>item.reference).sort())}`;}
export function teamContextReferenceCurrent(actor:Actor,reference:string){try{return reference===(reference.startsWith('board@')?transactionTeamContextReference(actor):getTransactionTeam(actor,reference.split('@')[0]).reference);}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}}
const excerpt=(value:string)=>value.length>300?`${value.slice(0,300)}… [excerpt; open shared work for full wording]`:value;
function modelItem(item:TransactionTeamItem){const {privateTransactionId,...shared}=item;void privateTransactionId;return {...shared,tasks:item.tasks.map(task=>({...task,instruction:excerpt(task.instruction),change:task.change?{...task.change,note:excerpt(task.change.note)}:null,cancellation:task.cancellation?{...task.cancellation,note:excerpt(task.cancellation.note)}:null,report:task.report?{...task.report,note:excerpt(task.report.note),source:excerpt(task.report.source)}:null,resolution:task.resolution?{...task.resolution,note:excerpt(task.resolution.note)}:null}))};}
function boardItem(item:TransactionTeamItem){const {tasks,...shared}=modelItem(item);return {...shared,followupCount:tasks.length};}
function teamSummary(item:TransactionTeamItem){return item.snapshot?`${item.snapshot.address} · owner ${item.owner.name} · closing target ${item.snapshot.closingDate??'not recorded'} · ${item.attention.open} open, ${item.attention.overdue} overdue, ${item.attention.blocked} blocked, ${item.attention.review} awaiting review. ${excerpt(item.snapshot.summary)}`:teamTransactionMessage(item);}
export function teamTransactionMessage(item:TransactionTeamItem){
 if(item.status!=='current')return `${item.status==='withdrawn'?'Sharing withdrawn':'Shared source changed'} · owner ${item.owner.name}. Earlier summary and follow-ups are withheld. The owner can review a current summary in Transactions. No deal outcome was inferred.`;
 const name=(id:string)=>[item.owner,...item.members].find(p=>p.id===id)?.name??'Unavailable teammate';
 return [`${item.snapshot!.address} · shared coordination version ${item.version} · owner ${item.owner.name}`,`Closing target: ${item.snapshot!.closingDate??'not recorded'}.`,item.snapshot!.summary,...Object.entries(item.snapshot!.milestones).map(([key,date])=>`${transactionMilestoneLabels[key as keyof typeof transactionMilestoneLabels]}: employee reported ${date}.`),...modelItem(item).tasks.map(task=>`${name(task.assignedTo)} · ${task.instruction} · due ${task.dueDate} · ${task.state}.${task.change?` Owner change: ${task.change.note}.`:''}${task.cancellation?` Canceled: ${task.cancellation.note}.`:''}${task.report?` Employee report: ${task.report.kind}; ${task.report.note} Source: ${task.report.source}.`:''}${task.resolution?` Owner review: ${task.resolution.note}.`:''}`),`${item.attention.open} open; ${item.attention.overdue} overdue; ${item.attention.blocked} blocked; ${item.attention.review} awaiting owner review.`,item.notice].join('\n');
}
export function teamTransactionReviewResult(actor:Actor,teamId:string):ToolResult {
 const item=getTransactionTeam(actor,teamId),transactionTeamAccessReference=item.reference;
 return {specialistIds:['transaction-coordinator'],data:{teamId,transactionTeamAccessReference,coordination:modelItem(item)},message:teamTransactionMessage(item),artifacts:[{type:'transaction_team',id:item.id,title:item.snapshot?`Review team work: ${item.snapshot.address}`:'Review shared coordination',data:{transactionTeamAccessReference}}]};
}
export function teamTransactionBoardResult(actor:Actor):ToolResult {
 const board=getTransactionTeams(actor),items=board.items.slice(0,12),transactionTeamAccessReference=transactionTeamContextReference(actor);
 return {specialistIds:['transaction-coordinator'],data:{items:items.map(boardItem),transactionTeamAccessReference,total:board.items.length},message:items.length?`${board.items.length} shared transaction${board.items.length===1?'':'s'} available to you.\n${items.map(teamSummary).join('\n\n')}\nOpen team work to acknowledge or report a follow-up; this lookup changes nothing.`:'No transaction summaries have been explicitly shared with you. Managers do not inherit private transactions. Owners can review and share a summary in Transactions.',artifacts:items.length?items.map(item=>({type:'transaction_team',id:item.id,title:item.snapshot?`Review team work: ${item.snapshot.address}`:'Review shared coordination',data:{transactionTeamAccessReference}})):[{type:'transaction_team',title:'Open team coordination',data:{transactionTeamAccessReference}}]};
}
export const teamTransactionToolSchema=z.object({teamId:z.string().min(1).max(150).nullable()}).strict();
export function dispatchTeamTransactionTool(actor:Actor,raw:unknown){requireFeature(actor,'transaction-coordinator');const {teamId}=teamTransactionToolSchema.parse(raw);return teamId?teamTransactionReviewResult(actor,teamId):teamTransactionBoardResult(actor);}
export function localTeamTransactionReply(actor:Actor,message:string):ToolResult|null {
 if(!/\b(?:team|shared)\s+(?:transactions?|deals?|coordination|closings?)\b|\btransaction (?:team|coordination)\b|\btransaction_team_[\w-]+\b/i.test(message))return null;
 requireFeature(actor,'transaction-coordinator');
 // Requests to change shared work must not be presented as completed by a lookup.
 if(/\b(?:assign|share|publish|withdraw|acknowledge|resolve|complete|cancel|reassign|report)\b/i.test(message)&&! /\b(?:show|review|check|what|which|list|status)\b/i.test(message))return {specialistIds:['transaction-coordinator'],message:'Open Team coordination to review this shared change. I can retrieve current summaries and follow-ups here; no assignment, report or sharing decision was changed.',artifacts:[{type:'transaction_team',title:'Open team coordination'}]};
 const explicit=[...new Set(message.match(/\btransaction_team_[\w-]+\b/g)??[])];
 if(explicit.length===1)return dispatchTeamTransactionTool(actor,{teamId:explicit[0]});
 const items=getTransactionTeams(actor).items.filter(item=>item.snapshot&&message.toLowerCase().includes(item.snapshot.address.toLowerCase()));
 return dispatchTeamTransactionTool(actor,{teamId:explicit.length===0&&items.length===1?items[0].id:null});
}
