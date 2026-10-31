import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor,ToolResult} from '../src/lib/contracts';
import type {CommunicationAccount,InboxThread} from '../src/lib/communications-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInboxState,getInboxThread,receiveDemoCommunication} from '../src/server/communications';
import {createInboxFollowUp,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {chat,dispatchTool,toolDefinitions} from '../src/server/orchestrator';
import {getConversation,listTasks} from '../src/server/services';
import {executeRecordedTool} from '../src/server/text-runtime';

let actor:Actor;let responseSequence=0;
const company=(coverage:CommunicationAccount['source']['coverage']='mailbox')=>{
 const state=getInboxState(actor),account=state.accounts.find(item=>item.source.system==='salesforce'&&item.source.coverage===coverage)!;
 return state.threads.find(thread=>thread.accountId===account.id)!;
};
const tool=(name:string,args:unknown,id:string)=>({type:'function_call',name,arguments:JSON.stringify(args),call_id:id});
const answer=(output:unknown[])=>new Response(JSON.stringify({id:`fixture-response-${++responseSequence}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:50,output_tokens:20}}));
const message=(text:string)=>({type:'message',content:[{type:'output_text',text}]});
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');actor=demoActor();});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('Salesforce company email through the shared Copilot',()=>{
 it('finds company email explicitly while retaining all private accounts for an unqualified inbox request',async()=>{
  const state=getInboxState(actor),thread=company();
  const listed=await chat(actor,'show my company email',undefined,'company-list');
  expect(listed.result.artifacts).toHaveLength(3);
  for(const artifact of listed.result.artifacts)expect(state.accounts.find(account=>account.id===state.threads.find(item=>item.id===artifact.id)?.accountId)?.source.system).toBe('salesforce');
  const found=await chat(actor,'find Mike company email',listed.conversation.id,'company-find');
  expect(found.result.artifacts).toMatchObject([{id:thread.id,type:'inbox'}]);
  const searched=await chat(actor,'search my company email for repair',listed.conversation.id,'company-search');
  expect(searched.result.artifacts).toMatchObject([{id:thread.id,type:'inbox'}]);
  const all=await chat(actor,'show my inbox',listed.conversation.id,'all-inbox');
  expect(all.result.artifacts).toHaveLength(state.threads.length);
  const external=await dispatchTool(actor,'inbox_search',{query:'',channel:'email',source:'external',limit:12});
  expect(external.artifacts.every(artifact=>!listed.result.artifacts.some(item=>item.id===artifact.id))).toBe(true);
  const schema=toolDefinitions().find(item=>item.name==='inbox_search')!;
  expect(schema.parameters.required).toContain('source');expect(schema.parameters.additionalProperties).toBe(false);
 });

 it('reads, drafts and proposes in one conversation across dashboard, Slack and SMS, leaving exact approval to the inbox',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);const thread=company();
  const read=await chat(actor,'read Mike company email',undefined,'company-read');
  expect(read.result.message).toContain('Source:');expect(read.result.message).toContain('repair');
  expect(read.result.artifacts).toMatchObject([{id:thread.id,type:'inbox'}]);
  const draft=await chat(actor,'draft reply to Mike company email',read.conversation.id,'company-draft','slack');
  expect(draft.conversation.id).toBe(read.conversation.id);expect(draft.result.message).toContain('not sent');
  const saved=getInboxThread(actor,thread.id);expect(saved.draft?.body).toContain('repair breakdown');expect(saved.draft?.body).toContain('cannot yet confirm');
  const before=listTasks(actor).length;
  const proposed=await chat(actor,`propose company email follow-up for ${thread.id}`,read.conversation.id,'company-followup','sms');
  expect(proposed.result.message).toContain('No task');expect(listTasks(actor)).toHaveLength(before);
  const assistance=await dispatchTool(actor,'propose_inbox_followup',{threadId:thread.id});
  const suggestion=(assistance.data as {suggestedFollowUp:{messageId:string;title:string;dueAt:null}}).suggestedFollowUp;
  const reviewed=reviewInboxSend(actor,thread.id,{expectedVersion:saved.thread.version,eventKey:'review-company-reply'});
  const sent=simulateInboxSend(actor,thread.id,{reviewId:reviewed.id,eventKey:'company-simulation'});
  expect(sent.receipt.status).toBe('simulated_sent');expect(sent.detail.messages.at(-1)?.body).toBe(saved.draft?.body);
  const task=createInboxFollowUp(actor,thread.id,{expectedVersion:sent.detail.thread.version,eventKey:'review-company-task',...suggestion});
  expect(task.task.investorId).toBe('investor-mike');expect(listTasks(actor)).toHaveLength(before+1);
  expect(fetch).not.toHaveBeenCalled();
 });

 it('clarifies an unqualified Mike and never routes a company draft through a personal mailbox',async()=>{
  const result=await chat(actor,"draft reply to Mike's email",undefined,'ambiguous-company');
  expect(result.result.message).toContain('More than one');
  expect(result.result.artifacts.some(artifact=>artifact.id===company().id)).toBe(true);
  expect(getInboxState(actor,{filter:'drafts'}).threads).toHaveLength(0);
  const external=getInboxState(actor).threads.find(thread=>thread.correspondent.name==='Mike Bennett'&&thread.accountId!==company().accountId)!;
  await expect(dispatchTool(actor,'prepare_inbox_reply',{threadId:external.id,expectedVersion:external.version},{conversationId:result.conversation.id,requestId:'wrong-source',message:'draft reply to Mike company email'})).rejects.toThrow(/exact inbox/);
 });

 it('returns headers without body-derived claims or actions and keeps the permitted metadata response readable',async()=>{
  const thread=company('headers_only');
  const read=await chat(actor,`read ${thread.id}`,undefined,'company-headers');
  expect(read.result.message).toContain('body were not captured');expect(read.result.message).not.toContain('withheld');
  const data=(await dispatchTool(actor,'inbox_thread',{threadId:thread.id})).data as {bodyAccess:string;messages:{body:string}[];suggestedObservation:unknown;suggestedFollowUp:unknown;suggestedReply:{eligible:boolean};sources:{kind:string}[]};
  expect(data.bodyAccess).toBe('headers_only');expect(data.messages.every(item=>item.body==='')).toBe(true);
  expect(data.suggestedObservation).toBeNull();expect(data.suggestedFollowUp).toBeNull();expect(data.suggestedReply.eligible).toBe(false);expect(data.sources.every(item=>item.kind==='message')).toBe(true);
  await expect(dispatchTool(actor,'prepare_inbox_reply',{threadId:thread.id,expectedVersion:thread.version},{conversationId:read.conversation.id,requestId:'header-draft',message:`draft reply to ${thread.id}`})).rejects.toThrow(/Headers only/);
  expect(getInboxThread(actor,thread.id).draft).toBeNull();
 });

 it('permits a captured-activity local draft but does not promise or approve a sending route',async()=>{
  const thread=company('crm_activity'),result=await chat(actor,`draft reply to ${thread.id}`,undefined,'activity-draft');
  expect(result.result.message).toContain('no sending route');
  const detail=getInboxThread(actor,thread.id);expect(detail.draft).not.toBeNull();
  expect(()=>reviewInboxSend(actor,thread.id,{expectedVersion:detail.thread.version,eventKey:'activity-review'})).toThrow(/sending route/);
  for(const name of ['review_inbox_send','approve_inbox_send','simulate_inbox_send','send_company_email'])await expect(dispatchTool(actor,name,{threadId:thread.id})).rejects.toThrow('Unknown');
  const refused=await chat(actor,`approve and send ${thread.id}`,result.conversation.id,'activity-chat-send');
  expect(refused.result.message).toContain('cannot approve');
 });

 it('rechecks account access for old results, history and tool receipts, including after restoration',async()=>{
  const thread=company(),read=await chat(actor,`read ${thread.id}`,undefined,'revoke-company-read');
  const result=await dispatchTool(actor,'inbox_thread',{threadId:thread.id});
  const cached=()=>executeRecordedTool(actor,read.conversation.id,'company-cached-read','inbox_thread',{threadId:thread.id},()=>result,'company-cached-request');cached();
  receiveDemoCommunication(actor,{scenarioId:'company-revoke-access',eventKey:'revoke-company'});
  expect(getConversation(actor,read.conversation.id).messages.at(-1)?.content).toContain('withheld');
  expect(()=>cached()).toThrow(/Access.*changed/);
  const replay=await chat(actor,`read ${thread.id}`,undefined,'revoke-company-read');expect(replay.result.message).toContain('withheld');
  await expect(dispatchTool(actor,'inbox_thread',{threadId:thread.id})).rejects.toThrow(/revoked/);
  receiveDemoCommunication(actor,{scenarioId:'company-restore-access',eventKey:'restore-company'});
  expect(()=>cached()).toThrow(/Access.*changed/);
  const refreshed=await chat(actor,`read ${thread.id}`,read.conversation.id,'restored-company-read');
  expect(refreshed.result.message).toContain('Source:');expect(refreshed.result.message).not.toContain('withheld');
  expect(getConversation(actor,read.conversation.id).messages.filter(item=>item.role==='assistant')[0].content).toContain('withheld');
 });

 it('withholds body-bearing search, draft and read receipts after a capability downgrade while allowing a fresh headers-only view',async()=>{
  const thread=company(),read=await chat(actor,`draft reply to ${thread.id}`,undefined,'downgrade-draft');
  const results:ToolResult[]=[await dispatchTool(actor,'inbox_search',{query:'Mike',channel:'email',source:'company',limit:12}),await dispatchTool(actor,'inbox_thread',{threadId:thread.id})];
  const replay=(index:number)=>executeRecordedTool(actor,read.conversation.id,`downgrade-cache-${index}`,'inbox_thread',{threadId:thread.id},()=>results[index],`downgrade-request-${index}`);results.forEach((_,index)=>replay(index));
  const account=getInboxThread(actor,thread.id).account;
  getDb().prepare('UPDATE communication_accounts SET data=? WHERE id=?').run(JSON.stringify({...account,source:{...account.source,coverage:'headers_only'},accessVersion:account.accessVersion+1}),account.id);
  results.forEach((_,index)=>expect(()=>replay(index)).toThrow(/Access.*changed/));
  expect(getConversation(actor,read.conversation.id).messages.at(-1)?.content).toContain('withheld');
  const next=await chat(actor,`read ${thread.id}`,read.conversation.id,'downgraded-fresh-read');
  expect(next.result.message).toContain('body were not captured');expect(next.result.message).not.toContain('repair breakdown');
  expect(getInboxThread(actor,thread.id).draft).toBeNull();
 });

 it('removes opaque model state and old body excerpts after revocation without putting mailbox bodies into context',async()=>{
  const thread=company();vi.stubEnv('OPENAI_API_KEY','mock-key');
  const opaque={type:'reasoning',id:'company-private-reasoning',summary:[],encrypted_content:'company-private-opaque'};
  const mock=vi.fn().mockResolvedValueOnce(answer([tool('inbox_thread',{threadId:thread.id},'company-read')])).mockResolvedValueOnce(answer([opaque,message('Private company source excerpt: repair breakdown.')])).mockResolvedValueOnce(answer([message('Company source access is unavailable.')]));vi.stubGlobal('fetch',mock);
  const first=await chat(actor,`read ${thread.id}`,undefined,'opaque-company-read');
  receiveDemoCommunication(actor,{scenarioId:'company-revoke-access',eventKey:'revoke-opaque-company'});
  await chat(actor,'show my company email',first.conversation.id,'opaque-company-revoked');
  const next=JSON.parse(mock.mock.calls[2][1].body as string);
  expect(JSON.stringify(next.input)).not.toContain('company-private-opaque');expect(JSON.stringify(next.input)).not.toContain('Private company source excerpt');
  const firstInput=JSON.parse(mock.mock.calls[0][1].body as string).input;
  expect(JSON.stringify(firstInput)).not.toContain('Fictional company email for the Salesforce workflow demonstration');
 });

 it('keeps company sources private when another employee or office manager requests them',async()=>{
  const thread=company(),manager=demoActor('manager');
  await expect(dispatchTool(manager,'inbox_thread',{threadId:thread.id})).rejects.toThrow(/private|not found/);
  const result=await dispatchTool(manager,'inbox_search',{query:'Mike',channel:'email',source:'company',limit:12});
  expect((result.data as {threads:InboxThread[]}).threads.some(item=>item.id===thread.id)).toBe(false);
 });
});
