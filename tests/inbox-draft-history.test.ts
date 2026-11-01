import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor,ToolResult} from '../src/lib/contracts';
import {closeDb,demoActor} from '../src/server/db';
import {getInboxState,getInboxThread,saveInboxDraft,discardInboxDraft,receiveDemoCommunication,updateInboxThread} from '../src/server/communications';
import {getInboxDraftRevisionContext,prepareInboxReply,reviseInboxDraft,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {inboxAccessReference,inboxAccessReferenceCurrent,inboxDraftReference} from '../src/server/communications-context';
import {collectHistoryReferences,historyReferencesVisible} from '../src/server/history';
import {addMessage,createConversation,getConversation} from '../src/server/services';
import {executeRecordedTool} from '../src/server/text-runtime';
import {getEmployeeMemory,saveEmployeeMemory} from '../src/server/memory';
import {recordJourneyObservation} from '../src/server/journey';

let actor:Actor,sequence=0;
const key=()=>`draft-history-${++sequence}`;
const mutation=(threadId:string)=>({expectedVersion:getInboxThread(actor,threadId).thread.version,eventKey:key()});
const draftBody='Hey Mike, which repair details would help you decide what to review next?';
function savedRewrite(){
 const inbox=getInboxState(actor),thread=inbox.threads.find(item=>item.correspondent.address==='mike@example.com'&&inbox.accounts.find(account=>account.id===item.accountId)?.provider==='gmail')!;
 const original=prepareInboxReply(actor,thread.id,mutation(thread.id)),context=getInboxDraftRevisionContext(actor,thread.id);
 return reviseInboxDraft(actor,thread.id,{...mutation(thread.id),draftId:original.draft!.id,draftVersion:original.draft!.version,sourceReference:context.sourceReference!,body:draftBody});
}
const resultFor=(threadId:string):ToolResult=>({message:`Saved this rewritten reply, not sent: ${draftBody}`,specialistIds:['investor-relationship'],artifacts:[{type:'inbox',id:threadId,title:'Review rewritten reply',data:{threadId,inboxAccessReference:inboxDraftReference(actor,threadId)}}]});
beforeEach(()=>{
 closeDb();sequence=0;
 vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T14:00:00Z'));actor=demoActor();
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No provider calls allowed');}));
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('exact source-aware Inbox draft history and cached tool replay',()=>{
 it('binds the current draft while preserving ordinary Inbox history and read-state changes',()=>{
  const saved=savedRewrite(),id=saved.thread.id,reference=inboxDraftReference(actor,id)!;
  expect(reference).toMatch(new RegExp(`^${id}\\|draft-v1\\|[a-f0-9]{64}$`));
  const ordinary=inboxAccessReference(actor,id);
  expect(inboxAccessReferenceCurrent(actor,id,[reference,ordinary])).toBe(true);
  updateInboxThread(actor,id,{...mutation(id),unread:false});
  expect(inboxDraftReference(actor,id)).toBe(reference);
  expect(inboxAccessReferenceCurrent(actor,id,[reference])).toBe(true);
  saveInboxDraft(actor,id,{...mutation(id),body:'My corrected wording.'});
  expect(inboxAccessReferenceCurrent(actor,id,[reference])).toBe(false);
  expect(inboxAccessReferenceCurrent(actor,id,[ordinary])).toBe(true);
 });

 it.each(['incoming','relationship','preference','manual_edit','discard','simulation'] as const)('withholds saved history and a cached tool result after %s changes the draft or its source',change=>{
  const saved=savedRewrite(),id=saved.thread.id,result=resultFor(id),reference=inboxDraftReference(actor,id)!;
  const conversation=createConversation(actor,'Review a fictional reply'),dispatch=vi.fn(()=>result),callId=key(),requestId=key(),args={threadId:id};
  executeRecordedTool(actor,conversation.id,callId,'revise_inbox_draft',args,dispatch,requestId);
  addMessage(actor,conversation.id,{role:'assistant',content:result.message,artifacts:result.artifacts,specialistIds:result.specialistIds});
  const refs=collectHistoryReferences(actor,result.artifacts);
  expect(historyReferencesVisible(actor,refs)).toBe(true);
  expect(executeRecordedTool(actor,conversation.id,callId,'revise_inbox_draft',args,dispatch,requestId)).toEqual(result);
  expect(dispatch).toHaveBeenCalledTimes(1);
  if(change==='incoming')receiveDemoCommunication(actor,{scenarioId:'mike-repair-followup',eventKey:key()});
  else if(change==='relationship')recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Ask for dated support for the repair assumptions.',eventKey:key()});
  else if(change==='preference')saveEmployeeMemory(actor,{tone:'direct',expectedVersion:getEmployeeMemory(actor).version});
  else if(change==='manual_edit')saveInboxDraft(actor,id,{...mutation(id),body:'Use my later correction instead.'});
  else if(change==='discard')discardInboxDraft(actor,id,mutation(id));
  else {const review=reviewInboxSend(actor,id,mutation(id));simulateInboxSend(actor,id,{reviewId:review.id,eventKey:key()});}
  expect(inboxAccessReferenceCurrent(actor,id,[reference])).toBe(false);
  expect(historyReferencesVisible(actor,refs)).toBe(false);
  const current=getConversation(actor,conversation.id).messages.at(-1)!;
  expect(current.content).toMatch(/^This historical message is withheld/);
  expect(current.artifacts).toEqual([]);
  expect(()=>executeRecordedTool(actor,conversation.id,callId,'revise_inbox_draft',args,dispatch,requestId)).toThrow('source context changed');
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
 });

 it('does not mint a current reference for an obsolete rewrite but permits a newly source-bound correction',()=>{
  const saved=savedRewrite(),id=saved.thread.id,old=inboxDraftReference(actor,id)!;
  saveEmployeeMemory(actor,{length:'concise',expectedVersion:getEmployeeMemory(actor).version});
  expect(getInboxThread(actor,id).draft!.copilotRevision!.current).toBe(false);
  expect(inboxDraftReference(actor,id)).toBeNull();
  const current=getInboxThread(actor,id),context=getInboxDraftRevisionContext(actor,id);
  reviseInboxDraft(actor,id,{...mutation(id),draftId:current.draft!.id,draftVersion:current.draft!.version,sourceReference:context.sourceReference!,body:'Mike, which repair details should we clarify first?'});
  const next=inboxDraftReference(actor,id)!;
  expect(next).not.toBe(old);
  expect(inboxAccessReferenceCurrent(actor,id,[next])).toBe(true);
  expect(inboxAccessReferenceCurrent(actor,id,[old])).toBe(false);
 });

 it('keeps references private and rejects malformed or mixed obsolete bindings',()=>{
  const saved=savedRewrite(),id=saved.thread.id,reference=inboxDraftReference(actor,id)!;
  expect(()=>inboxDraftReference(demoActor('manager'),id)).toThrow();
  expect(inboxAccessReferenceCurrent(demoActor('manager'),id,[reference])).toBe(false);
  expect(inboxAccessReferenceCurrent(actor,id,[`${id}|draft-v2|${'0'.repeat(64)}`])).toBe(false);
  expect(inboxAccessReferenceCurrent(actor,id,[reference,`${id}|draft-v1|${'0'.repeat(64)}`])).toBe(false);
 });
});
