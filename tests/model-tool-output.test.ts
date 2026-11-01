import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ToolResult} from '../src/lib/contracts';
import {serializeModelToolResult} from '../src/server/model-tool-output';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {fingerprint,providerOperations} from '../src/server/provider-runtime';
import {assertInboxToolResultVisible} from '../src/server/history';
import {recordJourneyObservation} from '../src/server/journey';

const result=(data:unknown,artifactData:unknown[]):ToolResult=>({specialistIds:['buyer-matchmaker'],message:'Fictional evidence; not permission to act.',data,artifacts:artifactData.map((value,index)=>({type:'briefing',title:`Evidence ${index}`,data:value}))});
describe('lossless model tool serialization',()=>{
 it('keeps artifacts and unique debrief/source information intact without mutating the service result',()=>{
  const data={investorId:'investor-mike',facts:[{text:'Fictional supplied fact',verified:false}],source:{revision:3}},artifact={...data,debriefs:[{id:'debrief-private'}],documentAccessReference:'exact-source'};
  const original=result(data,[artifact]),before=JSON.stringify(original);
  Object.freeze(original);Object.freeze(original.artifacts);Object.freeze(data);Object.freeze(artifact);
  const projected=JSON.parse(serializeModelToolResult(original));
  expect(projected).toEqual({message:original.message,specialistIds:original.specialistIds,artifacts:original.artifacts});
  expect(projected.artifacts[0].data).toEqual(artifact);expect(JSON.stringify(original)).toBe(before);
 });
 it('requires one complete identical source and preserves every unique top-level field',()=>{
  for(const original of [
   result({a:1,b:2},[{a:1},{b:2}]),
   result({a:1,b:2},[{a:1,b:3}]),
   result({a:1,unique:{source:'not repeated'}},[{a:1}]),
   result({rows:[1,2]},[{rows:[2,1]}]),
   result({nested:{a:1,b:2}},[{nested:{b:2,a:1}}]),
  ])expect(serializeModelToolResult(original)).toBe(JSON.stringify(original));
 });
 it('removes an exact repeated array but retains partial or differently ordered arrays',()=>{
  const data=[{id:'investor-a',note:'Unverified'}, {id:'investor-b',note:'Paused'}],original=result(data,[structuredClone(data)]);
  expect(JSON.parse(serializeModelToolResult(original))).not.toHaveProperty('data');
  for(const other of [data.slice(0,1),[...data].reverse()])expect(serializeModelToolResult(result(data,[other]))).toBe(JSON.stringify(result(data,[other])));
 });
 it('preserves absent, scalar and nonrepeated data byte for byte',()=>{
  for(const data of [undefined,null,'same text',42,true,{only:'one place'}]){
   const original=result(data,[data&&typeof data==='object'?{}:data]);expect(serializeModelToolResult(original)).toBe(JSON.stringify(original));
  }
 });
});

let sequence=0;
const reply=(output:unknown[])=>new Response(JSON.stringify({id:`projection-response-${++sequence}`,model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:0}}}),{headers:{'content-type':'application/json'}});
const call=(name:string,args:unknown,id:string)=>reply([{type:'function_call',name,arguments:JSON.stringify(args),call_id:id,status:'completed'}]);
const final=()=>reply([{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Existing buyers and the current fictional relationship are ready to review.'}]}]);
type Item={type?:string;call_id?:string;output?:string};
type Payload={input:Item[];[key:string]:unknown};
const savedResults=(conversationId:string)=>getDb().prepare('SELECT call_id,result FROM assistant_tool_receipts WHERE conversation_id=? ORDER BY rowid').all(conversationId) as {call_id:string;result:string}[];

beforeEach(()=>{
 closeDb();sequence=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubEnv('OPENAI_MODEL','gpt-6-astra');vi.stubEnv('OPENAI_REASONING_EFFORT','high');vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','operational');
 vi.stubEnv('AGENTDESK_TEXT_MAX_ROUNDS','5');vi.stubEnv('AGENTDESK_TEXT_MAX_INPUT_TOKENS','30000');vi.stubEnv('AGENTDESK_TEXT_MAX_OUTPUT_TOKENS','512');vi.stubEnv('AGENTDESK_TEXT_MAX_CONTEXT_BYTES','300000');
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No real provider request is permitted.');}));
});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('new model outputs with full durable receipts and authority',()=>{
 it.each(['operational','admitted_demo'] as const)('projects new outputs before %s hashing/dispatch and preserves exact replay',async mode=>{
  vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE',mode);
  vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS',JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional projection test tariff',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000,cached_input_tokens:0,output_tokens:1000}}]));
  const responses=[()=>call('match_buyers',{propertyId:'property-maple'},'projection-match'),()=>call('investor_journey',{investorId:'investor-mike'},'projection-journey'),final],payloads:Payload[]=[],counts:Payload[]=[];
  const fetcher=vi.fn(async(url:unknown,options:{body:string})=>{
   const payload=JSON.parse(options.body) as Payload;
   if(String(url).endsWith('/input_tokens')){counts.push(payload);return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:1000}));}
   payloads.push(payload);return responses.shift()!();
  });vi.stubGlobal('fetch',fetcher);
  const actor=demoActor(),requestId=`projection-${mode}`,message='Compare the existing buyers for 123 Example Street and review Mike’s current relationship. Do not change records.';
  const answer=await chat(actor,message,undefined,requestId);expect(payloads).toHaveLength(3);
  const receipts=savedResults(answer.conversation.id);expect(receipts).toHaveLength(2);
  const savedState=JSON.parse((getDb().prepare('SELECT data FROM text_executions WHERE request_id=?').get(requestId) as {data:string}).data) as {artifacts:ToolResult['artifacts']};
  for(const receipt of receipts){
   const full=JSON.parse(receipt.result) as ToolResult,wire=payloads[2].input.find(item=>item.type==='function_call_output'&&item.call_id===receipt.call_id)!;
   expect(full.data).toBeDefined();expect(wire.output).toBe(serializeModelToolResult(full));
   const projected=JSON.parse(wire.output!) as ToolResult;expect(projected).not.toHaveProperty('data');expect(projected.artifacts).toEqual(full.artifacts);
   for(const artifact of full.artifacts){expect(savedState.artifacts).toContainEqual(artifact);const {data,...link}=artifact;void data;expect(answer.result.artifacts).toContainEqual(link);}
   assertInboxToolResultVisible(actor,projected.artifacts);
  }
  const match=JSON.parse(receipts[0].result) as ToolResult,projectedMatch=JSON.parse(serializeModelToolResult(match)) as ToolResult;
  expect((projectedMatch.artifacts[0].data as {buyerShortlistReference:string}).buyerShortlistReference).toMatch(/^property-maple@/);
  const journey=JSON.parse(receipts[1].result) as ToolResult;expect(journey.artifacts[0].data).toHaveProperty('debriefs');
  payloads.forEach((payload,index)=>expect(providerOperations(actor).find(operation=>operation.operationId===`text:${requestId}:${index}`)?.requestHash).toBe(fingerprint(payload)));
  if(mode==='admitted_demo'){
   expect(counts).toHaveLength(3);payloads.forEach((payload,index)=>{const {max_output_tokens,service_tier,store,include,...counted}=payload;void max_output_tokens;void service_tier;void store;void include;expect(counts[index]).toEqual(counted);});
  }else expect(counts).toHaveLength(0);
  const before=getDb().prepare('SELECT data FROM text_executions WHERE request_id=?').get(requestId),calls=fetcher.mock.calls.length;
  expect(await chat(actor,message,undefined,requestId)).toEqual(answer);expect(fetcher).toHaveBeenCalledTimes(calls);expect(savedResults(answer.conversation.id)).toEqual(receipts);expect(getDb().prepare('SELECT data FROM text_executions WHERE request_id=?').get(requestId)).toEqual(before);
  recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Fictional correction: repair costs need clarification.',eventKey:`projection-source-${mode}`});
  expect(()=>assertInboxToolResultVisible(actor,projectedMatch.artifacts)).toThrow('source context changed');
 });

 it('leaves existing cached model output strings intact instead of retroactively projecting them',async()=>{
  const responses=[()=>call('match_buyers',{propertyId:'property-maple'},'legacy-match'),final,final];
  const fetcher=vi.fn(async()=>responses.shift()!());vi.stubGlobal('fetch',fetcher);
  const actor=demoActor(),first=await chat(actor,'Compare existing buyers for 123 Example Street.',undefined,'projection-legacy-first');
  const receipt=savedResults(first.conversation.id)[0],cached=getDb().prepare('SELECT items FROM assistant_context WHERE conversation_id=?').get(first.conversation.id) as {items:string};
  const items=JSON.parse(cached.items) as Item[];items.find(item=>item.type==='function_call_output'&&item.call_id===receipt.call_id)!.output=receipt.result;
  // Simulate a context saved by the previous serializer, with both complete copies.
  getDb().prepare('UPDATE assistant_context SET items=? WHERE conversation_id=?').run(JSON.stringify(items),first.conversation.id);
  const executionBefore=getDb().prepare('SELECT data FROM text_executions WHERE request_id=?').get('projection-legacy-first');
  await chat(actor,'Summarize those existing results; no new tools needed.',first.conversation.id,'projection-legacy-next');
  const payload=JSON.parse((fetcher.mock.calls[2] as unknown as [unknown,{body:string}])[1].body) as Payload;
  expect(payload.input.find(item=>item.type==='function_call_output'&&item.call_id===receipt.call_id)?.output).toBe(receipt.result);
  expect(savedResults(first.conversation.id)).toEqual([receipt]);expect(getDb().prepare('SELECT data FROM text_executions WHERE request_id=?').get('projection-legacy-first')).toEqual(executionBefore);
  expect(fetcher).toHaveBeenCalledTimes(3);
 });
});
