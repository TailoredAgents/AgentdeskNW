import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentController} from '../../src/lib/document-controller';
import type {SourceDocumentBoard,SourceDocumentDetail,SourceDocumentInput} from '../../src/lib/document-contracts';
const input:SourceDocumentInput={title:'Scope',fileName:'scope.txt',purpose:'repair_scope',sourceLabel:'Fictional note',sourceDate:'2026-10-30',propertyId:null,investorId:null,content:'Source text'};
const detail=(version=1):SourceDocumentDetail=>({document:{...input,id:'doc',version,revision:version,title:'Scope',withdrawn:false,updatedAt:'2026-10-30T12:00:00Z',sizeBytes:10,sha256:'test-digest'},input:{...input,content:`Saved ${version}`},history:[],reference:`doc@${version}`,canEdit:true,notice:'Fictional'});
const board:SourceDocumentBoard={documents:[],properties:[],investors:[],canEdit:true,notice:'Fictional'};
test('newer revisions never overwrite unsaved content or silently update its write base',async()=>{
 let current=detail(),writes=0;const c=new DocumentController(async(path,body)=>{if(body)writes++;return (path==='/documents'?board:current) as never;},()=> 'key');await c.load();await c.select('doc');c.edit();c.change({content:'Unsaved'});current=detail(2);await c.load();assert.equal(c.value.form?.content,'Unsaved');assert.equal(c.value.baseVersion,1);assert.equal(c.stale,true);await c.save();assert.equal(writes,0);c.discard();c.edit();assert.equal(c.value.form?.content,'Saved 2');
});
test('unknown save retries one exact operation while navigation and editing stay locked',async()=>{
 let attempts=0;const requests:unknown[]=[];const c=new DocumentController(async(path,body)=>{if(body){requests.push(body);if(++attempts===1)throw new Error('Connection lost');return detail() as never;}return (path==='/documents'?board:detail()) as never;},()=> 'key');await c.load();c.edit(true);c.change(input);await c.save();assert.equal(c.locked,true);c.change({content:'Replacement'});assert.equal(c.value.form?.content,input.content);let left=false;c.leave(()=>{left=true;});assert.equal(left,false);await c.retry();assert.equal(requests[0],requests[1]);assert.equal(c.value.form,null);assert.equal(c.value.detail?.document.id,'doc');
});
test('source loss removes protected content, history, edits and withdrawal review',async()=>{
 let denied=false;const c=new DocumentController(async(path)=>{if(denied)throw Object.assign(new Error('Source unavailable'),{status:404});return (path==='/documents'?board:detail()) as never;},()=> 'key');await c.load();await c.select('doc');c.edit();c.change({content:'Private draft'});denied=true;await c.load();assert.equal(c.value.form,null);assert.equal(c.value.detail,null);assert.equal(c.value.board,null);assert.equal(c.dirty,false);
});
test('changed documents cancel a withdrawal review and leave unsaved text guarded',async()=>{
 let current=detail();const c=new DocumentController(async(path)=>(path==='/documents'?board:current) as never,()=> 'key');await c.load();await c.select('doc');c.reason('Incorrect source');c.reviewWithdrawal();assert.equal(c.value.withdrawReview,true);current=detail(2);await c.load();assert.equal(c.value.withdrawReview,false);assert.equal(c.value.reason,'Incorrect source');let left=false;c.leave(()=>{left=true;});assert.equal(left,false);c.discard();c.leave(()=>{left=true;});assert.equal(left,true);
});
test('late reads cannot restore a disposed workspace',async()=>{
 let resolve!:(value:SourceDocumentBoard)=>void;const c=new DocumentController(async()=>await new Promise<SourceDocumentBoard>(r=>{resolve=r;}) as never,()=> 'key');const loading=c.load();c.dispose();resolve(board);await loading;assert.equal(c.value.board,null);
});
test('starting a new document cancels a refresh of the previously selected document',async()=>{
 let delayed=false,resolve!:(value:SourceDocumentBoard)=>void;const c=new DocumentController(async(path)=>{if(path==='/documents'&&delayed)return await new Promise<SourceDocumentBoard>(r=>{resolve=r;}) as never;return (path==='/documents'?board:detail()) as never;},()=> 'key');
 await c.load();await c.select('doc');delayed=true;const refresh=c.load();c.edit(true);c.change({title:'New source',content:'New draft'});resolve(board);await refresh;assert.equal(c.value.detail,null);assert.equal(c.value.baseVersion,0);assert.equal(c.value.form?.title,'New source');assert.equal(c.stale,false);
});
test('a rejected oversized request unlocks editing instead of trapping an exact retry',async()=>{
 const c=new DocumentController(async(path,body)=>{if(body)throw Object.assign(new Error('Request too large'),{status:413});return (path==='/documents'?board:detail()) as never;},()=> 'key');await c.load();c.edit(true);c.change(input);await c.save();assert.equal(c.value.pending,null);assert.equal(c.locked,false);assert.equal(c.value.form?.content,input.content);c.change({content:'Shorter source'});assert.equal(c.value.form?.content,'Shorter source');
});
const pdfPreview={id:'pdf-preview',fileName:'scope.txt',content:'[PDF page 1]\nFictional source',original:{id:'pdf-preview',fileName:'scope.pdf',mimeType:'application/pdf' as const,sizeBytes:500,sha256:'digest',parser:'test parser',pageCount:1,emptyPages:[],textEdited:false},expiresAt:'2099-01-01T00:00:00Z',notice:'Review extraction'};
test('a PDF preview remains unsaved and binds the original to the exact uncertain save retry',async()=>{
 let attempts=0;const writes:unknown[]=[];const c=new DocumentController(async(path,body)=>{if(path==='/documents/import')return pdfPreview as never;if(path==='/documents/save'){writes.push(body);if(++attempts===1)throw new Error('Connection lost');return detail() as never;}return (path==='/documents'?board:detail()) as never;},()=> 'key');
 await c.load();c.edit(true);c.change(input);await c.importPdf('scope.pdf','bytes');assert.equal(c.value.form?.content,pdfPreview.content);assert.equal(c.value.detail,null);c.change({content:'Checked correction'});await c.save();assert.equal(c.locked,true);assert.equal((writes[0] as {importId:string}).importId,pdfPreview.id);await c.retry();assert.equal(writes[0],writes[1]);assert.equal(c.value.imported,null);
});
test('a rejected extraction keeps existing draft text and releases navigation after explicit discard',async()=>{
 const c=new DocumentController(async(path)=>{if(path==='/documents/import')throw Object.assign(new Error('No readable text'),{status:422});return board as never;},()=> 'key');await c.load();c.edit(true);c.change(input);await c.importPdf('scan.pdf','bytes');assert.equal(c.value.form?.content,input.content);assert.equal(c.value.imported,null);assert.equal(c.locked,false);assert.match(c.value.error,/No readable text/);c.discard();assert.equal(c.dirty,false);
});
test('late PDF extraction cannot populate a disposed form and busy import blocks edits',async()=>{
 let resolve!:(value:unknown)=>void;const c=new DocumentController(async(path)=>path==='/documents/import'?await new Promise<unknown>(r=>{resolve=r;}) as never:board as never,()=> 'key');await c.load();c.edit(true);c.change(input);const importing=c.importPdf('scope.pdf','bytes');assert.equal(c.locked,true);c.change({content:'Should not change'});assert.equal(c.value.form?.content,input.content);c.dispose();resolve(pdfPreview);await importing;assert.equal(c.value.imported,null);
});
test('discard releases a staged original without saving a source document',async()=>{
 const calls:string[]=[];const c=new DocumentController(async(path)=>{calls.push(path);return (path==='/documents/import'?pdfPreview:board) as never;},()=> 'key');await c.load();c.edit(true);await c.importPdf('scope.pdf','bytes');c.discard();assert.equal(c.value.imported,null);assert.equal(c.value.form,null);assert.ok(calls.includes('/documents/discard-import'));assert.ok(!calls.includes('/documents/save'));
});
test('slow document refresh is not repeatedly invalidated by the polling timer',async()=>{
 let resolve!:(value:unknown)=>void,calls=0;const c=new DocumentController(async()=>{calls++;return await new Promise<unknown>(r=>{resolve=r;}) as never;},()=> 'key');const first=c.load();await c.load();await c.load();assert.equal(calls,1);resolve(board);await first;assert.equal(c.value.board,board);
});
