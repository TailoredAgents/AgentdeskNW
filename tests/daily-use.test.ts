import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {closeDb,demoActor,getDb,now} from '../src/server/db';
import {createConversation,createTask,getSettings,updateSettings} from '../src/server/services';
import {chat} from '../src/server/orchestrator';
import {findChatRequest,getChatRequest} from '../src/server/chat-requests';
import {getRecordBoard,getRecordDetail} from '../src/server/records';
import {assignInvestor} from '../src/server/intelligence';
import {recordSections} from '../src/lib/record-presentation';
import {formatChannelReply} from '../src/server/messaging-worker';
import {destinationFromArtifact,destinationFromSearch,destinationKinds,nativeLink,parseWorkspaceLink,workspacePath} from '../src/lib/workspace-links';
import {parsePendingChat,pendingChatMatches} from '../src/lib/chat-recovery';
import {createMobilePairing,pairMobileDevice,revokeMobileSession} from '../src/server/mobile-auth';
import {GET} from '../src/app/api/[...path]/route';

beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('AGENTDESK_MOBILE_DEV_ORIGIN','');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_CHANNELS_ENABLED','false');vi.stubEnv('AGENTDESK_CHANNEL_SEND_ENABLED','false');vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','false');});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.restoreAllMocks();});
const count=(table:string)=>(getDb().prepare(`SELECT count(*) n FROM ${table}`).get() as {n:number}).n;
async function phone(path:string,token:string){const url=new URL('http://localhost:3000/api/'+path);return GET(new NextRequest(url,{headers:{host:url.host,authorization:`Bearer ${token}`,'x-agentdesk-request':'1'}}),{params:Promise.resolve({path:url.pathname.slice(5).split('/')})});}

describe('one scoped destination across channels',()=>{
 it.each(destinationKinds)('round-trips the exact %s resource without choosing a different record',kind=>{const target={kind,id:kind==='work'?'work_demo':kind==='updates'?'update_demo':'record-demo_1'};expect(parseWorkspaceLink(nativeLink(target))).toEqual(target);expect(destinationFromSearch(workspacePath(target).slice(1))).toEqual(target);expect(parseWorkspaceLink('https://workspace.example'+workspacePath(target),'https://workspace.example')).toEqual(target);});
 it.each(['agentdesknw://user:password@work/work_demo','agentdesknw://work:80/work_demo','agentdesknw://work/work_demo?approve=yes','agentdesknw://inbox/..%2Fprivate','agentdesknw://task/task_one#action','agentdesknw://admin/user','https://evil.example/?target=investor&id=investor-mike','https://workspace.example/?target=investor&id=one&id=two','https://workspace.example/?work=work_demo&target=task&id=task_other','https://workspace.example/?target=task&id=task_one&approve=yes','https://workspace.example/private?target=task&id=task_one'])('rejects ambiguous or untrusted link %s',url=>{expect(parseWorkspaceLink(url,'https://workspace.example')).toBeNull();});
 it('routes saved record artifacts but keeps proposed business changes on the decision board',()=>{expect(destinationFromArtifact({type:'briefing',id:'investor-mike',title:'Journey'})).toEqual({kind:'investor',id:'investor-mike'});expect(destinationFromArtifact({type:'investors',title:'Qualification',data:{investorId:'investor-mike'}})).toEqual({kind:'investor',id:'investor-mike'});expect(destinationFromArtifact({type:'handoff',id:'preparation_one',title:'Review',data:{preparationId:'preparation_one'}})).toBeNull();expect(destinationFromArtifact({type:'investors',title:'Shortlist',data:[]})).toBeNull();});
 it('short SMS points to one saved result while excerpts always retain the full conversation',()=>{vi.stubEnv('AGENTDESK_CHANNEL_PUBLIC_ORIGIN','https://workspace.example');const artifact={type:'task' as const,id:'task_one',title:'Follow-up'};const short=formatChannelReply('Your follow-up is saved.','sms','conversation_one',[artifact]);expect(short).toContain('/?target=task&id=task_one');expect(short.length).toBeLessThanOrEqual(700);const long=formatChannelReply('One sentence. '.repeat(100),'sms','conversation_one',[artifact]);expect(long).toContain('Full reply: https://workspace.example/?conversation=conversation_one');expect(long).not.toContain('target=task');expect(long.length).toBeLessThanOrEqual(700);});
 it('keeps a complete cost decision when a focused-link label would overflow SMS',()=>{vi.stubEnv('AGENTDESK_CHANNEL_PUBLIC_ORIGIN','https://workspace.example');const text='Scope '.repeat(103)+'Approve A123 / Deny A123';const formatted=formatChannelReply(text,'sms','c',[{type:'work_run',id:'work_'+'a'.repeat(120),title:'Review'}]);expect(formatted).toContain('Approve A123 / Deny A123');expect(formatted).not.toContain('Excerpt:');expect(formatted.length).toBeLessThanOrEqual(700);});
 it('ambiguous multiple artifacts and unsafe configured origins never choose an arbitrary link',()=>{vi.stubEnv('AGENTDESK_CHANNEL_PUBLIC_ORIGIN','https://workspace.example');expect(formatChannelReply('Two tasks.','sms','conversation_one',[{type:'task',id:'task_a',title:'A'},{type:'task',id:'task_b',title:'B'}])).toContain('?conversation=conversation_one');vi.stubEnv('AGENTDESK_CHANNEL_PUBLIC_ORIGIN','https://user:password@workspace.example');expect(formatChannelReply('Saved.','sms','conversation_one',[{type:'task',id:'task_a',title:'A'}])).not.toContain('https:');});
});
describe('current source records on phone and desktop',()=>{
 it('provides current investor context and linked owner follow-ups without performing work',()=>{const actor=demoActor();const task=createTask(actor,{title:'Confirm the repair evidence',investorId:'investor-mike'});const before=count('audit_logs');const detail=getRecordDetail(actor,{kind:'investor',id:'investor-mike'});expect(detail.kind).toBe('investor');const sections=recordSections(detail);expect(sections.find(s=>s.title==='Saved follow-ups')?.links?.some(link=>link.target.id===task.id)).toBe(true);expect(count('audit_logs')).toBe(before);});
 it('rereads changed facts and removes records after ownership changes',()=>{const actor=demoActor(),manager=demoActor('manager');expect(getRecordBoard(actor).investors.some(i=>i.id==='investor-mike')).toBe(true);assignInvestor(manager,'investor-mike',manager.id);expect(getRecordBoard(actor).investors.some(i=>i.id==='investor-mike')).toBe(false);expect(()=>getRecordDetail(actor,{kind:'investor',id:'investor-mike'})).toThrow('authorized');expect(getRecordDetail(manager,{kind:'investor',id:'investor-mike'}).record.id).toBe('investor-mike');});
 it('never grants a manager private employee tasks through a relationship read',()=>{const task=createTask(demoActor(),{title:'Private owner follow-up',investorId:'investor-mike'});const detail=getRecordDetail(demoActor('manager'),{kind:'investor',id:'investor-mike'});expect(JSON.stringify(detail)).not.toContain(task.title);expect(JSON.stringify(detail)).not.toContain(task.id);});
 it('rejects invented membership and inaccessible inventory',()=>{const actor=demoActor();expect(()=>getRecordBoard({...actor,organizationId:'other-org'})).toThrow();expect(()=>getRecordDetail(actor,{kind:'property',id:'missing-property'})).toThrow();expect(getRecordDetail(actor,{kind:'property',id:'property-maple'}).notice).toContain('does not establish permission');});
 it('serves the same current records through a scoped phone session, then rejects revocation',async()=>{const actor=demoActor(),pair=pairMobileDevice({code:createMobilePairing(actor).code,deviceName:'Phase 3 test'});const result=await phone('records/investor/investor-mike',pair.token);expect(result.status).toBe(200);expect((await result.json()).record.id).toBe('investor-mike');expect(result.headers.get('cache-control')).toBe('no-store');assignInvestor(demoActor('manager'),'investor-mike',demoActor('manager').id);expect((await phone('records/investor/investor-mike',pair.token)).status).toBe(404);revokeMobileSession(actor,pair.sessionId);expect((await phone('records',pair.token)).status).toBe(401);});
});
describe('lost response reconciliation without duplicate work',()=>{
 it('recovers a first-turn conversation without creating work or changing its original retry identity',async()=>{
  const actor=demoActor(),message='Remind me to confirm the repair evidence';
  const original=await chat(actor,message,undefined,'first-turn-recovery');
  const before={tasks:count('tasks'),turns:count('assistant_turns'),conversations:count('conversations'),audits:count('audit_logs')};
  const found=findChatRequest(actor,'first-turn-recovery');
  expect(found.status).toBe('completed');expect(found.conversation?.id).toBe(original.conversation.id);
  expect(findChatRequest(actor,'missing-first-turn')).toMatchObject({status:'not_found',conversation:null,messageId:null});
  expect(await chat(actor,message,undefined,'first-turn-recovery')).toEqual(original);
  await expect(chat(actor,message,original.conversation.id,'first-turn-recovery')).rejects.toThrow('different');
  expect({tasks:count('tasks'),turns:count('assistant_turns'),conversations:count('conversations'),audits:count('audit_logs')}).toEqual(before);
 });
 it('first-turn lookup cannot expose another employee request or bypass current source redaction',async()=>{
  const actor=demoActor(),manager=demoActor('manager');
  await chat(actor,'Get me ready to call Mike',undefined,'first-turn-brief');
  expect(findChatRequest(manager,'first-turn-brief')).toMatchObject({status:'not_found',conversation:null});
  expect(()=>findChatRequest({...actor,organizationId:'other-org'},'first-turn-brief')).toThrow();
  expect(()=>findChatRequest({...actor,officeId:'other-office'},'first-turn-brief')).toThrow();
  assignInvestor(manager,'investor-mike',manager.id);
  const result=findChatRequest(actor,'first-turn-brief');
  expect(result.status).toBe('completed');expect(result.conversation?.messages.find(item=>item.id===result.messageId)?.artifacts).toEqual([]);
 });
 it('the authenticated lookup route accepts an omitted conversation but rejects a supplied mismatch',async()=>{
  const actor=demoActor(),pair=pairMobileDevice({code:createMobilePairing(actor).code,deviceName:'First-turn recovery test'});
  const original=await chat(actor,'Show my open reminders.',undefined,'lookup-route-request');
  const before={tasks:count('tasks'),turns:count('assistant_turns'),conversations:count('conversations')};
  const response=await phone('chat/requests/lookup-route-request',pair.token);
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({requestId:'lookup-route-request',status:'completed',conversation:{id:original.conversation.id}});
  expect((await phone(`chat/requests/lookup-route-request?conversationId=${pair.conversationId}`,pair.token)).status).toBe(404);
  expect((await phone('chat/requests/lookup-route-request?conversationId=',pair.token)).status).toBe(400);
  const missing=await phone('chat/requests/missing-first-turn',pair.token);expect(await missing.json()).toMatchObject({status:'not_found',conversation:null});
  expect({tasks:count('tasks'),turns:count('assistant_turns'),conversations:count('conversations')}).toEqual(before);
 });
 it('finds the saved response by original request and does not repeat its effect',async()=>{const actor=demoActor(),conversation=createConversation(actor);await chat(actor,'Remind me to confirm the repair evidence',conversation.id,'phase3-request','mobile');const tasks=count('tasks'),turns=count('assistant_turns');const result=getChatRequest(actor,conversation.id,'phase3-request');expect(result.status).toBe('completed');expect(result.conversation.messages.some(m=>m.id===result.messageId)).toBe(true);getChatRequest(actor,conversation.id,'phase3-request');expect(count('tasks')).toBe(tasks);expect(count('assistant_turns')).toBe(turns);});
 it('unknown and running requests remain distinct and never create or resume work',()=>{const actor=demoActor(),conversation=createConversation(actor);expect(getChatRequest(actor,conversation.id,'missing').status).toBe('not_found');expect(count('assistant_turns')).toBe(0);getDb().prepare('INSERT INTO assistant_turns VALUES(?,?,?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,'running',conversation.id,'test-hash','running',now(),null);expect(getChatRequest(actor,conversation.id,'running').status).toBe('running');expect(count('assistant_tool_receipts')).toBe(0);});
 it('rejects another conversation or employee and rechecks source access in recovered answers',async()=>{const actor=demoActor(),conversation=createConversation(actor),other=createConversation(actor);await chat(actor,'Get me ready to call Mike',conversation.id,'phase3-brief','mobile');expect(()=>getChatRequest(actor,other.id,'phase3-brief')).toThrow('not part');expect(()=>getChatRequest(demoActor('manager'),conversation.id,'phase3-brief')).toThrow();assignInvestor(demoActor('manager'),'investor-mike',demoActor('manager').id);const result=getChatRequest(actor,conversation.id,'phase3-brief');expect(result.status).toBe('completed');expect(result.conversation.messages.find(m=>m.id===result.messageId)?.artifacts).toEqual([]);});
 it('phone can check its original response with no mutation or provider request',async()=>{const actor=demoActor(),pair=pairMobileDevice({code:createMobilePairing(actor).code,deviceName:'Lost response test'});await chat(actor,'Show my open reminders.',pair.conversationId,'phone-request','mobile');const before=count('assistant_turns');const response=await phone(`chat/requests/phone-request?conversationId=${pair.conversationId}`,pair.token);expect(response.status).toBe(200);expect((await response.json()).status).toBe('completed');expect(count('assistant_turns')).toBe(before);});
 it('restored pending requests retain identity and cannot be replaced by changed instructions',()=>{const pending=parsePendingChat(JSON.stringify({requestId:'one',conversationId:'conversation_one',message:'Pause this job'}))!;expect(pendingChatMatches(pending,' Pause this job ','conversation_one')).toBe(true);expect(pendingChatMatches(pending,'Cancel this job','conversation_one')).toBe(false);expect(pendingChatMatches(pending,'Pause this job','conversation_two')).toBe(false);for(const raw of ['not json','{}','{"requestId":"one","message":42}','{"requestId":"one","message":"test","conversationId":false}'])expect(parsePendingChat(raw)).toBeNull();});
});

describe('shared notification preferences',()=>{
 it('preserves another surface’s changes and supports an exact uncertain retry',()=>{const actor=demoActor(),expected=getSettings(actor),before=count('audit_logs');const value=updateSettings(actor,{quietHoursStart:22,quietHoursEnd:7},expected);expect(value.quietHoursStart).toBe(22);expect(count('audit_logs')).toBe(before+1);expect(updateSettings(actor,{quietHoursStart:22,quietHoursEnd:7},expected)).toEqual(value);expect(count('audit_logs')).toBe(before+1);expect(()=>updateSettings(actor,{notifications:false},expected)).toThrow('changed elsewhere');expect(getSettings(demoActor('manager')).quietHoursStart).toBe(21);});
});
