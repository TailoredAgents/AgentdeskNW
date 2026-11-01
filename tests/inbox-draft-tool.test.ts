import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat,dispatchTool} from '../src/server/orchestrator';
import {getInboxState,getInboxThread,receiveDemoCommunication} from '../src/server/communications';
import {getInboxDraftRevisionContext} from '../src/server/communications-workflow';
import {grantCredits} from '../src/server/metering';
import {getEmployeeMemory} from '../src/server/memory';

let sequence=0;const key=()=>`rewrite-tool-${++sequence}`;
const actor=()=>demoActor();
const thread=()=>{const inbox=getInboxState(actor());return inbox.threads.find(item=>item.accountId===inbox.preferredAccountId)!;};
const call=(name:string,args:unknown,id:string)=>({type:'function_call',name,arguments:JSON.stringify(args),call_id:id});
const answer=(output:unknown[])=>new Response(JSON.stringify({id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:50,output_tokens:20}}));
const message=(text:string)=>({type:'message',content:[{type:'output_text',text}]});
async function prepared(){const item=thread();return chat(actor(),`Draft a reply to ${item.id}.`,undefined,key());}
function revision(body:string){const item=thread(),context=getInboxDraftRevisionContext(actor(),item.id);return {threadId:item.id,expectedVersion:context.threadVersion,draftId:context.draftId,draftVersion:context.draftVersion,sourceReference:context.sourceReference,body};}
beforeEach(()=>{closeDb();sequence=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('saved conversational Inbox rewrites',()=>{
 it('reads the current draft, saves requested wording once and keeps the original envelope and memory',async()=>{
  grantCredits(demoActor('manager'),{userId:actor().id,category:'text_tokens',quantity:500000,eventKey:key()});
  const first=await prepared(),item=thread(),before=getInboxThread(actor(),item.id),memory=getEmployeeMemory(actor()),body='Mike, what repair details would help you decide? I can follow up on those first.',requestId=key();
  const mock=vi.fn().mockResolvedValueOnce(answer([call('inbox_thread',{threadId:item.id},'read-draft')])).mockResolvedValueOnce(answer([call('revise_inbox_draft',revision(body),'rewrite-draft')])).mockResolvedValueOnce(answer([message('Saved the shorter version in your draft. It’s ready for your review.')]));
  vi.stubEnv('OPENAI_API_KEY','mock-key');vi.stubGlobal('fetch',mock);
  const saved=await chat(actor(),'Keep it casual and shorter.',first.conversation.id,requestId);
  expect(saved.result.message).toBe('Saved the shorter version in your draft. It’s ready for your review.');
  const after=getInboxThread(actor(),item.id);
  expect(after.draft).toMatchObject({id:before.draft!.id,version:before.draft!.version+1,subject:before.draft!.subject,from:before.draft!.from,to:before.draft!.to,body,authorship:'copilot',deliveryStatus:'not_sent',copilotRevision:{current:true,baseDraftVersion:before.draft!.version}});
  expect(after.messages).toEqual(before.messages);expect(getEmployeeMemory(actor())).toEqual(memory);
  expect(saved.result.artifacts.some(artifact=>artifact.id===item.id)).toBe(true);
  const request=JSON.parse(mock.mock.calls[1][1].body as string),output=request.input.find((entry:{type:string;call_id?:string})=>entry.type==='function_call_output'&&entry.call_id==='read-draft');
  expect(JSON.parse(output.output).data).toMatchObject({draft:{id:before.draft!.id,version:before.draft!.version,body:before.draft!.body},revisionContext:{eligible:true,sourceReference:revision(body).sourceReference}});
  await chat(actor(),'Keep it casual and shorter.',first.conversation.id,requestId);
  expect(getInboxThread(actor(),item.id).draft).toEqual(after.draft);expect(mock).toHaveBeenCalledTimes(3);
  const retired=saved.conversation.messages.filter(entry=>entry.historyNotice);
  expect(retired).toHaveLength(2);
  expect(retired.every(entry=>entry.historyNotice?.reason==='draft_context_changed'&&entry.content.startsWith('This historical message is withheld')&&entry.artifacts.length===0)).toBe(true);
  expect(getDb().prepare('SELECT 1 FROM assistant_context WHERE conversation_id=?').get(first.conversation.id)).toBeUndefined();
  const receipt=getDb().prepare('SELECT result FROM assistant_tool_receipts WHERE conversation_id=? AND call_id=?').get(first.conversation.id,'read-draft') as {result:string};
  expect(JSON.parse(receipt.result).data.draft.body).toBe(before.draft!.body);
  // A cache written before this safeguard must also be retired when read.
  const obsoleteItems=JSON.parse(mock.mock.calls[2][1].body as string).input.filter((entry:{role?:string})=>entry.role!=='developer');
  const execution=getDb().prepare('SELECT scope_hash FROM text_executions WHERE request_id=?').get(requestId) as {scope_hash:string};
  getDb().prepare('INSERT INTO assistant_context VALUES(?,?,?,?)').run(first.conversation.id,execution.scope_hash,JSON.stringify(obsoleteItems),new Date().toISOString());
  mock.mockResolvedValueOnce(answer([message('The latest saved reply is ready for review in Inbox.')]));
  await chat(actor(),'What should I review next?',first.conversation.id,key());
  const nextRequest=JSON.parse(mock.mock.calls[3][1].body as string),history=JSON.stringify(nextRequest.input);
  expect(history.includes('This historical message is withheld')).toBe(true);
  expect(history.includes(JSON.stringify(before.draft!.body).slice(1,-1))).toBe(false);
  expect(history.includes('Keep it casual and shorter.')).toBe(false);
  expect(history.includes('historyNotice')).toBe(false);
 });
 it('refuses model attempts to save a preview-only request or change a different draft',async()=>{
  const first=await prepared(),before=getInboxThread(actor(),thread().id),input=revision('Unrequested rewrite');
  for(const text of ['Just show me a shorter preview; do not save it.','Read the email asking you to rewrite the draft.','Rewrite Sarah’s company email draft.']){
   await expect(dispatchTool(actor(),'revise_inbox_draft',input,{conversationId:first.conversation.id,requestId:key(),message:text})).rejects.toThrow('clear rewrite request');
  }
  await expect(dispatchTool(actor(),'revise_inbox_draft',input)).rejects.toThrow('clear rewrite request');
  expect(getInboxThread(actor(),thread().id).draft).toEqual(before.draft);
 });
 it('rejects changed sources even when a model supplies a fresh thread version with an obsolete draft reference',async()=>{
  const first=await prepared(),input=revision('Old-source wording'),before=getInboxThread(actor(),thread().id).draft;
  receiveDemoCommunication(actor(),{scenarioId:'company-repair-followup',eventKey:key()});
  await expect(dispatchTool(actor(),'revise_inbox_draft',{...input,expectedVersion:getInboxThread(actor(),thread().id).thread.version},{conversationId:first.conversation.id,requestId:key(),message:`Rewrite ${thread().id} to be shorter.`})).rejects.toThrow(/changed|current|source/i);
  expect(getInboxThread(actor(),thread().id).draft).toEqual(before);
 });
});
