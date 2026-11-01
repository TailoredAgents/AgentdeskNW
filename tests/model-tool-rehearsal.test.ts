import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareActualToolRehearsal,runActualToolRehearsal,inspectActualToolRehearsal,actualRehearsalTransport} from '../scripts/model-tool-rehearsal';
import type {EvaluationTransport} from '../evaluations/specialists/runner';
import {closeDb} from '../src/server/db';

let root='';
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'agentdesk-tool-rehearsal-test-'));vi.stubEnv('OPENAI_API_KEY','mock-test-key-never-sent');vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();rmSync(root,{recursive:true,force:true});});
function fakeTransport(forbidden=false){
 let sequence=0;
 const count=vi.fn(async()=>({status:200,body:JSON.stringify({object:'response.input_tokens',input_tokens:1000})}));
 const create=vi.fn(async(body:string)=>{
  const payload=JSON.parse(body) as {input:Record<string,unknown>[]};
  const prompt=String(payload.input.find(item=>item.role==='user')?.content);
  const second=payload.input.some(item=>item.type==='function_call_output');
  let name:string,args:Record<string,unknown>;
  if(forbidden){name='create_task';args={title:'Unauthorized model task',dueAt:null,investorId:null};}
  else if(prompt.includes('123 Example Street')){name='match_buyers';args={propertyId:'property-maple'};}
  else if(prompt.includes('Preview Lane')){name='opportunity_review';args={opportunityId:prompt.match(/\(([^)]+)\)/)![1]};}
  else{name='handoff_overview';args={};}
  const output=second?[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'The fictional saved source was reviewed. No business changes or messages were made.'}]}]:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:`call-${++sequence}`,status:'completed'}];
  return {status:200,body:JSON.stringify({id:`response-${++sequence}`,model:'gpt-6.1-sol',service_tier:'default',status:'completed',output,usage:{input_tokens:1000,output_tokens:60,input_tokens_details:{cached_tokens:0}}})};
 });
 return {count,create} satisfies EvaluationTransport;
}

describe('bounded actual-chat rehearsal with fictional provider transport',()=>{
 it('uses the actual role tools and persists six receipts while exact replay makes no extra requests',async()=>{
  const prepared=await prepareActualToolRehearsal(root,'three-roles'),transport=fakeTransport();
  expect(prepared.maximumUsd).toBe(1.26864);expect(transport.create).not.toHaveBeenCalled();
  const result=await runActualToolRehearsal(root,'three-roles',{planHash:prepared.planHash,maximumCents:999},transport);
  expect(result).toMatchObject({verifiedScenarios:3,status:'completed',attemptedCalls:6});
  expect(transport.count).toHaveBeenCalledTimes(6);expect(transport.create).toHaveBeenCalledTimes(6);
  const evidence=JSON.parse(readFileSync(result.evidenceFile,'utf8'));
  expect(evidence.results.map((item:{toolNames:string[]})=>item.toolNames)).toEqual([['match_buyers'],['opportunity_review'],['handoff_overview']]);
  expect(evidence.results.every((item:{replayVerified:boolean})=>item.replayVerified)).toBe(true);
  expect(JSON.stringify(evidence)).not.toContain('mock-test-key-never-sent');
  expect(inspectActualToolRehearsal(root,'three-roles')).toMatchObject({execution:{status:'completed',scenariosCompleted:3}});
  await expect(runActualToolRehearsal(root,'three-roles',{planHash:prepared.planHash,maximumCents:999},transport)).rejects.toThrow('already started');
  expect(transport.create).toHaveBeenCalledTimes(6);
 });
 it('rejects modified initial fixture evidence before any counting or generation',async()=>{
  const prepared=await prepareActualToolRehearsal(root,'tampered'),transport=fakeTransport();
  writeFileSync(join(prepared.directory,'fixture-material.json'),'{}');
  await expect(runActualToolRehearsal(root,'tampered',{planHash:prepared.planHash,maximumCents:999},transport)).rejects.toThrow('immutable fixture changed');
  expect(transport.count).not.toHaveBeenCalled();expect(transport.create).not.toHaveBeenCalled();
 });
 it('withholds an unapproved mutation tool while retaining its received model charge and stopping without retry',async()=>{
  const prepared=await prepareActualToolRehearsal(root,'wrong-tool'),transport=fakeTransport(true);
  await expect(runActualToolRehearsal(root,'wrong-tool',{planHash:prepared.planHash,maximumCents:999},transport)).rejects.toThrow('bounded tool rehearsal stopped');
  expect(transport.create).toHaveBeenCalledTimes(1);
  const evidence=JSON.parse(readFileSync(join(prepared.directory,'tool-evidence.json'),'utf8'));
  expect(evidence.results[0].toolReceipts).toEqual([]);
  expect(inspectActualToolRehearsal(root,'wrong-tool')).toMatchObject({attemptedCalls:1,execution:{status:'stopped'}});
  await expect(runActualToolRehearsal(root,'wrong-tool',{planHash:prepared.planHash,maximumCents:999},transport)).rejects.toThrow('already started');
  expect(transport.create).toHaveBeenCalledTimes(1);
 });
 it('uses the captured original fetch for only fixed count and Responses destinations',async()=>{
  const fetcher=vi.fn(async(input:string|URL|Request)=>{void input;return new Response('{}',{status:200});}),transport=actualRehearsalTransport('mock-key',fetcher);
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Wrapper must not recurse');}));
  await transport.count('{}');await transport.create('{}','fixed-original-request');
  expect(fetcher.mock.calls.map(call=>String(call[0]))).toEqual(['https://api.openai.com/v1/responses/input_tokens','https://api.openai.com/v1/responses']);
 });
});
