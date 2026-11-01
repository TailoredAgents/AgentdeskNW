import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import type {CommunicationAccount,InboxThreadDetail,ReviseCommunicationDraft} from '../src/lib/communications-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInboxState,getInboxThread,saveInboxDraft,discardInboxDraft,receiveDemoCommunication,composeCommunication,updateInboxThread,linkInboxInvestor} from '../src/server/communications';
import {getInboxDraftRevisionContext,reviseInboxDraft,prepareInboxReply,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {getEmployeeMemory,saveEmployeeMemory} from '../src/server/memory';
import {recordJourneyObservation} from '../src/server/journey';
import {simulateLifecycle,subscription} from '../src/server/billing';
import {saveDocument} from '../src/server/documents';
import {assignInvestor,setInvestorSharing} from '../src/server/intelligence';
import {getOwnershipPolicy,updateOwnershipPolicy} from '../src/server/access';

let actor:Actor,sequence=0;
const key=()=>`rewrite-${++sequence}`;
const count=(table:string)=>(getDb().prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n;
const thread=()=>{const inbox=getInboxState(actor);return inbox.threads.find(t=>t.correspondent.address==='mike@example.com'&&inbox.accounts.find(a=>a.id===t.accountId)?.provider==='gmail')!;};
const mutation=(id=thread().id)=>({expectedVersion:getInboxThread(actor,id).thread.version,eventKey:key()});
const prepare=(id=thread().id)=>prepareInboxReply(actor,id,mutation(id));
const body='Hey Mike, let’s get clear on the repair details first. What would you like confirmed?';
function request(detail:InboxThreadDetail,content=body):ReviseCommunicationDraft {const context=getInboxDraftRevisionContext(actor,detail.thread.id);return {...mutation(detail.thread.id),draftId:detail.draft!.id,draftVersion:detail.draft!.version,sourceReference:context.sourceReference!,body:content};}
function account(detail:InboxThreadDetail,patch:Partial<CommunicationAccount>){getDb().prepare('UPDATE communication_accounts SET data=? WHERE id=?').run(JSON.stringify({...detail.account,...patch}),detail.account.id);}
function assertUnchanged(detail:InboxThreadDetail,fn:()=>unknown){const before=count('communication_draft_revisions');expect(fn).toThrow();expect(count('communication_draft_revisions')).toBe(before);expect(getInboxThread(actor,detail.thread.id).draft).toEqual(detail.draft);}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T14:00:00Z'));actor=demoActor();sequence=0;vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No provider calls allowed');}));});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('source-bound Copilot rewrites of ordinary saved Inbox replies',()=>{
 it('replaces only the body in the same draft, with truthful authorship and no delivery or billing effect',()=>{
  const original=saveInboxDraft(actor,thread().id,{...mutation(),body:'Please clarify the repair details.',subject:'Our repair question'}),input=request(original),saved=reviseInboxDraft(actor,original.thread.id,input);
  expect(saved.draft).toMatchObject({id:original.draft!.id,from:original.draft!.from,to:original.draft!.to,subject:original.draft!.subject,cc:[],documents:[],body,version:original.draft!.version+1,authorship:'copilot',status:'draft',deliveryStatus:'not_sent',copilotRevision:{baseDraftVersion:original.draft!.version,sourceReference:input.sourceReference,current:true,reason:null}});
  expect(saved.thread.version).toBe(original.thread.version+1);expect(saved.draftHistory[0]).toMatchObject({id:original.draft!.id,body:original.draft!.body,authorship:'employee'});expect(getInboxDraftRevisionContext(actor,saved.thread.id).sourceReference).toBe(input.sourceReference);
  for(const table of ['communication_send_receipts','wallet_operations','provider_operations','journey_observations'])expect(count(table)).toBe(0);expect(fetch).not.toHaveBeenCalled();
 });
 it('retries the exact saved rewrite once and rejects a reused key or replay after an intervening edit',()=>{
  const original=prepare(),input=request(original),saved=reviseInboxDraft(actor,original.thread.id,input),before=count('communication_draft_revisions');
  expect(reviseInboxDraft(actor,original.thread.id,input)).toEqual(saved);expect(count('communication_draft_revisions')).toBe(before);
  expect(()=>reviseInboxDraft(actor,original.thread.id,{...input,body:'Different wording'})).toThrow('different inbox action');
  saveInboxDraft(actor,original.thread.id,{...mutation(),body:'My intervening edit.'});expect(()=>reviseInboxDraft(actor,original.thread.id,input)).toThrow('since changed');
 });
 it.each(['thread','draft','identity','source'] as const)('rejects a stale or forged %s reference without a mutation',change=>{
  const original=prepare(),input=request(original);if(change==='thread')input.expectedVersion--;if(change==='draft')input.draftVersion++;if(change==='identity')input.draftId='another-draft';if(change==='source')input.sourceReference='0'.repeat(64);
  assertUnchanged(original,()=>reviseInboxDraft(actor,original.thread.id,input));
 });
 it('does not overwrite a newer saved edit even when the source content is unchanged',()=>{
  const original=prepare(),input=request(original),saved=saveInboxDraft(actor,original.thread.id,{...mutation(),body:'Keep this employee correction.'});
  assertUnchanged(saved,()=>reviseInboxDraft(actor,original.thread.id,{...input,expectedVersion:saved.thread.version}));
 });
 it('requires an existing unsent reply and never recreates discarded or simulated drafts',()=>{
  const original=prepare(),input=request(original);discardInboxDraft(actor,original.thread.id,mutation());expect(()=>reviseInboxDraft(actor,original.thread.id,input)).toThrow('Save an ordinary reply');expect(getInboxThread(actor,original.thread.id).draft).toBeNull();
  const saved=prepare(),next=request(saved),review=reviewInboxSend(actor,saved.thread.id,mutation());simulateInboxSend(actor,saved.thread.id,{reviewId:review.id,eventKey:key()});expect(()=>reviseInboxDraft(actor,saved.thread.id,next)).toThrow('Save an ordinary reply');expect(count('communication_send_receipts')).toBe(1);
  const opening=composeCommunication(actor,{accountId:original.account.id,to:{name:'Fictional contact',address:'contact@example.com'},subject:'Hello',body:'An opening message.',eventKey:key()});expect(getInboxDraftRevisionContext(actor,opening.thread.id)).toMatchObject({eligible:false,sourceReference:null,reason:expect.stringContaining('no incoming')});
 });
 it('binds source freshness to incoming evidence, relationship corrections and employee preferences',()=>{
  let saved=prepare();const input=request(saved);saved=reviseInboxDraft(actor,saved.thread.id,input);
  receiveDemoCommunication(actor,{scenarioId:'mike-repair-followup',eventKey:key()});expect(getInboxThread(actor,saved.thread.id).draft!.copilotRevision!.current).toBe(false);expect(()=>reviseInboxDraft(actor,saved.thread.id,input)).toThrow('source changed');
  saved=reviseInboxDraft(actor,saved.thread.id,request(getInboxThread(actor,saved.thread.id)));recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Clarify the repair scope with dated evidence.',eventKey:key()});expect(getInboxThread(actor,saved.thread.id).draft!.copilotRevision!.current).toBe(false);
  saved=reviseInboxDraft(actor,saved.thread.id,request(getInboxThread(actor,saved.thread.id)));saveEmployeeMemory(actor,{tone:'direct',expectedVersion:getEmployeeMemory(actor).version});expect(getInboxThread(actor,saved.thread.id).draft!.copilotRevision!.current).toBe(false);
  expect(()=>reviewInboxSend(actor,saved.thread.id,mutation())).toThrow('source context changed');
 });
 it('uses exact current employee simulation review without calling custom model wording verified',()=>{
  const original=prepare(),prior=reviewInboxSend(actor,original.thread.id,mutation()),saved=reviseInboxDraft(actor,original.thread.id,request(original));expect(()=>simulateInboxSend(actor,saved.thread.id,{reviewId:prior.id,eventKey:key()})).toThrow('changed');
  const review=reviewInboxSend(actor,saved.thread.id,mutation());expect(review).toMatchObject({scope:'copilot_revision',authorship:'copilot',body,from:saved.draft!.from,to:saved.draft!.to});expect(review.notice).toContain('wording is not fact-verified');expect(count('communication_send_receipts')).toBe(0);
  const input={reviewId:review.id,eventKey:key()},sent=simulateInboxSend(actor,saved.thread.id,input);expect(simulateInboxSend(actor,saved.thread.id,input).receipt).toEqual(sent.receipt);expect(sent.detail.messages.at(-1)!.body).toBe(body);expect(count('communication_send_receipts')).toBe(1);
 });
 it('invalidates exact reviewed rewritten wording when a source changes before simulation',()=>{
  const original=prepare(),saved=reviseInboxDraft(actor,original.thread.id,request(original)),review=reviewInboxSend(actor,saved.thread.id,mutation());saveEmployeeMemory(actor,{length:'concise',expectedVersion:getEmployeeMemory(actor).version});expect(()=>simulateInboxSend(actor,saved.thread.id,{reviewId:review.id,eventKey:key()})).toThrow('changed');expect(count('communication_send_receipts')).toBe(0);
 });
 it('keeps current wording through read-state changes, but requires a fresh thread version for another rewrite',()=>{
  const original=prepare(),saved=reviseInboxDraft(actor,original.thread.id,request(original)),input=request(saved);updateInboxThread(actor,saved.thread.id,{...mutation(),unread:false});expect(getInboxThread(actor,saved.thread.id).draft!.copilotRevision!.current).toBe(true);expect(()=>reviseInboxDraft(actor,saved.thread.id,input)).toThrow('conversation changed');
 });
 it('rejects CC and selected local files without silently clearing them',()=>{
  const original=prepare(),input=request(original),cc=[{name:'Coordinator',address:'coordinator@example.com'}];let saved=saveInboxDraft(actor,original.thread.id,{...mutation(),body:'Preserve my recipients.',cc});
  expect(getInboxDraftRevisionContext(actor,saved.thread.id).reason).toContain('CC recipients or files');assertUnchanged(saved,()=>reviseInboxDraft(actor,saved.thread.id,{...input,expectedVersion:saved.thread.version,draftVersion:saved.draft!.version}));
  const doc=saveDocument(actor,{id:null,expectedVersion:0,eventKey:key(),input:{title:'Fictional note',fileName:'note.txt',purpose:'other',sourceLabel:'Employee fictional source',sourceDate:'2026-11-01',propertyId:null,investorId:null,content:'A fictional note.'}});
  saved=saveInboxDraft(actor,saved.thread.id,{...mutation(),body:'Preserve this file.',cc:[],documents:[{documentId:doc.document.id,revision:doc.document.revision,reference:doc.reference!}]});assertUnchanged(saved,()=>reviseInboxDraft(actor,saved.thread.id,{...input,expectedVersion:saved.thread.version,draftVersion:saved.draft!.version}));
 });
 it('rejects model-supplied authorship, recipients, subjects, files and review authority',()=>{
  const original=prepare(),input=request(original);for(const patch of [{authorship:'employee'},{to:{address:'other@example.com'}},{subject:'Replacement'},{documents:[]},{approved:true},{copilotRevision:{current:true}}])assertUnchanged(original,()=>reviseInboxDraft(actor,original.thread.id,{...input,...patch} as never));
 });
 it('preserves SMS one-to-one delivery identity and the message size limit',()=>{
  const sms=getInboxState(actor).threads.find(t=>t.channel==='sms')!,original=prepare(sms.id),input=request(original);assertUnchanged(original,()=>reviseInboxDraft(actor,sms.id,{...input,body:'x'.repeat(1601)}));const saved=reviseInboxDraft(actor,sms.id,{...input,body:'What time works for you?'});expect(saved.draft!.to).toEqual(original.draft!.to);expect(saved.draft!.subject).toBe(original.draft!.subject);expect(saved.draft!.cc).toEqual([]);expect(reviewInboxSend(actor,sms.id,mutation(sms.id)).scope).toBe('copilot_revision');
 });
 it('rechecks private ownership, actual membership, entitlement and linked relationship access',()=>{
  const original=prepare(),input=request(original);for(const other of [demoActor('manager'),demoActor('acquisitions'),{...actor,organizationId:'other'},{...actor,officeId:'other'},{...actor,role:'manager' as const}]){expect(()=>getInboxDraftRevisionContext(other,original.thread.id)).toThrow();expect(()=>reviseInboxDraft(other,original.thread.id,input)).toThrow();}
  getDb().prepare('UPDATE investors SET owner_id=? WHERE id=?').run(demoActor('manager').id,'investor-mike');expect(getInboxDraftRevisionContext(actor,original.thread.id)).toMatchObject({eligible:false,sourceReference:null});expect(()=>reviseInboxDraft(actor,original.thread.id,input)).toThrow('relationship context');
  simulateLifecycle(demoActor('manager'),{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:key()});expect(()=>reviseInboxDraft(actor,original.thread.id,input)).toThrow('subscription');expect(count('communication_draft_revisions')).toBe(1);
 });
 it('withholds revoked or headers-only bodies and does not revive an old source reference after restoration',()=>{
  const original=prepare(),input=request(original),saved=reviseInboxDraft(actor,original.thread.id,input);account(saved,{access:'revoked',accessVersion:saved.account.accessVersion+1});expect(getInboxThread(actor,saved.thread.id).draft).toBeNull();expect(()=>reviseInboxDraft(actor,saved.thread.id,input)).toThrow('revoked');
  account(saved,{access:'available',accessVersion:saved.account.accessVersion+2});expect(getInboxThread(actor,saved.thread.id).draft!.copilotRevision!.current).toBe(false);expect(()=>reviseInboxDraft(actor,saved.thread.id,input)).toThrow('source changed');
  account(saved,{source:{...saved.account.source,coverage:'headers_only'},accessVersion:saved.account.accessVersion+3});expect(getInboxDraftRevisionContext(actor,saved.thread.id)).toMatchObject({eligible:false,sourceReference:null});expect(()=>reviseInboxDraft(actor,saved.thread.id,input)).toThrow('Headers only');
 });
 it('clears trusted revision provenance on an intentional employee save or fresh canonical reply',()=>{
  let saved=prepare();saved=reviseInboxDraft(actor,saved.thread.id,request(saved));saved=saveInboxDraft(actor,saved.thread.id,{...mutation(),body:'My new wording.'});expect(saved.draft!.authorship).toBe('employee');expect(saved.draft!.copilotRevision).toBeUndefined();
  saved=reviseInboxDraft(actor,saved.thread.id,request(saved));saved=prepare();expect(saved.draft!.authorship).toBe('copilot');expect(saved.draft!.copilotRevision).toBeUndefined();expect(reviewInboxSend(actor,saved.thread.id,mutation()).scope).toBe('relationship_only');
 });
 it('does not turn arbitrary legacy model wording into a valid generated reply',()=>{
  const saved=saveInboxDraft(actor,thread().id,{...mutation(),body:'Arbitrary model wording.'},'copilot');expect(saved.draft!.copilotRevision).toBeUndefined();expect(()=>reviewInboxSend(actor,saved.thread.id,mutation())).toThrow('generated reply is no longer current');
 });
});

it('does not permit saved rewrites after a contact-stop report or infer a send capability from a CRM activity source',()=>{
 const original=prepare(),input=request(original),message={...original.messages.at(-1)!,id:key(),sourceRef:key(),body:'Please do not contact me about repairs or properties again.'};getDb().prepare('INSERT INTO communication_messages VALUES(?,?,?,?,?,?,?,?)').run(message.id,actor.organizationId,actor.officeId,actor.id,message.accountId,message.threadId,message.sourceRef,JSON.stringify(message));
 expect(getInboxDraftRevisionContext(actor,original.thread.id).reason).toContain('contact-stop');expect(()=>reviseInboxDraft(actor,original.thread.id,input)).toThrow('contact-stop');
 const inbox=getInboxState(actor),source=inbox.accounts.find(a=>a.source.coverage==='crm_activity')!,threadId=inbox.threads.find(t=>t.accountId===source.id)!.id,activity=prepare(threadId),saved=reviseInboxDraft(actor,threadId,request(activity,'Which operating assumptions should we clarify?'));
 expect(saved.draft!.copilotRevision!.current).toBe(true);expect(()=>reviewInboxSend(actor,threadId,mutation(threadId))).toThrow('sending route');expect(count('communication_send_receipts')).toBe(0);
});

it('never revives older rewrite provenance when preferences are changed and restored to the same values',()=>{
 const original=prepare(),input=request(original),saved=reviseInboxDraft(actor,original.thread.id,input),before=getEmployeeMemory(actor),review=reviewInboxSend(actor,saved.thread.id,mutation());
 const changed=saveEmployeeMemory(actor,{tone:'direct',expectedVersion:before.version});saveEmployeeMemory(actor,{tone:before.tone,expectedVersion:changed.version});
 expect(getEmployeeMemory(actor).tone).toBe(before.tone);expect(getEmployeeMemory(actor).version).toBe(before.version+2);expect(getInboxDraftRevisionContext(actor,saved.thread.id).sourceReference).not.toBe(input.sourceReference);expect(getInboxThread(actor,saved.thread.id).draft!.copilotRevision!.current).toBe(false);
 expect(()=>reviseInboxDraft(actor,saved.thread.id,input)).toThrow('source changed');expect(()=>simulateInboxSend(actor,saved.thread.id,{reviewId:review.id,eventKey:key()})).toThrow('changed');expect(count('communication_send_receipts')).toBe(0);
});

it('keeps old rewrites stale after a linked relationship changes and returns to the same investor',()=>{
 const threadId=thread().id;linkInboxInvestor(actor,threadId,{...mutation(),investorId:'investor-mike'});const original=prepare(),input=request(original),saved=reviseInboxDraft(actor,threadId,input);
 linkInboxInvestor(actor,threadId,{...mutation(),investorId:'investor-sarah'});linkInboxInvestor(actor,threadId,{...mutation(),investorId:'investor-mike'});const restored=getInboxThread(actor,threadId);
 expect(restored.thread.association).toEqual(saved.thread.association);expect(restored.thread).not.toHaveProperty('associationRevision');expect(restored.draft!.copilotRevision!.current).toBe(false);expect(getInboxDraftRevisionContext(actor,threadId).sourceReference).not.toBe(input.sourceReference);expect(()=>reviewInboxSend(actor,threadId,mutation())).toThrow('source context changed');
 const fresh=reviseInboxDraft(actor,threadId,request(restored));expect(fresh.draft!.copilotRevision!.current).toBe(true);
});

it('does not revive rewritten wording after current investor sharing is revoked and restored',()=>{
 const manager=demoActor('manager');assignInvestor(manager,'investor-mike',manager.id);setInvestorSharing(manager,'investor-mike',{visibility:'office',sharedWith:[]});const original=prepare(),input=request(original),saved=reviseInboxDraft(actor,original.thread.id,input);
 setInvestorSharing(manager,'investor-mike',{visibility:'owner',sharedWith:[]});expect(getInboxThread(actor,saved.thread.id).thread.association.status).toBe('unavailable');
 setInvestorSharing(manager,'investor-mike',{visibility:'office',sharedWith:[]});const restored=getInboxThread(actor,saved.thread.id);expect(restored.thread.association).toEqual(saved.thread.association);expect(restored.draft!.copilotRevision!.current).toBe(false);expect(getInboxDraftRevisionContext(actor,saved.thread.id).sourceReference).not.toBe(input.sourceReference);expect(()=>reviewInboxSend(actor,saved.thread.id,mutation())).toThrow('source context changed');
});
it('does not revive rewritten wording after the organization ownership policy returns to the same values',()=>{
 const manager=demoActor('manager'),policy=getOwnershipPolicy(manager);updateOwnershipPolicy(manager,policy);const original=prepare(),input=request(original),saved=reviseInboxDraft(actor,original.thread.id,input);
 updateOwnershipPolicy(manager,{...policy,organizationVisibility:!policy.organizationVisibility});updateOwnershipPolicy(manager,policy);expect(getOwnershipPolicy(manager)).toEqual(policy);expect(getInboxDraftRevisionContext(actor,saved.thread.id).sourceReference).not.toBe(input.sourceReference);expect(getInboxThread(actor,saved.thread.id).draft!.copilotRevision!.current).toBe(false);expect(()=>reviewInboxSend(actor,saved.thread.id,mutation())).toThrow('source context changed');
});
