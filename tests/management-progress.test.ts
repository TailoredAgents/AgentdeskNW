import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getManagementReport,managementReferenceCurrent,managementQuerySchema} from '../src/server/management-reporting';
import {reportDay,shiftReportDay} from '../src/server/management-progress';
import {createTask} from '../src/server/services';
import {mutateTask} from '../src/server/task-actions';
import {prepareDemoScenario} from '../src/server/demo-scenario';
import {getHandoff,mutateHandoff} from '../src/server/handoffs';
import {billingPolicy,saveBillingPolicy} from '../src/server/billing';
import {getOpportunity,previewOpportunity,saveOpportunity} from '../src/server/opportunities';
import {opportunityInputSchema} from '../src/server/opportunities';
import {dispatchTool} from '../src/server/orchestrator';
import {executeWorkCapability,validateStoredWorkOutput} from '../src/server/work-capabilities';
import {collectHistoryReferences,historyReferencesVisible} from '../src/server/history';
let manager:Actor,alex:Actor,jordan:Actor;
const at=(value:string)=>vi.setSystemTime(new Date(value));
const progress=(employeeId?:string)=>getManagementReport(manager,{employeeId,activityWindow:'today'}).progress;
const metric=(id:string,employeeId?:string)=>progress(employeeId).metrics.find(item=>item.activity===id)!;
function scenario(){prepareDemoScenario();return getManagementReport(manager).records.find(item=>item.kind==='handoff'&&item.metrics.includes('blocked'))!.destination.id;}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers({toFake:['Date']});at('2026-11-02T14:00:00Z');manager=demoActor('manager');alex=demoActor();jordan=demoActor('acquisitions');});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();});
describe('source-linked recorded progress and profiles',()=>{
 it('separates closed calendar windows and today across the fall daylight-saving boundary',()=>{
  expect(reportDay('2026-11-02T04:59:59Z')).toBe('2026-11-01');expect(reportDay('2026-11-02T05:00:00Z')).toBe('2026-11-02');expect(shiftReportDay('2026-11-02',-7)).toBe('2026-10-26');
  at('2026-10-26T03:59:00Z');createTask(alex,{title:'Previous-window boundary',investorId:'investor-mike'});
  at('2026-10-26T04:00:00Z');createTask(alex,{title:'Current-window boundary',investorId:'investor-mike'});
  at('2026-11-02T04:59:00Z');createTask(alex,{title:'Last completed day',investorId:'investor-mike'});
  at('2026-11-02T05:00:00Z');createTask(alex,{title:'Today boundary',investorId:'investor-mike'});
  at('2026-11-02T14:00:00Z');
  const report=getManagementReport(manager,{employeeId:alex.id,activity:'followup_created'});
  expect(report.progress.start).toBe('2026-10-26');expect(report.progress.previousStart).toBe('2026-10-19');expect(report.progress.events.map(item=>item.title)).toContain('Current-window boundary');expect(report.progress.events.map(item=>item.title)).not.toContain('Today boundary');
  expect(getManagementReport(manager,{activity:'followup_created',activityWindow:'previous'}).progress.events.some(item=>item.title==='Previous-window boundary')).toBe(true);
  expect(progress().events.some(item=>item.title==='Today boundary')).toBe(true);expect(report.progress.daily).toHaveLength(7);
  expect(getManagementReport(manager,{period:'30d'}).progress.daily).toHaveLength(30);
 });
 it('adds completion once without treating it as a response, sale or manager resolution',()=>{
  const before=metric('followup_completed').today,task=createTask(alex,{title:'Fictional completed buyer work',investorId:'investor-mike'});
  const input={action:'complete' as const,eventKey:'one-completion',expectedVersion:task.version};mutateTask(alex,task.id,input);mutateTask(alex,task.id,input);
  expect(metric('followup_completed').today).toBe(before!+1);expect(metric('handoff_resolved').today).toBe(0);expect(progress().coverage).toContain('not unique deals');
 });
 it('excludes personal history and removes formerly linked history after loss of source scope',()=>{
  const initial=getManagementReport(manager).managementAccessReference;
  const privateTask=createTask(alex,{title:'PRIVATE personal detail'});mutateTask(alex,privateTask.id,{action:'complete'});expect(getManagementReport(manager).managementAccessReference).toBe(initial);expect(JSON.stringify(progress())).not.toContain('PRIVATE');
  const task=createTask(alex,{title:'Business-linked only',investorId:'investor-mike'});const before=getManagementReport(manager,{activityWindow:'today'});expect(JSON.stringify(before.progress)).toContain('Business-linked only');
  getDb().prepare("UPDATE tasks SET investor_id=NULL,data=json_set(data,'$.investorId',NULL) WHERE id=?").run(task.id);
  expect(JSON.stringify(progress())).not.toContain('Business-linked only');expect(managementReferenceCurrent(manager,before.managementAccessReference)).toBe(false);
 });
 it('attributes manager resolution and employee reporting separately and shows paired durations',()=>{
  const id=scenario();at('2026-11-02T16:00:00Z');let item=getHandoff(jordan,id);
  mutateHandoff(jordan,id,{action:'report',kind:'resolved',note:'Fictional scope supplied for separate review.',evidence:'demo:progress-review',eventKey:'reported',expectedVersion:item.record!.version,expectedReleaseVersion:item.releaseVersion});
  const employee=getManagementReport(manager,{employeeId:jordan.id});expect(employee.profile!.waiting[0].label).toContain('awaiting manager');expect(getManagementReport(manager,{employeeId:manager.id}).profile!.nextSteps.some(item=>item.metrics.includes('review'))).toBe(true);
  at('2026-11-02T19:00:00Z');item=getHandoff(manager,id);const input={action:'resolve' as const,note:'Reviewed the fictional supporting evidence.',eventKey:'reviewed',expectedVersion:item.record!.version,expectedReleaseVersion:item.releaseVersion};mutateHandoff(manager,id,input);mutateHandoff(manager,id,input);
  expect(metric('completion_reported',jordan.id).today).toBe(1);expect(metric('handoff_resolved',jordan.id).today).toBe(0);expect(metric('handoff_resolved',manager.id).today).toBe(1);
  expect(progress().timings.find(item=>item.kind==='review')).toMatchObject({sampleCount:1,meanHours:3});expect(progress(jordan.id).timings.find(item=>item.kind==='review')!.meanHours).toBeNull();expect(getManagementReport(manager,{employeeId:jordan.id}).profile!.nextSteps.every(item=>!item.metrics.includes('resolved'))).toBe(true);expect(getManagementReport(manager).briefing.every(item=>!item.detail.startsWith('resolved.'))).toBe(true);
 });
 it('reassignment retires the former cycle instead of attributing its results to the new assignment',()=>{
  const id=scenario(),before=getManagementReport(manager);expect(metric('blocker_reported').today).toBe(1);const item=getHandoff(manager,id);
  mutateHandoff(manager,id,{action:'assign',assignedTo:jordan.id,nextAction:'Fresh instructions with a separate acknowledgment.',dueAt:'2026-11-04T15:00:00Z',eventKey:'fresh-cycle',expectedVersion:item.record!.version,expectedReleaseVersion:item.releaseVersion});
  expect(metric('blocker_reported').today).toBe(0);expect(metric('handoff_acknowledged').today).toBe(0);expect(metric('handoff_assigned').today).toBe(1);expect(managementReferenceCurrent(manager,before.managementAccessReference)).toBe(false);
 });
 it('source revision removes obsolete handoff activity while retaining minimal opportunity revision metadata',()=>{
  const id=scenario(),before=getManagementReport(manager),detail=getOpportunity(jordan,id),input=opportunityInputSchema.parse(Object.fromEntries(Object.entries({...detail.opportunity,reviewNote:'Changed supporting scope for the current review.'}).filter(([key])=>!['id','ownerId','version','createdAt','updatedAt','synthetic'].includes(key))));
  const preview=previewOpportunity(jordan,{id,expectedVersion:detail.opportunity.version,input});saveOpportunity(jordan,{id,expectedVersion:detail.opportunity.version,input,eventKey:'new-source',reviewReference:preview.reviewReference});
  expect(metric('blocker_reported').today).toBe(0);expect(metric('opportunity_revised').today).toBe(1);expect(JSON.stringify(progress())).not.toContain('Changed supporting scope');expect(managementReferenceCurrent(manager,before.managementAccessReference)).toBe(false);
 });
 it('builds useful role profiles without exposing other employees private content or reporting unsupported results',()=>{
  scenario();const acquired=getManagementReport(manager,{employeeId:jordan.id}),disposed=getManagementReport(manager,{employeeId:alex.id});
  expect(acquired.profile!.gaps.some(gap=>gap.field==='repairs')).toBe(true);expect(acquired.profile!.focus).toContain('Wholesaler');expect(disposed.profile!.focus).toContain('Investor');expect(disposed.profile!.gaps).toEqual([]);expect(acquired.briefing[0].destination.kind).toBe('handoff');
  const policy=billingPolicy(manager);policy.restricted=['acquisition-lead'];saveBillingPolicy(manager,policy);expect(getManagementReport(manager,{employeeId:jordan.id}).profile!.gaps).toEqual([]);expect(metric('opportunity_submitted').today).toBeNull();
 });
 it('paginates event evidence with counts independent of the selected page',()=>{
  for(let i=0;i<24;i++)createTask(alex,{title:`Recorded fictional event ${i}`,investorId:'investor-mike'});
  const first=getManagementReport(manager,{activity:'followup_created',activityWindow:'today'}).progress,second=getManagementReport(manager,{activity:'followup_created',activityWindow:'today',activityOffset:20}).progress;
  expect(first.events).toHaveLength(20);expect(first.page.hasMore).toBe(true);expect(first.page.total).toBe(26);expect(second.events).toHaveLength(6);expect(second.events.every(event=>!first.events.some(prior=>prior.key===event.key))).toBe(true);
 });
 it('preserves source parity in Agent and durable work and retires reports on local-day boundaries',async()=>{
  scenario();const report=getManagementReport(manager,{employeeId:jordan.id,period:'30d',activityWindow:'today'}),tool=await dispatchTool(manager,'team_overview',{employeeId:jordan.id,period:'30d',activityWindow:'today'});expect((tool.data as typeof report).progress).toEqual(report.progress);expect((tool.data as typeof report).profile).toEqual(report.profile);
  const step={key:'office',capabilityId:'office_priorities',input:{},dependsOn:[]},output=executeWorkCapability(manager,step,{}),refs=collectHistoryReferences(manager,output.artifacts);validateStoredWorkOutput(manager,step,output);expect(historyReferencesVisible(manager,refs)).toBe(true);
  at('2026-11-03T05:00:00Z');expect(historyReferencesVisible(manager,refs)).toBe(false);expect(()=>validateStoredWorkOutput(manager,step,output)).toThrow();
 });
 it('rejects caller-controlled reporting scope and conflicting role/employee selection',()=>{
  for(const invalid of [{period:'year'},{timeZone:'UTC'},{activity:'revenue'},{activityOffset:-1},{activityWindow:'all'},{organizationId:'other'}])expect(managementQuerySchema.safeParse(invalid).success).toBe(false);
  expect(()=>getManagementReport(manager,{role:'acquisitions',employeeId:alex.id})).toThrow('selected role');expect(()=>getManagementReport(manager,{employeeId:'user-savannah'})).toThrow('unavailable');
 });
});
