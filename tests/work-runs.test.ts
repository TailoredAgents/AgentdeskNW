import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Actor,ToolResult} from '../src/lib/contracts';
import type {CreateWorkRunInput,WorkStepInput} from '../src/lib/work-contracts';
import {AppError,closeDb,demoActor,getDb} from '../src/server/db';
import {simulateLifecycle,subscription} from '../src/server/billing';
import {createTask,processQueuedJobs,getResearchJob} from '../src/server/services';
import {getWalletState} from '../src/server/wallet';
import * as capabilities from '../src/server/work-capabilities';
import * as budgets from '../src/server/work-budget';
import {createWorkRun,getWorkRun,listWorkRuns,reviseWorkRun,controlWorkRun,decideWorkCost,claimNextWorkStep,executeClaimedWorkStep,processWorkRuns} from '../src/server/work-runs';

let actor:Actor,sequence=0;
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const office:Actor={id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'};
const next=()=>`work-test-${++sequence}`;
const inspect:WorkStepInput={key:'facts',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]};
const match:WorkStepInput={key:'buyers',capabilityId:'match_existing_buyers',input:{propertyId:'property-maple'},dependsOn:['facts']};
const relationship:WorkStepInput={key:'relationship',capabilityId:'relationship_next_step',input:{investorId:'investor-mike'},dependsOn:['buyers']};
const followup:WorkStepInput={key:'followup',capabilityId:'create_followup',input:{title:'Review my composed work result',investorId:null,dueAt:null},dependsOn:['facts']};
function input(steps:WorkStepInput[]=[inspect,followup]):CreateWorkRunInput{return {requestId:next(),title:'A useful fictional assignment',instructions:'Inspect the property and save my requested follow-up.',steps:structuredClone(steps)};}
function approve(id:string){const run=getWorkRun(actor,id);return decideWorkCost(actor,id,{expectedVersion:run.version,eventKey:next(),quoteId:run.budget.quoteId,decision:'approve'});}
function control(id:string,action:'pause'|'resume'|'cancel'){return controlWorkRun(actor,id,{expectedVersion:getWorkRun(actor,id).version,eventKey:next(),action});}
function taskCount(){return (getDb().prepare('SELECT COUNT(*) n FROM tasks WHERE owner_id=?').get(actor.id) as {n:number}).n;}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider call');}));vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T16:00:00Z'));actor=demoActor();sequence=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('durable composed fictional work',()=>{
 it('runs real local steps and stores immutable results while direct navigation remains free',()=>{
  const before=taskCount(),run=createWorkRun(actor,input());expect(run.status).toBe('queued');expect(run.simulation).toBe(true);
  expect(processWorkRuns(actor,10)).toBe(2);const finished=getWorkRun(actor,run.id);
  expect(finished.status).toBe('completed');expect(finished.steps.every(step=>step.status==='completed')).toBe(true);expect(taskCount()).toBe(before+1);
  expect(finished.steps[0].result?.message).toContain('Fictional');expect(finished.steps[1].result?.artifacts[0].type).toBe('task');
  expect(finished.budget.spentCents).toBe(0);expect(processWorkRuns(actor,10)).toBe(0);expect(taskCount()).toBe(before+1);
  expect(()=>getDb().prepare("UPDATE work_step_receipts SET data='{}' WHERE run_id=?").run(run.id)).toThrow('immutable');
  expect(()=>getDb().prepare('DELETE FROM work_run_plans WHERE run_id=?').run(run.id)).toThrow('immutable');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('shares results only through declared safe dependency bindings',()=>{
  const draft={...relationship,input:{investorId:{$step:'buyers',path:'matches.0.investor.id'}}};
  const run=createWorkRun(actor,input([inspect,match,draft]));expect(run.budget.maximumCents).toBe(100);expect(run.status).toBe('queued');
  expect(processWorkRuns(actor,10)).toBe(3);const result=getWorkRun(actor,run.id);expect(result.status).toBe('completed');
  expect(result.steps[2].resolvedInput?.investorId).toMatch(/^investor-/);expect(result.budget.spentCents).toBe(75);expect(result.budget.reservedCents).toBe(0);
  expect(getWalletState(actor).spentThisPeriodCents).toBe(75);
 });
 it('deduplicates creation and rejects changed requests without erasing progressed work',()=>{
  const request=input(),first=createWorkRun(actor,request);processWorkRuns(actor,1);
  expect(createWorkRun(actor,request).id).toBe(first.id);expect(createWorkRun(actor,request).steps[0].status).toBe('completed');
  expect(()=>createWorkRun(actor,{...request,instructions:'Different work'})).toThrow('different work');
  expect(listWorkRuns(actor)).toHaveLength(1);
 });
 it('keeps tenant, office, employee and manager access private, including request replay',()=>{
  const run=createWorkRun(actor,input());
  for(const denied of [other,office,demoActor('acquisitions'),demoActor('manager')]){
   expect(()=>getWorkRun(denied,run.id)).toThrow('not found');expect(listWorkRuns(denied)).toHaveLength(0);
   expect(()=>controlWorkRun(denied,run.id,{expectedVersion:run.version,eventKey:next(),action:'cancel'})).toThrow('not found');
  }
  expect(()=>listWorkRuns({...actor,role:'manager'})).toThrow('not authorized');
 });
 it('requires approval for the aggregate above one dollar and binds the quote/version',()=>{
  const extra={...relationship,key:'second-relationship'};const run=createWorkRun(actor,input([inspect,match,relationship,extra]));
  expect(run).toMatchObject({status:'waiting_cost_approval',budget:{maximumCents:150,spentCents:0,reservedCents:0}});
  expect(processWorkRuns(actor,10)).toBe(0);
  expect(()=>decideWorkCost(actor,run.id,{expectedVersion:run.version,eventKey:next(),quoteId:'different-quote',decision:'approve'})).toThrow('changed');
  const approved=approve(run.id);expect(approved.status).toBe('queued');processWorkRuns(actor,10);
  expect(getWorkRun(actor,run.id)).toMatchObject({status:'completed',budget:{spentCents:110,reservedCents:0}});
 });
 it('does not execute denied or unanswered quoted work',()=>{
  const run=createWorkRun(actor,input([inspect,match,relationship,{...relationship,key:'another'}]));
  const denied=decideWorkCost(actor,run.id,{expectedVersion:run.version,eventKey:next(),quoteId:run.budget.quoteId,decision:'deny'});
  expect(denied.status).toBe('canceled');expect(processWorkRuns(actor,10)).toBe(0);expect(denied.budget.spentCents).toBe(0);
  expect(()=>control(run.id,'resume')).toThrow('current state');
 });
 it('invalidates stale control versions and protects command keys across runs',()=>{
  const first=createWorkRun(actor,input()),second=createWorkRun(actor,input());
  const command={expectedVersion:first.version,eventKey:'one-command',action:'pause' as const};const paused=controlWorkRun(actor,first.id,command);
  expect(controlWorkRun(actor,first.id,command)).toEqual(paused);
  expect(()=>controlWorkRun(actor,first.id,{...command,eventKey:next(),action:'resume'})).toThrow('changed');
  expect(()=>controlWorkRun(actor,second.id,{...command,expectedVersion:second.version})).toThrow('different work');
 });
 it('allows only one live worker claim and safely reclaims an expired lease after restart',()=>{
  const run=createWorkRun(actor,input());const claim=claimNextWorkStep(actor)!;expect(claim.runId).toBe(run.id);expect(claimNextWorkStep(actor)).toBeNull();
  vi.advanceTimersByTime(61_000);const recovered=claimNextWorkStep(actor)!;expect(recovered.token).not.toBe(claim.token);
  expect(executeClaimedWorkStep(claim)).toBe(false);expect(executeClaimedWorkStep(recovered)).toBe(true);expect(executeClaimedWorkStep(recovered)).toBe(false);
  processWorkRuns(actor,10);expect(getWorkRun(actor,run.id).status).toBe('completed');
  expect(getDb().prepare('SELECT COUNT(*) n FROM work_step_receipts WHERE run_id=?').get(run.id)).toEqual({n:2});
 });
 it('pauses and cancels a leased step before execution without undoing prior work',()=>{
  const run=createWorkRun(actor,input([inspect,match,followup]));processWorkRuns(actor,2);const before=taskCount(),claim=claimNextWorkStep(actor)!;
  const paused=control(run.id,'pause');expect(paused.status).toBe('paused');expect(executeClaimedWorkStep(claim)).toBe(false);expect(taskCount()).toBe(before);
  const canceled=control(run.id,'cancel');expect(canceled.status).toBe('canceled');expect(canceled.budget.spentCents).toBe(40);expect(canceled.budget.reservedCents).toBe(0);
  expect(getWalletState(actor).spentThisPeriodCents).toBe(40);expect(processWorkRuns(actor,10)).toBe(0);
 });
 it('revises only unfinished work and asks again when the new total crosses one dollar',()=>{
  const original=input([inspect,match,followup]),run=createWorkRun(actor,original);processWorkRuns(actor,2);
  const current=getWorkRun(actor,run.id),claim=claimNextWorkStep(actor)!;
  const revision=reviseWorkRun(actor,run.id,{expectedVersion:getWorkRun(actor,run.id).version,eventKey:next(),instructions:'Prepare two relationship reviews before the requested follow-up.',steps:[inspect,match,relationship,{...relationship,key:'second'},{...followup,dependsOn:['relationship','second']}]});
  expect(revision.status).toBe('waiting_cost_approval');expect(revision.planVersion).toBe(2);expect(revision.budget.maximumCents).toBe(140);expect(revision.budget.spentCents).toBe(40);expect(executeClaimedWorkStep(claim)).toBe(false);
  expect(revision.steps[0].result).toEqual(current.steps[0].result);
  expect(()=>reviseWorkRun(actor,run.id,{expectedVersion:revision.version,eventKey:next(),instructions:'Rewrite facts',steps:[{...inspect,input:{propertyId:'property-oak'}},match]})).toThrow('completed steps');
  approve(run.id);processWorkRuns(actor,10);expect(getWorkRun(actor,run.id)).toMatchObject({status:'completed',budget:{spentCents:110,reservedCents:0}});
  expect(getDb().prepare('SELECT COUNT(*) n FROM work_run_plans WHERE run_id=?').get(run.id)).toEqual({n:2});
 });
 it('rolls back a local mutation if budget settlement fails before its receipt commits',()=>{
  const run=createWorkRun(actor,input());processWorkRuns(actor,1);const before=taskCount();const claim=claimNextWorkStep(actor)!;
  const consume=vi.spyOn(budgets,'consumeWorkBudget').mockImplementation(()=>{throw new AppError(409,'Settlement is unavailable');});
  expect(executeClaimedWorkStep(claim)).toBe(false);expect(taskCount()).toBe(before);expect(getDb().prepare('SELECT COUNT(*) n FROM work_step_receipts WHERE run_id=?').get(run.id)).toEqual({n:1});
  expect(getWorkRun(actor,run.id).status).toBe('waiting_for_input');consume.mockRestore();control(run.id,'resume');processWorkRuns(actor,10);expect(taskCount()).toBe(before+1);
 });
 it('hides old source content after access revocation and prevents pending work',()=>{
  const run=createWorkRun(actor,input([inspect,match,relationship]));processWorkRuns(actor,2);
  getDb().prepare("UPDATE investors SET owner_id='user-taylor',data=json_set(data,'$.ownerId','user-taylor') WHERE id='investor-mike'").run();
  const hidden=getWorkRun(actor,run.id);expect(hidden.contentRestricted).toBe(true);expect(JSON.stringify(hidden)).not.toContain('Mike');expect(hidden.steps.every(step=>step.result===null)).toBe(true);
  expect(processWorkRuns(actor,10)).toBe(0);expect(getWorkRun(actor,run.id).status).toBe('waiting_for_input');expect(control(run.id,'cancel').status).toBe('canceled');
 });
 it('preserves historical results but prevents execution after subscription access ends',()=>{
  const run=createWorkRun(actor,input());processWorkRuns(actor,1);
  simulateLifecycle(demoActor('manager'),{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:next()});
  expect(getWorkRun(actor,run.id).steps[0].result?.message).toContain('Example Street');expect(processWorkRuns(actor,10)).toBe(0);
  expect(()=>control(run.id,'resume')).toThrow();expect(control(run.id,'cancel').status).toBe('canceled');
 });
 it('retains an unknown reservation and prevents execution, cancellation or repricing until reconciled',()=>{
  const run=createWorkRun(actor,input([inspect,match,followup])),claim=claimNextWorkStep(actor)!;
  budgets.markWorkBudgetUnknown(actor,run.id);expect(executeClaimedWorkStep(claim)).toBe(false);
  const blocked=getWorkRun(actor,run.id);expect(blocked.status).toBe('reconciling');expect(blocked.budget.reservedCents).toBe(50);
  expect(()=>control(run.id,'cancel')).toThrow('current state');expect(()=>control(run.id,'resume')).toThrow('current state');
  expect(processWorkRuns(actor,10)).toBe(0);expect(getWalletState(actor).reservedCents).toBe(50);
 });
 it('rejects unsupported, cyclic, cross-scope and undeclared/prototype result plans without creating a run',()=>{
  const bad:WorkStepInput[][]=[
   [{...inspect,capabilityId:'anything_i_want'}],
   [{...inspect,dependsOn:['followup']},followup],
   [inspect,{...relationship,dependsOn:['facts'],input:{investorId:{$step:'buyers',path:'matches.0.investor.id'}}}],
   [inspect,{...relationship,dependsOn:['facts'],input:{investorId:{$step:'facts',path:'constructor.prototype'}}}],
   [{...relationship,dependsOn:[],input:{investorId:'investor-isolated'}}],
  ];
  for(const steps of bad)expect(()=>createWorkRun(actor,input(steps))).toThrow();expect(listWorkRuns(actor)).toHaveLength(0);
 });
 it('stops when a referenced result field is absent instead of guessing an investor',()=>{
  const run=createWorkRun(actor,input([inspect,{...relationship,dependsOn:['facts'],input:{investorId:{$step:'facts',path:'missingInvestor'}}}]));
  expect(processWorkRuns(actor,10)).toBe(1);const stopped=getWorkRun(actor,run.id);expect(stopped.status).toBe('waiting_for_input');expect(stopped.budget.spentCents).toBe(0);
 });
 it('refreshes an expired estimate and never accepts approval of the old quote',()=>{
  const run=createWorkRun(actor,input([inspect,match,relationship,{...relationship,key:'second'}]));vi.advanceTimersByTime(16*60_000);
  expect(()=>approve(run.id)).toThrow('expired');const refreshed=control(run.id,'resume');expect(refreshed.budget.quoteId).not.toBe(run.budget.quoteId);expect(refreshed.status).toBe('waiting_cost_approval');
  expect(()=>decideWorkCost(actor,run.id,{expectedVersion:refreshed.version,eventKey:next(),quoteId:run.budget.quoteId,decision:'approve'})).toThrow('changed');
  approve(run.id);processWorkRuns(actor,10);expect(getWorkRun(actor,run.id).status).toBe('completed');
 });
 it('waits for an actual linked synthetic child and does not charge each polling attempt',()=>{
  const start:WorkStepInput={key:'research',capabilityId:'start_synthetic_research',input:{propertyId:'property-maple',limit:3},dependsOn:['buyers']};
  const collect:WorkStepInput={key:'results',capabilityId:'await_synthetic_research',input:{jobId:{$step:'research',path:'jobId'}},dependsOn:['research']};
  const run=createWorkRun(actor,input([inspect,match,start,collect]));approve(run.id);expect(processWorkRuns(actor,4)).toBe(3);
  const waiting=getWorkRun(actor,run.id);expect(waiting.status).toBe('waiting_for_dependency');expect(waiting.budget.spentCents).toBe(190);
  expect(processWorkRuns(actor,2)).toBe(0);expect(getWorkRun(actor,run.id).budget.spentCents).toBe(190);
  for(let i=0;i<8;i++){vi.advanceTimersByTime(4000);processQueuedJobs(actor);}
  processWorkRuns(actor,2);expect(getWorkRun(actor,run.id).status).toBe('completed');expect(getWorkRun(actor,run.id).budget.spentCents).toBe(190);expect(fetch).not.toHaveBeenCalled();
 });
 it('cancels its linked child without canceling unrelated research or refunding consumed work',()=>{
  const start:WorkStepInput={key:'research',capabilityId:'start_synthetic_research',input:{propertyId:'property-maple',limit:3},dependsOn:['buyers']};
  const collect:WorkStepInput={key:'results',capabilityId:'await_synthetic_research',input:{jobId:{$step:'research',path:'jobId'}},dependsOn:['research']};
  const run=createWorkRun(actor,input([inspect,match,start,collect]));approve(run.id);processWorkRuns(actor,3);
  const child=(getWorkRun(actor,run.id).steps[2].result?.data as {jobId:string}).jobId;control(run.id,'cancel');expect(getResearchJob(actor,child).status).toBe('canceled');expect(getWorkRun(actor,run.id).budget.spentCents).toBe(190);
 });
 it('supports a bounded useful acquisition and management composition with their real local services',()=>{
  for(const role of ['acquisitions','manager'] as const){const employee=demoActor(role);const steps:WorkStepInput[]=role==='acquisitions'?[inspect,{key:'review',capabilityId:'review_handoff',input:{propertyId:'property-maple'},dependsOn:['facts']},{...followup,dependsOn:['review']}]:[{key:'office',capabilityId:'office_priorities',input:{},dependsOn:[]},{...followup,dependsOn:['office']}];
   const run=createWorkRun(employee,input(steps));processWorkRuns(employee,10);const finished=getWorkRun(employee,run.id);expect(finished.status).toBe('completed');expect(finished.steps.at(-1)?.result?.artifacts[0].type).toBe('task');expect(finished.budget.spentCents).toBe(50);
  }
 });
 it('survives a real database close/reopen without repeating an already committed task',()=>{
  const dir=mkdtempSync(join(tmpdir(),'agentdesk-work-'));try{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',join(dir,'state.sqlite'));actor=demoActor();const before=taskCount();const run=createWorkRun(actor,input());processWorkRuns(actor,1);closeDb();expect(getWorkRun(actor,run.id).steps[0].status).toBe('completed');processWorkRuns(actor,5);closeDb();expect(getWorkRun(actor,run.id).status).toBe('completed');expect(taskCount()).toBe(before+1);expect(processWorkRuns(actor,5)).toBe(0);}finally{closeDb();rmSync(dir,{recursive:true,force:true});}
 });
 it('keeps the action, receipt and cost rolled back when a capability returns an invalid completion',()=>{
  const run=createWorkRun(actor,input());processWorkRuns(actor,1);const before=taskCount();
  vi.spyOn(capabilities,'executeWorkCapability').mockImplementation((actor)=>{createTask(actor,{title:'This must roll back'});return {message:42} as unknown as ToolResult;});
  processWorkRuns(actor,1);expect(taskCount()).toBe(before);expect(getWorkRun(actor,run.id).status).toBe('waiting_for_input');
 });
});
