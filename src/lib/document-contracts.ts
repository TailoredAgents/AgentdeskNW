import type {Investor,Property} from './contracts';
export const documentPurposes=['purchase_agreement','deposit_record','title_report','repair_scope','other'] as const;
export type DocumentPurpose=typeof documentPurposes[number];
export const documentPurposeLabels:Record<DocumentPurpose,string>={purchase_agreement:'Purchase agreement',deposit_record:'Deposit record',title_report:'Title report',repair_scope:'Repair scope',other:'Other source'};
export interface SourceDocumentInput {title:string;fileName:string;purpose:DocumentPurpose;sourceLabel:string;sourceDate:string;propertyId:string|null;investorId:string|null;content:string}
export interface SourceDocumentSummary {id:string;version:number;revision:number;title:string;fileName:string;purpose:DocumentPurpose;sourceLabel:string;sourceDate:string;propertyId:string|null;investorId:string|null;withdrawn:boolean;updatedAt:string;sizeBytes:number;sha256:string;original?:DocumentOriginal}
export interface SourceDocumentDetail {document:SourceDocumentSummary;input:SourceDocumentInput;history:{revision:number;title:string;createdAt:string;sizeBytes:number;sha256:string}[];reference:string|null;canEdit:boolean;notice:string}
export interface SourceDocumentBoard {documents:SourceDocumentSummary[];properties:Property[];investors:Investor[];canEdit:boolean;notice:string}
export interface SaveSourceDocument {id:string|null;expectedVersion:number;input:SourceDocumentInput;eventKey:string;importId?:string}
export interface WithdrawSourceDocument {id:string;expectedVersion:number;reason:string;eventKey:string}

export interface DocumentOriginal {id:string;fileName:string;mimeType:'application/pdf';sizeBytes:number;sha256:string;parser:string;pageCount:number;emptyPages:number[];textEdited:boolean}
export interface DocumentImportPreview {id:string;fileName:string;content:string;original:DocumentOriginal;expiresAt:string;notice:string}
