import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {CommunicationAttachment,CommunicationDocumentOption,CommunicationDocumentReference,CommunicationDraft} from '../lib/communications-contracts';
import {AppError} from './db';
import {featureAccess} from './billing';
import {currentDocument,getDocument,getDocuments,readDocumentRevision} from './documents';

export const communicationDocumentsSchema=z.array(z.object({documentId:z.string().min(1).max(150),revision:z.number().int().positive(),reference:z.string().min(1).max(240)}).strict()).max(3).refine(values=>new Set(values.map(v=>v.documentId)).size===values.length,'Select each document only once.');
const attachmentId=(ref:CommunicationDocumentReference)=>`${ref.documentId}:${ref.revision}`;

export function communicationDocumentOptions(actor:Actor):CommunicationDocumentOption[]{
 if(!featureAccess(actor,'core').allowed)return [];
 return getDocuments(actor).documents.filter(d=>!d.withdrawn).map(doc=>{
  const detail=getDocument(actor,doc.id);
  return {documentId:doc.id,revision:doc.revision,reference:detail.reference!,name:doc.fileName,title:doc.title,sizeBytes:doc.sizeBytes,sha256:doc.sha256};
 });
}
/** Only employee-selected local text; presence does not verify signatures, payment or sharing eligibility. */
export function reviewCommunicationDocuments(actor:Actor,raw:CommunicationDocumentReference[]=[]):CommunicationAttachment[]{
 return communicationDocumentsSchema.parse(raw).map(ref=>{
  const detail=currentDocument(actor,ref.documentId,ref.reference),doc=detail.document;
  if(doc.revision!==ref.revision)throw new AppError(409,'The selected file revision changed. Select and review the current document again.');
  return {id:attachmentId(ref),name:doc.fileName,mimeType:'text/plain; charset=utf-8',sizeBytes:doc.sizeBytes,availability:'local_text',document:ref,sha256:doc.sha256,current:true,textContent:detail.input.content};
 });
}
/** Historical message metadata reads its original immutable revision, but rechecks current source access. */
export function visibleCommunicationDocuments(actor:Actor,refs:CommunicationDocumentReference[]=[]):CommunicationAttachment[]{
 return refs.map<CommunicationAttachment>(ref=>{
  try{
   const detail=getDocument(actor,ref.documentId),revision=readDocumentRevision(actor,ref.documentId,ref.revision);
   return {id:attachmentId(ref),name:revision.input.fileName,mimeType:'text/plain; charset=utf-8',sizeBytes:revision.sizeBytes,availability:'local_text',document:ref,sha256:revision.sha256,current:detail.reference===ref.reference&&detail.document.revision===ref.revision};
  }catch(error){
   if(!(error instanceof AppError)||![402,403,404,409].includes(error.status))throw error;
   return {id:attachmentId(ref),name:'Source document unavailable',mimeType:'',sizeBytes:0,availability:'unavailable',current:false};
  }
 });
}
export function visibleDocumentDraft(actor:Actor,draft:CommunicationDraft|null):CommunicationDraft|null {
 return draft?{...draft,documentFiles:visibleCommunicationDocuments(actor,draft.documents)}:null;
}
