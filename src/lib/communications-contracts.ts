import type {RelationshipGuidance} from './relationship-method-contracts';
import type {InvestorJourney} from './journey-contracts';
import type {JourneyObservation} from './journey-contracts';
import type {Task} from './contracts';
import type {EmployeePreferences} from './memory-contracts';

export type CommunicationChannel='email'|'sms';
export type CommunicationProvider='gmail'|'outlook'|'twilio'|'salesforce';
export type InboxFilter='all'|'email'|'sms'|'needs_reply'|'drafts';
export type InboxStatus='needs_reply'|'waiting'|'done';
export interface CommunicationParty {name:string;address:string}
export interface CommunicationCapabilities {readBody:boolean;threadHistory:boolean;attachments:false;localTextAttachments?:boolean;localDraft:boolean;simulateSend:boolean}
export interface CommunicationSource {system:'salesforce'|'mailbox'|'business_text';coverage:'mailbox'|'crm_activity'|'headers_only';label:string}
export type CommunicationTransport='demo_company_email'|'demo_mailbox'|'demo_sms'|'none';
export interface CommunicationAccount {id:string;provider:CommunicationProvider;channel:CommunicationChannel;label:string;address:string;status:'demo';synthetic:true;source:CommunicationSource;transport:CommunicationTransport;access:'available'|'revoked';accessVersion:number;primary:boolean;capabilities:CommunicationCapabilities;capabilityNotice:string}
export interface CommunicationProvenance {system:'salesforce'|'company_mailbox';reference:string;label:string;synthetic:true}
export interface CommunicationDocumentReference {documentId:string;revision:number;reference:string}
export interface CommunicationDocumentOption extends CommunicationDocumentReference {name:string;title:string;sizeBytes:number;sha256:string}
export interface CommunicationAttachment {id:string;name:string;mimeType:string;sizeBytes:number;availability:'metadata_only'|'local_text'|'unavailable';document?:CommunicationDocumentReference;sha256?:string;current?:boolean;textContent?:string}
export interface CommunicationMessage {id:string;threadId:string;accountId:string;direction:'inbound'|'outbound';from:CommunicationParty;to:CommunicationParty[];cc?:CommunicationParty[];subject:string;body:string;receivedAt:string;sourceRef:string;sourceLabel:string;deliveryStatus:'demo_received'|'demo_history'|'simulated_sent';attachments:CommunicationAttachment[];documents?:CommunicationDocumentReference[];synthetic:true;bodyAvailability?:'full'|'headers_only'|'revoked';provenance?:CommunicationProvenance[]}
export interface InvestorMatch {id:string;name:string;company:string;reason:string}
export interface InvestorAssociation {status:'linked'|'needs_review'|'unmatched'|'unavailable';investor:InvestorMatch|null;candidates:InvestorMatch[];method:'exact_contact'|'employee_review'|null;notice:string}
export interface PackageDraftSource {packageId:string;reference:string;current?:boolean}
export interface TransactionDraftSource {transactionId:string;reference:string;version:number;current?:boolean}
export interface InboxThread {packageId?:string;packageReference?:string;transactionId?:string;id:string;accountId:string;channel:CommunicationChannel;subject:string;correspondent:CommunicationParty;status:InboxStatus;unread:boolean;version:number;updatedAt:string;lastMessageAt:string;preview:string;messageCount:number;hasDraft:boolean;association:InvestorAssociation;synthetic:true}
export interface CommunicationDraft {packageSource?:PackageDraftSource;transactionSource?:TransactionDraftSource;documents?:CommunicationDocumentReference[];documentFiles?:CommunicationAttachment[];id:string;threadId:string;accountId:string;from:CommunicationParty;to:CommunicationParty;cc?:CommunicationParty[];authorship?:'employee'|'copilot';subject:string;body:string;status:'draft'|'discarded';createdAt:string;updatedAt:string;version:number;deliveryStatus:'not_sent'|'simulated_sent';synthetic:true}
export type InboxScenarioId='mike-repair-followup'|'sarah-rental-followup'|'david-text-followup'|'unknown-buyer'|'company-repair-followup'|'company-duplicate-source'|'company-revoke-access'|'company-restore-access';
export interface InboxScenario {id:InboxScenarioId;name:string;description:string;channel:CommunicationChannel;available:boolean}
export interface InboxState {documentOptions?:CommunicationDocumentOption[];accounts:CommunicationAccount[];preferredAccountId:string|null;threads:InboxThread[];counts:Record<InboxFilter,number>;unreadCount:number;filter:InboxFilter;accountId:string|null;query:string;scenarios:InboxScenario[];canEdit:boolean;accessReason:string;mode:'demonstration';liveDelivery:false;notice:string}
export interface InboxThreadDetail {documentOptions?:CommunicationDocumentOption[];bodyAccess:'full'|'headers_only'|'revoked';capabilityNotice:string;thread:InboxThread;account:CommunicationAccount;messages:CommunicationMessage[];draft:CommunicationDraft|null;draftHistory:CommunicationDraft[];investorContext:InvestorJourney|null;contextNotice:string;availableInvestors:InvestorMatch[];canEdit:boolean;accessReason:string;liveDelivery:false}
export interface InboxMutation {expectedVersion:number;eventKey:string}
export interface SaveCommunicationDraft extends InboxMutation {documents?:CommunicationDocumentReference[];body:string;subject?:string;cc?:CommunicationParty[]}
export interface ComposeCommunication {documents?:CommunicationDocumentReference[];accountId:string;to:CommunicationParty;subject?:string;body:string;cc?:CommunicationParty[];eventKey:string}
export interface UpdateCommunicationThread extends InboxMutation {status?:InboxStatus;unread?:boolean}
export interface LinkCommunicationInvestor extends InboxMutation {investorId:string|null}
export interface ReceiveDemoCommunication {scenarioId:InboxScenarioId;eventKey:string}

export interface InboxSource {id:string;kind:'message'|'relationship';label:string;excerpt:string;recordedAt:string|null;verification:string;propertyId?:string|null}
export interface InboxAssistance {
 workingMethod:RelationshipGuidance|null;
 threadId:string;threadVersion:number;summary:string;nextStep:string;sources:InboxSource[];unknowns:string[];
 suggestedReply:{subject:string;body:string;scope:'relationship_only';deliveryStatus:'not_sent';eligible:boolean;reasons:string[]};
 suggestedObservation:{messageId:string;kind:'objection'|'preference';text:string}|null;
 suggestedFollowUp:{messageId:string;title:string;dueAt:null}|null;
 preferencesUsed:EmployeePreferences&{version:number};canRecordObservation:boolean;canCreateFollowUp:boolean;
 processing:{mode:'deterministic';messageCount:number;messageLimit:12;background:false;walletChargeCents:0;notice:string};synthetic:true;
}
export interface InboxSendReview {id:string;threadId:string;threadVersion:number;draftId:string;draftVersion:number;accountId:string;accountContext?:Pick<CommunicationAccount,'source'|'transport'|'capabilities'|'accessVersion'>;channel:CommunicationChannel;from:CommunicationParty;to:CommunicationParty;cc?:CommunicationParty[];authorship?:'employee'|'copilot';subject:string;body:string;documents?:CommunicationDocumentReference[];attachments:CommunicationAttachment[];createdAt:string;expiresAt:string;scope:'relationship_only'|'employee_correspondence'|'property_package';notice:string;liveDelivery:false}
export interface InboxSendReceipt {id:string;reviewId:string;threadId:string;messageId:string;simulatedAt:string;status:'simulated_sent';notice:string;liveDelivery:false}
export interface InboxSendResult {detail:InboxThreadDetail;receipt:InboxSendReceipt}
export interface SimulateInboxSend {reviewId:string;eventKey:string}
export interface RecordInboxObservation extends InboxMutation {messageId:string;kind:'objection'|'preference';text:string}
export interface CreateInboxFollowUp extends InboxMutation {messageId:string;title:string;dueAt:string|null}
export interface InboxObservationResult {detail:InboxThreadDetail;observation:JourneyObservation}
export interface InboxFollowUpResult {detail:InboxThreadDetail;task:Task}
