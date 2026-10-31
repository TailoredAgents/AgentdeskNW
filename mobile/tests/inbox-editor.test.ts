import test from 'node:test';
import assert from 'node:assert/strict';
import type {InboxSendReview,InboxThreadDetail} from '../../src/lib/communications-contracts';
import {editorDirty,editorFor,keepReviewedEdits,reconcileEditor,reviewMatches} from '../src/inbox-editor';
const detail=(changes:Partial<InboxThreadDetail>={}):InboxThreadDetail=>({thread:{id:'thread-one',version:1,channel:'email',subject:'Repair question'},account:{id:'account-one',accessVersion:1,capabilities:{simulateSend:true}},bodyAccess:'full',canEdit:true,draft:{id:'draft-one',version:1,subject:'Following up',body:'Saved text'},...changes} as InboxThreadDetail);
test('incoming changes preserve unsaved text and its original write version',()=>{
 const first=detail(),local={...editorFor(first),body:'My unsaved reply'},updated=detail({thread:{...first.thread,version:2},draft:{...first.draft!,body:'Another device reply',version:2}});
 const merged=reconcileEditor(local,updated);assert.equal(merged.body,'My unsaved reply');assert.equal(merged.baseVersion,1);assert.equal(editorDirty(merged),true);
 const reviewed=keepReviewedEdits(merged,updated);assert.equal(reviewed.baseVersion,2);assert.equal(reviewed.body,'My unsaved reply');assert.equal(reviewed.savedBody,'Another device reply');assert.equal(editorDirty(reviewed),true);
});
test('clean buffers follow saved revisions without becoming dirty',()=>{
 const first=detail(),updated=detail({thread:{...first.thread,version:2},draft:{...first.draft!,body:'New saved text',version:2}}),value=reconcileEditor(editorFor(first),updated);
 assert.equal(value.body,'New saved text');assert.equal(value.baseVersion,2);assert.equal(editorDirty(value),false);
});
test('revoked or headers-only access clears private unsaved text',()=>{
 const first=detail(),local={...editorFor(first),body:'Private unsaved text'};
 for(const bodyAccess of ['headers_only','revoked'] as const){const restricted=detail({bodyAccess,draft:null});assert.equal(reconcileEditor(local,restricted).body,'');assert.throws(()=>keepReviewedEdits(local,restricted));}
});
test('source revisions and thread changes cannot carry old buffers into restored access',()=>{
 const first=detail(),local={...editorFor(first),body:'From the old source'};
 const changed=detail({account:{...first.account,accessVersion:3}});assert.equal(reconcileEditor(local,changed).body,'Saved text');assert.throws(()=>keepReviewedEdits(local,changed));
 assert.equal(reconcileEditor(local,detail({thread:{...first.thread,id:'thread-two'}})).body,'Saved text');
});
test('a simulation review only authorizes its exact current draft and source',()=>{
 const first=detail(),editor=editorFor(first),review={threadId:'thread-one',threadVersion:1,accountId:'account-one',accountContext:{accessVersion:1},draftId:'draft-one',draftVersion:1,body:'Saved text',subject:'Following up',expiresAt:'2026-10-30T12:10:00Z'} as InboxSendReview;
 const at=Date.parse('2026-10-30T12:00:00Z');assert.equal(reviewMatches(review,first,editor,at),true);
 for(const changed of [detail({canEdit:false}),detail({bodyAccess:'revoked'}),detail({thread:{...first.thread,version:2}}),detail({account:{...first.account,accessVersion:2}}),detail({draft:{...first.draft!,body:'Changed'}}),detail({draft:null})])assert.equal(reviewMatches(review,changed,editor,at),false);
 assert.equal(reviewMatches(review,first,{...editor,body:'Unsaved change'},at),false);assert.equal(reviewMatches(review,first,editor,Date.parse(review.expiresAt)),false);
});
test('CC-only edits stay dirty and survive comparison without adopting a newer version silently',()=>{
 const first=detail(),local={...editorFor(first),cc:'attorney@example.com'},updated=detail({thread:{...first.thread,version:2},draft:{...first.draft!,cc:[{name:'',address:'other@example.com'}],version:2}});
 assert.equal(editorDirty(local),true);const pending=reconcileEditor(local,updated);assert.equal(pending.baseVersion,1);assert.equal(pending.cc,'attorney@example.com');const reviewed=keepReviewedEdits(pending,updated);assert.equal(reviewed.cc,'attorney@example.com');assert.equal(reviewed.savedCc,'other@example.com');assert.equal(reviewed.baseVersion,2);
});
test('CC identity and authorship remain part of exact send review',()=>{
 const first=detail();first.draft={...first.draft!,authorship:'employee',cc:[{name:'',address:'attorney@example.com'}]};const editor=editorFor(first),review={threadId:'thread-one',threadVersion:1,accountId:'account-one',accountContext:{accessVersion:1},draftId:'draft-one',draftVersion:1,body:'Saved text',subject:'Following up',cc:first.draft.cc,authorship:'employee',expiresAt:'2026-10-30T12:10:00Z'} as InboxSendReview,at=Date.parse('2026-10-30T12:00:00Z');assert.equal(reviewMatches(review,first,editor,at),true);assert.equal(reviewMatches({...review,cc:[]},first,editor,at),false);assert.equal(reviewMatches({...review,authorship:'copilot'},first,editor,at),false);assert.equal(reviewMatches(review,first,{...editor,cc:'changed@example.com'},at),false);assert.equal(reconcileEditor(editor,detail({bodyAccess:'revoked',draft:null})).cc,'');
});

test('file-only changes stay dirty through incoming edits and exact comparison',()=>{
 const first=detail(),file={documentId:'document-one',revision:1,reference:'document-one@one'},local={...editorFor(first),documents:[file]};
 assert.equal(editorDirty(local),true);const updated=detail({thread:{...first.thread,version:2}}),pending=reconcileEditor(local,updated);
 assert.equal(pending.baseVersion,1);assert.deepEqual(pending.documents,[file]);const compared=keepReviewedEdits(pending,updated);assert.equal(compared.baseVersion,2);assert.deepEqual(compared.documents,[file]);assert.equal(editorDirty(compared),true);
});
test('file correction, withdrawal or selection changes invalidate the phone send review',()=>{
 const first=detail(),file={documentId:'document-one',revision:1,reference:'document-one@one'};
 first.draft={...first.draft!,documents:[file],documentFiles:[{id:'file-one',name:'fictional.txt',mimeType:'text/plain',sizeBytes:10,availability:'local_text',current:true,document:file}]};
 const editor=editorFor(first),review={threadId:'thread-one',threadVersion:1,accountId:'account-one',accountContext:{accessVersion:1},draftId:'draft-one',draftVersion:1,body:'Saved text',subject:'Following up',documents:[file],expiresAt:'2026-10-30T12:10:00Z'} as InboxSendReview,at=Date.parse('2026-10-30T12:00:00Z');
 assert.equal(reviewMatches(review,first,editor,at),true);assert.equal(reviewMatches({...review,documents:[]},first,editor,at),false);assert.equal(reviewMatches(review,first,{...editor,documents:[]},at),false);
 const stale={...first,draft:{...first.draft,documentFiles:[{...first.draft.documentFiles![0],current:false}]}};
 assert.equal(reviewMatches(review,stale,editor,at),false);assert.deepEqual(reconcileEditor(editor,detail({bodyAccess:'revoked',draft:null})).documents,[]);
});
