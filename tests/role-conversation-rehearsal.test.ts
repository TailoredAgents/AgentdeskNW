import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {HandoffBoard,HandoffItem} from '../src/lib/handoff-contracts';
import type {OpportunityDetail,OpportunityInput} from '../src/lib/opportunity-contracts';
import type {ToolResult} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {prepareDemoScenario} from '../src/server/demo-scenario';
import {getInboxState,getInboxThread} from '../src/server/communications';
import {getHandoff,getHandoffBoard,mutateHandoff} from '../src/server/handoffs';
import {getOpportunity,getOpportunityBoard,previewOpportunity,saveOpportunity} from '../src/server/opportunities';
import {chat} from '../src/server/orchestrator';
import {decideRolePreparation,listRolePreparations} from '../src/server/role-preparations';
import {createResearchJob,createTask,getDailyBrief,getManagementOverview,proposeInvestorUpdate} from '../src/server/services';

// Scripted provider output exercises real scoped tools, persistence and context replay.
// It is transport/workflow evidence, not a rating of actual model advice (C-07/C-08).
let sequence=0;
const key=()=>`role-conversation-${++sequence}`;
const acq=()=>demoActor('acquisitions'),manager=()=>demoActor('manager');
const currentOpportunity=()=>getOpportunityBoard(acq()).items.find(item=>item.address==='456 Preview Lane')!;
const message=(text:string)=>({id:key(),type:'message',role:'assistant',status:'completed',phase:'final_answer',content:[{type:'output_text',text,annotations:[]}]});
const call=(name:string,args:unknown,callId:string)=>({id:key(),type:'function_call',status:'completed',name,arguments:JSON.stringify(args),call_id:callId});
const answer=(output:unknown[])=>new Response(JSON.stringify({id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output,usage:{input_tokens:100,output_tokens:40,input_tokens_details:{cached_tokens:20}}}),{headers:{'content-type':'application/json'}});
type Mock=ReturnType<typeof vi.fn>;
const request=(mock:Mock,index:number)=>JSON.parse(mock.mock.calls[index][1].body as string) as {input:Array<Record<string,unknown>>};
const toolOutput=(mock:Mock,index:number,callId:string)=>{
 const result=request(mock,index).input.find(item=>item.type==='function_call_output'&&item.call_id===callId);
 expect(result).toBeDefined();
 return JSON.parse(result!.output as string) as ToolResult&{error?:string;completed?:boolean};
};
function revision(change:Partial<OpportunityInput>){
 const saved=currentOpportunity();
 const input:OpportunityInput={address:saved.address,city:saved.city,county:saved.county,state:saved.state,postalCode:saved.postalCode,propertyType:saved.propertyType,submission:saved.submission,closingTarget:saved.closingTarget,accessNotes:saved.accessNotes,status:saved.status,reviewNote:saved.reviewNote,...change};
 const preview=previewOpportunity(acq(),{id:saved.id,expectedVersion:saved.version,input});
 return saveOpportunity(acq(),{id:saved.id,expectedVersion:saved.version,input,reviewReference:preview.reviewReference,eventKey:key()});
}
const preparation=(item:HandoffItem)=>({releaseId:item.releaseId,expectedVersion:item.record?.version??0,expectedReleaseVersion:item.releaseVersion,action:'assign',assignedTo:acq().id,nextAction:'Ask the wholesaler for the repair scope and whether the occupant has agreed to Friday access.',dueAt:'2026-11-02T15:00:00.000Z',note:null,evidence:null,reportKind:null});

beforeEach(()=>{
 closeDb();sequence=0;
 vi.stubEnv('AGENTDESK_DB_PATH',':memory:');
 vi.stubEnv('AGENTDESK_DEMO','true');
 vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');
 vi.stubEnv('OPENAI_API_KEY','mock-key-never-sent');
 vi.stubEnv('OPENAI_MODEL','gpt-6-astra');
 vi.stubEnv('AGENTDESK_TEXT_SPENDING_MODE','operational');
 for(const variable of ['AGENTDESK_TEXT_MAX_ROUNDS','AGENTDESK_TEXT_MAX_TOOL_CALLS','AGENTDESK_TEXT_MAX_OUTPUT_TOKENS','AGENTDESK_TEXT_TIMEOUT_MS','AGENTDESK_TEXT_MAX_CONTEXT_BYTES'])vi.stubEnv(variable,'');
 vi.useFakeTimers({toFake:['Date']});
 vi.setSystemTime(new Date('2026-10-31T14:00:00Z'));
 prepareDemoScenario();
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('acquisition and management conversational continuity with mocked model transport',()=>{
 it('keeps a manager’s personal priorities and task links separate from their explicit office overview',async()=>{
  const taylor=manager(),alex=demoActor();
  const personal=createTask(taylor,{title:'Review my fictional GM presentation notes',dueAt:'2026-10-30T15:00:00.000Z'});
  const colleague=createTask(alex,{title:'Alex’s private reminder to check a repair question',dueAt:'2026-10-29T15:00:00.000Z'});
  const ownApproval=proposeInvestorUpdate(taylor,'investor-mike',{timeframe:'Manager-supplied fictional proposal'});
  const otherApproval=proposeInvestorUpdate(alex,'investor-mike',{timeframe:'Alex-supplied fictional proposal'});
  const research={provider:'synthetic-fixtures-v1' as const,address:'123 Fictional Road, Marietta, GA',county:'Cobb',price:235000,strategy:'Fix & flip',limit:1};
  const ownJob=createResearchJob(taylor,research),otherJob=createResearchJob(alex,research);
  const mock=vi.fn()
   .mockResolvedValueOnce(answer([call('daily_priorities',{},'personal-priorities')]))
   .mockResolvedValueOnce(answer([message('Your presentation reminder is overdue; you also have your own pending review and research job.')]));
  vi.stubGlobal('fetch',mock);
  const result=await chat(taylor,'What should I focus on personally this morning?',undefined,key());
  const brief=toolOutput(mock,1,'personal-priorities').data as ReturnType<typeof getDailyBrief>;
  expect(brief.tasks.map(task=>task.id)).toEqual([personal.id]);
  expect(brief.overdue.map(task=>task.id)).toEqual([personal.id]);
  expect(brief.pendingApprovals.map(action=>action.id)).toEqual([ownApproval.id]);
  expect(brief.activeJobs.map(job=>job.id)).toEqual([ownJob.id]);
  expect(brief.dormantInvestors.every(investor=>investor.ownerId===taylor.id)).toBe(true);
  expect(brief.summary).toBe('You have 1 open task, 1 overdue, 1 pending approval and 1 active research job.');
  expect(result.result.artifacts.filter(item=>item.type==='task').map(item=>item.id)).toEqual([personal.id]);
  expect(JSON.stringify(toolOutput(mock,1,'personal-priorities'))).not.toContain(colleague.title);
  const office=getManagementOverview(taylor);
  expect(office.tasks.map(task=>task.id)).toEqual(expect.arrayContaining([personal.id,colleague.id]));
  expect(office.pendingApprovals.map(action=>action.id)).toEqual(expect.arrayContaining([ownApproval.id,otherApproval.id]));
  expect(office.activeJobs.map(job=>job.id)).toEqual(expect.arrayContaining([ownJob.id,otherJob.id]));
  expect(office.dormantInvestors.some(investor=>investor.ownerId===alex.id)).toBe(true);
  expect(office.summary).toMatch(/^Your office has /);
 });

 it('retains the exact current acquisition blocker across short follow-ups without turning conditional access into a business effect',async()=>{
  const source=currentOpportunity(),before=getOpportunity(acq(),source.id),handoff=getHandoff(acq(),source.id);
  const mock=vi.fn()
   .mockResolvedValueOnce(answer([call('opportunity_review',{opportunityId:null},'opportunity-board')]))
   .mockResolvedValueOnce(answer([call('opportunity_review',{opportunityId:source.id},'opportunity-detail')]))
   .mockResolvedValueOnce(answer([message('Repair scope and walkthrough arrangements are still missing on Preview Lane.')]))
   .mockResolvedValueOnce(answer([message('Ask the wholesaler for the repair scope behind the supplied estimate first.')]))
   .mockResolvedValueOnce(answer([message('That is conditional access, not a confirmed walkthrough. Ask whether the occupant agrees; repair scope is still missing.')]));
  vi.stubGlobal('fetch',mock);
  const first=await chat(acq(),"What's holding up Preview Lane?",undefined,key());
  const detail=toolOutput(mock,2,'opportunity-detail').data as OpportunityDetail;
  expect(detail.opportunity.id).toBe(source.id);
  expect(detail.opportunityAccessReference).toBe(before.opportunityAccessReference);
  expect(detail.followThrough).toMatchObject({title:'Blocked',handoffId:source.id});
  expect(detail.followThrough!.lines).toContain(`Assigned next step: ${handoff.record!.nextAction}`);
  expect(detail.questions.some(question=>question.field==='repairs')).toBe(true);
  await chat(acq(),'What should I ask the wholesaler first?',first.conversation.id,key());
  expect(toolOutput(mock,3,'opportunity-detail').data).toEqual(detail);
  const conditional="They say we can walk it Friday, if the occupant agrees. Does that solve it?";
  await chat(acq(),conditional,first.conversation.id,key());
  expect(toolOutput(mock,4,'opportunity-detail').data).toEqual(detail);
  expect(request(mock,4).input.at(-1)).toEqual({role:'user',content:conditional});
  expect(getOpportunity(acq(),source.id)).toEqual(before);
  expect(getHandoff(acq(),source.id)).toEqual(handoff);
  expect(listRolePreparations(acq())).toEqual([]);
  expect(getDb().prepare('SELECT COUNT(*) n FROM messaging_outbox').get()).toEqual({n:0});
  expect(mock).toHaveBeenCalledTimes(5);
 });

 it('replaces stale acquisition advice with current sourced facts before a follow-up reaches the model',async()=>{
  const source=currentOpportunity(),staleMarker='old-blocker-advice-marker';
  const mock=vi.fn()
   .mockResolvedValueOnce(answer([call('opportunity_review',{opportunityId:source.id},'old-detail')]))
   .mockResolvedValueOnce(answer([message(staleMarker)]))
   .mockResolvedValueOnce(answer([call('opportunity_review',{opportunityId:source.id},'new-detail')]))
   .mockResolvedValueOnce(answer([message('Friday remains subject to occupant agreement. The earlier assignment needs a current review.')]));
  vi.stubGlobal('fetch',mock);
  const first=await chat(acq(),"What's holding up Preview Lane?",undefined,key());
  const original=toolOutput(mock,1,'old-detail').data as OpportunityDetail;
  revision({accessNotes:'Wholesaler reports a Friday walkthrough only if the occupant agrees; no agreement supplied.'});
  const result=await chat(acq(),'Does the new access note solve it?',first.conversation.id,key());
  const restarted=request(mock,2).input;
  expect(JSON.stringify(restarted)).not.toContain(staleMarker);
  expect(restarted.some(item=>item.type==='function_call_output'&&item.call_id==='old-detail')).toBe(false);
  const current=toolOutput(mock,3,'new-detail').data as OpportunityDetail;
  expect(current.opportunity.version).toBe(2);
  expect(current.opportunity.accessNotes).toContain('only if the occupant agrees');
  expect(current.opportunityAccessReference).not.toBe(original.opportunityAccessReference);
  expect(current.followThrough?.title).toBe('Source changed');
  expect(result.conversation.messages.find(item=>item.content===staleMarker)).toBeUndefined();
  expect(getHandoff(acq(),source.id).record?.resolution).toBeNull();
  expect(current.opportunity.status).toBe('reviewing');
 });

 it('carries a manager selection into one exact pending review and applies it only through the employee decision service',async()=>{
  const source=currentOpportunity(),before=getHandoff(manager(),source.id),input=preparation(before),board=getHandoffBoard(manager());
  const mock=vi.fn()
   .mockResolvedValueOnce(answer([call('handoff_overview',{},'office-board')]))
   .mockResolvedValueOnce(answer([message('Jordan has a blocked Preview Lane follow-up; the released property also needs an assigned next step.')]))
   .mockResolvedValueOnce(answer([message(`Start with Preview Lane. Have Jordan ask for the repair scope and occupant agreement by Monday at 10 a.m. Eastern.`)]))
   .mockResolvedValueOnce(answer([call('prepare_handoff_action',input,'prepare-selected')]))
   .mockResolvedValueOnce(answer([message('The Preview Lane next step is saved for your review in Work. Jordan’s shared assignment has not changed.')]));
  vi.stubGlobal('fetch',mock);
  const first=await chat(manager(),'What needs my attention this morning?',undefined,key());
  const currentBoard=toolOutput(mock,1,'office-board').data as HandoffBoard;
  expect(currentBoard.metrics).toEqual(board.metrics);
  expect(currentBoard.handoffAccessReference).toBe(board.handoffAccessReference);
  const selected=currentBoard.items.find(item=>item.releaseId===source.id)!;
  expect(selected).toMatchObject({sourceKind:'opportunity',attention:'blocked',assigneeName:acq().name});
  expect(selected.eligibleAssignees.map(person=>person.id)).toEqual([acq().id]);
  await chat(manager(),'Which one would you tackle first?',first.conversation.id,key());
  expect((toolOutput(mock,2,'office-board').data as HandoffBoard).items).toEqual(board.items);
  const requestId=key(),prompt='Prepare that next step for review.';
  const result=await chat(manager(),prompt,first.conversation.id,requestId);
  const preparations=listRolePreparations(manager());
  expect(preparations).toHaveLength(1);
  const prepared=preparations[0];
  expect(prepared).toMatchObject({state:'pending',current:true,outcomeId:null});
  expect(prepared.body).toContain(source.address);
  expect(prepared.body).toContain(input.nextAction);
  expect(prepared.body).toContain(`Follow-up v${before.record!.version}`);
  expect(result.result.artifacts.some(item=>item.id===source.id&&(item.data as {preparationId?:string}|undefined)?.preparationId===prepared.id)).toBe(true);
  expect(getHandoff(manager(),source.id)).toEqual(before);
  expect(listRolePreparations(acq())).toEqual([]);
  await chat(manager(),prompt,first.conversation.id,requestId);
  expect(mock).toHaveBeenCalledTimes(5);
  expect(listRolePreparations(manager())).toHaveLength(1);
  expect(getDb().prepare('SELECT COUNT(*) n FROM role_preparation_decisions').get()).toEqual({n:0});
  decideRolePreparation(manager(),prepared.id,{reference:prepared.reference,decision:'apply',eventKey:key()});
  const after=getHandoff(manager(),source.id);
  expect(after.record).toMatchObject({assignedTo:acq().id,nextAction:input.nextAction,state:'assigned',acknowledgedAt:null,outcome:null,resolution:null});
  expect(after.history).toHaveLength(before.history.length+1);
  expect(getOpportunity(acq(),source.id).opportunity.version).toBe(source.version);
 });

 it('rejects a model preparation using an earlier handoff version after another employee changes the selected work',async()=>{
  const source=currentOpportunity(),before=getHandoff(manager(),source.id),oldInput=preparation(before),staleMarker='stale-manager-selection-marker';
  const mock=vi.fn()
   .mockResolvedValueOnce(answer([call('handoff_overview',{},'prior-board')]))
   .mockResolvedValueOnce(answer([message(staleMarker)]))
   .mockResolvedValueOnce(answer([call('prepare_handoff_action',oldInput,'stale-prepare')]))
   .mockResolvedValueOnce(answer([message('That follow-up changed. I need to review the current assignment before preparing it.')]));
  vi.stubGlobal('fetch',mock);
  const first=await chat(manager(),'Review my office handoffs and identify the first one to address.',undefined,key());
  mutateHandoff(manager(),source.id,{action:'assign',assignedTo:acq().id,nextAction:'Review the corrected fictional access instructions before asking for another walkthrough.',dueAt:'2026-11-03T15:00:00.000Z',expectedVersion:before.record!.version,expectedReleaseVersion:before.releaseVersion,eventKey:key()});
  const changed=getHandoff(manager(),source.id);
  await chat(manager(),'Prepare that next step for review.',first.conversation.id,key());
  expect(JSON.stringify(request(mock,2).input)).not.toContain(staleMarker);
  expect(request(mock,2).input.some(item=>item.type==='function_call_output'&&item.call_id==='prior-board')).toBe(false);
  expect(toolOutput(mock,3,'stale-prepare')).toMatchObject({completed:false,error:'The handoff changed. Prepare its current version.'});
  expect(listRolePreparations(manager())).toEqual([]);
  expect(getHandoff(manager(),source.id)).toEqual(changed);
 });

 it('does not extend management board access into a colleague’s private mailbox on a follow-up',async()=>{
  const alex=demoActor(),thread=getInboxState(alex).threads.find(item=>item.correspondent.address==='mike@example.com')!;
  const privateDetail=getInboxThread(alex,thread.id),privateBody=privateDetail.messages.find(item=>item.body)!.body;
  const mock=vi.fn()
   .mockResolvedValueOnce(answer([call('handoff_overview',{},'manager-board')]))
   .mockResolvedValueOnce(answer([message('Preview Lane has a blocked follow-up assigned to Jordan.')]))
   .mockResolvedValueOnce(answer([call('inbox_thread',{threadId:thread.id},'colleague-mailbox')]))
   .mockResolvedValueOnce(answer([message('Your office role does not provide access to Alex’s private correspondence.')]));
  vi.stubGlobal('fetch',mock);
  const first=await chat(manager(),'What needs my attention this morning?',undefined,key());
  await chat(manager(),`Also inspect Alex's inbox conversation ${thread.id}.`,first.conversation.id,key());
  const failure=toolOutput(mock,3,'colleague-mailbox');
  expect(failure.completed).toBe(false);
  expect(failure.error).toMatch(/not found|private|access/i);
  expect(JSON.stringify(request(mock,3).input)).not.toContain(privateBody);
  expect(getInboxThread(alex,thread.id)).toEqual(privateDetail);
  expect(listRolePreparations(manager())).toEqual([]);
 });
});
