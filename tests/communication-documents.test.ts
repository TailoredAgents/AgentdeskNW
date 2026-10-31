import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import type {SourceDocumentDetail,SourceDocumentInput} from '../src/lib/document-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {saveDocument,withdrawDocument,readDocumentRevision} from '../src/server/documents';
import {communicationDocumentOptions,reviewCommunicationDocuments} from '../src/server/communication-documents';
import {composeCommunication,getInboxState,getInboxThread,saveInboxDraft,receiveDemoCommunication} from '../src/server/communications';
import {prepareInboxReply,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {dispatchTool} from '../src/server/orchestrator';
import {simulateLifecycle,subscription} from '../src/server/billing';

let actor:Actor,seq=0;const key=()=>`attachment-${++seq}`;
const file=(changes:Partial<SourceDocumentInput>={})=>saveDocument(actor,{id:null,expectedVersion:0,input:{title:'Fictional agreement source',fileName:'private-agreement.txt',purpose:'purchase_agreement',sourceLabel:'Employee-provided fictional source',sourceDate:'2026-10-30',propertyId:null,investorId:null,content:'  Fictional text.\r\nSignature and deposit status are unverified.\n',...changes},eventKey:key()});
const ref=(doc:SourceDocumentDetail)=>({documentId:doc.document.id,revision:doc.document.revision,reference:doc.reference!});
function draft(doc:SourceDocumentDetail){return composeCommunication(actor,{accountId:getInboxState(actor).preferredAccountId!,to:{name:'Fictional closing coordinator',address:'coordinator@example.com'},cc:[{name:'Colleague',address:'colleague@example.com'}],subject:'Source text for your review',body:'Please review these fictional materials.',documents:[ref(doc)],eventKey:key()});}
const review=(detail:ReturnType<typeof draft>)=>reviewInboxSend(actor,detail.thread.id,{expectedVersion:detail.thread.version,eventKey:key()});
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');actor=demoActor();seq=0;vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No provider calls allowed');}));});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('employee-selected local text documents in reviewed correspondence',()=>{
 it('reviews exact bytes, revision, digest and every recipient without a provider attachment claim',()=>{
  const doc=file(),detail=draft(doc),prepared=review(detail);
  expect(detail.account.capabilities).toMatchObject({attachments:false,localTextAttachments:true});expect(detail.draft!.documentFiles![0]).toMatchObject({name:doc.document.fileName,current:true,sha256:doc.document.sha256});
  expect(prepared.attachments[0]).toMatchObject({textContent:doc.input.content,document:ref(doc),sizeBytes:doc.document.sizeBytes,sha256:doc.document.sha256});expect(prepared.cc).toEqual(detail.draft!.cc);expect(fetch).not.toHaveBeenCalled();
 });
 it('records one simulated outgoing file revision on exact retry without copying its content into ordinary inbox reads',()=>{
  const doc=file(),detail=draft(doc),prepared=review(detail),request={reviewId:prepared.id,eventKey:key()},first=simulateInboxSend(actor,detail.thread.id,request),again=simulateInboxSend(actor,detail.thread.id,request);
  expect(again.receipt).toEqual(first.receipt);expect(first.detail.messages.filter(m=>m.direction==='outbound')).toHaveLength(1);const attachment=first.detail.messages.at(-1)!.attachments[0];expect(attachment).toMatchObject({availability:'local_text',document:ref(doc)});expect(attachment.textContent).toBeUndefined();expect(readDocumentRevision(actor,doc.document.id,1).input.content).toBe(doc.input.content);expect(fetch).not.toHaveBeenCalled();
 });
 it.each(['correction','withdrawal'])('invalidates a prepared review on document %s without silently choosing another revision',cause=>{
  const doc=file(),detail=draft(doc),request={expectedVersion:detail.thread.version,eventKey:key()},prepared=reviewInboxSend(actor,detail.thread.id,request);
  if(cause==='correction')saveDocument(actor,{id:doc.document.id,expectedVersion:1,input:{...doc.input,content:'Corrected fictional source.'},eventKey:key()});else withdrawDocument(actor,{id:doc.document.id,expectedVersion:1,reason:'Source needs correction',eventKey:key()});
  expect(getInboxThread(actor,detail.thread.id).draft!.documentFiles![0].current).toBe(false);
  expect(()=>reviewInboxSend(actor,detail.thread.id,request)).toThrow('stale');expect(()=>simulateInboxSend(actor,detail.thread.id,{reviewId:prepared.id,eventKey:key()})).toThrow('changed');expect(()=>review(getInboxThread(actor,detail.thread.id))).toThrow(/changed|withdrawn/);
 });
 it('keeps original outgoing-file history after correction and withdrawal',()=>{
  const doc=file(),detail=draft(doc),prepared=review(detail);simulateInboxSend(actor,detail.thread.id,{reviewId:prepared.id,eventKey:key()});
  saveDocument(actor,{id:doc.document.id,expectedVersion:1,input:{...doc.input,fileName:'revised-name.txt',content:'Revised content.'},eventKey:key()});withdrawDocument(actor,{id:doc.document.id,expectedVersion:2,reason:'Withdraw current use',eventKey:key()});
  const attachment=getInboxThread(actor,detail.thread.id).messages.at(-1)!.attachments[0];expect(attachment.name).toBe('private-agreement.txt');expect(attachment.document!.revision).toBe(1);expect(attachment.current).toBe(false);expect(readDocumentRevision(actor,doc.document.id,1).input.content).toBe(doc.input.content);
 });
 it('withholds source metadata in drafts, history and outgoing files after linked investor access is lost',()=>{
  const doc=file({investorId:'investor-mike'}),detail=draft(doc),prepared=review(detail);simulateInboxSend(actor,detail.thread.id,{reviewId:prepared.id,eventKey:key()});
  getDb().prepare('UPDATE investors SET owner_id=? WHERE id=?').run('user-jordan','investor-mike');
  const next=getInboxThread(actor,detail.thread.id);expect(JSON.stringify(next)).not.toContain('private-agreement.txt');expect(JSON.stringify(next)).not.toContain(doc.input.content);expect(next.messages.at(-1)!.attachments[0].availability).toBe('unavailable');expect(communicationDocumentOptions(actor)).toEqual([]);expect(()=>readDocumentRevision(actor,doc.document.id,1)).toThrow();
 });
 it('never grants manager mailbox or document access by CRM role',()=>{
  const doc=file(),detail=draft(doc),manager=demoActor('manager');expect(communicationDocumentOptions(manager)).toEqual([]);expect(()=>getInboxThread(manager,detail.thread.id)).toThrow('private workspace');expect(()=>reviewCommunicationDocuments(manager,[ref(doc)])).toThrow('private workspace');
 });
 it('rejects forged revision/content, duplicate files and more than three selections',()=>{
  const doc=file();expect(()=>reviewCommunicationDocuments(actor,[{...ref(doc),revision:2}])).toThrow('revision');expect(()=>reviewCommunicationDocuments(actor,[{...ref(doc),reference:'forged'}])).toThrow('changed');expect(()=>reviewCommunicationDocuments(actor,[{...ref(doc),textContent:'forged'} as never])).toThrow();expect(()=>reviewCommunicationDocuments(actor,[ref(doc),ref(doc)])).toThrow('once');expect(()=>reviewCommunicationDocuments(actor,[ref(doc),ref(file()),ref(file()),ref(file())])).toThrow();
 });
 it('rejects text-message attachments and header-only or revoked email capabilities',()=>{
  const doc=file(),state=getInboxState(actor),sms=state.accounts.find(a=>a.channel==='sms')!;
  expect(()=>composeCommunication(actor,{accountId:sms.id,to:{name:'Fictional',address:'+14045550199'},body:'Hello',documents:[ref(doc)],eventKey:key()})).toThrow();
  const headers=state.accounts.find(a=>a.source.coverage==='headers_only')!;expect(()=>composeCommunication(actor,{accountId:headers.id,to:{name:'Fictional',address:'person@example.com'},subject:'Fictional source',body:'Hello',documents:[ref(doc)],eventKey:key()})).toThrow();
  const detail=draft(doc);receiveDemoCommunication(actor,{scenarioId:'company-revoke-access',eventKey:key()});expect(getInboxThread(actor,detail.thread.id).documentOptions).toEqual([]);expect(()=>review(detail)).toThrow();
 });
 it('preserves exact draft retries and requires a fresh selection for a corrected source',()=>{
  const doc=file(),detail=draft(doc),request={expectedVersion:detail.thread.version,body:'Edited draft',documents:[ref(doc)],eventKey:key()},saved=saveInboxDraft(actor,detail.thread.id,request);
  const corrected=saveDocument(actor,{id:doc.document.id,expectedVersion:1,input:{...doc.input,content:'Corrected fictional content.'},eventKey:key()});expect(saveInboxDraft(actor,detail.thread.id,request).draft!.id).toBe(saved.draft!.id);
  expect(()=>saveInboxDraft(actor,detail.thread.id,{...request,expectedVersion:saved.thread.version,eventKey:key()})).toThrow('changed');
  const updated=saveInboxDraft(actor,detail.thread.id,{...request,expectedVersion:saved.thread.version,documents:[ref(corrected)],eventKey:key()});expect(review(updated).attachments[0].textContent).toBe(corrected.input.content);
 });
 it('generated replies cannot select files and replacement explicitly clears a manual selection',()=>{
  const doc=file(),thread=getInboxState(actor).threads.find(t=>t.association.investor?.id==='investor-mike'&&t.channel==='email')!,detail=getInboxThread(actor,thread.id);
  expect(()=>saveInboxDraft(actor,thread.id,{expectedVersion:detail.thread.version,body:'Generated arbitrary file',documents:[ref(doc)],eventKey:key()},'copilot')).toThrow('cannot attach');
  const saved=saveInboxDraft(actor,thread.id,{expectedVersion:detail.thread.version,body:'Employee draft',documents:[ref(doc)],eventKey:key()});const generated=prepareInboxReply(actor,thread.id,{expectedVersion:saved.thread.version,eventKey:key()});expect(generated.draft!.documents).toEqual([]);expect(generated.draftHistory.some(d=>d.documents?.length===1)).toBe(true);
 });
 it('keeps local file contents and metadata out of existing model inbox tools until source-aware document tools are implemented',async()=>{
  const doc=file(),detail=draft(doc),prepared=review(detail);simulateInboxSend(actor,detail.thread.id,{reviewId:prepared.id,eventKey:key()});
  const result=await dispatchTool(actor,'inbox_thread',{threadId:detail.thread.id});expect(result.data).toHaveProperty('messages');expect(JSON.stringify(result)).not.toContain(doc.document.fileName);expect(JSON.stringify(result)).not.toContain(doc.input.content);expect(JSON.stringify(result)).not.toContain(doc.document.id);
 });
 it('retains permitted private historical file reads after subscription ends but blocks new review',()=>{
  const doc=file(),detail=draft(doc),prepared=review(detail);simulateInboxSend(actor,detail.thread.id,{reviewId:prepared.id,eventKey:key()});simulateLifecycle(demoActor('manager'),{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:key()});
  expect(getInboxThread(actor,detail.thread.id).messages.at(-1)!.attachments[0].name).toBe(doc.document.fileName);expect(communicationDocumentOptions(actor)).toEqual([]);expect(()=>review(getInboxThread(actor,detail.thread.id))).toThrow();
 });
});
