import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {getConversation,processQueuedJobs,listTasks} from '../src/server/services';
import {listAssignmentReviews,decideAssignmentReview} from '../src/server/assignment-reviews';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {getMeteredAssignment,finishMeteredAssignment} from '../src/server/metered-work';
import {getAssignmentBinding,withAssignment} from '../src/server/assignment-roots';
import {admitCurrentAssignmentAttempt,quoteCurrentAssignment} from '../src/server/assignment-metering';
import {decideMeteredAssignment} from '../src/server/metered-work';
import {fingerprint} from '../src/server/provider-runtime';
import {createWorkRun,getWorkRun,listWorkRuns,claimNextWorkStep,executeClaimedWorkStep,processWorkRuns,controlWorkRun,reviseWorkRun,answerWorkQuestion} from '../src/server/work-runs';
import {localWorkAdmission,isIncludedLocalWork} from '../src/server/local-assignment-work';
import type {WorkStepInput} from '../src/lib/work-contracts';

let sequence=0,directory='';const key=()=>`local-delegation-${++sequence}`,actor=()=>demoActor();
const steps:WorkStepInput[]=[{key:'property',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]},{key:'buyers',capabilityId:'match_existing_buyers',input:{propertyId:'property-maple'},dependsOn:['property']}];
const output=(items:unknown[])=>new Response(JSON.stringify({id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output:items,usage:{input_tokens:20,output_tokens:10}}));
const final=()=>output([{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Your local buyer shortlist job is saved.'}]}]);
const call=(plan=steps,callId='delegate')=>({type:'function_call',name:'start_work',call_id:callId,status:'completed',arguments:JSON.stringify({title:'Prepare the local shortlist',steps:plan.map(step=>({key:step.key,capabilityId:step.capabilityId,inputJson:JSON.stringify(step.input),dependsOn:step.dependsOn}))})});
function transport(plan=steps,last:()=>Promise<Response>|Response=final){let round=0;const mock=vi.fn(async(url:unknown)=>String(url).endsWith('/input_tokens')?new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40})):++round===1?output([call(plan)]):last());vi.stubGlobal('fetch',mock);return mock;}
async function start(message='Find existing buyers for property-maple as a saved job.'){return chat(actor(),message,undefined,key());}
function approve(){const review=listAssignmentReviews(actor())[0];decideAssignmentReview(actor(),review.id,{quoteId:review.quoteId,revision:review.revision,decision:'approve',eventKey:key()});}
function budget(){const row=getDb().prepare('SELECT id FROM metered_assignments ORDER BY rowid DESC LIMIT 1').get() as {id:string};return getMeteredAssignment(actor(),row.id);}
beforeEach(()=>{closeDb();sequence=0;for(const [name,value] of Object.entries({AGENTDESK_DB_PATH:':memory:',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'mock-never-sent',OPENAI_MODEL:'gpt-6-astra',AGENTDESK_TEXT_SPENDING_MODE:'admitted_demo',AGENTDESK_TEXT_MAX_ROUNDS:'2',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'300000'}))vi.stubEnv(name,value);vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS',JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional local delegation acceptance tariff',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000000,cached_input_tokens:0,output_tokens:1000000}}]));vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();vi.restoreAllMocks();if(directory){rmSync(directory,{recursive:true,force:true});directory='';}});
describe('included local jobs retain their admitted parent assignment',()=>{
 it('waits for the original decision, then charges only model usage and completes local work once',async()=>{
  const fetcher=transport();const initial=await start();expect(listWorkRuns(actor())).toEqual([]);expect(fetcher).not.toHaveBeenCalled();approve();expect(await processApprovedTextRequests(actor())).toBe(1);
  const job=listWorkRuns(actor())[0],parent=getDb().prepare('SELECT parent_request_id FROM local_assignment_work WHERE run_id=?').get(job.id) as {parent_request_id:string};
  expect(job).toMatchObject({costScope:'included_local',status:'queued',budget:{maximumCents:0,spentCents:0}});expect(job.steps.every(step=>step.maximumCents===0&&step.rateVersion==='included-local-v1')).toBe(true);
  expect(getAssignmentBinding(actor(),{kind:'work',id:job.id})?.rootId).toBe(getAssignmentBinding(actor(),{kind:'turn',id:parent.parent_request_id})?.rootId);
  expect(budget()).toMatchObject({status:'active',budget:{spentCents:6,reservedCents:0}});expect(processWorkRuns(actor(),10)).toBe(2);
  expect(getWorkRun(actor(),job.id).status).toBe('completed');expect(budget()).toMatchObject({status:'completed',budget:{spentCents:6,reservedCents:0}});expect(processWorkRuns(actor(),10)).toBe(0);expect(fetcher).toHaveBeenCalledTimes(4);expect(getConversation(actor(),initial.conversation.id).messages.at(-1)?.content).toContain('job is saved');
 });
 it('does not dispatch the child while the parent is generating its final response',async()=>{
  let finish!:(response:Response)=>void;transport(steps,()=>new Promise(resolve=>{finish=resolve;}));await start();approve();const running=processApprovedTextRequests(actor());
  for(let i=0;i<30&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,1));
  const job=listWorkRuns(actor())[0];expect(job).toBeTruthy();expect(localWorkAdmission(actor(),job.id)).toBe('wait');expect(claimNextWorkStep(actor())).toBeNull();expect(getWorkRun(actor(),job.id).steps.every(step=>step.attempts===0)).toBe(true);
  finish(final());await running;expect(localWorkAdmission(actor(),job.id)).toBe('ready');expect(processWorkRuns(actor(),10)).toBe(2);
 });
 it('persists the zero-charge binding through restart and environment changes',async()=>{
  directory=mkdtempSync(join(tmpdir(),'agentdesk-local-work-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'test.sqlite'));transport();await start();approve();await processApprovedTextRequests(actor());const job=listWorkRuns(actor())[0];closeDb();vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','operational');expect(isIncludedLocalWork(actor(),job.id)).toBe(true);processWorkRuns(actor(),10);expect(getWorkRun(actor(),job.id).budget.spentCents).toBe(0);expect(budget().budget.spentCents).toBe(6);
 });
 it('does not hold credits or demand another cost approval for delayed included work',async()=>{
  transport();await start();approve();await processApprovedTextRequests(actor());expect(budget().budget.reservedCents).toBe(0);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+20*60_000);expect(listAssignmentReviews(actor())[0].state).toBe('continued');expect(processWorkRuns(actor(),10)).toBe(2);expect(budget().budget.spentCents).toBe(6);expect(budget().status).toBe('completed');
 });
 it('does not reuse settled credit authority for another paid call while free work remains',async()=>{
  vi.stubEnv('AGENTDESK_TEXT_MAX_ROUNDS','3');transport();await start();approve();await processApprovedTextRequests(actor());const assignment=budget(),row=getDb().prepare('SELECT parent_request_id FROM local_assignment_work LIMIT 1').get() as {parent_request_id:string};
  withAssignment(actor(),{kind:'turn',id:row.parent_request_id},()=>expect(()=>admitCurrentAssignmentAttempt(actor(),{revision:assignment.revision,scopeHash:assignment.scopeHash,partKey:assignment.parts[0].key,attemptId:key(),requestHash:fingerprint('not newly authorized'),bounds:{input_tokens:40,cached_input_tokens:40,output_tokens:512}})).toThrow('approve'));
  expect(budget().attempts).toHaveLength(2);expect(budget().budget.reservedCents).toBe(0);
 });
 it('does not let an older local child close a later paid allocation',async()=>{
  transport();await start();approve();await processApprovedTextRequests(actor());const assignment=budget(),row=getDb().prepare('SELECT parent_request_id FROM local_assignment_work LIMIT 1').get() as {parent_request_id:string};
  withAssignment(actor(),{kind:'turn',id:row.parent_request_id},()=>{
   const next=quoteCurrentAssignment(actor(),{title:'Expanded fictional assignment',revision:2,scopeHash:fingerprint('additional supported-host test'),parts:[...assignment.parts,{key:'future-paid',feature:'core',rateId:'test-search-v1',maximumCalls:1,maximumUnits:{search_calls:1},estimatedUnits:{search_calls:1}}]});
   decideMeteredAssignment(actor(),{assignmentId:next.id,quoteId:next.budget.quoteId,revision:2,decision:'approve',eventKey:key()});
   admitCurrentAssignmentAttempt(actor(),{revision:2,scopeHash:next.scopeHash,partKey:'future-paid',attemptId:key(),requestHash:fingerprint('later paid allocation'),bounds:{search_calls:1}});
  });
  expect(processWorkRuns(actor(),10)).toBe(2);expect(budget().status).toBe('active');expect(budget().stopRequested).toBeUndefined();expect(budget().attempts.at(-1)?.status).toBe('dispatched');expect(budget().budget.reservedCents).toBeGreaterThan(0);
 });
 it('keeps standalone fictional sample pricing unchanged',()=>{
  const job=createWorkRun(actor(),{requestId:key(),title:'Standalone sample',instructions:'Prepare a sample shortlist',steps});expect(job.costScope).toBeUndefined();expect(job.budget.maximumCents).toBe(50);expect(isIncludedLocalWork(actor(),job.id)).toBe(false);processWorkRuns(actor(),10);expect(getWorkRun(actor(),job.id).budget.spentCents).toBe(40);
 });
 it('does not adopt old delegated jobs into included pricing after switching mode',async()=>{
  vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','operational');transport();await start();const job=listWorkRuns(actor())[0];expect(job.budget.maximumCents).toBe(50);vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','admitted_demo');processWorkRuns(actor(),10);expect(getWorkRun(actor(),job.id).budget.spentCents).toBe(40);expect(isIncludedLocalWork(actor(),job.id)).toBe(false);
 });
 it('retains uncertain parent usage and never runs a child after unknown generation',async()=>{
  transport(steps,()=>{throw new Error('unknown provider outcome');});await start();approve();await processApprovedTextRequests(actor());const job=listWorkRuns(actor())[0];expect(budget().status).toBe('reconciling');expect(processWorkRuns(actor(),10)).toBe(0);expect(getWorkRun(actor(),job.id).status).toBe('reconciling');expect(getWorkRun(actor(),job.id).steps.every(step=>step.attempts===0)).toBe(true);expect(budget().budget.reservedCents).toBe(202);
 });
 it('cancels unpaid local work after a confirmed parent failure',async()=>{
  transport(steps,()=>new Response('{}',{status:429}));await start();approve();await processApprovedTextRequests(actor());const job=listWorkRuns(actor())[0];expect(budget()).toMatchObject({status:'canceled',budget:{spentCents:3,reservedCents:0}});expect(processWorkRuns(actor(),10)).toBe(0);expect(getWorkRun(actor(),job.id).status).toBe('canceled');
 });
 it('preserves the completed parent charge when the employee cancels local work',async()=>{
  transport();await start();approve();await processApprovedTextRequests(actor());const job=listWorkRuns(actor())[0];controlWorkRun(actor(),job.id,{expectedVersion:job.version,eventKey:key(),action:'cancel'});expect(budget()).toMatchObject({status:'canceled',budget:{spentCents:6,reservedCents:0}});expect(processWorkRuns(actor(),10)).toBe(0);
 });
 it('records cancellation before the parent final response without reporting the whole assignment complete',async()=>{
  let finish!:(response:Response)=>void;transport(steps,()=>new Promise(resolve=>{finish=resolve;}));await start();approve();const running=processApprovedTextRequests(actor());for(let i=0;i<30&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,1));const job=listWorkRuns(actor())[0];controlWorkRun(actor(),job.id,{expectedVersion:job.version,eventKey:key(),action:'cancel'});finish(final());await running;expect(budget().status).toBe('canceled');expect(getWorkRun(actor(),job.id).status).toBe('canceled');
 });
 it('keeps completed steps and included pricing through a remaining-plan revision',async()=>{
  transport();await start();approve();await processApprovedTextRequests(actor());const id=listWorkRuns(actor())[0].id;processWorkRuns(actor(),1);const job=getWorkRun(actor(),id);const revised=reviseWorkRun(actor(),id,{expectedVersion:job.version,eventKey:key(),instructions:'Prepare the shortlist and current relationship context',steps:[...steps,{key:'relationship',capabilityId:'relationship_next_step',input:{investorId:'investor-mike'},dependsOn:['buyers']}]});expect(revised.steps[0].status).toBe('completed');expect(revised.budget.maximumCents).toBe(0);expect(processWorkRuns(actor(),10)).toBe(2);expect(getWorkRun(actor(),id).budget.spentCents).toBe(0);expect(budget().budget.spentCents).toBe(6);
 });
 it('supports a missing property answer without repricing completed reasoning or inventing a target',async()=>{
  const plan:WorkStepInput[]=[{key:'question',capabilityId:'request_information',input:{prompt:'Which property should I review?',answerType:'property'},dependsOn:[]},{key:'buyers',capabilityId:'match_existing_buyers',input:{propertyId:{$step:'question',path:'propertyId'}},dependsOn:['question']}];
  transport(plan);await start('Prepare a saved buyer shortlist and ask me for the property.');approve();await processApprovedTextRequests(actor());const job=listWorkRuns(actor())[0];expect(job.question).toBeTruthy();answerWorkQuestion(actor(),job.id,{expectedVersion:job.version,eventKey:key(),questionReference:job.question!.reference,answer:'property-maple'});expect(processWorkRuns(actor(),10)).toBe(1);expect(getWorkRun(actor(),job.id).budget.spentCents).toBe(0);expect(budget().status).toBe('completed');
 });
 it('waits for explicitly requested synthetic research without an additional AI wallet debit',async()=>{
  const plan:WorkStepInput[]=[...steps,{key:'research',capabilityId:'start_synthetic_research',input:{propertyId:'property-maple',limit:3},dependsOn:['buyers']},{key:'collect',capabilityId:'await_synthetic_research',input:{jobId:{$step:'research',path:'jobId'}},dependsOn:['research']}];
  transport(plan);await start('Find existing buyers and new investors for property-maple as a saved job.');approve();await processApprovedTextRequests(actor());const job=listWorkRuns(actor())[0];processWorkRuns(actor(),10);expect(getWorkRun(actor(),job.id).status).toBe('waiting_for_dependency');expect(budget().status).toBe('active');
  vi.useFakeTimers({toFake:['Date']});for(let i=0;i<10;i++){vi.setSystemTime(Date.now()+1001);processQueuedJobs(actor());}vi.setSystemTime(Date.now()+3000);processWorkRuns(actor(),10);expect(getWorkRun(actor(),job.id).status).toBe('completed');expect(budget()).toMatchObject({status:'completed',budget:{spentCents:6,reservedCents:0}});
 });
 it('checks root state again after claiming and before a local effect',async()=>{
  const plan:WorkStepInput[]=[{key:'task',capabilityId:'create_followup',input:{title:'Never execute after root stops',investorId:null,dueAt:null},dependsOn:[]}];transport(plan);await start('Create a personal task as a saved job.');approve();await processApprovedTextRequests(actor());const claim=claimNextWorkStep(actor())!;expect(claim).toBeTruthy();finishMeteredAssignment(actor(),budget().id,'canceled');expect(executeClaimedWorkStep(claim)).toBe(false);expect(listTasks(actor()).some(task=>task.title==='Never execute after root stops')).toBe(false);
 });
 it('rolls back the local effect and receipt if final assignment settlement cannot commit',async()=>{
  const plan:WorkStepInput[]=[{key:'task',capabilityId:'create_followup',input:{title:'Atomic included follow-up',investorId:null,dueAt:null},dependsOn:[]}];transport(plan);await start('Create a personal task as a saved job.');approve();await processApprovedTextRequests(actor());
  getDb().exec("CREATE TEMP TRIGGER reject_root_finish BEFORE UPDATE ON metered_assignments WHEN json_extract(NEW.data,'$.status')='completed' BEGIN SELECT RAISE(ABORT,'test interrupted settlement'); END;");
  expect(processWorkRuns(actor(),1)).toBe(0);expect(listTasks(actor()).some(task=>task.title==='Atomic included follow-up')).toBe(false);expect(budget().status).toBe('active');getDb().exec('DROP TRIGGER reject_root_finish');
  const job=listWorkRuns(actor())[0];controlWorkRun(actor(),job.id,{expectedVersion:job.version,eventKey:key(),action:'resume'});expect(processWorkRuns(actor(),10)).toBe(1);expect(listTasks(actor()).filter(task=>task.title==='Atomic included follow-up')).toHaveLength(1);expect(budget().budget.spentCents).toBe(6);
 });
 it('retains private ownership and rejects reparenting or binding changes',async()=>{
  transport();await start();approve();await processApprovedTextRequests(actor());const job=listWorkRuns(actor())[0];expect(()=>getWorkRun(demoActor('manager'),job.id)).toThrow('not found');expect(isIncludedLocalWork(demoActor('manager'),job.id)).toBe(false);expect(()=>getDb().prepare('UPDATE local_assignment_work SET parent_request_id=? WHERE run_id=?').run('another',job.id)).toThrow('original spending');const other=createWorkRun(actor(),{requestId:key(),title:'Other assignment',instructions:'Read local facts',steps:[steps[0]]});expect(()=>withAssignment(actor(),{kind:'work',id:other.id},()=>createWorkRun(actor(),{requestId:(getDb().prepare('SELECT request_id FROM work_runs WHERE id=?').get(job.id) as {request_id:string}).request_id,title:job.title,instructions:job.instructions,steps}))).toThrow();
 });
});
