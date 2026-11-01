import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor,getDb,now} from '../src/server/db';
import {getInboxState,getInboxThread,receiveDemoCommunication} from '../src/server/communications';
import {addMessage,createConversation,getConversation} from '../src/server/services';
import {chat,dispatchTool} from '../src/server/orchestrator';
import {employeeRequestedInboxReply,focusedInboxReplyThread,requestsFocusedInboxReply} from '../src/server/inbox-conversation';
import {getEmployeeMemory} from '../src/server/memory';

let sequence=0;const key=()=>`inbox-continuity-${++sequence}`;
const actor=()=>demoActor();
const thread=()=>{const inbox=getInboxState(actor());return inbox.threads.find(item=>item.accountId===inbox.preferredAccountId)!;};
const tick=()=>vi.advanceTimersByTime(20);
async function shown(){const item=thread(),read=await chat(actor(),`read ${item.id}`,undefined,key());tick();return {thread:item,conversationId:read.conversation.id};}
const command=(conversationId:string,message='Draft that.')=>({conversationId,message,requestId:key()});
beforeEach(()=>{closeDb();sequence=0;vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider request');}));});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('current inbox source continuity',()=>{
 it('prepares the previously inspected exact reply from a short follow-up and replays once',async()=>{
  const f=await shown(),requestId=key(),before=getInboxThread(actor(),f.thread.id);
  const result=await chat(actor(),'Yes, draft that.',f.conversationId,requestId);
  const saved=getInboxThread(actor(),f.thread.id);expect(saved.draft?.body).toBeTruthy();expect(result.result.artifacts[0].id).toBe(f.thread.id);expect(saved.messages).toEqual(before.messages);
  await chat(actor(),'Yes, draft that.',f.conversationId,requestId);expect(getInboxThread(actor(),f.thread.id).draft).toEqual(saved.draft);expect(fetch).not.toHaveBeenCalled();
 });
 it('lets a single current search result identify the reply, but not multiple threads for one person',async()=>{
  const item=thread(),conversation=createConversation(actor()),single=await dispatchTool(actor(),'inbox_search',{query:item.subject,source:'company',channel:'email',limit:12});
  expect(single.artifacts).toHaveLength(1);addMessage(actor(),conversation.id,{role:'assistant',content:single.message,artifacts:single.artifacts});tick();
  expect(focusedInboxReplyThread(actor(),command(conversation.id,'Draft a reply to that.'))).toBe(item.id);
  const all=await dispatchTool(actor(),'inbox_search',{query:'Mike',source:null,channel:null,limit:12});expect(all.artifacts.length).toBeGreaterThan(1);
  addMessage(actor(),conversation.id,{role:'assistant',content:all.message,artifacts:all.artifacts});tick();
  expect(focusedInboxReplyThread(actor(),command(conversation.id))).toBeNull();
 });
 it('does not bind a changed thread to an old reference',async()=>{
  const f=await shown();receiveDemoCommunication(actor(),{scenarioId:'company-repair-followup',eventKey:key()});
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
  await expect(dispatchTool(actor(),'prepare_inbox_reply',{threadId:f.thread.id,expectedVersion:getInboxThread(actor(),f.thread.id).thread.version},command(f.conversationId))).rejects.toThrow('clear draft request');
  expect(getInboxThread(actor(),f.thread.id).draft).toBeNull();
 });
 it.each(['briefing','task','release'] as const)('clarifies omitted draft targets when the same answer also includes a %s subject',async(type)=>{
  const f=await shown(),source=await dispatchTool(actor(),'inbox_thread',{threadId:f.thread.id});
  addMessage(actor(),f.conversationId,{role:'assistant',content:'I can help with either next step.',artifacts:[...source.artifacts,{type,...(type==='briefing'?{id:'investor-sarah'}:{}),title:'Another current subject'}]});tick();
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
  await expect(dispatchTool(actor(),'prepare_inbox_reply',{threadId:f.thread.id,expectedVersion:f.thread.version},command(f.conversationId))).rejects.toThrow('clear draft request');
  expect(getInboxThread(actor(),f.thread.id).draft).toBeNull();
  expect(employeeRequestedInboxReply(actor(),'Draft a reply to Mike’s company email.',f.thread.id,command(f.conversationId))).toBe(true);
  expect(employeeRequestedInboxReply(actor(),`Draft a reply to ${f.thread.id}.`,f.thread.id,command(f.conversationId))).toBe(true);
 });
 it('allows duplicate links to the same inbox subject and harmless display guidance',async()=>{
  const f=await shown(),source=await dispatchTool(actor(),'inbox_thread',{threadId:f.thread.id});
  addMessage(actor(),f.conversationId,{role:'assistant',content:'Review this reply.',artifacts:[...source.artifacts,...source.artifacts,{type:'guidance',title:'Review the supporting source'}]});tick();
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBe(f.thread.id);
 });
 it('does not fall back past a newer unrelated answer or use another conversation',async()=>{
  const f=await shown();expect(focusedInboxReplyThread(actor(),command(createConversation(actor()).id))).toBeNull();
  addMessage(actor(),f.conversationId,{role:'assistant',content:'We are discussing your priorities now.'});tick();
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
 });
 it('preserves a current source through a brief no-tool follow-up, but stops on a real topic change',async()=>{
  const f=await shown();addMessage(actor(),f.conversationId,{role:'user',content:'What would you do next?'});tick();
  addMessage(actor(),f.conversationId,{role:'assistant',content:'I would address his repair question before another property pitch.'});tick();
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBe(f.thread.id);
  addMessage(actor(),f.conversationId,{role:'user',content:'Actually, tell me about Sarah instead.'});tick();
  addMessage(actor(),f.conversationId,{role:'assistant',content:'Her rental priorities need a separate review.'});tick();
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
 });
 it.each(['briefing','investors'] as const)('preserves the inbox source through current same-investor %s evidence after a brief follow-up',async(type)=>{
  const f=await shown();addMessage(actor(),f.conversationId,{role:'user',content:'What would you do next?'});tick();
  addMessage(actor(),f.conversationId,{role:'assistant',content:'Address the repair question before another pitch.',artifacts:[{type,id:'investor-mike',title:'Current relationship evidence'}]});tick();
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBe(f.thread.id);
  const reply=await chat(actor(),'Draft a reply to that.',f.conversationId,key());expect(reply.result.artifacts[0].id).toBe(f.thread.id);expect(getInboxThread(actor(),f.thread.id).draft).not.toBeNull();
 });
 it('rejects a same-investor evidence bridge after a named topic change or a generic investor list',async()=>{
  const f=await shown();addMessage(actor(),f.conversationId,{role:'user',content:'Show Mike’s latest property matches instead.'});tick();
  addMessage(actor(),f.conversationId,{role:'assistant',content:'Here is his current relationship.',artifacts:[{type:'briefing',id:'investor-mike',title:'Mike'}]});tick();
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
  const fresh=await shown();addMessage(actor(),fresh.conversationId,{role:'user',content:'What would you do next?'});tick();
  addMessage(actor(),fresh.conversationId,{role:'assistant',content:'Here are several possibilities.',artifacts:[{type:'investors',title:'CRM investor list'}]});tick();
  expect(focusedInboxReplyThread(actor(),command(fresh.conversationId))).toBeNull();
 });
 it('does not carry an inbox source through a newer structured result or unlimited conversational detours',async()=>{
  const f=await shown();for(let i=0;i<3;i++){
   addMessage(actor(),f.conversationId,{role:'user',content:'Tell me more.'});tick();addMessage(actor(),f.conversationId,{role:'assistant',content:'Review the source before making a commitment.'});tick();
  }
  expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
  const fresh=await shown();addMessage(actor(),fresh.conversationId,{role:'user',content:'What would you do next?'});tick();
  addMessage(actor(),fresh.conversationId,{role:'assistant',content:'This now concerns a different record.',artifacts:[{type:'briefing',id:'investor-sarah',title:'Different source'}]});tick();
  expect(focusedInboxReplyThread(actor(),command(fresh.conversationId))).toBeNull();
 });
 it('rejects revoked, restored-but-obsolete and expired source references',async()=>{
  const f=await shown();receiveDemoCommunication(actor(),{scenarioId:'company-revoke-access',eventKey:key()});expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
  receiveDemoCommunication(actor(),{scenarioId:'company-restore-access',eventKey:key()});expect(focusedInboxReplyThread(actor(),command(f.conversationId))).toBeNull();
  const current=await shown();vi.advanceTimersByTime(24*60*60_000+1);expect(focusedInboxReplyThread(actor(),command(current.conversationId))).toBeNull();
 });
 it('does not turn a quoted request, hypothetical, changed recipient or style instruction into draft authority',async()=>{
  const f=await shown();for(const text of ['"Draft that."','If I wanted to draft that, could you?','Do not draft that.','Mike said draft that.','Draft this reply to Sarah.','Keep it casual.','Yeah, keep it casual.']){
   expect(requestsFocusedInboxReply(text),text).toBe(false);
   await expect(dispatchTool(actor(),'prepare_inbox_reply',{threadId:f.thread.id,expectedVersion:f.thread.version},command(f.conversationId,text))).rejects.toThrow('clear draft request');
  }
  expect(getInboxThread(actor(),f.thread.id).draft).toBeNull();expect(getEmployeeMemory(actor()).version).toBe(0);
 });
 it('cannot use another employee’s conversation or silently retarget the model argument',async()=>{
  const f=await shown();expect(()=>focusedInboxReplyThread(demoActor('manager'),command(f.conversationId))).toThrow();
  const different=getInboxState(actor()).threads.find(item=>item.id!==f.thread.id)!;
  await expect(dispatchTool(actor(),'prepare_inbox_reply',{threadId:different.id,expectedVersion:different.version},command(f.conversationId))).rejects.toThrow('clear draft request');
  expect(getInboxThread(actor(),different.id).draft).toBeNull();
 });
 it('requires a current accepted delivery before the inbound timestamp for channel follow-ups',async()=>{
  const f=await shown(),latest=getConversation(actor(),f.conversationId).messages.at(-1)!;
  const inbound={...command(f.conversationId),receivedAt:now()};expect(focusedInboxReplyThread(actor(),inbound)).toBeNull();
  const a=actor(),link='focused-slack';getDb().prepare('INSERT INTO messaging_links(id,organization_id,office_id,user_id,provider,account_id,external_id,address,active,opted_out,reminders,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,0,0,?,?)').run(link,a.organizationId,a.officeId,a.id,'slack','TFICTIONAL','UFICTIONAL','DFICTIONAL',latest.createdAt,latest.createdAt);
  getDb().prepare("INSERT INTO messaging_outbox(id,link_id,dedupe_key,kind,reference_id,body,status,created_at,updated_at) VALUES(?,?,?,'reply',?,?,'accepted',?,?)").run('focused-reply',link,key(),latest.id,'Fictional delivered excerpt',latest.createdAt,latest.createdAt);
  expect(focusedInboxReplyThread(actor(),inbound)).toBe(f.thread.id);
  getDb().prepare("UPDATE messaging_outbox SET status='unknown' WHERE id='focused-reply'").run();expect(focusedInboxReplyThread(actor(),inbound)).toBeNull();
  getDb().prepare("UPDATE messaging_outbox SET status='accepted',updated_at=? WHERE id='focused-reply'").run(inbound.receivedAt);expect(focusedInboxReplyThread(actor(),inbound)).toBeNull();
  getDb().prepare("UPDATE messaging_outbox SET updated_at=? WHERE id='focused-reply'").run(latest.createdAt);getDb().prepare('UPDATE messaging_links SET active=0 WHERE id=?').run(link);expect(focusedInboxReplyThread(actor(),inbound)).toBeNull();
 });
});
