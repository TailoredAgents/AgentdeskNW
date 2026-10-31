import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {createConversation,createResearchJob} from '../src/server/services';
import {chat} from '../src/server/orchestrator';
import {bindAssignment,getAssignmentBinding,currentAssignment,withAssignment,withNewAssignment} from '../src/server/assignment-roots';
import {quoteCurrentAssignment,currentMeteredAssignment,admitCurrentAssignmentAttempt} from '../src/server/assignment-metering';
import {recordMeteredReceipt,decideMeteredAssignment} from '../src/server/metered-work';
import {createWorkRun,getWorkRun,processWorkRuns,decideWorkCost,controlWorkRun} from '../src/server/work-runs';
import {fingerprint} from '../src/server/provider-runtime';
import type {MeteredPart} from '../src/lib/metered-work-contracts';

let seq=0,directory='';const key=()=>`assignment-test-${++seq}`,actor=()=>demoActor();
const jobInput=()=>({requestId:key(),title:'Read property facts',instructions:'Inspect the fictional property',steps:[{key:'facts',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]}]});
const makeJob=()=>createWorkRun(actor(),jobInput());
const host=(id:string)=>({kind:'work' as const,id});
const part=(name:string,cents:number,parentKey?:string):MeteredPart=>({key:name,...(parentKey?{parentKey}:{}),feature:'core',rateId:'test-text-v1',maximumCalls:4,maximumUnits:{output_tokens:cents*200},estimatedUnits:{output_tokens:cents*100}});
const scope=fingerprint({source:'fictional assignment'});
beforeEach(()=>{closeDb();seq=0;vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();if(directory){rmSync(directory,{recursive:true,force:true});directory='';}});

describe('authoritative assignment roots',()=>{
 it('binds an exact saved-work retry to one immutable root',()=>{
  const input=jobInput(),one=createWorkRun(actor(),input),binding=getAssignmentBinding(actor(),host(one.id));
  expect(binding).toMatchObject({legacy:false,parentId:null});expect(createWorkRun(actor(),input).id).toBe(one.id);
  expect(getDb().prepare('SELECT count(*) n FROM assignment_roots').get()).toEqual({n:1});
  expect(()=>createWorkRun(actor(),{...input,title:'Changed request'})).toThrow('different work');
 });
 it('binds a typed request, its saved job and repeated requests to the same root',async()=>{
  const conversation=createConversation(actor()),requestId=key(),message='Start a job for 123 Example Street to match buyers and create a task';
  const first=await chat(actor(),message,conversation.id,requestId),runId=first.result.artifacts.find(a=>a.type==='work_run')!.id!;
  const turn=getAssignmentBinding(actor(),{kind:'turn',id:requestId})!,run=getAssignmentBinding(actor(),host(runId))!;
  expect(run.rootId).toBe(turn.rootId);expect(run.parentId).toBe(turn.id);expect(turn.legacy).toBe(false);
  await chat(actor(),message,conversation.id,requestId);expect(getAssignmentBinding(actor(),host(runId))).toEqual(run);
 });
 it('preserves one root through mocked model planning, tool delegation and the final answer',async()=>{
  vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');vi.stubEnv('OPENAI_MODEL','gpt-6-astra');const roots:string[]=[];
  const response=(output:unknown[])=>new Response(JSON.stringify({id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:40}}),{headers:{'content-type':'application/json'}});
  let round=0;const mock=vi.fn(async()=>{roots.push(currentAssignment(actor()).rootId);await Promise.resolve();return response(++round===1?[{type:'function_call',status:'completed',name:'start_work',call_id:key(),arguments:JSON.stringify({title:'Read property facts',steps:[{key:'facts',capabilityId:'inspect_property',inputJson:JSON.stringify({propertyId:'property-maple'}),dependsOn:[]}]})}]:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'The source review is saved.'}]}]);});vi.stubGlobal('fetch',mock);
  const result=await chat(actor(),'Save a job to inspect the fictional property',undefined,key()),runId=result.result.artifacts.find(a=>a.type==='work_run')!.id!;
  expect(mock).toHaveBeenCalledTimes(2);expect(new Set(roots).size).toBe(1);expect(getAssignmentBinding(actor(),host(runId))?.rootId).toBe(roots[0]);
 });
 it('restores the job root in workers and binds delegated research before execution',()=>{
  const input={...jobInput(),steps:[{key:'buyers',capabilityId:'match_existing_buyers',input:{propertyId:'property-maple'},dependsOn:[]},{key:'research',capabilityId:'start_synthetic_research',input:{propertyId:'property-maple',limit:2},dependsOn:['buyers']},{key:'results',capabilityId:'await_synthetic_research',input:{jobId:{$step:'research',path:'jobId'}},dependsOn:['research']}]};
  const run=createWorkRun(actor(),input);decideWorkCost(actor(),run.id,{expectedVersion:run.version,quoteId:run.budget.quoteId,decision:'approve',eventKey:key()});processWorkRuns(actor(),5);
  const done=getWorkRun(actor(),run.id),researchId=(done.steps[1].result?.data as {jobId:string}).jobId;
  const parent=getAssignmentBinding(actor(),host(run.id))!,child=getAssignmentBinding(actor(),{kind:'research',id:researchId})!;
  expect(done.steps[1].status).toBe('completed');expect(child.rootId).toBe(parent.rootId);expect(child.parentId).toBe(parent.id);
 });
 it('keeps a phone control continuation on the selected saved-work root',async()=>{
  const run=makeJob(),conversation=createConversation(actor()),requestId=key();
  const result=await chat(actor(),`Pause job ${run.id}`,conversation.id,requestId,'mobile');
  expect(result.result.artifacts.some(a=>a.type==='work_run'&&a.id===run.id)).toBe(true);
  expect(getAssignmentBinding(actor(),{kind:'turn',id:requestId})?.rootId).toBe(getAssignmentBinding(actor(),host(run.id))?.rootId);
 });
 it('new unrelated requests in the same conversation have separate roots',async()=>{
  const conversation=createConversation(actor()),a=key(),b=key();await chat(actor(),'Show my investors',conversation.id,a);await chat(actor(),'Show my investors',conversation.id,b);
  expect(getAssignmentBinding(actor(),{kind:'turn',id:a})?.rootId).not.toBe(getAssignmentBinding(actor(),{kind:'turn',id:b})?.rootId);
 });
 it('cannot reparent an existing job through a new delegation',()=>{
  const a=makeJob(),input=jobInput(),b=createWorkRun(actor(),input),before=getAssignmentBinding(actor(),host(b.id));
  expect(()=>withAssignment(actor(),host(a.id),()=>createWorkRun(actor(),input))).toThrow('cannot be replaced');expect(getAssignmentBinding(actor(),host(b.id))).toEqual(before);
 });
 it('checks private ownership, office and real host existence',()=>{
  const run=makeJob();for(const other of [demoActor('manager'),{...actor(),officeId:'other'}])expect(()=>getAssignmentBinding(other,host(run.id))).toThrow();
  expect(()=>bindAssignment(actor(),host('work-invented'))).toThrow('not available');
  expect(()=>withAssignment(actor(),host(run.id),()=>currentAssignment(demoActor('manager')))).toThrow();
 });
 it('keeps concurrent async assignments isolated and clears context after failure',async()=>{
  const a=makeJob(),b=makeJob();let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});
  const first=withAssignment(actor(),host(a.id),async()=>{await wait;return currentAssignment(actor()).rootId;});
  const second=withAssignment(actor(),host(b.id),async()=>{await Promise.resolve();return currentAssignment(actor()).rootId;});
  release();expect(await first).not.toBe(await second);expect(()=>currentAssignment(actor())).toThrow('original employee assignment');
  await expect(withAssignment(actor(),host(a.id),async()=>{throw new Error('failure');})).rejects.toThrow('failure');expect(()=>currentAssignment(actor())).toThrow();
 });
 it('does not leave roots or bindings after a rolled-back delegated creation',()=>{
  const run=makeJob(),before=getDb().prepare('SELECT count(*) n FROM assignment_bindings').get();
  expect(()=>withAssignment(actor(),host(run.id),()=>getDb().transaction(()=>{makeJob();throw new Error('rollback');})())).toThrow('rollback');
  expect(getDb().prepare('SELECT count(*) n FROM assignment_bindings').get()).toEqual(before);
 });
 it('preserves root identity through pause and resume',()=>{
  const run=makeJob(),before=getAssignmentBinding(actor(),host(run.id));const paused=controlWorkRun(actor(),run.id,{expectedVersion:run.version,eventKey:key(),action:'pause'});controlWorkRun(actor(),run.id,{expectedVersion:paused.version,eventKey:key(),action:'resume'});
  expect(getAssignmentBinding(actor(),host(run.id))).toEqual(before);
 });
 it('retains roots after process/database restart',()=>{
  directory=mkdtempSync(join(tmpdir(),'agentdesk-assignment-root-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'copy.sqlite'));const run=makeJob(),before=getAssignmentBinding(actor(),host(run.id));closeDb();
  expect(withAssignment(actor(),host(run.id),()=>currentAssignment(actor()))).toEqual(before);
 });
 it('rejects a changed persisted host identity instead of assigning a new root',()=>{
  const run=makeJob();getDb().prepare('UPDATE work_runs SET request_hash=? WHERE id=?').run('changed-host-identity',run.id);
  expect(()=>getAssignmentBinding(actor(),host(run.id))).toThrow('identity changed');expect(()=>withAssignment(actor(),host(run.id),()=>null)).toThrow('identity changed');expect(getDb().prepare('SELECT count(*) n FROM assignment_roots').get()).toEqual({n:1});
 });
 it('keeps binding records immutable',()=>{
  const run=makeJob(),binding=getAssignmentBinding(actor(),host(run.id))!;
  expect(()=>getDb().prepare('UPDATE assignment_bindings SET root_id=? WHERE id=?').run('other',binding.id)).toThrow('immutable');
  expect(()=>getDb().prepare('DELETE FROM assignment_roots WHERE id=?').run(binding.rootId)).toThrow('immutable');
 });
 it('labels historical unbound work without inventing historical cost aggregation',()=>{
  const run=makeJob();getDb().exec('DROP TRIGGER assignment_bindings_no_delete; DROP TRIGGER assignment_roots_no_delete; DELETE FROM assignment_bindings; DELETE FROM assignment_roots;');
  withAssignment(actor(),host(run.id),()=>{expect(currentAssignment(actor()).legacy).toBe(true);expect(()=>quoteCurrentAssignment(actor(),{title:'Legacy',scopeHash:scope,revision:1,parts:[part('planning',1)]})).toThrow('incomplete spending history');});
 });
 it('creates independent roots for direct research and preserves ownership',()=>{
  const job=createResearchJob(actor(),{address:'123 Example Street',county:'Fulton',price:150000,strategy:'flip',limit:2,provider:'synthetic-fixtures-v1'});
  expect(getAssignmentBinding(actor(),{kind:'research',id:job.id})).toMatchObject({legacy:false,parentId:null});expect(()=>getAssignmentBinding(demoActor('manager'),{kind:'research',id:job.id})).toThrow();
 });
});

describe('whole-root metered admission boundary',()=>{
 it('requires the server execution context and rejects caller-selected roots',()=>{
  const input={title:'Plan',scopeHash:scope,revision:1,parts:[part('planning',99)]};expect(()=>quoteCurrentAssignment(actor(),input)).toThrow('original employee assignment');
  const run=makeJob();withAssignment(actor(),host(run.id),()=>{expect(()=>quoteCurrentAssignment(actor(),{...input,assignmentKey:'forged'} as typeof input)).toThrow('cannot choose');expect(()=>currentMeteredAssignment(actor())).toThrow('whole-assignment quote');});
 });
 it('aggregates planning and delegated parts above $1 on the same root',()=>{
  const run=makeJob();withAssignment(actor(),host(run.id),()=>{
   const planned=quoteCurrentAssignment(actor(),{title:'Planning',scopeHash:scope,revision:1,parts:[part('planning',99)]});
   const child=makeJob();withAssignment(actor(),host(child.id),()=>{
    const revised=quoteCurrentAssignment(actor(),{title:'Planning and delegated analysis',scopeHash:scope,revision:2,parts:[part('planning',99),part('analysis',2,'planning')]});
    expect(revised.id).toBe(planned.id);expect(revised.budget.maximumCents).toBe(101);expect(revised.budget.status).toBe('awaiting_approval');
    expect(()=>admitCurrentAssignmentAttempt(actor(),{revision:2,scopeHash:scope,attemptId:key(),partKey:'analysis',requestHash:scope,bounds:{output_tokens:1}})).toThrow('approve');
   });
  });expect(getDb().prepare('SELECT count(*) n FROM metered_assignments').get()).toEqual({n:1});
 });
 it('preserves consumed planning and original approval across delegated continuation',()=>{
  const run=makeJob();withNewAssignment(actor(),host(run.id),()=>{
   const planned=quoteCurrentAssignment(actor(),{title:'Plan and research',scopeHash:scope,revision:1,parts:[part('planning',50),part('research',75,'planning')]});
   decideMeteredAssignment(actor(),{assignmentId:planned.id,revision:1,quoteId:planned.budget.quoteId,decision:'approve',eventKey:key()});
   const attempt=admitCurrentAssignmentAttempt(actor(),{revision:1,scopeHash:scope,attemptId:key(),partKey:'planning',requestHash:scope,bounds:{output_tokens:2000}});
   recordMeteredReceipt(actor(),{assignmentId:planned.id,attemptId:attempt.attempt.id,status:'succeeded',responseId:key(),usage:{output_tokens:2000},providerCostMicros:null});
   const child=makeJob();withAssignment(actor(),host(child.id),()=>{const same=currentMeteredAssignment(actor());expect(same.id).toBe(planned.id);expect(same.budget.spentCents).toBe(10);expect(same.budget.approvedMaximumCents).toBe(125);});
  });
 });
 it('refuses to erase previous planning receipts or switch attempt budgets',()=>{
  const run=makeJob();withAssignment(actor(),host(run.id),()=>{
   const planned=quoteCurrentAssignment(actor(),{title:'Planning',scopeHash:scope,revision:1,parts:[part('planning',99)]});
   const attempt=admitCurrentAssignmentAttempt(actor(),{revision:1,scopeHash:scope,attemptId:key(),partKey:'planning',requestHash:scope,bounds:{output_tokens:200}});
   recordMeteredReceipt(actor(),{assignmentId:planned.id,attemptId:attempt.attempt.id,status:'succeeded',responseId:key(),usage:{output_tokens:200},providerCostMicros:null});
   expect(()=>quoteCurrentAssignment(actor(),{title:'Only research',scopeHash:scope,revision:2,parts:[part('research',99)]})).toThrow('preserve every');
   const input={revision:1,scopeHash:scope,attemptId:key(),partKey:'planning',requestHash:scope,bounds:{output_tokens:1}};expect(()=>admitCurrentAssignmentAttempt(actor(),{...input,assignmentId:'other'} as typeof input)).toThrow('cannot choose');
  });
 });
});
