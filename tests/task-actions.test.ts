import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { Actor,Task } from '../src/lib/contracts';
import { closeDb,demoActor,getDb,now } from '../src/server/db';
import { getPersonalTask,listPersonalTasks,mutateTask,taskForReminder,taskReminderKey } from '../src/server/task-actions';
import { completeTask,createTask,getBootstrap,processNotifications,readNotification,updateSettings } from '../src/server/services';
import { simulateLifecycle,subscription } from '../src/server/billing';

let actor:Actor;
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const otherOffice:Actor={id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'};
beforeEach(()=>{
 closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-29T14:00:00Z'));actor=demoActor();updateSettings(actor,{quietHoursStart:0,quietHoursEnd:0,notifications:true});
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();});
const dueTask=()=>createTask(actor,{title:'Call Mike about timing',investorId:'investor-mike',dueAt:'2026-10-29T13:00:00Z'});
function notices(task:Task){return getDb().prepare("SELECT id,dedupe_key,data FROM notifications WHERE owner_id=? AND substr(dedupe_key,1,?)=? ORDER BY rowid").all(actor.id,`task-due:${task.id}`.length,`task-due:${task.id}`) as {id:string;dedupe_key:string;data:string}[];}

describe('personal task lifecycle',()=>{
 it('normalizes old records and creates versioned tasks without modifying the CRM',()=>{
  expect(getPersonalTask(actor,'task-mike')).toMatchObject({version:0,status:'open'});
  const before=getDb().prepare("SELECT data FROM investors WHERE id='investor-mike'").get();
  const task=dueTask();expect(task).toMatchObject({version:1,updatedAt:now(),status:'open'});
  const completed=completeTask(actor,task.id);expect(completed).toMatchObject({version:2,status:'completed',completedAt:now()});
  expect(completeTask(actor,task.id).version).toBe(2);
  expect(getDb().prepare("SELECT data FROM investors WHERE id='investor-mike'").get()).toEqual(before);
  expect(getDb().prepare("SELECT COUNT(*) n FROM audit_logs WHERE event='task.completed' AND entity_id=?").get(task.id)).toEqual({n:1});
 });
 it('isolates tenant, office, employee and manager personal actions',()=>{
  const task=dueTask();
  for(const denied of [other,otherOffice,demoActor('acquisitions'),demoActor('manager')]){
   expect(()=>getPersonalTask(denied,task.id)).toThrow('not found');
   expect(()=>mutateTask(denied,task.id,{action:'complete'})).toThrow('not found');
   expect(listPersonalTasks(denied).map(item=>item.id)).not.toContain(task.id);
  }
  expect(()=>mutateTask({...actor,role:'manager'},task.id,{action:'cancel'})).toThrow('not authorized');
  expect(getPersonalTask(actor,task.id).status).toBe('open');
 });
 it('uses optimistic versions and serializes an event replay without repeating or reversing work',()=>{
  const task=dueTask(),input={action:'snooze' as const,minutes:120,expectedVersion:1,eventKey:'snooze-once'};
  const snoozed=mutateTask(actor,task.id,input);expect(snoozed).toMatchObject({version:2,dueAt:'2026-10-29T16:00:00.000Z'});
  vi.setSystemTime(new Date('2026-10-29T14:30:00Z'));
  expect(mutateTask(actor,task.id,input)).toEqual(snoozed);
  expect(()=>mutateTask(actor,task.id,{...input,minutes:30})).toThrow('different work');
  expect(()=>mutateTask(actor,task.id,{action:'complete',expectedVersion:1})).toThrow('changed');
  const completed=mutateTask(actor,task.id,{action:'complete',expectedVersion:2,eventKey:'finish-once'});
  expect(mutateTask(actor,task.id,input)).toEqual(completed);
  expect(getDb().prepare('SELECT COUNT(*) n FROM task_action_receipts WHERE task_id=?').get(task.id)).toEqual({n:2});
 });
 it('does not confuse the same request key across tasks or employees',()=>{
  const first=dueTask(),second=createTask(actor,{title:'Another personal task'});
  mutateTask(actor,first.id,{action:'cancel',eventKey:'one-event'});
  expect(()=>mutateTask(actor,second.id,{action:'cancel',eventKey:'one-event'})).toThrow('different work');
  const manager=demoActor('manager'),managerTask=createTask(manager,{title:'Manager own task'});
  expect(mutateTask(manager,managerTask.id,{action:'cancel',eventKey:'one-event'}).status).toBe('canceled');
 });
 it('reschedules to a normalized future timestamp and can explicitly clear a deadline',()=>{
  const task=dueTask();const moved=mutateTask(actor,task.id,{action:'reschedule',dueAt:'2026-10-30T09:00:00-04:00',expectedVersion:1,eventKey:'move'});
  expect(moved).toMatchObject({dueAt:'2026-10-30T13:00:00.000Z',version:2,status:'open'});
  expect(mutateTask(actor,task.id,{action:'reschedule',dueAt:null,expectedVersion:2,eventKey:'clear'})).toMatchObject({dueAt:null,version:3,status:'open'});
 });
 it('retains cancellation history and prevents silent reopening or completing canceled work',()=>{
  const task=dueTask(),canceled=mutateTask(actor,task.id,{action:'cancel',expectedVersion:1,eventKey:'cancel'});
  expect(canceled).toMatchObject({status:'canceled',version:2,canceledAt:now()});
  expect(getBootstrap(actor).tasks.find(item=>item.id===task.id)).toEqual(canceled);
  expect(mutateTask(actor,task.id,{action:'cancel'})).toEqual(canceled);
  for(const input of [{action:'complete' as const},{action:'snooze' as const,minutes:60},{action:'reschedule' as const,dueAt:'2026-10-30T09:00:00Z'}])expect(()=>mutateTask(actor,task.id,input)).toThrow('canceled');
  const finished=dueTask();completeTask(actor,finished.id);expect(()=>mutateTask(actor,finished.id,{action:'cancel'})).toThrow('completed');
 });
 it('rejects malformed, contradictory or past scheduling requests without writing state',()=>{
  const task=dueTask();
  const invalid=[{action:'reschedule'},{action:'snooze'},{action:'snooze',minutes:0},{action:'snooze',minutes:1.5},{action:'snooze',minutes:43201},{action:'complete',minutes:1},{action:'cancel',dueAt:null},{action:'reschedule',dueAt:'tomorrow'},{action:'reschedule',dueAt:'2026-10-29T13:59:00Z'}];
  for(const input of invalid)expect(()=>mutateTask(actor,task.id,input as Parameters<typeof mutateTask>[2])).toThrow();
  expect(getPersonalTask(actor,task.id)).toEqual(task);
 });
 it('preserves saved work but rejects mutations and reminder delivery after Core access ends',()=>{
  const task=dueTask();processNotifications(actor);const notice=notices(task)[0];
  simulateLifecycle(demoActor('manager'),{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:'end-core'});
  expect(getPersonalTask(actor,task.id).status).toBe('open');
  expect(()=>mutateTask(actor,task.id,{action:'complete'})).toThrow();
  expect(taskForReminder(actor,notice.id)).toBeNull();
 });
 it('rechecks linked investor access for private task reads, writes and reminders',()=>{
  const task=dueTask();processNotifications(actor);const notice=notices(task)[0];
  getDb().prepare("UPDATE investors SET owner_id='user-taylor',data=json_set(data,'$.ownerId','user-taylor') WHERE id='investor-mike'").run();
  expect(()=>getPersonalTask(actor,task.id)).toThrow('not found');
  expect(listPersonalTasks(actor).map(item=>item.id)).not.toContain(task.id);
  expect(()=>mutateTask(actor,task.id,{action:'cancel'})).toThrow('not found');
  expect(taskForReminder(actor,notice.id)).toBeNull();
 });
});

describe('reminder revision lifecycle',()=>{
 it('snoozes a due reminder, retires queued delivery, then emits one reminder at its new time',()=>{
  const task=dueTask();processNotifications(actor);processNotifications(actor);const old=notices(task)[0];expect(notices(task)).toHaveLength(1);
  expect(taskForReminder(actor,old.id)?.version).toBe(1);
  getDb().prepare("INSERT INTO messaging_links VALUES('task-link',?,?,?,?,?,?,?,1,0,1,?,?)").run(actor.organizationId,actor.officeId,actor.id,'slack','TTEST','UTEST','DTEST',now(),now());
  getDb().prepare("INSERT INTO messaging_outbox(id,link_id,dedupe_key,kind,reference_id,body,status,created_at,updated_at) VALUES('task-out','task-link','task-out','notice',?,'','queued',?,?)").run(old.id,now(),now());
  const snoozed=mutateTask(actor,task.id,{action:'snooze',minutes:120,expectedVersion:1,eventKey:'snooze'});
  expect(taskForReminder(actor,old.id)).toBeNull();
  expect(JSON.parse(notices(task)[0].data).read).toBe(true);
  expect(getDb().prepare("SELECT status FROM messaging_outbox WHERE id='task-out'").get()).toEqual({status:'canceled'});
  processNotifications(actor);expect(notices(task)).toHaveLength(1);
  vi.setSystemTime(new Date('2026-10-29T16:00:00Z'));processNotifications(actor);processNotifications(actor);
  const current=notices(task);expect(current).toHaveLength(2);expect(current[1].dedupe_key).toBe(taskReminderKey(snoozed));expect(taskForReminder(actor,current[1].id)?.id).toBe(task.id);
 });
 it('retains legacy reminder deduplication until the legacy task is changed',()=>{
  getDb().prepare("UPDATE tasks SET data=json_set(data,'$.dueAt','2026-10-29T13:00:00.000Z') WHERE id='task-mike'").run();
  const legacy=getPersonalTask(actor,'task-mike');expect(legacy.version).toBe(0);expect(taskReminderKey(legacy)).toBe('task-due:task-mike');
  processNotifications(actor);processNotifications(actor);expect(notices(legacy)).toHaveLength(1);
  const notice=notices(legacy)[0];expect(taskForReminder(actor,notice.id)?.id).toBe(legacy.id);
  mutateTask(actor,legacy.id,{action:'snooze',minutes:30,expectedVersion:0});expect(taskForReminder(actor,notice.id)).toBeNull();
  vi.setSystemTime(new Date('2026-10-29T14:30:00Z'));processNotifications(actor);expect(notices(legacy)).toHaveLength(2);expect(notices(legacy)[1].dedupe_key).toBe('task-due:task-mike:v1');
 });
 it('keeps a delivered reminder resolvable after reading it but not after completion or cancellation',()=>{
  const task=dueTask();processNotifications(actor);const notice=notices(task)[0];readNotification(actor,notice.id);
  expect(taskForReminder(actor,notice.id)?.id).toBe(task.id);
  mutateTask(actor,task.id,{action:'complete'});expect(taskForReminder(actor,notice.id)).toBeNull();
  const canceled=dueTask();processNotifications(actor);const canceledNotice=notices(canceled)[0];mutateTask(actor,canceled.id,{action:'cancel'});expect(taskForReminder(actor,canceledNotice.id)).toBeNull();
 });
 it('does not deliver another employee’s notice, a nonexistent notice or a non-task notification',()=>{
  const task=dueTask();processNotifications(actor);const notice=notices(task)[0];
  expect(taskForReminder(demoActor('manager'),notice.id)).toBeNull();expect(taskForReminder(other,notice.id)).toBeNull();expect(taskForReminder(actor,'missing')).toBeNull();
  getDb().prepare("UPDATE notifications SET dedupe_key='research-done:test' WHERE id=?").run(notice.id);expect(taskForReminder(actor,notice.id)).toBeNull();
 });
});
