import type {InvestorJourney} from './journey-contracts';

export type CommunicationChannel='email'|'sms';
export type CommunicationProvider='gmail'|'outlook'|'twilio';
export type InboxFilter='all'|'email'|'sms'|'needs_reply'|'drafts';
export type InboxStatus='needs_reply'|'waiting'|'done';
export interface CommunicationParty {name:string;address:string}
export interface CommunicationAccount {id:string;provider:CommunicationProvider;channel:CommunicationChannel;label:string;address:string;status:'demo';synthetic:true}
export interface CommunicationAttachment {id:string;name:string;mimeType:string;sizeBytes:number;availability:'metadata_only'}
export interface CommunicationMessage {id:string;threadId:string;accountId:string;direction:'inbound'|'outbound';from:CommunicationParty;to:CommunicationParty[];subject:string;body:string;receivedAt:string;sourceRef:string;sourceLabel:string;deliveryStatus:'demo_received'|'demo_history';attachments:CommunicationAttachment[];synthetic:true}
export interface InvestorMatch {id:string;name:string;company:string;reason:string}
export interface InvestorAssociation {status:'linked'|'needs_review'|'unmatched'|'unavailable';investor:InvestorMatch|null;candidates:InvestorMatch[];method:'exact_contact'|'employee_review'|null;notice:string}
export interface InboxThread {id:string;accountId:string;channel:CommunicationChannel;subject:string;correspondent:CommunicationParty;status:InboxStatus;unread:boolean;version:number;updatedAt:string;lastMessageAt:string;preview:string;messageCount:number;hasDraft:boolean;association:InvestorAssociation;synthetic:true}
export interface CommunicationDraft {id:string;threadId:string;accountId:string;from:CommunicationParty;to:CommunicationParty;subject:string;body:string;status:'draft'|'discarded';createdAt:string;updatedAt:string;version:number;deliveryStatus:'not_sent';synthetic:true}
export type InboxScenarioId='mike-repair-followup'|'sarah-rental-followup'|'david-text-followup'|'unknown-buyer';
export interface InboxScenario {id:InboxScenarioId;name:string;description:string;channel:CommunicationChannel;available:boolean}
export interface InboxState {accounts:CommunicationAccount[];threads:InboxThread[];counts:Record<InboxFilter,number>;unreadCount:number;filter:InboxFilter;accountId:string|null;query:string;scenarios:InboxScenario[];canEdit:boolean;accessReason:string;mode:'demonstration';liveDelivery:false;notice:string}
export interface InboxThreadDetail {thread:InboxThread;account:CommunicationAccount;messages:CommunicationMessage[];draft:CommunicationDraft|null;draftHistory:CommunicationDraft[];investorContext:InvestorJourney|null;contextNotice:string;availableInvestors:InvestorMatch[];canEdit:boolean;accessReason:string;liveDelivery:false}
export interface InboxMutation {expectedVersion:number;eventKey:string}
export interface SaveCommunicationDraft extends InboxMutation {body:string;subject?:string}
export interface UpdateCommunicationThread extends InboxMutation {status?:InboxStatus;unread?:boolean}
export interface LinkCommunicationInvestor extends InboxMutation {investorId:string|null}
export interface ReceiveDemoCommunication {scenarioId:InboxScenarioId;eventKey:string}
