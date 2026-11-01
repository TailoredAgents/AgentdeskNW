import {chat} from '../src/server/orchestrator';
import {voiceContextSnapshot} from '../src/server/voice-context';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import type {ReleaseInput} from '../src/lib/intelligence-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {saveRelease,getRelease} from '../src/server/workflows';
import {getHandoffBoard,getHandoff,mutateHandoff,handoffMutationSchema} from '../src/server/handoffs';
import {createTask} from '../src/server/services';
import {mutateTask} from '../src/server/task-actions';
import {collectHistoryReferences,historyReferencesVisible} from '../src/server/history';
import {executeWorkCapability,validateStoredWorkOutput} from '../src/server/work-capabilities';
import {emptyOpportunity,type OpportunityInput} from '../src/lib/opportunity-contracts';
import {previewOpportunity,saveOpportunity} from '../src/server/opportunities';
let manager:Actor,alex:Actor,jordan:Actor,releaseId:string;
const due='2026-11-01T15:00:00.000Z';
function release(changes:Partial<ReleaseInput>={}){return saveRelease(jordan,{propertyId:'property-maple',status:'released',source:'Fictional wholesaler submission',eventKey:'initial',propertyType:'House',description:'Fictional house',notes:'',mediaUrl:null,mediaAccess:'unverified',arv:null,repairEstimate:null,economicsSource:'',showingInstructions:'',authorizedUserIds:[alex.id],upstreamParty:'Fictional wholesaler',upstreamStage:'Reviewed',downstreamStage:'Awaiting handoff',closingStructure:'unspecified',closingAt:'2026-11-03T15:00:00.000Z',...changes});}
const base=(actor=manager)=>{const item=getHandoff(actor,releaseId);return {eventKey:crypto.randomUUID(),expectedVersion:item.record?.version??0,expectedReleaseVersion:item.releaseVersion};};
const assign=()=>mutateHandoff(manager,releaseId,{...base(),action:'assign',assignedTo:alex.id,nextAction:'Confirm access and the closing target',dueAt:due});
const ack=()=>mutateHandoff(alex,releaseId,{...base(alex),action:'acknowledge'});
const report=(kind:'blocked'|'resolved'='resolved')=>mutateHandoff(alex,releaseId,{...base(alex),action:'report',kind,note:kind==='blocked'?'Access is still awaiting confirmation.':'The requested access details were recorded.',evidence:'Fictional operational record #42, October 30'});
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T16:00:00Z'));manager=demoActor('manager');alex=demoActor();jordan=demoActor('acquisitions');releaseId=release().id;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();});
describe('shared handoff follow-through',()=>{
 it('persists the read-only handoff link in the ongoing employee conversation',async()=>{const result=await chat(manager,'Show office handoffs.',undefined,'handoff-read');expect(result.result.artifacts[0].type).toBe('handoff');expect(result.result.message).toContain('No coordination assignment');});
 it('shows sourced gaps without inferring an acknowledgment or reading correspondence',()=>{const board=getHandoffBoard(manager),item=board.items[0];expect(item.attention).toBe('closing_soon');expect(item.evidence.join(' ')).toContain('No coordination assignment');expect(item.owner.name).toBe(jordan.name);expect(item.record).toBeNull();expect(board.method.notice).toContain('not company policy');expect(getHandoffBoard(alex).items).toEqual([]);expect(JSON.stringify(board)).not.toContain('mike@example.com');});
 it('completes assignment, employee acknowledgment, evidenced report and separate manager resolution',()=>{assign();expect(getHandoffBoard(alex).items).toHaveLength(1);expect(getHandoffBoard(jordan).items).toEqual([]);ack();report();const review=getHandoff(manager,releaseId);expect(review.attention).toBe('review');expect(review.record?.state).toBe('reported');expect(review.actions).toContain('resolve');const resolved=mutateHandoff(manager,releaseId,{...base(),action:'resolve',note:'Reviewed the supplied operational evidence.'});expect(resolved.record?.state).toBe('resolved');expect(resolved.history).toHaveLength(4);expect(getRelease(jordan,releaseId).downstreamStage).toBe('Awaiting handoff');expect(getDb().prepare('SELECT COUNT(*) n FROM messaging_outbox').get()).toEqual({n:0});});
 it('cannot resolve a blocked or unreported outcome, and the manager cannot acknowledge for the employee',()=>{assign();expect(()=>mutateHandoff(manager,releaseId,{...base(),action:'acknowledge'})).toThrow('not available');expect(()=>mutateHandoff(alex,releaseId,{...base(alex),action:'report',kind:'resolved',note:'A reported outcome',evidence:'A source reference'})).toThrow('not available');ack();report('blocked');expect(getHandoff(manager,releaseId).attention).toBe('blocked');expect(()=>mutateHandoff(manager,releaseId,{...base(),action:'resolve',note:'Assume it is complete.'})).toThrow('not available');});
 it('rejects source-free outcome claims, forged scope and invalid deadlines',()=>{expect(()=>handoffMutationSchema.parse({...base(),action:'report',kind:'resolved',note:'A result',evidence:''})).toThrow();expect(()=>handoffMutationSchema.parse({...base(),action:'acknowledge',organizationId:'forged'})).toThrow();expect(()=>mutateHandoff(manager,releaseId,{...base(),action:'assign',assignedTo:alex.id,nextAction:'Confirm the target',dueAt:'2026-01-01T00:00:00Z'})).toThrow('future');});
 it('replays an exact decision once, returns current state and rejects conflicting event reuse',()=>{const input={...base(),action:'assign' as const,assignedTo:alex.id,nextAction:'Confirm access',dueAt:due};mutateHandoff(manager,releaseId,input);ack();expect(mutateHandoff(manager,releaseId,input).record?.version).toBe(2);expect(()=>mutateHandoff(manager,releaseId,{...input,nextAction:'Change access'})).toThrow('different');expect(getDb().prepare('SELECT COUNT(*) n FROM handoff_events').get()).toEqual({n:2});});
 it('rejects stale competing writes without changing the recorded outcome',()=>{assign();const old=base(alex);ack();expect(()=>mutateHandoff(alex,releaseId,{...old,action:'report',kind:'resolved',note:'A stale result',evidence:'An old reference'})).toThrow('changed');expect(getHandoff(alex,releaseId).record?.outcome).toBeNull();});
 it('requires refreshing the assignment after release revisions and preserves earlier evidence',()=>{assign();ack();report();release({eventKey:'revision',expectedVersion:1,downstreamStage:'Changed deadline',closingAt:'2026-11-05T15:00:00Z'});const changed=getHandoff(manager,releaseId);expect(changed.sourceChanged).toBe(true);expect(changed.attention).toBe('source_changed');expect(changed.actions).not.toContain('resolve');expect(getHandoff(alex,releaseId).actions).toEqual([]);const reset=assign();expect(reset.record).toMatchObject({releaseVersion:2,state:'assigned',outcome:null,acknowledgedAt:null});expect(reset.history.some(event=>event.record.outcome?.evidence.includes('#42'))).toBe(true);});
 it('withdrawal stops actions and revocation hides assignments without deleting history',()=>{assign();release({eventKey:'withdraw',expectedVersion:1,status:'withdrawn'});expect(getHandoff(alex,releaseId).actions).toEqual([]);expect(()=>mutateHandoff(alex,releaseId,{...base(alex),action:'acknowledge'})).toThrow('not available');release({eventKey:'revoke',expectedVersion:2,status:'released',authorizedUserIds:[]});expect(getHandoffBoard(alex).items).toEqual([]);expect(()=>getHandoff(alex,releaseId)).toThrow('not available');expect(getHandoff(manager,releaseId).history).toHaveLength(1);});
 it('assignment cannot grant source access or cross an office/tenant boundary',()=>{expect(()=>mutateHandoff(manager,releaseId,{...base(),action:'assign',assignedTo:'user-savannah',nextAction:'Confirm access',dueAt:due})).toThrow('current access');expect(()=>mutateHandoff(alex,releaseId,{...base(),action:'assign',assignedTo:alex.id,nextAction:'Confirm access',dueAt:due})).toThrow('role');expect(()=>getHandoff({...manager,officeId:'office-savannah'},releaseId)).toThrow();const other={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions' as const};expect(getHandoffBoard(other).items).toEqual([]);});
 it('a completed personal task is not a handoff acknowledgment or outcome',()=>{assign();const task=createTask(alex,{title:'Confirm handoff',investorId:null,dueAt:null});mutateTask(alex,task.id,{action:'complete',expectedVersion:task.version??0,eventKey:'complete'});expect(getHandoff(manager,releaseId).record).toMatchObject({state:'assigned',acknowledgedAt:null,outcome:null});});
 it('due and closing signals use actual stored dates and never report unverified completion',()=>{assign();vi.setSystemTime(new Date('2026-11-02T16:00:00Z'));expect(getHandoff(manager,releaseId).attention).toBe('overdue');expect(getHandoff(manager,releaseId).record?.state).toBe('assigned');});
 it('changed evidence withholds old Copilot history and saved work without rewriting receipts',()=>{const result=executeWorkCapability(manager,{key:'review',capabilityId:'office_priorities',input:{},dependsOn:[]},{});const refs=collectHistoryReferences(manager,result.artifacts),saved=JSON.stringify(result),voice=voiceContextSnapshot(manager);expect(historyReferencesVisible(manager,refs)).toBe(true);expect(getHandoffBoard({role:manager.role,officeId:manager.officeId,name:manager.name,id:manager.id,organizationId:manager.organizationId}).handoffAccessReference).toBe(getHandoffBoard(manager).handoffAccessReference);validateStoredWorkOutput(manager,{key:'review',capabilityId:'office_priorities',input:{},dependsOn:[]},result);assign();expect(voiceContextSnapshot(manager)).not.toEqual(voice);expect(historyReferencesVisible(manager,refs)).toBe(false);expect(()=>validateStoredWorkOutput(manager,{key:'review',capabilityId:'office_priorities',input:{},dependsOn:[]},result)).toThrow('handoff evidence changed');expect(JSON.stringify(result)).toBe(saved);});
 it('defines overlapping operational metrics without inflating the denominator',()=>{assign();ack();report('blocked');vi.setSystemTime(new Date('2026-11-02T16:00:00Z'));const board=getHandoffBoard(manager);expect(board.metrics).toMatchObject({active:1,unresolvedAssigned:1,overdue:1,blocked:1,awaitingAcknowledgment:0,awaitingReview:0});expect(board.summary).toContain('1 of 1');expect(board.metrics?.notice).toContain('can overlap');});
 it('counts reported work as unresolved until independent manager review',()=>{assign();ack();report();expect(getHandoffBoard(manager).metrics).toMatchObject({unresolvedAssigned:1,awaitingReview:1,resolved:0});mutateHandoff(manager,releaseId,{...base(),action:'resolve',note:'Reviewed the reported evidence.'});expect(getHandoffBoard(manager).metrics).toMatchObject({unresolvedAssigned:0,awaitingReview:0,resolved:1});});
 it('separates changed-source and withdrawn assignments from current overdue work',()=>{assign();vi.setSystemTime(new Date('2026-11-02T16:00:00Z'));release({eventKey:'withdraw-metrics',expectedVersion:1,status:'withdrawn'});expect(getHandoffBoard(manager).metrics).toMatchObject({visible:1,active:0,changedSource:1,unresolvedAssigned:0,overdue:0});});
 it('counts unassigned sources separately and produces meaningful zeroes for an empty view',()=>{expect(getHandoffBoard(manager).metrics).toMatchObject({active:1,unassigned:1,unresolvedAssigned:0});expect(getHandoffBoard(alex).metrics).toMatchObject({visible:0,active:0,overdue:0});expect(getHandoffBoard(alex).summary).toContain('0 of 0');});
 it('orders equally urgent work by its actual deadline instead of alphabetic address',()=>{assign();const second=release({propertyId:'property-cedar',eventKey:'second-release',authorizedUserIds:[alex.id],closingAt:null}),item=getHandoff(manager,second.id);mutateHandoff(manager,second.id,{eventKey:'earlier',expectedVersion:0,expectedReleaseVersion:item.releaseVersion,action:'assign',assignedTo:alex.id,nextAction:'Confirm the earlier deadline',dueAt:'2026-10-31T15:00:00Z'});vi.setSystemTime(new Date('2026-11-02T16:00:00Z'));const board=getHandoffBoard(manager);expect(board.items[0].releaseId).toBe(second.id);expect(board.metrics).toMatchObject({overdue:2,unresolvedAssigned:2});});
 it('does not count retries as new assignments or expose another employee private task',()=>{const input={...base(),action:'assign' as const,assignedTo:alex.id,nextAction:'Confirm access',dueAt:due};mutateHandoff(manager,releaseId,input);mutateHandoff(manager,releaseId,input);const task=createTask(alex,{title:'Private sensitive reminder',investorId:null});expect(getHandoffBoard(manager).metrics?.unresolvedAssigned).toBe(1);expect(JSON.stringify(getHandoffBoard(manager))).not.toContain(task.title);});

 it('explains an earlier closing target and sorts by it without changing the assigned deadline',()=>{
  release({eventKey:'early-closing',expectedVersion:1,closingAt:'2026-10-31T12:00:00Z'});
  const first=mutateHandoff(manager,releaseId,{...base(),action:'assign',assignedTo:alex.id,nextAction:'Review the supplied access instructions',dueAt:'2026-11-04T15:00:00Z'});
  const second=release({propertyId:'property-cedar',eventKey:'second-target',closingAt:'2026-11-03T15:00:00Z'});
  mutateHandoff(manager,second.id,{eventKey:'second-assignment',expectedVersion:0,expectedReleaseVersion:second.version,action:'assign',assignedTo:alex.id,nextAction:'Check the current source details',dueAt:due});
  const board=getHandoffBoard(manager);
  expect(board.items.map(item=>item.attention)).toEqual(['closing_soon','closing_soon']);
  expect(board.items[0].releaseId).toBe(releaseId);
  expect(board.items[0].evidence.join(' ')).toContain('Timing conflict:');
  expect(board.items[0].evidence.join(' ')).toContain('neither date is changed automatically');
  expect(board.items[0].record?.dueAt).toBe(first.record?.dueAt);
  expect(board.items[0].nextStep).toContain(alex.name);
  expect(board.items[0].record?.state).toBe('assigned');
 });

 it('directs a reported completion to manager review even after its deadline and does not reopen resolved work',()=>{
  assign();ack();report();vi.setSystemTime(new Date('2026-11-04T16:00:00Z'));
  const review=getHandoff(manager,releaseId);
  expect(review.attention).toBe('review');
  expect(review.nextStep).toContain('Manager: review the reported outcome');
  expect(review.nextStep).toContain('not a request for the employee to repeat');
  expect(review.evidence.join(' ')).toContain('does not establish employee failure');
  expect(review.evidence.join(' ')).toContain('Recorded closing target has passed');
  expect(review.evidence.join(' ')).toContain('neither success nor a failed deal is established');
  mutateHandoff(manager,releaseId,{...base(),action:'resolve',note:'Reviewed the supplied operational evidence.'});
  const resolved=getHandoff(manager,releaseId);
  expect(resolved.attention).toBe('resolved');
  expect(resolved.evidence.join(' ')).not.toContain('Follow-up deadline passed');
  expect(resolved.evidence.join(' ')).toContain('does not reopen it');
  expect(getHandoffBoard(manager).metrics).toMatchObject({resolved:1,overdue:0,unresolvedAssigned:0});
 });

 it('replaces current blocker advice after a source correction while retaining its historical receipt',()=>{
  assign();ack();report('blocked');
  const step={key:'office',capabilityId:'office_priorities',input:{},dependsOn:[]};
  const original=executeWorkCapability(manager,step,{}),frozen=JSON.stringify(original);
  expect(original.message).toContain('reported a blocker');
  release({eventKey:'revised-access',expectedVersion:1,showingInstructions:'Fictional access details corrected by the employee.'});
  const changed=getHandoff(manager,releaseId);
  expect(changed.attention).toBe('source_changed');
  expect(changed.nextStep).toContain('review the changed source');
  expect(changed.evidence.some(line=>line.startsWith('Why now:')&&line.includes('reported a blocker'))).toBe(false);
  expect(changed.evidence.join(' ')).toContain('outcome reports are historical');
  expect(changed.history.some(event=>event.record.outcome?.kind==='blocked')).toBe(true);
  expect(()=>validateStoredWorkOutput(manager,step,original)).toThrow('handoff evidence changed');
  expect(JSON.stringify(original)).toBe(frozen);
  const refreshed=assign();
  expect(refreshed.record).toMatchObject({outcome:null,acknowledgedAt:null,state:'assigned'});
  expect(refreshed.nextStep).toContain(`Ask ${alex.name} to acknowledge`);
 });

 it('retires current advice when a closing target passes even if its attention category stays the same',()=>{
  release({eventKey:'near-closing',expectedVersion:1,closingAt:'2026-10-30T17:00:00Z'});assign();
  const step={key:'office',capabilityId:'office_priorities',input:{},dependsOn:[]};
  const original=executeWorkCapability(manager,step,{}),before=getHandoffBoard(manager),refs=collectHistoryReferences(manager,original.artifacts);
  expect(before.items[0].attention).toBe('closing_soon');
  vi.setSystemTime(new Date('2026-10-30T18:00:00Z'));
  const after=getHandoffBoard(manager);
  expect(after.items[0].attention).toBe('closing_soon');
  expect(after.items[0].record?.version).toBe(before.items[0].record?.version);
  expect(after.items[0].evidence.join(' ')).toContain('Recorded closing target has passed');
  expect(after.handoffAccessReference).not.toBe(before.handoffAccessReference);
  expect(historyReferencesVisible(manager,refs)).toBe(false);
  expect(()=>validateStoredWorkOutput(manager,step,original)).toThrow('handoff evidence changed');
 });

 it('keeps a withdrawn source out of active deadline advice and preserves its past assignment',()=>{
  assign();ack();report('blocked');
  release({eventKey:'withdraw-priority',expectedVersion:1,status:'withdrawn'});
  vi.setSystemTime(new Date('2026-11-05T16:00:00Z'));
  const item=getHandoff(manager,releaseId);
  expect(item.actions).toEqual([]);
  expect(item.nextStep).toContain('Keep this release out of active follow-through');
  expect(item.evidence.join(' ')).not.toContain('Follow-up deadline passed');
  expect(item.evidence.join(' ')).not.toContain('Timing conflict:');
  expect(item.record?.outcome?.kind).toBe('blocked');
  expect(item.history).toHaveLength(3);
 });

 it('explains lost employee scope without treating the assignment as an access grant',()=>{
  assign();
  release({eventKey:'lost-assignee-scope',expectedVersion:1,authorizedUserIds:[]});
  const item=getHandoff(manager,releaseId);
  expect(item.sourceChanged).toBe(true);
  expect(item.attention).toBe('source_changed');
  expect(item.evidence.join(' ')).toContain('no longer has current source access');
  expect(item.nextStep).toContain('assignment does not grant access');
  expect(item.eligibleAssignees.map(person=>person.id)).not.toContain(alex.id);
  expect(()=>getHandoff(alex,releaseId)).toThrow('not available');
 });

 it('keeps not-pursuing pre-inventory work stopped without suggesting a fresh active assignment',()=>{
  const input:OpportunityInput={...structuredClone(emptyOpportunity),address:'416 Fictional Road',city:'Marietta',state:'GA',submission:{...emptyOpportunity.submission,wholesaler:'Fictional Wholesale LLC',sourceReference:'Demo email 414'}};
  const first={id:null,expectedVersion:0,input},preview=previewOpportunity(jordan,first);
  const saved=saveOpportunity(jordan,{...first,reviewReference:preview.reviewReference,eventKey:'priority-opportunity'}).opportunity;
  mutateHandoff(manager,saved.id,{eventKey:'priority-opportunity-assign',expectedVersion:0,expectedReleaseVersion:saved.version,action:'assign',assignedTo:jordan.id,nextAction:'Confirm supported repair assumptions',dueAt:due});
  const revision={id:saved.id,expectedVersion:saved.version,input:{...input,status:'not_pursuing' as const,reviewNote:'Employee chose not to pursue the current terms.'}};
  saveOpportunity(jordan,{...revision,reviewReference:previewOpportunity(jordan,revision).reviewReference,eventKey:'priority-not-pursuing'});
  const item=getHandoff(manager,saved.id);
  expect(item.sourceKind).toBe('opportunity');
  expect(item.nextStep).toContain('Keep this opportunity out of active follow-through');
  expect(item.evidence.join(' ')).toContain('not pursuing');
  expect(item.actions).toEqual([]);
  expect(getDb().prepare('SELECT COUNT(*) n FROM property_releases').get()).toEqual({n:1});
 });

});
