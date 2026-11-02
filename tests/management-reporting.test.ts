import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor,ManagementMetricId,ManagementReport} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getManagementReport,managementReferenceCurrent,managementQuerySchema} from '../src/server/management-reporting';
import {createTask,getBootstrap,listTasks} from '../src/server/services';
import {mutateTask} from '../src/server/task-actions';
import {billingPolicy,saveBillingPolicy} from '../src/server/billing';
import {prepareDemoScenario} from '../src/server/demo-scenario';
import {getHandoff,mutateHandoff} from '../src/server/handoffs';
import {collectHistoryReferences,historyReferencesVisible,readHistoryMessage} from '../src/server/history';
import {executeWorkCapability,validateStoredWorkOutput} from '../src/server/work-capabilities';
import {dispatchTool,toolDefinitions} from '../src/server/orchestrator';
import {voiceContextSnapshot} from '../src/server/voice-context';
import {updateOwnershipPolicy} from '../src/server/access';
import {bindCompanyIdentity} from '../src/server/company-identity';
let manager:Actor,alex:Actor;
const value=(report:ManagementReport,id:ManagementMetricId)=>report.metrics.find(item=>item.id===id)!.value;
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-02T14:00:00Z'));manager=demoActor('manager');alex=demoActor();});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();});
describe('current office management reporting',()=>{
 it('rejects forged roles, offices, other roles and a removed membership',()=>{
  expect(()=>getManagementReport(alex)).toThrow('role');expect(()=>getManagementReport({...alex,role:'manager'})).toThrow('not authorized');expect(()=>getManagementReport({...manager,officeId:'office-savannah'})).toThrow('not authorized');
  getDb().prepare('DELETE FROM memberships WHERE user_id=?').run(manager.id);expect(()=>getManagementReport(manager)).toThrow('not authorized');
 });
 it('rechecks feature restrictions on reads and historical references',()=>{
  const prior=getManagementReport(manager),policy=billingPolicy(manager);policy.restricted=['team-performance'];saveBillingPolicy(manager,policy);
  expect(()=>getManagementReport(manager)).toThrow();expect(managementReferenceCurrent(manager,prior.managementAccessReference)).toBe(false);
 });
 it('excludes personal tasks, approvals, research and arbitrary usage metadata',()=>{
  const before=getManagementReport(manager),task=createTask(alex,{title:'PRIVATE medical appointment reminder'});
  const report=getManagementReport(manager);expect(value(report,'followups')).toBe(value(before,'followups'));expect(JSON.stringify(report)).not.toContain(task.title);expect(JSON.stringify(report)).not.toContain(task.id);
  expect(report).not.toHaveProperty('activeJobs');expect(report).not.toHaveProperty('pendingApprovals');expect(report).not.toHaveProperty('usage');expect(report.coverage.excluded).toContain('Private Inbox messages and drafts');
  expect(report.managementAccessReference).toBe(before.managementAccessReference);
  expect(getBootstrap(manager).tasks.some(item=>item.id===task.id)).toBe(false);
  expect(listTasks(manager).some(item=>item.id===task.id)).toBe(false);
  expect(listTasks(alex).some(item=>item.id===task.id)).toBe(true);
  const own=createTask(manager,{title:'My private presentation notes'});
  expect(listTasks(manager).some(item=>item.id===own.id)).toBe(true);
  expect(JSON.stringify(getManagementReport(manager))).not.toContain(own.id);
 });
 it('counts supported business follow-ups and missing due dates, never completion as a sale',()=>{
  const before=getManagementReport(manager),task=createTask(alex,{title:'Confirm the fictional repair question',investorId:'investor-mike',dueAt:'2026-11-01T15:00:00Z'}),undated=createTask(alex,{title:'Review the fictional buy box',investorId:'investor-mike'});
  let report=getManagementReport(manager);expect(value(report,'followups')).toBe(value(before,'followups')!+2);expect(value(report,'overdue')).toBe(value(before,'overdue')!+1);expect(report.records.find(row=>row.key===`followup:${undated.id}`)?.status).toBe('No due time recorded');
  mutateTask(alex,task.id,{action:'complete',expectedVersion:task.version??0,eventKey:'complete-once'});mutateTask(alex,task.id,{action:'complete',expectedVersion:task.version??0,eventKey:'complete-once'});
  report=getManagementReport(manager);expect(value(report,'followups')).toBe(value(before,'followups')!+1);expect(value(report,'resolved')).toBe(value(before,'resolved'));expect(report.coverage.unavailable).toContain('Verified closings, revenue and conversion');
 });
 it('keeps cross-office records out even when broader CRM sharing is enabled',()=>{
  const source=getDb().prepare('SELECT data FROM investors WHERE id=?').get('investor-mike') as {data:string};
  getDb().prepare('INSERT INTO investors VALUES(?,?,?,?,?)').run('investor-cross-office','org-demo','office-savannah','user-savannah',JSON.stringify({...JSON.parse(source.data),id:'investor-cross-office',ownerId:'user-savannah',name:'Cross-office private name'}));
  const before=getManagementReport(manager);updateOwnershipPolicy(manager,{organizationVisibility:true,crossOfficeSharing:true,managerAssignment:true});
  const record=getDb().prepare('SELECT id,data FROM investors WHERE office_id=?').get('office-savannah') as {id:string;data:string};expect(record).toBeDefined();
  const report=getManagementReport(manager);expect(value(report,'relationships')).toBe(value(before,'relationships'));expect(JSON.stringify(report.records)).not.toContain(record.id);
  expect(()=>getManagementReport(manager,{employeeId:'user-savannah'})).toThrow('unavailable');
 });
 it('withdraws linked follow-ups when their source changes outside the office',()=>{
  const task=createTask(alex,{title:'SOURCE-BOUND follow-up',investorId:'investor-mike'}),before=getManagementReport(manager);
  const source=getDb().prepare('SELECT data FROM investors WHERE id=?').get('investor-mike') as {data:string};
  getDb().prepare('INSERT INTO investors VALUES(?,?,?,?,?)').run('investor-cross-office','org-demo','office-savannah','user-savannah',JSON.stringify({...JSON.parse(source.data),id:'investor-cross-office',ownerId:'user-savannah'}));
  getDb().prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify({...task,investorId:'investor-cross-office'}),task.id);
  const report=getManagementReport(manager);expect(JSON.stringify(report)).not.toContain(task.title);expect(managementReferenceCurrent(manager,before.managementAccessReference)).toBe(false);
 });
 it('returns unavailable rather than zero when acquisition access is restricted',()=>{
  const policy=billingPolicy(manager);policy.restricted=['acquisition-lead'];saveBillingPolicy(manager,policy);
  const report=getManagementReport(manager);expect(value(report,'opportunities')).toBeNull();expect(report.coverage.opportunities).toBe('restricted');expect(report.employees.every(person=>person.counts.opportunities===null)).toBe(true);
 });
 it('attributes recorded work without crediting the manager for an employee report',()=>{
  prepareDemoScenario();const before=getManagementReport(manager),row=before.records.find(item=>item.kind==='handoff'&&item.metrics.includes('blocked'))!;expect(row).toBeDefined();
  const jordan=demoActor('acquisitions'),id=row.destination.id;
  let item=getHandoff(jordan,id);const report={eventKey:'employee-report',expectedVersion:item.record!.version,expectedReleaseVersion:item.releaseVersion,action:'report' as const,kind:'resolved' as const,note:'Fictional repair scope was recorded for separate review.',evidence:'demo:management-review-case'};
  mutateHandoff(jordan,id,report);mutateHandoff(jordan,id,report);
  const pending=getManagementReport(manager);expect(value(pending,'blocked')).toBe(value(before,'blocked')!-1);expect(value(pending,'review')).toBe(value(before,'review')!+1);expect(value(pending,'resolved')).toBe(value(before,'resolved'));
  expect(pending.employees.find(person=>person.id===jordan.id)?.counts.review).toBe(1);expect(pending.employees.find(person=>person.id===manager.id)?.counts.review).toBe(0);
  item=getHandoff(manager,id);const resolution={eventKey:'manager-resolution',expectedVersion:item.record!.version,expectedReleaseVersion:item.releaseVersion,action:'resolve' as const,note:'Reviewed the fictional source and this follow-up only.'};mutateHandoff(manager,id,resolution);mutateHandoff(manager,id,resolution);
  const after=getManagementReport(manager);expect(value(after,'review')).toBe(value(before,'review'));expect(value(after,'resolved')).toBe(value(before,'resolved')!+1);expect(after.records.find(item=>item.key===row.key)?.ownerId).toBe(jordan.id);
 });
 it('shares the same projection with Copilot, role filters and bounded source pagination',async()=>{
  const report=getManagementReport(manager),result=await dispatchTool(manager,'team_overview',{});expect(result.data).toEqual({...report,query:{role:null,employeeId:null,metric:null,offset:null,period:null,activity:null,activityWindow:null,activityOffset:null}});
  const roleReport=getManagementReport(manager,{role:'acquisitions'});expect(roleReport.records.every(row=>row.role==='acquisitions')).toBe(true);
  for(let i=0;i<43;i++)createTask(alex,{title:`Fictional paged task ${i}`,investorId:'investor-mike'});
  const first=getManagementReport(manager,{metric:'followups',employeeId:alex.id}),second=getManagementReport(manager,{metric:'followups',employeeId:alex.id,offset:40});expect(first.records).toHaveLength(40);expect(first.page.hasMore).toBe(true);expect(first.page.total).toBe(value(first,'followups'));expect(second.records.every(row=>!first.records.some(prior=>prior.key===row.key))).toBe(true);
  const filtered=await dispatchTool(manager,'team_overview',{metric:'followups',employeeId:alex.id,offset:40});expect(filtered.data).toEqual({...second,query:{role:null,period:null,activity:null,activityWindow:null,activityOffset:null,...second.query}});
 });
 it('retires saved report/Agent context when business evidence changes while retaining immutable output',()=>{
  const step={key:'review',capabilityId:'office_priorities',input:{},dependsOn:[]},output=executeWorkCapability(manager,step,{}),saved=JSON.stringify(output),refs=collectHistoryReferences(manager,output.artifacts),voice=voiceContextSnapshot(manager);
  expect(historyReferencesVisible(manager,refs)).toBe(true);validateStoredWorkOutput(manager,step,output);
  createTask(alex,{title:'New fictional relationship follow-up',investorId:'investor-mike'});
  expect(historyReferencesVisible(manager,refs)).toBe(false);expect(()=>validateStoredWorkOutput(manager,step,output)).toThrow('management report evidence changed');expect(voiceContextSnapshot(manager)).not.toEqual(voice);expect(JSON.stringify(output)).toBe(saved);
 });
 it('rechecks due-time boundaries without inventing a recorded event',()=>{
  createTask(alex,{title:'Exact deadline question',investorId:'investor-mike',dueAt:'2026-11-02T14:05:00Z'});const before=getManagementReport(manager);vi.setSystemTime(new Date('2026-11-02T14:06:00Z'));expect(value(getManagementReport(manager),'overdue')).toBe(value(before,'overdue')!+1);expect(managementReferenceCurrent(manager,before.managementAccessReference)).toBe(false);
 });
 it('validates bounded filters and never accepts caller scope or prices',()=>{
  for(const bad of [{organizationId:'org-demo'},{officeId:'office-savannah'},{offset:-1},{offset:1.5},{offset:1000001},{role:'executive'},{metric:'revenue'},{price:0}])expect(managementQuerySchema.safeParse(bad).success).toBe(false);
 });
 it('publishes strict nullable model filters while retaining older empty callers',()=>{
  const tool=toolDefinitions().find(item=>item.name==='team_overview')!;
  expect(tool.parameters.required).toEqual(['role','employeeId','metric','offset','period','activity','activityWindow','activityOffset']);expect(tool.parameters.additionalProperties).toBe(false);
 });
 it('keeps current report identity stable across worker and HTTP actor construction order',()=>{
  const reference=getManagementReport(manager).managementAccessReference;
  expect(getManagementReport({role:manager.role,officeId:manager.officeId,name:manager.name,id:manager.id,organizationId:manager.organizationId}).managementAccessReference).toBe(reference);
 });
 it('binds company membership versions so re-provisioning cannot restore an old report reference',()=>{
  const issuer='https://company.example.test';for(const person of [manager,alex,demoActor('acquisitions')])bindCompanyIdentity(person,{issuer,subject:person.id});
  vi.stubEnv('AGENTDESK_AUTH_MODE','company_oidc');vi.stubEnv('AGENTDESK_OIDC_ISSUER',issuer);
  const before=getManagementReport(manager);getDb().prepare('UPDATE company_identity_bindings SET version=version+1 WHERE issuer=? AND user_id=?').run(issuer,manager.id);
  expect(managementReferenceCurrent(manager,before.managementAccessReference)).toBe(false);
 });
 it('requires an upgraded source review for legacy office reports without hiding unrelated handoff decisions',()=>{
  const legacy={message:'Older office summary',specialistIds:['team-performance'],artifacts:[{type:'handoff' as const,title:'Review office handoffs'}],data:{overview:{tasks:[],activeJobs:[]}}};
  expect(()=>validateStoredWorkOutput(manager,{key:'office',capabilityId:'office_priorities',input:{},dependsOn:[]},legacy)).toThrow('older office report');
  const message={id:'legacy-message',role:'assistant' as const,createdAt:new Date().toISOString(),content:'Legacy private job details',specialistIds:legacy.specialistIds,artifacts:legacy.artifacts};
  expect(readHistoryMessage(manager,message).content).not.toContain('Legacy private job');
  expect(readHistoryMessage(manager,{...message,content:'A current reviewed handoff preparation',artifacts:[{type:'handoff',title:'Review shared handoffs'}]}).content).toBe('A current reviewed handoff preparation');
 });
});
