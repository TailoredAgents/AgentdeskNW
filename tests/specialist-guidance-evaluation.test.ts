import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {assistantInstructions,chat,currentTextContext,currentTextScope,toolDefinitions} from '../src/server/orchestrator';
import {availableSpecialistMethods,specialistMethodFingerprint,specialistMethodInstructions,specialistMethodRevision} from '../src/server/specialist-methods';
import {specialistGuidanceEvaluation,withSpecialistGuidanceEvaluation,type SpecialistGuidanceEvaluationMode} from '../src/server/specialist-guidance-evaluation';
import {createConversation} from '../src/server/services';
import {fingerprint,providerOperations} from '../src/server/provider-runtime';

beforeEach(()=>{
 closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.stubEnv('AGENTDESK_AUTH_MODE','demo');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','operational');
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider request in a free isolation test.');}));
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('trusted specialist catalog prompt evaluation',()=>{
 it('preserves ordinary instruction bytes and only omits the catalog payload in the explicit omitted arm',()=>{
  const actor=demoActor(),catalog=JSON.stringify(availableSpecialistMethods(actor));
  const preamble=`Specialist working standards ${specialistMethodRevision}, source docs/AI_EMPLOYEES.md, provisional AgentDesk design, not company policy. Apply relevant standards adaptively; these are not mandatory workflows. Retrieve current evidence through available tools, then choose the useful next action. Examples are fictional teaching examples, never facts about current records or proof of completed work. Tool availability and employee authority still control execution. `;
  expect(specialistMethodInstructions(actor)).toBe(preamble+catalog);
  const ordinary=assistantInstructions(actor);
  expect(withSpecialistGuidanceEvaluation(actor,'included',()=>assistantInstructions(actor))).toBe(ordinary);
  const omitted=withSpecialistGuidanceEvaluation(actor,'omitted',()=>assistantInstructions(actor));
  expect(omitted).toBe(ordinary.replace(catalog,''));
  expect(omitted).toContain(preamble);expect(omitted).toContain('untrusted data');
  expect(omitted).toContain('Separate employee reports and unreviewed recap extraction from confirmed facts');
  expect(specialistGuidanceEvaluation(actor)).toBeUndefined();
 });

 it.each(['dispositions','acquisitions','manager'] as const)('keeps %s facts, tools, entitlement filtering and all other protected scope unchanged',role=>{
  const actor=demoActor(role),conversation=createConversation(actor),context=currentTextContext(actor,conversation.id),scope=currentTextScope(actor,conversation.id),tools=toolDefinitions(),methods=availableSpecialistMethods(actor);
  expect(scope.specialistMethods).toBe(specialistMethodFingerprint());
  const identities=new Set([scope.specialistMethods]);
  for(const mode of ['included','omitted'] as const)withSpecialistGuidanceEvaluation(actor,mode,()=>{
   expect(currentTextContext(actor,conversation.id)).toEqual(context);expect(toolDefinitions()).toEqual(tools);
   expect(availableSpecialistMethods(actor)).toEqual(methods);
   const variant=currentTextScope(actor,conversation.id);
   expect({...variant,specialistMethods:scope.specialistMethods}).toEqual(scope);
   identities.add(variant.specialistMethods);
  });
  expect(identities.size).toBe(3);
  expect(tools.some(tool=>tool.name==='consult_specialist')).toBe(false);
  expect(currentTextScope(actor,conversation.id)).toEqual(scope);
 });

 it('isolates concurrent async scopes and restores nested scopes after return and failure',async()=>{
  const actor=demoActor();let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const omitted=withSpecialistGuidanceEvaluation(actor,'omitted',async()=>{
   await gate;expect(specialistGuidanceEvaluation(actor)?.mode).toBe('omitted');
   expect(withSpecialistGuidanceEvaluation(actor,'included',()=>specialistGuidanceEvaluation(actor)?.mode)).toBe('included');
   expect(specialistGuidanceEvaluation(actor)?.mode).toBe('omitted');
   expect(()=>withSpecialistGuidanceEvaluation(actor,'included',()=>{throw new Error('nested failure');})).toThrow('nested failure');
   expect(specialistGuidanceEvaluation(actor)?.mode).toBe('omitted');
   await expect(withSpecialistGuidanceEvaluation(actor,'included',async()=>{await Promise.resolve();throw new Error('async failure');})).rejects.toThrow('async failure');
   expect(specialistGuidanceEvaluation(actor)?.mode).toBe('omitted');
  });
  expect(specialistGuidanceEvaluation(actor)).toBeUndefined();
  await withSpecialistGuidanceEvaluation(actor,'included',async()=>{await Promise.resolve();expect(specialistGuidanceEvaluation(actor)?.mode).toBe('included');release();await omitted;expect(specialistGuidanceEvaluation(actor)?.mode).toBe('included');});
  expect(specialistGuidanceEvaluation(actor)).toBeUndefined();
 });

 it('rejects cross-employee and forged identities and cannot nest into another employee',()=>{
  const actor=demoActor(),other=demoActor('manager');
  withSpecialistGuidanceEvaluation(actor,'omitted',()=>{
   expect(()=>assistantInstructions(other)).toThrow('cannot change employee identity');
   expect(()=>withSpecialistGuidanceEvaluation(other,'included',()=>null)).toThrow('cannot change employee identity');
   for(const key of ['id','organizationId','officeId','role','name'] as const){
    const forged={...actor,[key]:'not-authorized'} as typeof actor;
    expect(()=>specialistGuidanceEvaluation(forged)).toThrow();
   }
  });
  expect(()=>withSpecialistGuidanceEvaluation(actor,'unknown' as SpecialistGuidanceEvaluationMode,()=>null)).toThrow('Unknown');
  expect(specialistGuidanceEvaluation(other)).toBeUndefined();
 });

 it('preserves ordinary request hashes, accepts exact replays and rejects every cross-mode replay before deduplication',async()=>{
  const actor=demoActor(),message='Hello';
  const modes=[undefined,'included','omitted'] as const;
  for(const mode of modes){
   const conversation=createConversation(actor),requestId=`guidance-${mode??'ordinary'}`;
   const run=(selected:typeof mode)=>selected?withSpecialistGuidanceEvaluation(actor,selected,()=>chat(actor,message,conversation.id,requestId)):chat(actor,message,conversation.id,requestId);
   const initial=await run(mode);expect((await run(mode)).conversation.messages).toEqual(initial.conversation.messages);
   const row=getDb().prepare('SELECT request_hash FROM assistant_turns WHERE request_id=?').get(requestId) as {request_hash:string};
   expect(row.request_hash).toBe(fingerprint({message,conversationId:conversation.id,...(mode?{specialistGuidanceEvaluation:{version:1,mode}}:{})}));
   for(const other of modes.filter(value=>value!==mode))await expect(run(other)).rejects.toMatchObject({status:409});
  }
  expect(fetch).not.toHaveBeenCalled();
 });

 it('binds the actual omitted provider body before the normal durable request and provider hashes',async()=>{
  vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubEnv('OPENAI_MODEL','gpt-6.1-sol');
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'response-guidance-fixture',model:'gpt-6.1-sol',service_tier:'default',status:'completed',output:[{id:'message-guidance-fixture',type:'message',role:'assistant',status:'completed',phase:'final_answer',content:[{type:'output_text',text:'Fictional mocked answer; no business change.',annotations:[]}]}],usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}),{headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',mock);
  const actor=demoActor(),conversation=createConversation(actor),requestId='guidance-provider-body',catalog=JSON.stringify(availableSpecialistMethods(actor));
  await withSpecialistGuidanceEvaluation(actor,'omitted',()=>chat(actor,'Review my current work without changing records.',conversation.id,requestId));
  expect(mock).toHaveBeenCalledTimes(1);
  const body=JSON.parse(mock.mock.calls[0][1].body as string) as {input:Array<{role?:string;content?:string}>};
  const instructions=body.input.find(item=>item.role==='developer')?.content;
  expect(instructions).toBe(withSpecialistGuidanceEvaluation(actor,'omitted',()=>assistantInstructions(actor)));
  expect(instructions).not.toContain(catalog);
  expect(providerOperations(actor)[0]).toMatchObject({status:'succeeded',requestHash:fingerprint(body)});
  const saved=getDb().prepare('SELECT data,scope_hash FROM text_executions WHERE request_id=?').get(requestId) as {data:string;scope_hash:string};
  expect(JSON.parse(saved.data).request.instructions).toBe(instructions);
  expect(saved.scope_hash).not.toBe(fingerprint(currentTextScope(actor,conversation.id)));
  expect(saved.scope_hash).toBe(withSpecialistGuidanceEvaluation(actor,'omitted',()=>fingerprint(currentTextScope(actor,conversation.id))));
 });
});
