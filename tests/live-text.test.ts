import {getKnowledgeState,withdrawKnowledge} from '../src/server/knowledge';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb,demoActor,getDb } from '../src/server/db';
import * as services from '../src/server/services';
import { chat,toolDefinitions } from '../src/server/orchestrator';
import { providerOperations } from '../src/server/provider-runtime';
import { usageBalances } from '../src/server/metering';
import { featureAccess,grantTrial,billingPolicy,saveBillingPolicy } from '../src/server/billing';
import { listReleases,saveRelease } from '../src/server/workflows';
import { specialists } from '../src/server/registry';
import { runLiveText } from '../src/server/text-runtime';

let responseSequence=0;
const message=(text:string,phase:'commentary'|'final_answer'='final_answer')=>({id:`msg-${++responseSequence}`,type:'message',role:'assistant',status:'completed',phase,content:[{type:'output_text',text,annotations:[]}]});
const call=(name:string,args:unknown,callId='call-test')=>({id:`fc-${++responseSequence}`,type:'function_call',status:'completed',name,arguments:JSON.stringify(args),call_id:callId});
const answer=(output:unknown[],extra:Record<string,unknown>={})=>new Response(JSON.stringify({id:`resp-${++responseSequence}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:40,input_tokens_details:{cached_tokens:20},output_tokens_details:{reasoning_tokens:15}},...extra}),{headers:{'content-type':'application/json','x-request-id':`req-mock-${responseSequence}`}});
const requestBody=(mock:ReturnType<typeof vi.fn>,index:number)=>JSON.parse(mock.mock.calls[index][1].body as string) as {input:Array<Record<string,unknown>>;store:boolean;model:string;reasoning:{effort:string};tools:unknown[]};
const results=(mock:ReturnType<typeof vi.fn>,index:number)=>requestBody(mock,index).input.filter(item=>item.type==='function_call_output');
const taskInput={title:'Review this fictional call',dueAt:null,investorId:null};
beforeEach(()=>{
 closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubEnv('OPENAI_MODEL','gpt-6-astra');vi.stubEnv('OPENAI_REASONING_EFFORT','high');
 for(const key of ['AGENTDESK_TEXT_MAX_ROUNDS','AGENTDESK_TEXT_MAX_TOOL_CALLS','AGENTDESK_TEXT_MAX_OUTPUT_TOKENS','AGENTDESK_TEXT_TIMEOUT_MS','AGENTDESK_TEXT_MAX_CONTEXT_BYTES'])vi.stubEnv(key,'');
 responseSequence=0;
});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('live text protocol with mocked Responses',()=>{
 it.each([
  {usage:undefined},{id:undefined},{status:undefined},{status:'in_progress'},
  {model:'unexpected-model'},{service_tier:'priority'},{service_tier:undefined},
  {usage:{input_tokens:10,output_tokens:5,input_tokens_details:{cached_tokens:11}}},
  {usage:{input_tokens:10,output_tokens:5,output_tokens_details:{reasoning_tokens:6}}},
 ])('withholds tools and keeps the allowance hold for an unconfirmed receipt: %j',async extra=>{
  const mock=vi.fn().mockResolvedValue(answer([call('create_task',taskInput)],extra));vi.stubGlobal('fetch',mock);vi.spyOn(console,'error').mockImplementation(()=>{});
  const actor=demoActor();await chat(actor,'Prepare a new reminder',undefined,'unconfirmed-receipt');
  expect(mock).toHaveBeenCalledTimes(1);expect(services.listTasks(actor).some(task=>task.title===taskInput.title)).toBe(false);
  expect(providerOperations(actor)[0].status).toBe('unknown');
  expect(usageBalances(actor).find(item=>item.category==='text_tokens')).toMatchObject({consumed:0});
  expect(usageBalances(actor).find(item=>item.category==='text_tokens')!.reserved).toBeGreaterThan(0);
 });
 it('preserves reasoning, assistant phases and scoped tool outputs throughout a follow-up',async()=>{
  const reasoning={type:'reasoning',id:'rs-context',summary:[],encrypted_content:'opaque-test-context'};
  const mock=vi.fn().mockResolvedValueOnce(answer([reasoning,message('I will review your priorities.','commentary'),call('daily_priorities',{})])).mockResolvedValueOnce(answer([message('Your saved priorities are ready.')])).mockResolvedValueOnce(answer([message('Those priorities remain in your work queue.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const first=await chat(actor,'Review my priorities',undefined,'turn-context-one');
  expect(first.result.specialistIds).toContain('daily-coordinator');expect(first.result.message).toBe('Your saved priorities are ready.');
  const second=requestBody(mock,1);expect(second).toMatchObject({model:'gpt-6-astra',store:false,reasoning:{effort:'high'}});expect(second.input).toContainEqual(reasoning);
  expect(second.input.some(item=>item.type==='message'&&item.phase==='commentary')).toBe(true);expect(JSON.stringify(results(mock,1))).toContain('Confirm Mike');
  await chat(actor,'Where do I find those?',first.conversation.id,'turn-context-two');
  const next=requestBody(mock,2);expect(next.input).toContainEqual(reasoning);expect(next.input.some(item=>item.type==='function_call_output')).toBe(true);expect(next.input.some(item=>item.phase==='final_answer')).toBe(true);
  expect(providerOperations(actor)).toHaveLength(3);expect(providerOperations(actor).every(item=>item.actualCostCents===null)).toBe(true);
 });
 it('recovers replayable provider context after reopening the local database',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-provider-history-'));closeDb();vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'history.sqlite'));
  try{
   const reasoning={type:'reasoning',id:'rs-durable',summary:[],encrypted_content:'opaque-durable-marker'};
   const mock=vi.fn().mockResolvedValueOnce(answer([reasoning,message('Your workspace is ready.')])).mockResolvedValueOnce(answer([message('We can continue.')]));vi.stubGlobal('fetch',mock);
   const actor=demoActor();const first=await chat(actor,'Review my workspace',undefined,'durable-one');closeDb();
   await chat(demoActor(),'Continue our review',first.conversation.id,'durable-two');expect(requestBody(mock,1).input).toContainEqual(reasoning);
  }finally{closeDb();rmSync(directory,{recursive:true,force:true});}
 });
 it('replays a completed request without a second mutation, inference or display message',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(answer([call('create_task',taskInput)])).mockResolvedValueOnce(answer([message('Your task is saved.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const first=await chat(actor,'Create a task to review this call',undefined,'repeatable-turn');
  const second=await chat(actor,'Create a task to review this call',undefined,'repeatable-turn');
  expect(second.conversation.id).toBe(first.conversation.id);expect(second.conversation.messages).toHaveLength(2);expect(mock).toHaveBeenCalledTimes(2);
  expect(services.listTasks(actor).filter(task=>task.title===taskInput.title)).toHaveLength(1);
  await expect(chat(actor,'A different instruction',undefined,'repeatable-turn')).rejects.toThrow(/conflict|different|already/i);
 });
 it('deduplicates repeated tool calls and rejects changed arguments for the same call',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(answer([call('create_task',taskInput,'same-call')])).mockResolvedValueOnce(answer([call('create_task',taskInput,'same-call')])).mockResolvedValueOnce(answer([call('create_task',{...taskInput,title:'Must never be created'},'same-call')])).mockResolvedValueOnce(answer([message('The original task remains saved.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();await chat(actor,'Create one task',undefined,'duplicate-call-turn');
  expect(services.listTasks(actor).filter(task=>task.title===taskInput.title)).toHaveLength(1);expect(services.listTasks(actor).some(task=>task.title==='Must never be created')).toBe(false);
  expect(JSON.stringify(results(mock,3).at(-1))).toMatch(/conflict|different|already/i);
 });
 it('rejects concurrent execution of the same request and preserves one turn',async()=>{
  let finish!:(value:Response)=>void;const mock=vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const pending=chat(actor,'Review priorities',undefined,'concurrent-turn');
  await expect(chat(actor,'Review priorities',undefined,'concurrent-turn')).rejects.toThrow(/respond|running|progress|wait/i);
  finish(answer([message('Ready.')]));const done=await pending;expect(done.conversation.messages).toHaveLength(2);expect(mock).toHaveBeenCalledTimes(1);
 });
 it('withholds opaque context and cached answers when record ownership changes',async()=>{
  const marker='private-history-marker';const reasoning={type:'reasoning',id:'rs-private',summary:[],encrypted_content:'private-opaque-marker'};
  const mock=vi.fn().mockResolvedValueOnce(answer([reasoning,message(marker)])).mockResolvedValueOnce(answer([message('Current authorized records only.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const first=await chat(actor,'Review my authorized records',undefined,'private-turn');
  getDb().prepare('UPDATE investors SET owner_id=? WHERE id=?').run('user-jordan','investor-mike');
  const replay=await chat(actor,'Review my authorized records',undefined,'private-turn');expect(JSON.stringify(replay)).not.toContain(marker);
  await chat(actor,'Review them again',first.conversation.id,'private-follow-up');expect(JSON.stringify(requestBody(mock,1).input)).not.toContain('private-opaque-marker');expect(JSON.stringify(requestBody(mock,1).input)).not.toContain(marker);
 });
 it('rechecks history visibility when ownership changes while inference is pending',async()=>{
  let finish!:(value:Response)=>void;const mock=vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const pending=chat(actor,'Review my authorized records',undefined,'revoked-during-turn');
  getDb().prepare('UPDATE investors SET owner_id=? WHERE id=?').run('user-jordan','investor-mike');
  finish(answer([message('private-inflight-marker')]));const response=await pending;expect(JSON.stringify(response)).not.toContain('private-inflight-marker');
 });
 it('does not persist copied private facts through a generic tool after in-flight access revocation',async()=>{
  let finish!:(value:Response)=>void;const mock=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;})).mockResolvedValue(answer([message('The task was prepared.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const pending=chat(actor,'Create a reminder from my investor details',undefined,'revoked-tool-turn');
  getDb().prepare('UPDATE investors SET owner_id=? WHERE id=?').run('user-jordan','investor-mike');
  finish(answer([call('create_task',{...taskInput,title:'private-inflight-task-fact'})]));await pending;
  expect(services.listTasks(actor).some(task=>task.title==='private-inflight-task-fact')).toBe(false);expect(mock).toHaveBeenCalledTimes(1);
 });
 it('withholds an in-flight answer when its role guidance is withdrawn',async()=>{
  let finish!:(value:Response)=>void;const mock=vi.fn().mockResolvedValueOnce(answer([call('knowledge_search',{query:'buyer repair concern'})])).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',mock);
  const actor=demoActor(),pending=chat(actor,'Use our current guidance to plan the next buyer follow-up',undefined,'guidance-withdrawn-turn');
  await vi.waitFor(()=>expect(mock).toHaveBeenCalledTimes(2));const doc=getKnowledgeState(demoActor('manager')).documents[0];withdrawKnowledge(demoActor('manager'),{id:doc.id,expectedVersion:doc.version,reason:'The source needs correction.',eventKey:'withdraw-during-model'});
  finish(answer([message('obsolete-guidance-marker')]));const response=await pending;expect(JSON.stringify(response)).not.toContain('obsolete-guidance-marker');
 });
 it('does not transmit a stale context when scope changed before provider admission',async()=>{
  const actor=demoActor(),conversation=services.createConversation(actor,'Scope changes before inference');const mock=vi.fn().mockResolvedValue(answer([message('Unreachable answer.')]));vi.stubGlobal('fetch',mock);
  await expect(runLiveText({actor,conversationId:conversation.id,requestId:'stale-initial-context',message:'Review my work',instructions:'Test instructions',context:{sensitive:'do not transmit stale facts'},scope:{permission:'previous'},currentScope:()=>({permission:'revoked'}),history:[],tools:[],dispatch:()=>({message:'Should not execute',specialistIds:[],artifacts:[]}),artifacts:[],specialists:new Set()})).rejects.toThrow(/changed|context|scope|permissions/i);
  expect(mock).not.toHaveBeenCalled();expect(providerOperations(actor)).toHaveLength(0);expect(usageBalances(actor).find(item=>item.category==='text_tokens')?.reserved).toBe(0);
 });
 it('enforces company restrictions even when a model requests included research',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(answer([call('research_investors',{address:'123 Example Street',county:'Cobb',price:235000,strategy:'Fix & flip',propertyType:null,limit:25})])).mockResolvedValueOnce(answer([message('Investor Hunter is restricted by your organization.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor(),admin=demoActor('manager'),policy=billingPolicy(admin);policy.restricted=['investor-hunter'];saveBillingPolicy(admin,policy);const response=await chat(actor,'Research new buyers',undefined,'denied-premium');
  expect(services.listJobs(actor)).toHaveLength(0);expect(featureAccess(actor,'investor-hunter').allowed).toBe(false);expect(response.result.artifacts.some(item=>item.type==='marketplace')).toBe(true);expect(JSON.stringify(results(mock,1))).toContain('Restricted');
 });
 it('keeps acquisition context behind company access and returns saved releases without changing them',async()=>{
  const acquisitions=demoActor('acquisitions'),manager=demoActor('manager'),policy=billingPolicy(manager);policy.restricted=['acquisition-disposition'];saveBillingPolicy(manager,policy);
  const mock=vi.fn().mockResolvedValueOnce(answer([call('acquisition_context',{releaseId:null},'acq-denied')])).mockResolvedValueOnce(answer([message('This capability is restricted by your organization.')]));vi.stubGlobal('fetch',mock);
  const denied=await chat(acquisitions,'Review my acquisition handoffs',undefined,'acq-core-only');expect(denied.result.artifacts.some(item=>item.type==='marketplace')).toBe(true);expect(JSON.stringify(results(mock,1))).toContain('Restricted');
  policy.restricted=[];saveBillingPolicy(manager,policy);
  for(const actor of [acquisitions,manager])grantTrial(manager,{userId:actor.id,features:['acquisition-disposition']});
  const release=saveRelease(acquisitions,{propertyId:'property-maple',status:'draft',source:'Fictional acquisition source for protocol testing',eventKey:'acq-protocol-release',propertyType:'Single-family',description:'Fictional property requiring a reviewed handoff.',notes:'Draft, not published.',mediaUrl:null,mediaAccess:'unverified',arv:null,repairEstimate:null,economicsSource:'',showingInstructions:'',authorizedUserIds:[],upstreamParty:'Fictional seller',upstreamStage:'Review pending',downstreamStage:'',closingStructure:'unspecified',closingAt:null});
  const before=JSON.stringify(listReleases(manager));
  for(const [index,actor] of [acquisitions,manager].entries()){
   mock.mockResolvedValueOnce(answer([call('acquisition_context',{releaseId:release.id},`acq-authorized-${index}`)])).mockResolvedValueOnce(answer([message('Your saved draft needs a closing date and handoff milestone.')]));
   const result=await chat(actor,'Review the saved acquisition release',undefined,`acq-authorized-turn-${index}`);expect(result.result.specialistIds).toContain('acquisition-disposition');expect(result.result.artifacts).toContainEqual({type:'release',id:release.id,title:release.property.address});
   const tool=JSON.parse(results(mock,3+index*2).at(-1)!.output as string) as {data:Array<{id:string;status:string;source:string;missing:string[]}>;message:string};
   expect(tool.data[0]).toMatchObject({id:release.id,status:'draft',source:'Fictional acquisition source for protocol testing'});expect(tool.data[0].missing).toContain('Closing date');expect(tool.data[0].missing).toContain('Disposition milestone');expect(tool.message).toContain('No release was published or changed');
  }
  expect(JSON.stringify(listReleases(manager))).toBe(before);
 });
 it('preserves sixteen specialists with honest local implementation status',()=>{
  expect(specialists).toHaveLength(16);expect(specialists.filter(item=>item.status!=='planned')).toHaveLength(16);
  expect(specialists.filter(item=>item.status==='planned').map(item=>item.id).sort()).toEqual([]);
  expect(specialists.filter(item=>item.status==='planned').every(item=>item.tools.length===0)).toBe(true);expect(toolDefinitions().some(tool=>tool.name==='acquisition_context')).toBe(true);
 });
 it('only prepares a CRM note and refuses a model-generated approval',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(answer([call('prepare_crm_note',{investorId:'investor-mike',transcript:'Mike said he wants cosmetic flips in Cobb County and will review the details.'},'note-call')])).mockResolvedValueOnce(answer([call('approve_action',{id:'invented-approval'},'approval-call')])).mockResolvedValueOnce(answer([message('Your note needs human review.')]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const before=services.listInvestors(actor).find(item=>item.id==='investor-mike')!.notes;await chat(actor,'Prepare notes from my conversation',undefined,'approval-boundary');
  expect(services.listInvestors(actor).find(item=>item.id==='investor-mike')!.notes).toBe(before);expect(services.listApprovals(actor).some(item=>item.kind==='crm_note'&&item.status==='pending')).toBe(true);expect(JSON.stringify(results(mock,2).at(-1))).toMatch(/Unknown|unavailable/i);
 });
 it('preserves completed work when a later provider round fails',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(answer([call('create_task',taskInput)])).mockRejectedValueOnce(new Error('private-provider-error-body'));vi.stubGlobal('fetch',mock);vi.spyOn(console,'error').mockImplementation(()=>{});
  const actor=demoActor();const response=await chat(actor,'Save this task',undefined,'partial-turn');expect(response.result.artifacts.some(item=>item.type==='task')).toBe(true);expect(services.listTasks(actor).filter(task=>task.title===taskInput.title)).toHaveLength(1);expect(response.result.message).not.toContain('private-provider-error-body');expect(mock).toHaveBeenCalledTimes(2);expect(providerOperations(actor).some(item=>item.status==='unknown')).toBe(true);
 });
 it('counts reasoning-only incomplete output and does not claim the request completed',async()=>{
  const mock=vi.fn().mockResolvedValue(answer([{type:'reasoning',id:'rs-incomplete',summary:[],encrypted_content:'opaque-incomplete'}],{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:8000,output_tokens_details:{reasoning_tokens:8000}}}));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const response=await chat(actor,'Review this work',undefined,'incomplete-turn');expect(mock).toHaveBeenCalledTimes(1);expect(response.result.message).toMatch(/limit|incomplete|budget|finish|truncat/i);expect(usageBalances(actor).find(item=>item.category==='text_tokens')?.consumed).toBe(8100);expect(response.result.artifacts).toEqual([]);
 });
 it.each(['incomplete','in_progress'])('does not execute a %s function call inside a malformed completed envelope',async(status)=>{
  const mock=vi.fn().mockResolvedValueOnce(answer([{...call('create_task',taskInput),status}])).mockResolvedValueOnce(answer([message('Task created.')]));vi.stubGlobal('fetch',mock);vi.spyOn(console,'error').mockImplementation(()=>{});
  const actor=demoActor();await chat(actor,'Create a task',undefined,`partial-call-${status}`);expect(services.listTasks(actor).some(task=>task.title===taskInput.title)).toBe(false);expect(mock).toHaveBeenCalledTimes(1);
 });
 it('does not present an incomplete assistant message as a completed final answer',async()=>{
  const mock=vi.fn().mockResolvedValue(answer([{...message('Unfinished final-answer marker'),status:'incomplete'}]));vi.stubGlobal('fetch',mock);vi.spyOn(console,'error').mockImplementation(()=>{});
  const result=await chat(demoActor(),'Review my work',undefined,'partial-final-message');expect(result.result.message).not.toContain('Unfinished final-answer marker');
 });
 it('returns an explicit refusal without executing work',async()=>{
  const refusal='I cannot help with that request.';const mock=vi.fn().mockResolvedValue(answer([{type:'message',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'refusal',refusal}]}]));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const count=services.listTasks(actor).length;const response=await chat(actor,'A request the provider refuses',undefined,'refusal-turn');expect(response.result.message).toContain(refusal);expect(services.listTasks(actor)).toHaveLength(count);expect(mock).toHaveBeenCalledTimes(1);
 });
 it('keeps missing provider usage unknown and reserved instead of recording zero consumption',async()=>{
  const mock=vi.fn().mockResolvedValue(answer([message('Your question is answered.')],{usage:undefined}));vi.stubGlobal('fetch',mock);
  const actor=demoActor();const response=await chat(actor,'A simple question',undefined,'unknown-usage');expect(response.result.message).toContain('receipt could not be confirmed');expect(response.result.message).not.toContain('Your question is answered.');expect(providerOperations(actor)[0]).toMatchObject({status:'unknown',usage:{},actualCostCents:null});expect(usageBalances(actor).find(item=>item.category==='text_tokens')?.reserved).toBeGreaterThan(0);
 });
 it('rejects malformed output while preserving invalid token usage as unresolved',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(answer('invalid-output' as unknown as unknown[])).mockResolvedValueOnce(answer([message('The answer has an unresolved usage receipt.')],{usage:{input_tokens:-1,output_tokens:10}}));vi.stubGlobal('fetch',mock);vi.spyOn(console,'error').mockImplementation(()=>{});
  const actor=demoActor();const malformed=await chat(actor,'Malformed response',undefined,'invalid-output');await chat(actor,'Invalid usage receipt',undefined,'invalid-usage');expect(malformed.result.message).toMatch(/failed|invalid|could not/i);expect(usageBalances(actor).find(item=>item.category==='text_tokens')).toMatchObject({consumed:140});expect(usageBalances(actor).find(item=>item.category==='text_tokens')?.reserved).toBeGreaterThan(0);expect(providerOperations(actor).find(item=>item.operationId==='text:invalid-usage:0')).toMatchObject({status:'unknown',usage:{}});
 });
 it('bounds tool loops and keeps nested strict schemas closed',async()=>{
  const checkSchema=(schema:unknown):void=>{
   if(!schema||typeof schema!=='object')return;const object=schema as Record<string,unknown>;
   if(object.type==='object'){expect(object.additionalProperties).toBe(false);expect(object.required??[]).toEqual(Object.keys(object.properties as object));}
   for(const value of Object.values(object))if(Array.isArray(value))value.forEach(checkSchema);else if(value&&typeof value==='object')checkSchema(value);
  };
  toolDefinitions().forEach(tool=>checkSchema(tool.parameters));vi.stubEnv('AGENTDESK_TEXT_MAX_ROUNDS','2');
  const mock=vi.fn().mockImplementation(()=>Promise.resolve(answer([call('daily_priorities',{},`loop-${responseSequence}`)])));vi.stubGlobal('fetch',mock);const response=await chat(demoActor(),'Keep checking priorities',undefined,'bounded-loop');expect(mock).toHaveBeenCalledTimes(2);expect(response.result.message).toMatch(/limit|review|completed/i);
 });
});
