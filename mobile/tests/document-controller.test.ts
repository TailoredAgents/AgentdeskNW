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
