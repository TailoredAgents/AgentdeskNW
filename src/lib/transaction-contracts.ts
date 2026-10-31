import type {Investor,Property} from './contracts';
import type {CommunicationDocumentOption,CommunicationDocumentReference,CommunicationAttachment} from './communications-contracts';
export const transactionPartyRoles=['buyer','attorney','acquisition','lender'] as const;
export type TransactionPartyRole=typeof transactionPartyRoles[number];
export const transactionPartyLabels:Record<TransactionPartyRole,string>={buyer:'Buyer contact',attorney:'Closing attorney',acquisition:'Acquisition agent',lender:'Lender contact'};
export const transactionMilestones=['agreement','deposit','title_opened','title_cleared','signed','funded','closed'] as const;
export type TransactionMilestone=typeof transactionMilestones[number];
export const transactionMilestoneLabels:Record<TransactionMilestone,string>={agreement:'Purchase agreement signed',deposit:'Earnest money received',title_opened:'Title opened',title_cleared:'Title cleared',signed:'Closing documents signed',funded:'Funds disbursed',closed:'Closing completed'};
export interface TransactionParty {name:string;email:string;source:string}
export interface TransactionReport {date:string;source:string;note:string;document:CommunicationDocumentReference|null}
export interface TransactionIssue {description:string;source:string;dueDate:string|null;resolved:boolean}
export interface TransactionInput {
 propertyId:string;investorId:string;closingDate:string|null;financing:'unknown'|'cash'|'hard_money'|'other';
 parties:Record<TransactionPartyRole,TransactionParty|null>;
 milestones:Record<TransactionMilestone,TransactionReport|null>;
 issues:TransactionIssue[];
}
export interface TransactionRecord {id:string;version:number;input:TransactionInput;updatedAt:string;createdAt:string;reportedBy:string}
export interface TransactionSummary {id:string;version:number;property:string;investor:string;closingDate:string|null;openIssues:number;reportedMilestones:number;updatedAt:string}
export interface TransactionPreparation {reference:string;ready:boolean;gaps:string[];cautions:string[];to:TransactionParty|null;cc:TransactionParty[];subject:string;body:string;files:CommunicationAttachment[];notice:string}
export interface TransactionDetail {record:TransactionRecord;property:Property;investor:Investor;history:TransactionRecord[];preparation:TransactionPreparation;canEdit:boolean;notice:string}
export interface TransactionBoard {items:TransactionSummary[];properties:Property[];investors:Investor[];documents:CommunicationDocumentOption[];canEdit:boolean;notice:string}
export interface SaveTransaction {id:string|null;expectedVersion:number;input:TransactionInput;eventKey:string}
export function emptyTransaction():TransactionInput{return {propertyId:'',investorId:'',closingDate:null,financing:'unknown',parties:{buyer:null,attorney:null,acquisition:null,lender:null},milestones:{agreement:null,deposit:null,title_opened:null,title_cleared:null,signed:null,funded:null,closed:null},issues:[]};}
