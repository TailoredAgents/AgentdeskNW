import type {Role} from './contracts';
import type {TransactionMilestone} from './transaction-contracts';
export interface TransactionTeamMember {id:string;name:string;role:Role}
export interface TransactionTeamSnapshot {propertyId:string;address:string;closingDate:string|null;summary:string;milestones:Partial<Record<TransactionMilestone,string>>}
export interface TransactionTeamTask {
 id:string;generation:number;assignedTo:string;instruction:string;dueDate:string;
 state:'assigned'|'acknowledged'|'blocked'|'reported'|'resolved';acknowledgedAt:string|null;
 report:{kind:'blocked'|'completed';note:string;source:string;by:string;at:string}|null;
 resolution:{note:string;by:string;at:string}|null;
}
export interface TransactionTeamItem {
 id:string;version:number;generation:number;viewerId:string;privateTransactionId:string|null;owner:TransactionTeamMember;members:TransactionTeamMember[];
 snapshot:TransactionTeamSnapshot|null;tasks:TransactionTeamTask[];
 status:'current'|'source_changed'|'withdrawn';canManage:boolean;canAct:boolean;
 attention:{overdue:number;blocked:number;review:number;open:number};reference:string;notice:string;
}
export interface TransactionTeamBoard {items:TransactionTeamItem[];notice:string}
export interface TransactionTeamSetup {transactionId:string;expectedVersion:number;sourceReference:string;members:TransactionTeamMember[];current:TransactionTeamItem|null;preview:TransactionTeamSnapshot;canPublish:boolean}
export interface TransactionTeamPublish {transactionId:string;expectedVersion:number;sourceReference:string;memberIds:string[];summary:string;milestones:TransactionMilestone[];eventKey:string}
export interface TransactionTeamReview {request:TransactionTeamPublish;reviewHash:string;snapshot:TransactionTeamSnapshot;members:TransactionTeamMember[];notice:string}
export type TransactionTeamAction={expectedVersion:number;eventKey:string}&(
 {action:'withdraw'}|{action:'assign';assignedTo:string;instruction:string;dueDate:string}|
 {action:'acknowledge';taskId:string}|{action:'report';taskId:string;kind:'blocked'|'completed';note:string;source:string}|
 {action:'resolve';taskId:string;note:string}
);
