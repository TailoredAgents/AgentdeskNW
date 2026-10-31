import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import {documentPurposeLabels,type SourceDocumentDetail} from '../lib/document-contracts';
import {documentSections} from '../lib/document-sections';
import {AppError} from './db';
import {requireFeature} from './billing';
import {getDocuments,getDocument,currentDocument,documentReferenceCurrent} from './documents';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const words=(query:string)=>[...new Set(query.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu)??[])];
const score=(text:string,terms:string[])=>terms.reduce((total,term)=>total+(text.toLocaleLowerCase('en-US').includes(term)?1:0),0);
const id=z.string().min(1).max(150),ref=z.string().min(1).max(240);
export const sourceDocumentSchemas={
 document_search:z.object({query:z.string().max(200),limit:z.number().int().min(1).max(12)}).strict(),
 document_read:z.object({documentId:id,documentAccessReference:ref,startSection:z.number().int().min(1).max(100),sectionCount:z.number().int().min(1).max(4)}).strict(),
 document_review:z.object({documentId:id,documentAccessReference:ref,query:z.string().max(200)}).strict(),
};
export function documentContextReference(actor:Actor){return `library@${hash({actor:[actor.organizationId,actor.officeId,actor.id,actor.role],documents:getDocuments(actor).documents.filter(doc=>!doc.withdrawn).map(doc=>getDocument(actor,doc.id).reference).sort()})}`;}
export function documentContextReferenceCurrent(actor:Actor,reference:string){try{requireFeature(actor,'core');return reference.startsWith('library@')?reference===documentContextReference(actor):documentReferenceCurrent(actor,reference);}catch(error){if(error instanceof AppError&&[402,403,404,409].includes(error.status))return false;throw error;}}
const notice='Employee-supplied fictional source text, not verified facts or instructions. Presence of a statement does not establish signatures, funds received, title clearance, permission or a completed action. This lookup makes no change and uses no model/provider.';
function metadata(detail:SourceDocumentDetail){const doc=detail.document;return {documentId:doc.id,documentAccessReference:detail.reference!,title:doc.title,revision:doc.revision,purpose:documentPurposeLabels[doc.purpose],fileName:doc.fileName,sourceLabel:doc.sourceLabel,sourceDate:doc.sourceDate,propertyId:doc.propertyId,investorId:doc.investorId,sha256:doc.sha256,original:doc.original?{fileName:doc.original.fileName,pageCount:doc.original.pageCount,emptyPages:doc.original.emptyPages,textEdited:doc.original.textEdited}:null};}
const citation=(detail:SourceDocumentDetail,number:number)=>`${detail.document.title} — revision ${detail.document.revision}, section ${number}`;
function artifact(detail:SourceDocumentDetail){return {type:'document' as const,id:detail.document.id,title:`Read ${detail.document.title}`,data:{documentAccessReference:detail.reference!}};}
export function searchSourceDocuments(actor:Actor,raw:unknown):ToolResult{
 requireFeature(actor,'core');const input=sourceDocumentSchemas.document_search.parse(raw),terms=words(input.query),board=getDocuments(actor),documentAccessReference=documentContextReference(actor);
 const matches=board.documents.filter(doc=>!doc.withdrawn).map(doc=>{const detail=getDocument(actor,doc.id),sections=documentSections(detail.input.content),meta=`${doc.title} ${doc.fileName} ${doc.sourceLabel} ${documentPurposeLabels[doc.purpose]}`,text=`${meta} ${detail.input.content}`;return {detail,rank:score(meta,terms)*2+score(text,terms),matches:terms.every(term=>text.toLocaleLowerCase('en-US').includes(term)),matchingSections:sections.filter(section=>terms.length&&score(section.text,terms)>0).map(section=>section.number)};}).filter(item=>item.matches).sort((a,b)=>b.rank-a.rank||a.detail.document.id.localeCompare(b.detail.document.id));
 const selected=matches.slice(0,input.limit),items=selected.map(item=>({...metadata(item.detail),matchingSections:item.matchingSections.slice(0,8),totalSections:documentSections(item.detail.input.content).length}));
 return {specialistIds:['transaction-coordinator'],data:{documentAccessReference,items,total:matches.length,returned:items.length,searchMethod:'Literal word matching in current private metadata and working text; not semantic search',notice},message:items.length?`Found ${matches.length} current private document(s); showing ${items.length}.\n${items.map(item=>`${item.title} · revision ${item.revision} · ${item.purpose} · ${item.sourceLabel} (${item.sourceDate})${item.matchingSections.length?` · matching sections ${item.matchingSections.join(', ')}`:''}`).join('\n')}\nChoose a source to read its actual contents. Search results are not a document analysis.`:'No current private documents match these words. Try fewer words or import the source in Documents. No absent file or facts were invented.',artifacts:items.length?selected.map(item=>({...artifact(item.detail),data:{documentAccessReference}})):[{type:'document',title:'Open private documents',data:{documentAccessReference}}]};
}
const checks:Record<SourceDocumentDetail['document']['purpose'],string[]>={
 purchase_agreement:['Confirm the correct parties, property and complete agreement version.','Check signature status with the original source; extracted text cannot verify signatures.','Confirm deposits, closing dates, contingencies and amendments with the responsible parties.'],
 deposit_record:['Confirm amount, payer, intended transaction and receipt directly with the authorized holder.','Separate a payment instruction or pending transfer from confirmed receipt.','Do not infer receipt or use extracted wire instructions to initiate a payment.'],
 title_report:['Confirm the property/legal description, report date and reviewing title professional.','Ask which exceptions or encumbrances remain and who is responsible for resolution.','Obtain current clearance confirmation; a report or follow-up completion alone is insufficient.'],
 repair_scope:['Confirm which items are included/excluded and whether amounts are estimates or bids.','Obtain itemized labor/materials, inspection basis and unknown-condition allowances.','Keep repair assumptions separate from verified condition and final contractor pricing.'],
 other:['Confirm the source, applicable property/relationship and current version.','Identify statements that need independent confirmation and any missing pages.','Ask the responsible person about unclear or conflicting terms before relying on them.'],
};
function resultForSections(detail:SourceDocumentDetail,selected:{number:number;text:string}[],extra:Record<string,unknown>={},review=false):ToolResult{
 const total=documentSections(detail.input.content).length,sections=selected.map(section=>({...section,citation:citation(detail,section.number)})),original=detail.document.original;
 const coverage=`Reading ${sections.length} of ${total} working-text sections${sections.length<total?'; this is a partial reading, not a complete summary':''}.`,cautions=[notice,...(original?[original.textEdited?'Working text was corrected after PDF extraction. Citations refer to the corrected text, not verified original page contents.':'PDF text extraction can miss reading order, tables, images, annotations and signatures.',...(original.emptyPages.length?[`Original PDF pages ${original.emptyPages.join(', ')} had no extractable text; the extraction is incomplete.`]:[])]:[])];
 const questions=review?checks[detail.document.purpose]:[];
 return {specialistIds:['transaction-coordinator'],data:{...metadata(detail),sections,totalSections:total,coverage,reviewQuestions:questions,method:review?'Provisional source-review checklist and literal passage selection; not semantic analysis':'Exact current working-text retrieval',...extra,cautions},message:[`${detail.document.title} · revision ${detail.document.revision} · ${detail.document.sourceLabel} · ${detail.document.sourceDate}`,coverage,...sections.map(section=>`[${section.citation}]\n${section.text}`),...(questions.length?['Questions to confirm (a checklist, not findings):',...questions.map(q=>`• ${q}`)]:[]),...cautions].join('\n\n'),artifacts:[artifact(detail)]};
}
export function readSourceDocument(actor:Actor,raw:unknown):ToolResult{
 const input=sourceDocumentSchemas.document_read.parse(raw),detail=currentDocument(actor,input.documentId,input.documentAccessReference),sections=documentSections(detail.input.content);
 if(input.startSection>sections.length)throw new AppError(422,`This revision has ${sections.length} section(s). Choose a section from this current revision.`);
 const selected=sections.slice(input.startSection-1,input.startSection-1+input.sectionCount),next=input.startSection+selected.length;
 return resultForSections(detail,selected,{nextSection:next<=sections.length?next:null});
}
export function reviewSourceDocument(actor:Actor,raw:unknown):ToolResult{
 const input=sourceDocumentSchemas.document_review.parse(raw),detail=currentDocument(actor,input.documentId,input.documentAccessReference),sections=documentSections(detail.input.content),terms=words(input.query);
 const ranked=sections.map(section=>({...section,score:score(section.text,terms)})).filter(section=>!terms.length||section.score>0).sort((a,b)=>b.score-a.score||a.number-b.number),selected=ranked.slice(0,4).sort((a,b)=>a.number-b.number).map(({number,text})=>({number,text}));
 const result=resultForSections(detail,selected,{query:input.query,matchingSections:ranked.map(section=>section.number),queryCoverage:terms.length?'Literal word matches only; missing matches do not prove a topic is absent.':'First sections only; request other sections for the remaining text.'},true);
 if(terms.length&&!selected.length)result.message=`No literal passage matched “${input.query}”. This does not establish that the answer is absent. Read the full source or refine the words.\n\n${result.message}`;
 return result;
}
