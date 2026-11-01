import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Artifact} from '../src/lib/contracts';
import {closeDb,demoActor,getDb,now} from '../src/server/db';
import {getInboxState,getInboxThread,receiveDemoCommunication,saveInboxDraft} from '../src/server/communications';
import {prepareInboxReply} from '../src/server/communications-workflow';
import {addMessage,createConversation,getConversation} from '../src/server/services';
import {dispatchTool} from '../src/server/orchestrator';
import {employeeRequestedInboxRevision} from '../src/server/inbox-conversation';
import {getEmployeeMemory} from '../src/server/memory';

let sequence=0;const key=()=>`inbox-rewrite-authority-${++sequence}`;
const actor=()=>demoActor();
const tick=()=>vi.advanceTimersByTime(20);
const thread=()=>{const state=getInboxState(actor());return state.threads.find(item=>item.accountId===state.preferredAccountId)!;};
const command=(conversationId:string,message='Keep it casual and shorter.')=>({conversationId,message,requestId:key()});
async function shownDraft(shape:'flat'|'nested'='flat'){
 const item=thread(),detail=prepareInboxReply(actor(),item.id,{expectedVersion:item.version,eventKey:key()});
 const conversation=createConversation(actor()),read=await dispatchTool(actor(),'inbox_thread',{threadId:item.id});
 const artifacts=read.artifacts.map(artifact=>{
  const data:Record<string,unknown>={...(artifact.data as Record<string,unknown>),threadVersion:detail.thread.version};
  if(shape==='nested'){delete data.draftId;delete data.draftVersion;data.draft={id:detail.draft!.id,version:detail.draft!.version};}
  else {delete data.draft;data.draftId=detail.draft!.id;data.draftVersion=detail.draft!.version;}
  return {...artifact,data};
 });
 addMessage(actor(),conversation.id,{role:'assistant',content:'Here is your saved draft. Nothing has been sent.',artifacts});tick();
 return {detail,conversationId:conversation.id,artifacts};
}
beforeEach(()=>{closeDb();sequence=0;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider request');}));});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('current employee authority to rewrite a saved Inbox draft',()=>{
 it.each(['flat','nested'] as const)('accepts a direct current style or body edit with %s saved draft identity',async shape=>{
  const f=await shownDraft(shape),before=getInboxThread(actor(),f.detail.thread.id);
  for(const message of ['Keep it casual and shorter.','Make it shorter and more direct.','Yes, please rewrite this draft to sound more natural.','Could you please shorten the saved reply?','Edit this draft to say I will follow up tomorrow.','Reword this reply to ask whether repair details are available.']){
   expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,command(f.conversationId,message)),message).toBe(true);
  }
  expect(getInboxThread(actor(),f.detail.thread.id)).toEqual(before);expect(getEmployeeMemory(actor()).version).toBe(0);expect(fetch).not.toHaveBeenCalled();
 });
 it('accepts an explicit uniquely named current draft without borrowing another conversation focus',async()=>{
  const f=await shownDraft(),name=f.detail.thread.correspondent.name.split(' ')[0],unrelated=createConversation(actor());
  for(const message of [`Rewrite ${name}’s company email draft to sound more natural.`,`Rewrite ${f.detail.thread.id} to be shorter.`])expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,command(unrelated.id,message))).toBe(true);
  const ambiguous=`Rewrite ${name}’s email draft to sound more natural.`;
  expect(employeeRequestedInboxRevision(actor(),ambiguous,f.detail.thread.id,command(f.conversationId,ambiguous))).toBe(false);
 });
 it('requires an existing ordinary draft even for explicit names',async()=>{
  const item=thread(),conversation=createConversation(actor()),read=await dispatchTool(actor(),'inbox_thread',{threadId:item.id});addMessage(actor(),conversation.id,{role:'assistant',content:'This is the current email.',artifacts:read.artifacts});tick();
  for(const message of ['Keep it casual.',`Rewrite ${item.id} to be shorter.`])expect(employeeRequestedInboxRevision(actor(),message,item.id,command(conversation.id,message))).toBe(false);
  expect(getInboxThread(actor(),item.id).draft).toBeNull();
 });
 it('cannot rewrite another thread or use a different employee message as its authority',async()=>{
  const f=await shownDraft(),other=getInboxState(actor()).threads.find(item=>item.id!==f.detail.thread.id)!;
  expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',other.id,command(f.conversationId,'Keep it casual.'))).toBe(false);
  expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',f.detail.thread.id,command(f.conversationId,'Do not change it.'))).toBe(false);
  expect(()=>employeeRequestedInboxRevision(demoActor('manager'),'Keep it casual.',f.detail.thread.id,command(f.conversationId,'Keep it casual.'))).toThrow();
 });
 it.each([
  '"Rewrite this draft."','“Keep it casual.”','Mike said rewrite this draft.','If I wanted to rewrite this draft, could you?','Do not rewrite this draft.','Don’t rewrite this draft.','Rewrite this draft but don’t save it.','Rewrite this draft as a preview.','Rewrite this draft to say hello, just show me the wording.','Make it shorter from now on.','Keep it casual and remember that style.','Rewrite my weekly business plan to be shorter.','Rewrite this draft to Sarah.','Rewrite this draft with a new subject.','Rewrite this draft and add an attachment.','Rewrite this draft to open title.','Rewrite this draft to share the property.','Rewrite this draft to mention the asking price.','Rewrite this draft to mention the property address.','Rewrite this draft to mention the repair estimate.','Rewrite this draft to mention the seller terms.','Rewrite this draft to mention the deposit.','Rewrite this draft to mention the signed contract.','Rewrite this draft to say I will follow up tomorrow, and send it.'
 ])('does not treat %s as authority for this ordinary saved rewrite',async message=>{
  const f=await shownDraft();expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,command(f.conversationId,message))).toBe(false);expect(getEmployeeMemory(actor()).version).toBe(0);
 });
 it('rejects missing, mismatched or stale shown draft metadata even when the current thread version is supplied',async()=>{
  const f=await shownDraft();
  for(const identity of [{},{draftId:f.detail.draft!.id,draftVersion:f.detail.draft!.version+1},{draftId:'another-draft',draftVersion:f.detail.draft!.version},{draft:{id:f.detail.draft!.id,version:f.detail.draft!.version},draftId:'another-draft',draftVersion:f.detail.draft!.version}]){
   const artifacts=f.artifacts.map(item=>({...item,data:{threadVersion:f.detail.thread.version,...identity}}));addMessage(actor(),f.conversationId,{role:'assistant',content:'A saved draft link.',artifacts});tick();
   expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',f.detail.thread.id,command(f.conversationId,'Keep it casual.'))).toBe(false);
  }
 });
 it('does not rebind old shown wording after a new employee edit or incoming message',async()=>{
  const f=await shownDraft();saveInboxDraft(actor(),f.detail.thread.id,{expectedVersion:f.detail.thread.version,eventKey:key(),body:'My newer saved wording.'});
  expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',f.detail.thread.id,command(f.conversationId,'Keep it casual.'))).toBe(false);
  const fresh=await shownDraft();receiveDemoCommunication(actor(),{scenarioId:'company-repair-followup',eventKey:key()});
  expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',fresh.detail.thread.id,command(fresh.conversationId,'Keep it casual.'))).toBe(false);
 });
 it('does not borrow focus through unrelated results, multiple threads, lost access or an expired view',async()=>{
  const f=await shownDraft(),other=getInboxState(actor()).threads.find(item=>item.id!==f.detail.thread.id)!;
  for(const extra of [{type:'task',id:'unrelated-task',title:'Other work'},{type:'inbox',id:other.id,title:'Another email'}] as Artifact[]){addMessage(actor(),f.conversationId,{role:'assistant',content:'Choose a result.',artifacts:[...f.artifacts,extra]});tick();expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',f.detail.thread.id,command(f.conversationId,'Keep it casual.'))).toBe(false);}
  const fresh=await shownDraft();receiveDemoCommunication(actor(),{scenarioId:'company-revoke-access',eventKey:key()});expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',fresh.detail.thread.id,command(fresh.conversationId,'Keep it casual.'))).toBe(false);
  receiveDemoCommunication(actor(),{scenarioId:'company-restore-access',eventKey:key()});expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',fresh.detail.thread.id,command(fresh.conversationId,'Keep it casual.'))).toBe(false);
  const current=await shownDraft();vi.advanceTimersByTime(24*60*60_000+1);expect(employeeRequestedInboxRevision(actor(),'Keep it casual.',current.detail.thread.id,command(current.conversationId,'Keep it casual.'))).toBe(false);
 });
 it.each(['slack','sms'])('requires a current delivered draft reference before a %s employee follow-up',async provider=>{
  const f=await shownDraft(),latest=getConversation(actor(),f.conversationId).messages.at(-1)!,message='Keep it casual and shorter.',inbound={...command(f.conversationId,message),receivedAt:now()};
  expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,inbound)).toBe(false);
  const a=actor(),link=`rewrite-${provider}`;getDb().prepare('INSERT INTO messaging_links(id,organization_id,office_id,user_id,provider,account_id,external_id,address,active,opted_out,reminders,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,0,0,?,?)').run(link,a.organizationId,a.officeId,a.id,provider,'FICTIONAL-ACCOUNT','FICTIONAL-EMPLOYEE',provider==='sms'?'+14045550123':'DFICTIONAL',latest.createdAt,latest.createdAt);
  getDb().prepare("INSERT INTO messaging_outbox(id,link_id,dedupe_key,kind,reference_id,body,status,created_at,updated_at) VALUES(?,?,?,'reply',?,?,'accepted',?,?)").run('rewrite-delivery',link,key(),latest.id,'Fictional delivered draft excerpt',latest.createdAt,latest.createdAt);
  expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,inbound)).toBe(true);
  getDb().prepare("UPDATE messaging_outbox SET status='unknown' WHERE id='rewrite-delivery'").run();expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,inbound)).toBe(false);
  getDb().prepare("UPDATE messaging_outbox SET status='delivered',updated_at=? WHERE id='rewrite-delivery'").run(inbound.receivedAt);expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,inbound)).toBe(false);
  getDb().prepare("UPDATE messaging_outbox SET updated_at=? WHERE id='rewrite-delivery'").run(latest.createdAt);getDb().prepare('UPDATE messaging_links SET opted_out=1 WHERE id=?').run(link);expect(employeeRequestedInboxRevision(actor(),message,f.detail.thread.id,inbound)).toBe(false);
 });
});
