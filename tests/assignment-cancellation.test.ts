import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {processQueuedJobs} from '../src/server/services';
import {listAssignmentReviews,decideAssignmentReview,cancelAssignmentReview} from '../src/server/assignment-reviews';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {getMeteredAssignment} from '../src/server/metered-work';
import {getWorkRun,listWorkRuns,claimNextWorkStep,executeClaimedWorkStep,processWorkRuns,controlWorkRun} from '../src/server/work-runs';
import {assignmentConversationReference,assignmentConversationIntent} from '../src/server/assignment-conversation';
import {assignmentReviewRoute} from '../src/server/assignment-review-api';
import {NextRequest} from 'next/server';
import {subscription,simulateLifecycle} from '../src/server/billing';
import {recordMeteredReceipt} from '../src/server/metered-work';
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

const review=()=>listAssignmentReviews(actor())[0];
const cancellation=()=>({quoteId:review().quoteId,revision:review().revision,eventKey:key()});
const cancel=()=>cancelAssignmentReview(actor(),review().id,cancellation());
describe('employee cancellation of the original paid assignment',()=>{
 it('cancels before approval without dispatch and preserves exact retries',async()=>{
  const fetcher=transport();await start();const old=review(),input=cancellation();
  expect(cancelAssignmentReview(actor(),old.id,input)).toMatchObject({canCancel:false,executionState:'canceled',spentCents:0,heldCents:0});
  expect(cancelAssignmentReview(actor(),old.id,input).executionState).toBe('canceled');expect(await processApprovedTextRequests(actor())).toBe(0);expect(fetcher).not.toHaveBeenCalled();
  expect(()=>cancelAssignmentReview(actor(),old.id,{...input,revision:2})).toThrow('different cancellation');
 });
 it('cancels an approved but unclaimed request without generation',async()=>{const fetcher=transport();await start();approve();cancel();expect(await processApprovedTextRequests(actor())).toBe(0);expect(fetcher).not.toHaveBeenCalled();expect(budget().budget.reservedCents).toBe(0);});
 it('can stop an expired quote',async()=>{transport();await start();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+20*60_000);expect(review()).toMatchObject({state:'obsolete',canCancel:true});expect(cancel().executionState).toBe('canceled');});
 it('refuses another employee and forged price or scope',async()=>{transport();await start();expect(()=>cancelAssignmentReview(demoActor('manager'),review().id,cancellation())).toThrow('not found');expect(()=>cancelAssignmentReview(actor(),review().id,{...cancellation(),maximumCents:0} as never)).toThrow();expect(()=>cancelAssignmentReview(actor(),review().id,{...cancellation(),revision:2})).toThrow('scope changed');});
 it('cancels during input counting before any generation leaves',async()=>{
  let release!:(response:Response)=>void;const fetcher=vi.fn(async()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal('fetch',fetcher);await start();approve();const running=processApprovedTextRequests(actor());await Promise.resolve();cancel();release(new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40})));await running;
  expect(fetcher).toHaveBeenCalledTimes(1);expect(budget()).toMatchObject({status:'canceled',attempts:[],budget:{spentCents:0,reservedCents:0}});
 });
 it('accepts an exact conversation cancellation during generation and settles without executing returned tools',async()=>{
  let release!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>String(url).endsWith('/input_tokens')?new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40})):new Promise<Response>(resolve=>{release=resolve;})));
  const original=await start();approve();const running=processApprovedTextRequests(actor());await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  const stopped=await chat(actor(),`Cancel ${assignmentConversationReference(review().id)}`,original.conversation.id,key(),'mobile');expect(stopped.result.message).toContain('in-flight');expect(review()).toMatchObject({executionState:'stopping',heldCents:205,canCancel:false});
  release(output([call()]));await running;expect(listWorkRuns(actor())).toHaveLength(0);expect(budget()).toMatchObject({status:'canceled',budget:{spentCents:3,reservedCents:0}});expect(review().executionState).toBe('canceled');expect(await processApprovedTextRequests(actor())).toBe(0);
 });
 it('retains uncertain held credit after cancel and settles only an authoritative late receipt',async()=>{
  const mock=vi.fn(async(url:unknown)=>{if(String(url).endsWith('/input_tokens'))return new Response(JSON.stringify({object:'response.input_tokens',input_tokens:40}));throw new Error('uncertain');});vi.stubGlobal('fetch',mock);await start();approve();await processApprovedTextRequests(actor());expect(review().canCancel).toBe(true);cancel();expect(review()).toMatchObject({executionState:'stopping',heldCents:205,canCancel:false});
  const value=budget();recordMeteredReceipt(actor(),{assignmentId:value.id,attemptId:value.attempts[0].id,status:'succeeded',responseId:'late-cancel-receipt',usage:{input_tokens:20,cached_input_tokens:0,output_tokens:10},providerCostMicros:null});expect(review()).toMatchObject({executionState:'canceled',spentCents:3,heldCents:0});expect(await processApprovedTextRequests(actor())).toBe(0);expect(mock).toHaveBeenCalledTimes(2);
 });
 it.each(['queued','paused','waiting_for_input'] as const)('cancels included local work in %s state without discarding completed reasoning',async state=>{
  const plan:WorkStepInput[]=state==='waiting_for_input'?[{key:'question',capabilityId:'request_information',input:{prompt:'Which property?',answerType:'property'},dependsOn:[]}]:steps;
  transport(plan);await start();approve();await processApprovedTextRequests(actor());let job=listWorkRuns(actor())[0];if(state==='paused')job=controlWorkRun(actor(),job.id,{action:'pause',expectedVersion:job.version,eventKey:key()});
  cancel();expect(getWorkRun(actor(),job.id)).toMatchObject({status:'canceled',budget:{spentCents:0,reservedCents:0}});expect(processWorkRuns(actor(),10)).toBe(0);expect(review()).toMatchObject({executionState:'canceled',spentCents:6,heldCents:0});
 });
 it('stops a claimed local step before its effect and preserves earlier results',async()=>{transport();await start();approve();await processApprovedTextRequests(actor());processWorkRuns(actor(),1);const claim=claimNextWorkStep(actor())!;cancel();expect(executeClaimedWorkStep(claim)).toBe(false);const job=listWorkRuns(actor())[0];expect(job.steps[0].status).toBe('completed');expect(job.steps[1].status).toBe('canceled');});
 it('cancels the included synthetic child while awaiting its result',async()=>{transport([...steps,{key:'research',capabilityId:'start_synthetic_research',input:{propertyId:'property-maple',limit:3},dependsOn:['buyers']},{key:'collect',capabilityId:'await_synthetic_research',input:{jobId:{$step:'research',path:'jobId'}},dependsOn:['research']}]);await start('Find buyers with fictional new-investor research as a saved job.');approve();await processApprovedTextRequests(actor());processWorkRuns(actor(),4);cancel();expect(getDb().prepare("SELECT json_extract(data,'$.status') status FROM research_jobs").all()).toEqual([{status:'canceled'}]);expect(processQueuedJobs(actor())).toBe(0);expect(listWorkRuns(actor())[0].status).toBe('canceled');});
 it('keeps cancellation and child changes atomic on storage failure',async()=>{transport();await start();approve();await processApprovedTextRequests(actor());getDb().exec("CREATE TRIGGER fail_cancel BEFORE INSERT ON assignment_cancellations BEGIN SELECT RAISE(ABORT,'storage interruption'); END");expect(()=>cancel()).toThrow('storage interruption');expect(budget().status).toBe('active');expect(listWorkRuns(actor())[0].status).toBe('queued');getDb().exec('DROP TRIGGER fail_cancel');expect(cancel().executionState).toBe('canceled');});
 it('keeps completed work completed and refuses cancellation as a refund',async()=>{transport();await start();approve();await processApprovedTextRequests(actor());processWorkRuns(actor(),10);expect(review()).toMatchObject({executionState:'completed',canCancel:false,spentCents:6});expect(()=>cancel()).toThrow('different final outcome');expect(budget().budget.spentCents).toBe(6);});
 it('persists cancellation across restart without re-enabling the original worker',async()=>{directory=mkdtempSync(join(tmpdir(),'agentdesk-cancel-'));vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'test.sqlite'));const fetcher=transport();await start();approve();const old=review(),input=cancellation();cancelAssignmentReview(actor(),old.id,input);closeDb();expect(cancelAssignmentReview(actor(),old.id,input).executionState).toBe('canceled');expect(await processApprovedTextRequests(actor())).toBe(0);expect(fetcher).not.toHaveBeenCalled();});
 it.each(['web','mobile','sms','slack'] as const)('uses exact employee cancellation in %s without a model call',async channel=>{const fetcher=transport();const original=await start(),reference=assignmentConversationReference(review().id);const result=await chat(actor(),`Cancel ${reference}`,original.conversation.id,key(),channel);expect(result.result.message).toContain('Remaining assignment canceled');expect(fetcher).not.toHaveBeenCalled();expect(assignmentConversationIntent(`He said cancel ${reference}`)).toBeNull();expect(assignmentConversationIntent('cancel it')).toBeNull();});
 it('exposes only a scoped cancel command, no caller receipt or replacement root',async()=>{transport();await start();const old=review();const result=await assignmentReviewRoute(new NextRequest('http://localhost/api/assignment-reviews',{method:'POST'}),actor(),['assignment-reviews',old.id,'cancel'],async()=>cancellation());expect(await result!.json()).toMatchObject({executionState:'canceled',canCancel:false});expect(getDb().prepare('SELECT count(*) n FROM assignment_cancellations').get()).toEqual({n:1});expect(()=>getDb().exec('DELETE FROM assignment_cancellations')).toThrow('retained');});
 it('permits stopping owned work after workforce access ends without granting new execution',async()=>{const fetcher=transport();const original=await start();approve();const sub=subscription(actor());simulateLifecycle(demoActor('manager'),{userId:actor().id,action:'cancel_now',expectedVersion:sub.version,eventKey:key()});const result=await chat(actor(),`Cancel ${assignmentConversationReference(review().id)}`,original.conversation.id,key(),'sms');expect(result.result.message).toContain('Remaining assignment canceled');expect(fetcher).not.toHaveBeenCalled();});
 it('does not let canceled ready reviews crowd a later approved worker request out of its scan',async()=>{transport();for(let i=0;i<21;i++){await start();approve();cancel();}await start();approve();expect(await processApprovedTextRequests(actor())).toBe(1);expect(listWorkRuns(actor())).toHaveLength(1);});

 it('lets the employee cancel included work after the parent outcome became uncertain',async()=>{transport(steps,()=>{throw new Error('unknown final response');});await start();approve();await processApprovedTextRequests(actor());expect(review().canCancel).toBe(true);expect(listWorkRuns(actor())).toHaveLength(1);cancel();expect(listWorkRuns(actor())[0].status).toBe('canceled');expect(review()).toMatchObject({executionState:'stopping',canCancel:false,spentCents:3,heldCents:202});});

});
