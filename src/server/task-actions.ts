import { z } from 'zod';
import type { Actor, Notification, Task } from '../lib/contracts';
import { readInvestor } from './access';
import { requireFeature } from './billing';
import { AppError, audit, getDb, now, scopedGet, scopedRows, updateRecord } from './db';
import { fingerprint } from './provider-runtime';

const id = z.string().trim().min(1).max(150);
export const taskMutationSchema = z.object({
  action:z.enum(['complete','cancel','reschedule','snooze']),
  dueAt:z.string().datetime({offset:true}).nullable().optional(),
  minutes:z.number().int().min(1).max(43200).optional(),
  expectedVersion:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  eventKey:id.optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.action==='reschedule'&&!Object.hasOwn(value,'dueAt'))ctx.addIssue({code:'custom',path:['dueAt'],message:'Supply the new deadline, or null to clear it.'});
  if(value.action!=='reschedule'&&Object.hasOwn(value,'dueAt'))ctx.addIssue({code:'custom',path:['dueAt'],message:'Only rescheduling accepts a deadline.'});
  if(value.action==='snooze'&&value.minutes===undefined)ctx.addIssue({code:'custom',path:['minutes'],message:'Supply the number of minutes to snooze.'});
  if(value.action!=='snooze'&&value.minutes!==undefined)ctx.addIssue({code:'custom',path:['minutes'],message:'Only snoozing accepts a duration.'});
});
export type TaskMutationInput = z.input<typeof taskMutationSchema>;
const normalized=(task:Task):Task=>({...task,version:task.version??0,updatedAt:task.updatedAt??task.createdAt});

/** Conversational reminders are personal work, including for office managers. */
export function getPersonalTask(actor:Actor,taskId:string):Task {
  const task=normalized(scopedGet<Task>(actor,'tasks',id.parse(taskId),true));
  if(task.investorId)readInvestor(actor,task.investorId);
  return task;
}
export function listPersonalTasks(actor:Actor):Task[] {
  return scopedRows<Task>(actor,'tasks',true).flatMap(task=>{
    try { if(task.investorId)readInvestor(actor,task.investorId);return [normalized(task)]; }
    catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return [];throw error;}
  });
}

export function taskReminderKey(task:Task):string {return (task.version??0)===0?`task-due:${task.id}`:`task-due:${task.id}:v${task.version}`;}

/** Rechecks the precise reminder revision at delivery time. Legacy notices apply only to legacy tasks. */
export function taskForReminder(actor:Actor,notificationId:string):Task|null {
  try {
    // Reading a delivered notice in the dashboard does not erase its exact reply target.
    // Delivery callers separately suppress already-read notifications.
    scopedGet<Notification>(actor,'notifications',id.parse(notificationId),true);
    const row=getDb().prepare('SELECT dedupe_key FROM notifications WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?')
      .get(notificationId,actor.organizationId,actor.officeId,actor.id) as {dedupe_key:string};
    if(!row.dedupe_key.startsWith('task-due:'))return null;
    const reference=row.dedupe_key.slice(9),revision=/^(.*):v(\d+)$/.exec(reference);
    const task=getPersonalTask(actor,revision?revision[1]:reference);
    const version=task.version??0;
    if(revision?Number(revision[2])!==version:version!==0)return null;
    if(task.status!=='open'||!task.dueAt||Date.parse(task.dueAt)>Date.now())return null;
    requireFeature(actor,'core');requireFeature(actor,'daily-coordinator');
    return task;
  }catch(error){if(error instanceof AppError&&[402,403,404].includes(error.status))return null;throw error;}
}

function retireReminders(actor:Actor,taskId:string){
  const key=`task-due:${taskId}`,prefix=`${key}:v`;
  const notices=getDb().prepare('SELECT id,data FROM notifications WHERE organization_id=? AND office_id=? AND owner_id=? AND (dedupe_key=? OR substr(dedupe_key,1,?)=?)')
    .all(actor.organizationId,actor.officeId,actor.id,key,prefix.length,prefix) as {id:string;data:string}[];
  for(const notice of notices){
    getDb().prepare("UPDATE notifications SET data=json_set(data,'$.read',json('true')) WHERE id=?").run(notice.id);
    getDb().prepare("UPDATE messaging_outbox SET status='canceled',updated_at=? WHERE kind='notice' AND reference_id=? AND status='queued'").run(now(),notice.id);
  }
}

/** Mutation and replay receipt commit together; completed/canceled work is retained rather than deleted. */
export function mutateTask(actor:Actor,taskId:string,input:TaskMutationInput):Task {
  requireFeature(actor,'core');requireFeature(actor,'daily-coordinator');
  id.parse(taskId);const parsed=taskMutationSchema.parse(input);
  const requestHash=fingerprint({taskId,action:parsed.action,dueAt:parsed.dueAt?new Date(parsed.dueAt).toISOString():parsed.dueAt,minutes:parsed.minutes,expectedVersion:parsed.expectedVersion});
  return getDb().transaction(()=>{
    const old=getPersonalTask(actor,taskId),version=old.version??0;
    if(parsed.eventKey){
      const receipt=getDb().prepare('SELECT request_hash FROM task_action_receipts WHERE organization_id=? AND office_id=? AND user_id=? AND event_key=?')
        .get(actor.organizationId,actor.officeId,actor.id,parsed.eventKey) as {request_hash:string}|undefined;
      if(receipt){if(receipt.request_hash!==requestHash)throw new AppError(409,'This task request identifier already belongs to different work.');return old;}
    }
    if(parsed.expectedVersion!==undefined&&parsed.expectedVersion!==version)throw new AppError(409,'This task changed. Review its current details before updating it.');
    const target=parsed.action==='complete'?'completed':parsed.action==='cancel'?'canceled':'open';
    if(old.status!=='open'&&old.status!==target)throw new AppError(409,`This task is ${old.status}. Create a new task for further follow-up.`);
    let dueAt=old.dueAt;
    if(parsed.action==='reschedule'){
      dueAt=parsed.dueAt?new Date(parsed.dueAt).toISOString():null;
      if(dueAt&&Date.parse(dueAt)<=Date.now())throw new AppError(422,'Choose a future deadline for this reminder.');
    }
    if(parsed.action==='snooze')dueAt=new Date(Date.now()+parsed.minutes!*60000).toISOString();
    const changed=target!==old.status||dueAt!==old.dueAt;
    let next=old;
    if(changed){
      const stamp=now();
      next={...old,status:target,dueAt,version:version+1,updatedAt:stamp,...(target==='completed'?{completedAt:stamp}:{}),...(target==='canceled'?{canceledAt:stamp}:{})};
      updateRecord(actor,'tasks',next,true);retireReminders(actor,taskId);
      audit(actor,`task.${parsed.action==='complete'?'completed':parsed.action==='cancel'?'canceled':parsed.action==='snooze'?'snoozed':'rescheduled'}`,taskId,{version:next.version,previousVersion:version,dueAt:next.dueAt});
    }
    if(parsed.eventKey)getDb().prepare('INSERT INTO task_action_receipts VALUES(?,?,?,?,?,?,?,?)')
      .run(actor.organizationId,actor.officeId,actor.id,parsed.eventKey,taskId,requestHash,next.version??0,now());
    return next;
  }).immediate();
}
