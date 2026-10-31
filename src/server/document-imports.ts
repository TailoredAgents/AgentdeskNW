import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {DocumentImportPreview,DocumentOriginal} from '../lib/document-contracts';
import {AppError,assertActor,getDb,newId,now} from './db';
import {requireFeature} from './billing';
const MAX_BYTES=2_000_000,scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
export const documentImportSchema=z.object({fileName:z.string().min(5).max(120).regex(/^[\p{L}\p{N} _().-]+\.pdf$/iu,'Choose a PDF filename without folders.'),base64:z.string().min(4).max(2_666_668).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict();
const extractionSchema=z.object({pages:z.array(z.object({number:z.number().int().positive(),text:z.string().max(30000)}).strict()).min(1).max(40)}).strict();
type Imported={preview:DocumentImportPreview;bytes:Buffer};
let activeParsers=0;
/** A separate process makes the wall-clock limit effective even if parsing blocks its event loop. */
async function extract(bytes:Buffer){
 if(activeParsers>=2)throw new AppError(429,'Document extraction is busy. Try this file again shortly.');activeParsers++;
 try{return await new Promise<z.infer<typeof extractionSchema>>((accept,reject)=>{
  const child=spawn(process.execPath,['--max-old-space-size=128',resolve(process.cwd(),'scripts/extract-document-pdf.mjs')],{cwd:process.cwd(),env:{NODE_ENV:'production'},stdio:['pipe','pipe','pipe']});
  let output='',settled=false;
  const finish=(error?:AppError,value?:z.infer<typeof extractionSchema>)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill('SIGKILL');reject(error);}else accept(value!);};
  const timer=setTimeout(()=>finish(new AppError(422,'This PDF could not be extracted within the time limit. Use a smaller text-based file.')),15000);
  child.stdout.on('data',chunk=>{output+=String(chunk);if(Buffer.byteLength(output)>150000)finish(new AppError(422,'This PDF contains too much text for a single source document.'));});
  child.stderr.resume(); // Parser diagnostics may contain source text. Never log them.
  child.stdin.on('error',()=>{});
  child.on('error',()=>finish(new AppError(503,'Document extraction is unavailable. Try again later.')));
  child.on('close',()=>{
   if(settled)return;
   try{const result=JSON.parse(output);if(result.error){const message:Record<string,string>={password:'Password-protected PDFs are not supported. Use an authorized unlocked copy.',page_limit:'Use a PDF with no more than 40 pages.',text_limit:'This PDF contains too much text. Split it into smaller source documents.',unreadable:'This PDF could not be read. Use a valid text-based PDF or paste its text.'};finish(new AppError(422,message[result.error]??message.unreadable));}else finish(undefined,extractionSchema.parse(result));}
   catch{finish(new AppError(422,'This PDF could not be read safely. Use a smaller text-based file.'));}
  });child.stdin.end(bytes);
 });}finally{activeParsers--;}
}
export async function previewDocumentImport(actor:Actor,raw:unknown):Promise<DocumentImportPreview>{
 assertActor(actor);requireFeature(actor,'core');const input=documentImportSchema.parse(raw),bytes=Buffer.from(input.base64,'base64');
 if(bytes.length>MAX_BYTES)throw new AppError(413,'Choose a PDF no larger than 2 MB.');
 if(bytes.toString('base64')!==input.base64||!bytes.subarray(0,8).toString('ascii').startsWith('%PDF-'))throw new AppError(422,'The file does not contain a supported PDF.');
 cleanExpired(actor);checkPendingLimit(actor);
 const extracted=await extract(bytes),emptyPages=extracted.pages.filter(p=>!p.text.trim()).map(p=>p.number);
 if(emptyPages.length===extracted.pages.length)throw new AppError(422,'No readable text was found. This may be a scanned PDF; OCR is not available yet. Paste a checked transcription instead.');
 const content=extracted.pages.map(page=>`[PDF page ${page.number}]\n${page.text||'[No extractable text on this page]'}\n`).join('\n');
 if(content.length>32000||Buffer.byteLength(content)>64000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)||Buffer.from(content).toString('utf8')!==content)throw new AppError(422,'The extracted text cannot be represented completely in this document. Split the PDF or paste a checked transcription.');
 const id=newId('document_import'),preview:DocumentImportPreview={id,fileName:input.fileName.replace(/\.pdf$/i,'.txt'),content,original:{id,fileName:input.fileName,mimeType:'application/pdf',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),parser:'unpdf 1.6.2 / text extraction v1',pageCount:extracted.pages.length,emptyPages,textEdited:false},expiresAt:new Date(Date.now()+30*60*1000).toISOString(),notice:'Review this text against the original before saving. PDF reading order, tables, images, annotations and signatures may be missing or inaccurate. No OCR or verification was performed. Only the text extract is eligible for current email simulation.'};
 // Recheck after asynchronous extraction; an entitlement or membership may have changed.
 assertActor(actor);requireFeature(actor,'core');getDb().transaction(()=>{cleanExpired(actor);checkPendingLimit(actor);getDb().prepare('INSERT INTO document_imports VALUES(?,?,?,?,?,?,?)').run(id,...scope(actor),JSON.stringify(preview),bytes,preview.expiresAt);}).immediate();return preview;
}
function cleanExpired(actor:Actor){getDb().prepare('DELETE FROM document_imports WHERE organization_id=? AND office_id=? AND owner_id=? AND expires_at<=?').run(...scope(actor),now());}
function checkPendingLimit(actor:Actor){const row=getDb().prepare('SELECT COUNT(*) n FROM document_imports WHERE organization_id=? AND office_id=? AND owner_id=?').get(...scope(actor)) as {n:number};if(row.n>=6)throw new AppError(409,'Finish or discard a pending PDF import before uploading another. Unused previews expire after 30 minutes.');}
export function pendingDocumentImport(actor:Actor,id:string):Imported{
 assertActor(actor);requireFeature(actor,'core');const row=getDb().prepare('SELECT data,bytes,expires_at FROM document_imports WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,...scope(actor)) as {data:string;bytes:Buffer;expires_at:string}|undefined;
 if(!row)throw new AppError(404,'This PDF preview is unavailable in your private workspace.');if(row.expires_at<=now())throw new AppError(409,'This PDF preview expired. Import and review the file again.');return {preview:JSON.parse(row.data),bytes:row.bytes};
}
export function discardDocumentImport(actor:Actor,id:string){assertActor(actor);getDb().prepare('DELETE FROM document_imports WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(id,...scope(actor));return {ok:true};}
export function commitDocumentImport(actor:Actor,docId:string,imported:Imported){
 const row=getDb().prepare('SELECT COALESCE(SUM(length(f.bytes)),0) n FROM source_document_files f JOIN source_documents d ON d.id=f.document_id WHERE d.organization_id=? AND d.office_id=? AND d.owner_id=?').get(...scope(actor)) as {n:number};
 if(row.n+imported.bytes.length>50_000_000)throw new AppError(409,'The private demonstration has reached its 50 MB original-file limit. Existing sources remain readable.');
 getDb().prepare('INSERT INTO source_document_files VALUES(?,?,?,?)').run(imported.preview.id,docId,JSON.stringify(imported.preview),imported.bytes);
 getDb().prepare('DELETE FROM document_imports WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').run(imported.preview.id,...scope(actor));
}
/** Call only after resolving the currently authorized document and its immutable revision. */
export function originalDocumentFile(docId:string,original:DocumentOriginal){const row=getDb().prepare('SELECT data,bytes FROM source_document_files WHERE id=? AND document_id=?').get(original.id,docId) as {data:string;bytes:Buffer}|undefined;if(!row)throw new AppError(404,'The original file is unavailable.');return {preview:JSON.parse(row.data) as DocumentImportPreview,bytes:row.bytes};}
