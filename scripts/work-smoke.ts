import {quoteCurrentAssignment} from '../src/server/assignment-metering';
import {presentCurrentAssignmentQuote,claimAssignmentContinuation,completeAssignmentContinuation} from '../src/server/assignment-reviews';
import {fingerprint} from '../src/server/provider-runtime';
import type {AssignmentReview} from '../src/lib/assignment-review-contracts';
import {withAssignment,getAssignmentBinding} from '../src/server/assignment-roots';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import type {Actor,Bootstrap} from '../src/lib/contracts';
import type {WorkRun} from '../src/lib/work-contracts';
import type {WalletState} from '../src/lib/wallet-contracts';
import type {InboxState,InboxThreadDetail} from '../src/lib/communications-contracts';
import type {ProviderStatus} from '../src/lib/provider-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {claimNextWorkStep,processWorkRuns} from '../src/server/work-runs';
import {getResearchJob,processQueuedJobs} from '../src/server/services';

// This suite deliberately advances worker steps and inspects immutable receipts. It must never use a user's database.
if(process.env.AGENTDESK_WORK_SMOKE_ISOLATED!=='true'||!process.env.AGENTDESK_DB_PATH||!process.env.SMOKE_BASE_URL)throw new Error('Use npm run test:work so a disposable compiled workspace is created.');
const base=process.env.SMOKE_BASE_URL;
if(new URL(base).hostname!=='127.0.0.1')throw new Error('Work acceptance requires the isolated loopback server.');
let cookie='',checks=0;
async function request<T>(path:string,method='GET',value?:unknown,expected=200):Promise<T>{
 const response=await fetch(base+'/api/'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:value===undefined?undefined:JSON.stringify(value)});
 const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];
 const body=await response.text();assert.equal(response.status,expected,method+' '+path+': '+body);checks++;return body?JSON.parse(body) as T:undefined as T;
}
function check(condition:unknown,message:string){assert.ok(condition,message);checks++;}
const latest=(run:WorkRun)=>request<WorkRun>('work/'+run.id);
const control=(run:WorkRun,action:'pause'|'resume'|'cancel')=>request<WorkRun>('work/'+run.id+'/control','POST',{expectedVersion:run.version,eventKey:randomUUID(),action});
const count=(table:'research_jobs'|'provider_operations'|'research_provider_calls'|'messaging_outbox'|'communication_send_receipts'|'work_step_receipts')=>(getDb().prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n;
const snapshot=(table:'investors'|'properties'|'tasks'|'communication_messages'|'communication_drafts')=>getDb().prepare(`SELECT id,data FROM ${table} ORDER BY id`).all() as {id:string;data:string}[];
const finish=(actor:Actor)=>processWorkRuns(actor,20);

try{
 await request('work','GET',undefined,401);await request('work','POST',{},401);
 const initial=await request<Bootstrap>('bootstrap'),employeeCookie=cookie,actor=demoActor();
 check(!initial.integrations.openai&&!initial.integrations.voice,'Isolated job acceptance does not configure live AI');
 const walletBefore=await request<WalletState>('wallet');
 const inboxBefore=await request<InboxState>('inbox');
 const thread=inboxBefore.threads.find(item=>item.association.investor?.id==='investor-mike');assert.ok(thread);
 let inbox=await request<InboxThreadDetail>('inbox/'+thread.id);
 inbox=await request<InboxThreadDetail>('inbox/'+thread.id+'/draft','POST',{expectedVersion:inbox.thread.version,eventKey:randomUUID(),subject:'Saved before Copilot work',body:'Preserve this fictional manual draft while the job runs.'});
 const originals={investors:snapshot('investors'),properties:snapshot('properties'),tasks:snapshot('tasks'),messages:snapshot('communication_messages'),drafts:snapshot('communication_drafts')};
 const capabilities=await request<{capabilities:{capabilityId:string;available:boolean;simulation:boolean}[]}>('work/capabilities');
 check(capabilities.capabilities.some(item=>item.capabilityId==='match_existing_buyers'&&item.available)&&capabilities.capabilities.every(item=>item.simulation),'Capability discovery exposes permitted, explicitly simulated work');
 await request('work','POST',{requestId:randomUUID(),presetId:'management'},403);
 const missingTarget=await request<WorkRun>('work','POST',{requestId:randomUUID(),presetId:'dispositions'},201);check(missingTarget.status==='waiting_for_input'&&!!missingTarget.question,'Missing property now asks a saved question');await control(missingTarget,'cancel');
 await request('work','POST',{requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple',maximumCents:0},400);
 await request('work','POST',{requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple',ownerId:'user-taylor'},400);
 await request('work','POST',{requestId:randomUUID(),presetId:'dispositions',propertyId:'not-a-property'},404);
 const csrf=await fetch(base+'/api/work',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://unrelated.example'},body:JSON.stringify({requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple'})});
 check(csrf.status===403,'Cross-origin job mutations fail');

 const firstInput={requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple',investorId:'investor-mike'};
 let first=await request<WorkRun>('work','POST',firstInput,201);
 const originalRoot=getAssignmentBinding(actor,{kind:'work',id:first.id})!;check(!originalRoot.legacy&&!originalRoot.parentId,'Direct saved work has its own immutable assignment root');
 check(first.status==='queued'&&first.budget.maximumCents===100&&first.budget.approvedMaximumCents===100,'Exactly $1 needs no extra cost decision');
 check(first.budget.reservedCents===0&&first.steps.every(step=>step.status==='pending'),'Creation saves a plan without pretending execution');
 const duplicate=await request<WorkRun>('work','POST',firstInput,201);check(duplicate.id===first.id,'Create retry returns the same saved job');
 await request('work','POST',{...firstInput,investorId:'investor-sarah'},409);
 const staleVersion=first.version;
 check(processWorkRuns(actor,1)===1,'Worker completes the first saved step');first=await latest(first);
 await request('work/'+first.id+'/control','POST',{expectedVersion:staleVersion,eventKey:randomUUID(),action:'cancel'},409);
 first=await control(first,'pause');check(first.status==='paused','Pause persists at the API boundary');
 check(finish(actor)===0&&(await latest(first)).status==='paused','Paused work does not advance');
 first=await control(first,'resume');
 const abandoned=claimNextWorkStep(actor);assert.ok(abandoned);check(abandoned.runId===first.id,'Worker claims the same resumed job');
 closeDb();
 // Expire only the disposable fixture's lease to exercise recovery without a real 60-second wait.
 getDb().prepare('UPDATE work_runs SET lease_expires_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),first.id);
 finish(actor);first=await latest(first);
 check(first.status==='completed'&&first.steps.every(step=>step.status==='completed'),'A new database connection recovers the interrupted lease and completes the job');
 check(first.budget.spentCents===75&&first.budget.reservedCents===0,'The whole job settles its actual fictional steps and releases unused maximum');
 check(first.steps.some(step=>step.capabilityId==='relationship_next_step'&&step.result?.message.includes('Nothing has been sent')),'Completed relationship preparation preserves its unsent boundary');
 const firstTaskId=(first.steps.find(step=>step.key==='followup')?.result?.data as {taskId?:string}|undefined)?.taskId;assert.ok(firstTaskId);
 const receiptCount=count('work_step_receipts');finish(actor);check(count('work_step_receipts')===receiptCount,'Repeated worker cycles do not repeat completed receipts');
 check((await request<{runs:WorkRun[]}>('work')).runs.some(run=>run.id===first.id),'Saved completed work appears in the private queue');
 await request('work/'+first.id+'/control','POST',{expectedVersion:first.version,eventKey:randomUUID(),action:'resume'},409);

 const jobsBefore=count('research_jobs');
 const researchInput={requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple',includeResearch:true};
 let research=await request<WorkRun>('work','POST',researchInput,201);
 check(research.status==='waiting_cost_approval'&&research.budget.maximumCents>100,'Optional research asks for whole-job approval before starting');
 finish(actor);check(count('research_jobs')===jobsBefore&&research.budget.spentCents===0,'Unapproved expensive work never creates a child research job');
 const decision={expectedVersion:research.version,eventKey:randomUUID(),quoteId:research.budget.quoteId,decision:'approve'};
 await request('work/'+research.id+'/decision','POST',{...decision,maximumCents:99999},400);
 research=await request<WorkRun>('work/'+research.id+'/decision','POST',decision);
 check((await request<WorkRun>('work/'+research.id+'/decision','POST',decision)).version===research.version,'Exact approval retries are safe');
 await request('work/'+research.id+'/decision','POST',{...decision,decision:'deny'},409);
 processWorkRuns(actor,4);research=await latest(research);
 check(research.status==='waiting_for_dependency','The parent waits for actual saved research results');
 const childId=(research.steps.find(step=>step.key==='research')?.result?.data as {jobId:string}).jobId;
 const researchRoot=getAssignmentBinding(actor,{kind:'work',id:research.id})!,childRoot=getAssignmentBinding(actor,{kind:'research',id:childId})!;check(childRoot.rootId===researchRoot.rootId&&childRoot.parentId===researchRoot.id,'Worker-created research retains the originating work assignment');
 check(count('research_jobs')===jobsBefore+1&&getResearchJob(actor,childId).provider==='synthetic-fixtures-v1','Exactly one fictional child was created');
 const beforeWait=research.budget.spentCents;processWorkRuns(actor,1);research=await latest(research);
 check(research.budget.spentCents===beforeWait&&count('research_jobs')===jobsBefore+1,'Waiting does not create duplicate children or extra charges');
 for(let stage=0;stage<4;stage++){
  getDb().prepare('UPDATE research_jobs SET next_attempt_at=NULL WHERE id=?').run(childId);
  processQueuedJobs(actor);
 }
 check(getResearchJob(actor,childId).status==='completed','The fictional child has a persisted completed result');
 // The parent uses a short polling lease after a dependency wait. Advance only this fixture's timer.
 getDb().prepare('UPDATE work_runs SET lease_expires_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),research.id);
 finish(actor);research=await latest(research);
 check(research.status==='completed'&&research.steps.find(step=>step.key==='research_results')?.result?.artifacts.some(item=>item.id===childId),'Parent collects the saved child result before reporting completion');
 check(research.budget.spentCents===190&&research.budget.reservedCents===0,'Research, matching and final steps settle once within the approved total');

 let denied=await request<WorkRun>('work','POST',{...researchInput,requestId:randomUUID()},201);
 const denial={expectedVersion:denied.version,eventKey:randomUUID(),quoteId:denied.budget.quoteId,decision:'deny'};
 denied=await request<WorkRun>('work/'+denied.id+'/decision','POST',denial);finish(actor);
 check(denied.status==='canceled'&&denied.budget.spentCents===0&&count('research_jobs')===jobsBefore+1,'Denied work remains canceled and creates no child');
 check((await request<WorkRun>('work/'+denied.id+'/decision','POST',denial)).status==='canceled','Denial retries are also safe');

 let partial=await request<WorkRun>('work','POST',{...firstInput,requestId:randomUUID()},201);
 processWorkRuns(actor,2);partial=await latest(partial);
 check(partial.budget.spentCents===40&&partial.budget.reservedCents===60,'Partially completed work separates consumed and held credit');
 const tasksBeforeCancel=snapshot('tasks').length;partial=await control(partial,'cancel');finish(actor);
 check(partial.status==='canceled'&&partial.budget.spentCents===40&&partial.budget.reservedCents===0,'Cancel releases only unused credit');
 check(snapshot('tasks').length===tasksBeforeCancel,'Cancel prevents the unfinished follow-up from executing');

 let growing=await request<WorkRun>('work','POST',{requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple'},201);
 processWorkRuns(actor,2);growing=await latest(growing);const oldQuote=growing.budget.quoteId;
 growing=await request<WorkRun>('work/'+growing.id+'/revise','POST',{expectedVersion:growing.version,eventKey:randomUUID(),presetId:'dispositions',propertyId:'property-maple',includeResearch:true,instructions:'Keep completed matching; add fictional research after cost approval.'});
 check(growing.planVersion===2&&growing.status==='waiting_cost_approval'&&growing.budget.spentCents===40,'Growth retains completed results and pauses before crossing $1');
 await request('work/'+growing.id+'/decision','POST',{expectedVersion:growing.version,eventKey:randomUUID(),quoteId:oldQuote,decision:'approve'},409);
 finish(actor);check(count('research_jobs')===jobsBefore+1,'Revised work cannot start from the prior cost authority');
 growing=await control(growing,'cancel');check(growing.budget.spentCents===40,'Canceling revised work preserves its earlier settled usage');

 await request('session','POST',{role:'acquisitions'});const acquisitionActor=demoActor('acquisitions');
 await request('work/'+first.id,'GET',undefined,404);
 await request('work/'+first.id+'/control','POST',{expectedVersion:first.version,eventKey:randomUUID(),action:'cancel'},404);
 let acquisition=await request<WorkRun>('work','POST',{requestId:randomUUID(),presetId:'acquisitions',propertyId:'property-maple'},201);finish(acquisitionActor);acquisition=await latest(acquisition);
 check(acquisition.status==='completed'&&acquisition.budget.spentCents===50&&acquisition.steps.some(step=>step.result?.message.includes('not valuation')),'Acquisition starter completes a useful, bounded handoff review');
 check((await request<{runs:WorkRun[]}>('work')).runs.every(run=>run.ownerId===acquisitionActor.id),'Acquisition queue does not expose another employee job');
 await request('session','POST',{role:'manager'});const managerActor=demoActor('manager');
 await request('work/'+first.id,'GET',undefined,404);
 let management=await request<WorkRun>('work','POST',{requestId:randomUUID(),presetId:'management'},201);finish(managerActor);management=await latest(management);
 check(management.status==='completed'&&management.budget.spentCents===50&&management.steps.some(step=>step.result?.message.includes('no private mailbox')),'Management starter completes an office-priorities review without private-mail access');
 check((await request<{runs:WorkRun[]}>('work')).runs.every(run=>run.ownerId===managerActor.id),'Manager privilege does not grant another employee private jobs');
 cookie=employeeCookie;

 let unattended=await request<WorkRun>('work','POST',{requestId:randomUUID(),presetId:'dispositions',propertyId:'property-maple'},201);
 const worker=spawn(process.execPath,['--import','tsx','scripts/worker.ts'],{stdio:['ignore','ignore','inherit'],env:process.env});
 try{
  for(let attempt=0;attempt<40;attempt++){
   unattended=await latest(unattended);if(unattended.status==='completed')break;
   assert.equal(worker.exitCode,null,'Background worker must stay running until the job completes');
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  check(unattended.status==='completed'&&unattended.budget.spentCents===40,'Actual background worker completes persisted work without manual processing or an open UI');
 }finally{
  await new Promise<void>(resolve=>{if(worker.exitCode!==null||worker.signalCode!==null){resolve();return;}worker.once('exit',()=>resolve());worker.kill('SIGTERM');});
 }

 check(getAssignmentBinding(actor,{kind:'work',id:first.id})?.id===originalRoot.id,'Pause/resume and completion preserve the same root');
 check(getAssignmentBinding(actor,{kind:'research',id:childId})?.rootId===researchRoot.rootId,'Research collection preserves the child root');
 check(!!getAssignmentBinding(actor,{kind:'work',id:unattended.id}), 'Independent background worker retains persisted assignment identity');
 const budgetAfter=await request<WalletState>('wallet');
 const expectedSpent=first.budget.spentCents+research.budget.spentCents+partial.budget.spentCents+growing.budget.spentCents+unattended.budget.spentCents;
 check(budgetAfter.availableCents===walletBefore.availableCents-expectedSpent&&budgetAfter.spentThisPeriodCents===walletBefore.spentThisPeriodCents+expectedSpent&&budgetAfter.reservedCents===0,'Only this employee’s completed fictional work changes the wallet');
 check(budgetAfter.purchasedCents===walletBefore.purchasedCents&&budgetAfter.liveUsageDebiting===false,'No top-up or live customer billing was activated');
 assert.deepEqual(snapshot('investors'),originals.investors);assert.deepEqual(snapshot('properties'),originals.properties);checks+=2;
 const finalTasks=new Map(snapshot('tasks').map(item=>[item.id,item.data]));check(originals.tasks.every(item=>finalTasks.get(item.id)===item.data),'Existing tasks retain their original data');
 assert.deepEqual(snapshot('communication_messages'),originals.messages);assert.deepEqual(snapshot('communication_drafts'),originals.drafts);checks+=2;
 check((await request<InboxThreadDetail>('inbox/'+thread.id)).draft?.id===inbox.draft?.id,'Original manual inbox draft is still available');
 const providers=await request<ProviderStatus>('providers');
 check(providers.usage.operations===0&&count('provider_operations')===0&&count('research_provider_calls')===0,'No real model or external research operation ran');
 check(count('messaging_outbox')===0&&count('communication_send_receipts')===0,'No employee/investor message was sent or queued');
 assert.throws(()=>getDb().prepare('UPDATE work_run_plans SET data=data WHERE run_id=?').run(first.id),/immutable/);checks++;
 assert.throws(()=>getDb().prepare('UPDATE work_step_receipts SET data=data WHERE run_id=?').run(first.id),/immutable/);checks++;
 assert.throws(()=>getDb().prepare('UPDATE work_budget_events SET data=data WHERE run_id=?').run(first.id),/immutable/);checks++;
 assert.throws(()=>getDb().prepare('UPDATE work_runs SET version=0 WHERE id=?').run(first.id),/CHECK/);checks++;
 // A trusted fictional host publishes; HTTP employees can only read and decide the exact quote.
 const scope=fingerprint({fixture:'whole-assignment-review'}),host={kind:'work' as const,id:unattended.id};
 const review=withAssignment(actor,host,()=>{quoteCurrentAssignment(actor,{title:'Fictional reasoning review',scopeHash:scope,revision:1,parts:[{key:'planning',feature:'core',rateId:'test-text-v1',maximumCalls:2,maximumUnits:{output_tokens:20200},estimatedUnits:{output_tokens:10000}}]});return presentCurrentAssignmentQuote(actor,{summary:'Review the fictional property and explain supported facts.',parts:[{key:'planning',label:'Read and explain the property'}]});});
 check((await request<{reviews:AssignmentReview[]}>('assignment-reviews')).reviews.some(r=>r.id===review.id&&r.maximumCents===101),'The employee sees one whole-assignment maximum');
 await request('assignment-reviews/'+review.id+'/claim','POST',{},404);
 await request('assignment-reviews/'+review.id+'/decision','POST',{quoteId:review.quoteId,revision:1,decision:'approve',eventKey:randomUUID(),maximumCents:1},400);
 const approvedRequest={quoteId:review.quoteId,revision:1,decision:'approve',eventKey:randomUUID()};
 check((await request<AssignmentReview>('assignment-reviews/'+review.id+'/decision','POST',approvedRequest)).state==='ready','HTTP approval records readiness without inventing execution');
 check((await request<AssignmentReview>('assignment-reviews/'+review.id+'/decision','POST',approvedRequest)).state==='ready','Exact HTTP retries preserve the original decision');
 withAssignment(actor,host,()=>{const claim=claimAssignmentContinuation(actor,review.id,()=>scope);check(claim.claimed,'The original host claims continuation');check(!claimAssignmentContinuation(actor,review.id,()=>scope).claimed,'Continuation never claims twice');completeAssignmentContinuation(actor,review.id,claim.token!);});
 check((await request<AssignmentReview>('assignment-reviews/'+review.id)).state==='continued','The saved continuation is visible in the employee interface');
 await request('session','POST',{role:'manager'});
 check((await request<{reviews:AssignmentReview[]}>('assignment-reviews')).reviews.length===0,'Managers do not inherit private spending reviews');
 await request('assignment-reviews/'+review.id,'GET',undefined,404);cookie=employeeCookie;
 assert.throws(()=>getDb().prepare('UPDATE assignment_reviews SET data=? WHERE id=?').run('{}',review.id),/immutable/);checks++;
 check((getDb().pragma('foreign_key_check') as unknown[]).length===0,'New and existing records satisfy foreign keys');
 check(getDb().pragma('integrity_check',{simple:true})==='ok','Disposable workspace remains structurally sound');
 console.info('PASS: '+checks+' durable-work HTTP/worker checks. Role starters, complete-job cost approval, saved progress, recovery, revised scope, child research, partial cancellation and preserved inbox/CRM; no real provider, messaging or payment operation.');
}finally{closeDb();}
