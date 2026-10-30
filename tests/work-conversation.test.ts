import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor,ToolResult} from '../src/lib/contracts';
import type {WorkRun} from '../src/lib/work-contracts';
import type {WorkConversationCostReview,WorkConversationOptions} from '../src/lib/work-conversation-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {createConversation,addMessage} from '../src/server/services';
import {chat} from '../src/server/orchestrator';
import {buildWorkPreset} from '../src/server/work-presets';
import {createWorkRun,getWorkRun,controlWorkRun,processWorkRuns} from '../src/server/work-runs';
import {executeWorkConversationAction,workConversationIntent,workConversationReference} from '../src/server/work-conversation';

let actor:Actor,conversationId:string,sequence:number;
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected external provider call');}));vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T16:00:00Z'));actor=demoActor();conversationId=createConversation(actor).id;sequence=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
const id=()=>`work-conversation-${++sequence}`;
const advance=(ms=1)=>vi.setSystemTime(new Date(Date.now()+ms));
const run=(research=false)=>createWorkRun(actor,{requestId:id(),conversationId,...buildWorkPreset(actor,{presetId:'dispositions',propertyId:'property-maple',investorId:'investor-mike',includeResearch:research})});
const ask=(message:string,options:WorkConversationOptions={},requestId=id())=>executeWorkConversationAction(actor,message,conversationId,requestId,options);
const review=(job:WorkRun,options:WorkConversationOptions={})=>ask(`Review job ${workConversationReference(job.id)}`,options)!;
const cost=(result:ToolResult)=>(result.data as {review:WorkConversationCostReview}).review;

describe('actual employee durable-work conversation commands',()=>{
 it('recognizes complete commands without treating quotes, transcripts, conditionals or negation as authority',()=>{
  expect(workConversationIntent('Could you please pause job W1234ABCD?')).toMatchObject({action:'pause',target:'W1234ABCD'});
  expect(workConversationIntent('Approve A1234ABCD.')).toMatchObject({action:'approve',target:'A1234ABCD'});
  for(const message of ['"Approve A1234ABCD"','Mike said approve A1234ABCD','If I say so, approve A1234ABCD','Do not cancel job W1234ABCD','Transcript:\nPause job W1234ABCD','Please summarize: Approve A1234ABCD'])expect(workConversationIntent(message)).toBeNull();
 });
 it('lists stable scoped references and reports actual saved progress',()=>{
  const job=run();expect(ask('Show my Copilot jobs')?.message).toContain(workConversationReference(job.id));
  expect(ask(`Show job ${workConversationReference(job.id)}`)?.message).toContain('0/4');processWorkRuns(actor,10);
  const result=ask(`Check progress of job ${workConversationReference(job.id)}`)!;expect(result.message).toContain('4/4');expect(result.message).toContain('$0.75 spent');expect(result.artifacts[0].data).toMatchObject({workRunId:job.id,workPlanVersion:1});
 });
 it('never chooses an arbitrary job for a vague pause request even when only one exists',()=>{
  const job=run();const result=ask('Pause that job')!;expect(result.message).toContain('Which saved job');expect(getWorkRun(actor,job.id).status).toBe('queued');
  run();expect(ask('Cancel my job')?.message).toContain('Which saved job');
 });
 it('pauses and resumes from the same conversation across channels without duplicate commands',()=>{
  const job=run(),reference=workConversationReference(job.id),key=id();
  const first=ask(`Pause job ${reference}`,{channel:'mobile'},key)!;expect(getWorkRun(actor,job.id).status).toBe('paused');
  expect(ask(`Pause job ${reference}`,{channel:'mobile'},key)).toEqual(first);
  expect(()=>ask(`Cancel job ${reference}`,{channel:'mobile'},key)).toThrow('different work');
  advance();ask(`Resume job ${reference}`,{channel:'sms',receivedAt:new Date().toISOString()});expect(getWorkRun(actor,job.id).status).toBe('queued');
  ask(`Cancel job ${reference}`,{channel:'web'});expect(getWorkRun(actor,job.id).status).toBe('canceled');expect(fetch).not.toHaveBeenCalled();
 });
 it('uses an immutable exact review and employee token to approve the whole job',()=>{
  const job=run(true),result=review(job,{channel:'mobile'}),decision=cost(result);
  expect(decision.maximumCents).toBe(325);expect(result.message).toContain('Mike Bennett');expect(result.message).toContain('123 Example Street');expect(result.message).toContain('12 prospects');expect(result.message).toContain('Personal task');
  expect(getWorkRun(actor,job.id).status).toBe('waiting_cost_approval');advance();
  const key=id(),accepted=ask(decision.approveCommand,{channel:'sms',receivedAt:new Date().toISOString()},key)!;expect(accepted.message).toContain('$3.25');expect(getWorkRun(actor,job.id).status).toBe('queued');expect(ask(decision.approveCommand,{channel:'sms',receivedAt:new Date().toISOString()},key)).toEqual(accepted);expect(fetch).not.toHaveBeenCalled();
 });
 it('rejects generic yes and model-like embedded commands without approving a job',()=>{
  const job=run(true);review(job);
  ask('yes');ask('approve it');ask('Here is a message: Approve A1234ABCD');expect(getWorkRun(actor,job.id).status).toBe('waiting_cost_approval');
 });
 it('denial cancels unpaid work and consumes no credits',()=>{
  const job=run(true),decision=cost(review(job));advance();ask(decision.denyCommand);const current=getWorkRun(actor,job.id);expect(current.status).toBe('canceled');expect(current.budget.spentCents).toBe(0);expect(current.steps.every(step=>step.status==='canceled')).toBe(true);
 });
 it('cannot use another employee’s review, conversation or job reference',()=>{
  const job=run(true),decision=cost(review(job)),other=demoActor('manager'),otherConversation=createConversation(other).id;
  expect(executeWorkConversationAction(other,decision.approveCommand,otherConversation,id())?.message).toContain('not available');
  expect(executeWorkConversationAction(other,`Show job ${workConversationReference(job.id)}`,otherConversation,id())?.message).toContain('No active saved jobs');
  expect(executeWorkConversationAction(other,`Cancel job ${job.id}`,otherConversation,id())?.message).toContain('not found');
  expect(()=>executeWorkConversationAction(other,decision.approveCommand,conversationId,id())).toThrow();expect(getWorkRun(actor,job.id).status).toBe('waiting_cost_approval');
 });
 it('rejects a review after quote expiry or intervening job revision',()=>{
  const job=run(true),decision=cost(review(job));advance(16*60_000);expect(ask(decision.approveCommand)?.message).toContain('expired');
  const refreshed=controlWorkRun(actor,job.id,{action:'resume',expectedVersion:job.version,eventKey:id()}),freshDecision=cost(review(refreshed));
  ask(`Remove research from job ${workConversationReference(job.id)}`);expect(ask(freshDecision.approveCommand)?.message).toContain('changed');expect(getWorkRun(actor,job.id).planVersion).toBe(2);
 });
 it('cannot approve after access to the exact reviewed source is lost and cannot replay protected receipt content',()=>{
  const job=run(true),key=id(),result=ask(`Review job ${workConversationReference(job.id)}`,{},key)!,decision=cost(result);
  getDb().prepare("UPDATE investors SET owner_id='user-jordan' WHERE id='investor-mike'").run();
  expect(ask(decision.approveCommand)?.message).toContain('Source access');expect(()=>ask(`Review job ${workConversationReference(job.id)}`,{},key)).toThrow('Access to this result');
 });
 it('rejects decisions that arrived before their review was created',()=>{
  const before=new Date(Date.now()-1000).toISOString(),job=run(true),decision=cost(review(job));expect(ask(decision.approveCommand,{channel:'sms',receivedAt:before})?.message).toContain('predates');
 });
 it('requires confirmed review delivery for a channel-origin review before a later SMS decision',()=>{
  const job=createWorkRun(actor,{requestId:id(),conversationId,title:'Two local relationship checks',instructions:'Review the relationships with current sources.',steps:[{key:'one',capabilityId:'relationship_next_step',input:{investorId:'investor-mike'},dependsOn:[]},{key:'two',capabilityId:'relationship_next_step',input:{investorId:'investor-sarah'},dependsOn:[]},{key:'three',capabilityId:'relationship_next_step',input:{investorId:'investor-david'},dependsOn:[]}]});
  const key=id(),result=ask(`Review job ${workConversationReference(job.id)}`,{channel:'sms'},key)!,decision=cost(result);advance();
  expect(ask(decision.approveCommand,{channel:'sms',receivedAt:new Date().toISOString()})?.message).toContain('not been confirmed');
  const stamp=new Date().toISOString();getDb().prepare('INSERT INTO assistant_turns VALUES(?,?,?,?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,actor.id,key,conversationId,'test-hash','completed',stamp,JSON.stringify({messageId:'message-review-test'}));
  getDb().prepare('INSERT INTO messaging_links VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('link-review',actor.organizationId,actor.officeId,actor.id,'sms','ACTEST','+14045550199','+14045550199',1,0,0,stamp,stamp);
  getDb().prepare('INSERT INTO messaging_outbox VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('out-review','link-review','review-delivery','reply','message-review-test','','unknown',null,null,0,null,stamp,stamp,null,null);
  advance();expect(ask(decision.approveCommand,{channel:'sms',receivedAt:new Date().toISOString()})?.message).toContain('not been confirmed');
  getDb().prepare("UPDATE messaging_outbox SET status='accepted',updated_at=? WHERE id='out-review'").run(new Date().toISOString());advance();expect(ask(decision.approveCommand,{channel:'sms',receivedAt:new Date().toISOString()})?.message).toContain('Approved this plan');
 });
 it('does not create an approval token when the complete exact scope would be truncated by SMS',()=>{
  const job=run(true);const stored=getDb().prepare('SELECT data FROM work_runs WHERE id=?').get(job.id) as {data:string};const value=JSON.parse(stored.data);value.steps.find((step:{key:string})=>step.key==='followup').input.title='A long personal task '.repeat(11);getDb().prepare('UPDATE work_runs SET data=? WHERE id=?').run(JSON.stringify(value),job.id);
  const result=review(getWorkRun(actor,job.id),{channel:'sms'});expect(result.message).toContain('too long');expect(result.data).toBeUndefined();expect(getDb().prepare('SELECT count(*) n FROM work_conversation_reviews').get()).toEqual({n:0});
 });
 it('revises supported pending starter work and refreshes cost review without changing completed results',()=>{
  const job=run();processWorkRuns(actor,2);const original=getWorkRun(actor,job.id),reference=workConversationReference(job.id);
  expect(ask(`Add research to job ${reference}`)?.message).toContain('Remaining work revised');let changed=getWorkRun(actor,job.id);expect(changed.status).toBe('waiting_cost_approval');expect(changed.budget.maximumCents).toBe(315);expect(changed.steps[0].result).toEqual(original.steps[0].result);expect(changed.steps[1].result).toEqual(original.steps[1].result);
  ask(`Change investor for job ${reference} to Sarah Chen`);changed=getWorkRun(actor,job.id);expect(changed.steps.find(step=>step.key==='relationship')?.input.investorId).toBe('investor-sarah');
  ask(`Remove fictional research from job ${reference}`);changed=getWorkRun(actor,job.id);expect(changed.steps.some(step=>step.capabilityId==='start_synthetic_research')).toBe(false);expect(changed.status).toBe('queued');
 });
 it('refuses edits that would erase completed work, while partial cancellation keeps consumed credits',()=>{
  const job=run();processWorkRuns(actor,3);const reference=workConversationReference(job.id);expect(ask(`Change investor for job ${reference} to Sarah Chen`)?.message).toContain('already completed');
  ask(`Cancel job ${reference}`);const canceled=getWorkRun(actor,job.id);expect(canceled.status).toBe('canceled');expect(canceled.budget.spentCents).toBe(75);expect(canceled.budget.reservedCents).toBe(0);expect(canceled.steps.filter(step=>step.status==='completed')).toHaveLength(3);
 });

 it('uses one latest structured work artifact for a convenient pointer, but never competing task context',()=>{
  const job=run(),first=ask(`Show job ${workConversationReference(job.id)}`)!;
  addMessage(actor,conversationId,{role:'assistant',content:first.message,artifacts:first.artifacts});advance();
  ask('Pause that job',{channel:'sms',receivedAt:new Date().toISOString()});expect(getWorkRun(actor,job.id).status).toBe('paused');
  ask('Resume it');expect(getWorkRun(actor,job.id).status).toBe('queued');
  addMessage(actor,conversationId,{role:'assistant',content:'Here are two things.',artifacts:[...first.artifacts,{type:'task',id:'task-call-mike',title:'Another personal task'}]});
  expect(ask('Cancel it')?.message).toContain('Which saved job');expect(getWorkRun(actor,job.id).status).toBe('queued');
 });
 it('leaves a task-only pointer available to the existing personal-task handler',()=>{
  run();addMessage(actor,conversationId,{role:'assistant',content:'Your task is ready.',artifacts:[{type:'task',id:'task-call-mike',title:'Call Mike'}]});expect(ask('Cancel it')).toBeNull();
 });
 it('requires fresh selection for a withheld job pointer without changing an older task or calling a model',async()=>{
  vi.stubEnv('OPENAI_API_KEY','fictional-no-provider-allowed');
  const job=run(),first=ask(`Show job ${workConversationReference(job.id)}`)!;
  addMessage(actor,conversationId,{role:'assistant',content:'Your task is ready.',artifacts:[{type:'task',id:'task-call-mike',title:'Call Mike'}]});
  addMessage(actor,conversationId,{role:'assistant',content:first.message,artifacts:first.artifacts});
  const tasksBefore=getDb().prepare('SELECT id,data FROM tasks ORDER BY id').all();
  getDb().prepare("UPDATE investors SET owner_id='user-jordan' WHERE id='investor-mike'").run();advance();
  const result=await chat(actor,'Cancel it',conversationId,id(),'mobile');
  expect(result.result.message).toContain('Which saved job');
  expect(result.result.message).not.toContain('Mike Bennett');
  expect(getWorkRun(actor,job.id).status).toBe('queued');
  expect(getDb().prepare('SELECT id,data FROM tasks ORDER BY id').all()).toEqual(tasksBefore);
  expect(fetch).not.toHaveBeenCalled();
 });
 it('requires fresh explicit selection after a job plan changed or an unrelated assistant response',()=>{
  const job=run(),first=ask(`Show job ${workConversationReference(job.id)}`)!;
  addMessage(actor,conversationId,{role:'assistant',content:first.message,artifacts:first.artifacts});
  ask(`Add research to job ${workConversationReference(job.id)}`);
  expect(ask('Cancel that job')?.message).toContain('Which saved job');expect(getWorkRun(actor,job.id).status).toBe('waiting_cost_approval');
  addMessage(actor,conversationId,{role:'assistant',content:'Here is an unrelated answer.'});expect(ask('Pause it')).toBeNull();
 });
 it('does not use a structured reply created after a queued message arrived',()=>{
  const job=run(),before=new Date().toISOString();advance();const first=ask(`Show job ${workConversationReference(job.id)}`)!;
  addMessage(actor,conversationId,{role:'assistant',content:first.message,artifacts:first.artifacts});advance();
  expect(ask('Cancel it',{channel:'sms',receivedAt:before})?.message).toContain('Which saved job');expect(getWorkRun(actor,job.id).status).toBe('queued');
 });
 it('handles actual chat approvals before any model request and preserves mobile-to-SMS continuity',async()=>{
  vi.stubEnv('OPENAI_API_KEY','fictional-no-provider-allowed');const job=run(true),reference=workConversationReference(job.id);
  const shown=await chat(actor,`Review job ${reference}`,conversationId,id(),'mobile');const code=/Approve (A[0-9A-F]{8})/.exec(shown.result.message)![1];
  advance();const approved=await chat(actor,`Approve ${code}`,conversationId,id(),'sms',{receivedAt:new Date().toISOString()});expect(approved.result.message).toContain('Approved this plan');expect(getWorkRun(actor,job.id).status).toBe('queued');expect(fetch).not.toHaveBeenCalled();
  advance();const canceled=await chat(actor,'Cancel that job',conversationId,id(),'mobile');expect(canceled.result.message).toContain('Canceled remaining work');expect(getWorkRun(actor,job.id).status).toBe('canceled');
 });
 it('returns a useful stale SMS approval explanation without a failed conversation or new model request',async()=>{
  vi.stubEnv('OPENAI_API_KEY','fictional-no-provider-allowed');const job=run(true),reference=workConversationReference(job.id);
  const shown=await chat(actor,`Review job ${reference}`,conversationId,id(),'mobile');const code=/Approve (A[0-9A-F]{8})/.exec(shown.result.message)![1];
  advance();await chat(actor,`Remove research from job ${reference}`,conversationId,id(),'mobile');advance();
  const key=id(),declined=await chat(actor,`Approve ${code}`,conversationId,key,'sms',{receivedAt:new Date().toISOString()});
  expect(declined.result.message).toContain('changed after review');expect(getDb().prepare('SELECT status FROM assistant_turns WHERE request_id=?').get(key)).toEqual({status:'completed'});expect(fetch).not.toHaveBeenCalled();
 });
 it('does not overwrite custom plans or silently accept unsupported instruction edits',()=>{
  const job=createWorkRun(actor,{requestId:id(),title:'Custom property lookup',instructions:'Look at the current property.',steps:[{key:'custom',capabilityId:'inspect_property',input:{propertyId:'property-maple'},dependsOn:[]}]});
  expect(ask(`Add research to job ${workConversationReference(job.id)}`)?.message).toContain('custom work plan');expect(ask('Change that job to send everyone an email')?.message).toContain('Nothing was changed');expect(getWorkRun(actor,job.id).planVersion).toBe(1);
 });
});
