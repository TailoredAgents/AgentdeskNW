import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import { AppError, getDb, newId, now, scopedGet } from './db';
import { requireFeature } from './billing';
import { getPersonalTask, taskForReminder } from './task-actions';

const id = z.string().min(1).max(240);
const taskReference = z.object({id,version:z.number().int().nonnegative()}).strict();
const pendingSchema = z.object({action:z.enum(['complete','cancel','reschedule','snooze']),dateText:z.string().max(240).optional(),minutes:z.number().int().positive().max(43200).optional(),requestId:id,referenceAt:z.string().datetime({offset:true}).optional()}).strict();
export type PendingConversationIntent = z.infer<typeof pendingSchema>;
export interface ConversationFocusCandidate {id:string;version:number;title:string;source:'assistant_result'|'reminder'|'choices';createdAt:string}
export interface ConversationFocus {kind:'task';status:'none'|'ready'|'ambiguous'|'stale';candidates:ConversationFocusCandidate[];pending?:PendingConversationIntent}
export interface ConversationFocusInput {kind:'task';id:string;version:number;source:'assistant_result'|'reminder';eventKey:string;occurredAt?:string;turnKey?:string;sourceEventId?:string;deliveryRequestId?:string}
type FocusData={tasks:Array<{id:string;version:number}>;pending?:PendingConversationIntent;sourceEventId?:string;deliveryRequestId?:string};
type FocusRow={id:string;source:'assistant_result'|'reminder'|'choices'|'clear';turn_key:string|null;occurred_at:string;available_at:string|null;data:string};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const none=():ConversationFocus=>({kind:'task',status:'none',candidates:[]});
const focusLifetime=24*60*60_000,choiceLifetime=15*60_000;

function access(actor:Actor,conversationId:string){requireFeature(actor,'core');scopedGet(actor,'conversations',id.parse(conversationId),true);}
function write(actor:Actor,conversationId:string,source:FocusRow['source'],eventKey:string,data:FocusData,occurredAt=now(),turnKey?:string){
  access(actor,conversationId);id.parse(eventKey);
  z.string().datetime({offset:true}).parse(occurredAt);
  if(Date.parse(occurredAt)>Date.now())throw new AppError(422,'Conversation context cannot come from the future.');
  const payloadHash=hash({source,data,turnKey:turnKey??null});
  const db=getDb();
  const previous=db.prepare('SELECT payload_hash FROM conversation_focus_events WHERE organization_id=? AND office_id=? AND user_id=? AND conversation_id=? AND event_key=?').get(actor.organizationId,actor.officeId,actor.id,conversationId,eventKey) as {payload_hash:string}|undefined;
  if(previous){if(previous.payload_hash!==payloadHash)throw new AppError(409,'This conversation context event already represents different work.');return;}
  const stamp=new Date(occurredAt).toISOString();
  db.prepare('INSERT INTO conversation_focus_events(id,organization_id,office_id,user_id,conversation_id,event_key,payload_hash,source,turn_key,occurred_at,available_at,data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(newId('focus'),actor.organizationId,actor.officeId,actor.id,conversationId,eventKey,payloadHash,source,turnKey??null,stamp,data.deliveryRequestId?null:stamp,JSON.stringify(data));
}

function replyReceipt(actor:Actor,conversationId:string,requestId:string){
  return getDb().prepare(`SELECT o.updated_at FROM assistant_turns a JOIN messaging_outbox o ON o.reference_id=json_extract(a.result,'$.messageId')
    JOIN messaging_links l ON l.id=o.link_id WHERE a.organization_id=? AND a.office_id=? AND a.user_id=? AND a.conversation_id=? AND a.request_id=? AND a.status='completed'
    AND o.kind='reply' AND o.status IN ('accepted','delivered') AND l.organization_id=a.organization_id AND l.office_id=a.office_id AND l.user_id=a.user_id AND l.active=1 AND l.opted_out=0
    ORDER BY o.updated_at LIMIT 1`).get(actor.organizationId,actor.officeId,actor.id,conversationId,requestId) as {updated_at:string}|undefined;
}

/** Latch first verified reply availability, separately from when a tool happened to finish. */
export function confirmConversationFocusDelivery(actor:Actor,conversationId:string){
  access(actor,conversationId);
  const rows=getDb().prepare('SELECT id,data FROM conversation_focus_events WHERE organization_id=? AND office_id=? AND user_id=? AND conversation_id=? AND available_at IS NULL')
    .all(actor.organizationId,actor.officeId,actor.id,conversationId) as {id:string;data:string}[];
  for(const row of rows){const data=JSON.parse(row.data) as FocusData;if(!data.deliveryRequestId)continue;const receipt=replyReceipt(actor,conversationId,data.deliveryRequestId);if(receipt)getDb().prepare('UPDATE conversation_focus_events SET available_at=? WHERE id=? AND available_at IS NULL').run(receipt.updated_at,row.id);}
}

/** A reminder is a referent only after a provider receipt and only in the employee's shared conversation. */
function reminderReference(actor:Actor,conversationId:string,outboxId:string){
  const row=getDb().prepare(`SELECT o.reference_id,o.updated_at,o.status,l.active,l.opted_out FROM messaging_outbox o
    JOIN messaging_links l ON l.id=o.link_id JOIN messaging_threads t ON t.organization_id=l.organization_id AND t.office_id=l.office_id AND t.user_id=l.user_id
    WHERE o.id=? AND o.kind='notice' AND l.organization_id=? AND l.office_id=? AND l.user_id=? AND t.conversation_id=?`)
    .get(outboxId,actor.organizationId,actor.officeId,actor.id,conversationId) as {reference_id:string|null;updated_at:string;status:string;active:number;opted_out:number}|undefined;
  if(!row||!['accepted','delivered'].includes(row.status)||!row.active||row.opted_out||!row.reference_id)return null;
  const task=taskForReminder(actor,row.reference_id);
  return task?{task,occurredAt:row.updated_at}:null;
}

export function setConversationFocus(actor:Actor,conversationId:string,input:ConversationFocusInput){
  access(actor,conversationId);
  const parsed=z.object({kind:z.literal('task'),id,version:z.number().int().nonnegative(),source:z.enum(['assistant_result','reminder']),eventKey:id,occurredAt:z.string().datetime({offset:true}).optional(),turnKey:id.optional(),sourceEventId:id.optional(),deliveryRequestId:id.optional()}).strict().parse(input);
  return getDb().transaction(()=>{
    const task=getPersonalTask(actor,parsed.id);
    if((task.version??0)!==parsed.version)throw new AppError(409,'The task changed before conversation context could be saved.');
    let occurredAt=parsed.occurredAt??now();
    if(parsed.source==='reminder'){
      if(!parsed.sourceEventId)throw new AppError(422,'A confirmed reminder receipt is required.');
      const reference=reminderReference(actor,conversationId,parsed.sourceEventId);
      if(!reference||reference.task.id!==task.id||(reference.task.version??0)!==parsed.version)throw new AppError(409,'This reminder is not a current confirmed task reference.');
      occurredAt=reference.occurredAt;
    }
    write(actor,conversationId,parsed.source,parsed.eventKey,{tasks:[{id:parsed.id,version:parsed.version}],...(parsed.sourceEventId?{sourceEventId:parsed.sourceEventId}:{}),...(parsed.deliveryRequestId?{deliveryRequestId:parsed.deliveryRequestId}:{})},occurredAt,parsed.turnKey??(parsed.source==='assistant_result'?parsed.eventKey:undefined));
  }).immediate();
}

export function saveConversationChoices(actor:Actor,conversationId:string,input:{tasks:Array<{id:string;version:number}>;intent:PendingConversationIntent;deliveryRequestId?:string}){
  access(actor,conversationId);
  const parsed=z.object({tasks:z.array(taskReference).min(1).max(20),intent:pendingSchema,deliveryRequestId:id.optional()}).strict().parse(input);
  return getDb().transaction(()=>{
    for(const reference of parsed.tasks){const task=getPersonalTask(actor,reference.id);if(task.status!=='open'||(task.version??0)!==reference.version)throw new AppError(409,'A task changed. Ask again using its current details.');}
    const tasks=[...new Map(parsed.tasks.map(task=>[task.id,task])).values()];
    write(actor,conversationId,'choices',`choices:${hash(parsed.intent.requestId)}`,{tasks,pending:parsed.intent,...(parsed.deliveryRequestId?{deliveryRequestId:parsed.deliveryRequestId}:{})});
  }).immediate();
}

export function clearConversationFocus(actor:Actor,conversationId:string,eventKey=newId('clear')){
  write(actor,conversationId,'clear',eventKey,{tasks:[]});
}

/** Current authorization/version checks are always applied, even when reading context as of an earlier inbound message. */
export function readConversationFocus(actor:Actor,conversationId:string,asOf?:string):ConversationFocus {
  access(actor,conversationId);
  confirmConversationFocusDelivery(actor,conversationId);
  const until=asOf?new Date(z.string().datetime({offset:true}).parse(asOf)).toISOString():now();
  if(Date.parse(until)>Date.now())throw new AppError(422,'Conversation context cannot be read from a future message.');
  const cutoff=new Date(Date.now()-focusLifetime).toISOString();
  // Equal timestamps cannot establish which event came first; ask rather than bind a queued reply to later work.
  const persisted=getDb().prepare(`SELECT id,source,turn_key,occurred_at,available_at,data FROM conversation_focus_events WHERE organization_id=? AND office_id=? AND user_id=? AND conversation_id=? AND available_at>=? AND available_at${asOf?'<':'<='}? ORDER BY available_at DESC,rowid DESC LIMIT 100`)
    .all(actor.organizationId,actor.officeId,actor.id,conversationId,cutoff,until) as FocusRow[];
  const rows=persisted.filter(row=>{const data=JSON.parse(row.data) as FocusData;return !data.deliveryRequestId||!!replyReceipt(actor,conversationId,data.deliveryRequestId);});
  if(!rows.length)return none();
  // Unknown transport outcomes may have reached the employee. Do not silently fall back to an older task.
  const uncertain=getDb().prepare(`SELECT MAX(o.updated_at) at FROM messaging_outbox o JOIN messaging_links l ON l.id=o.link_id
    JOIN messaging_threads t ON t.organization_id=l.organization_id AND t.office_id=l.office_id AND t.user_id=l.user_id
    WHERE l.organization_id=? AND l.office_id=? AND l.user_id=? AND t.conversation_id=? AND o.status IN ('dispatching','unknown') AND o.created_at>=? AND o.created_at${asOf?'<':'<='}?
    AND ((o.kind='notice' AND EXISTS(SELECT 1 FROM notifications n WHERE n.id=o.reference_id AND n.dedupe_key LIKE 'task-due:%'))
      OR (o.kind='reply' AND EXISTS(SELECT 1 FROM assistant_turns a JOIN conversation_focus_events f ON json_extract(f.data,'$.deliveryRequestId')=a.request_id AND f.conversation_id=a.conversation_id AND f.user_id=a.user_id
        WHERE a.organization_id=l.organization_id AND a.office_id=l.office_id AND a.user_id=l.user_id AND a.conversation_id=t.conversation_id AND json_extract(a.result,'$.messageId')=o.reference_id)))`)
    .get(actor.organizationId,actor.officeId,actor.id,conversationId,cutoff,until) as {at:string|null};
  if(uncertain.at&&uncertain.at>=(rows[0].available_at??rows[0].occurred_at))return {...none(),status:'stale'};
  const anchorIndex=rows.findIndex(row=>row.source!=='reminder'),anchor=rows[anchorIndex];
  let selected:FocusRow[],pending:PendingConversationIntent|undefined;
  if(!anchor)selected=rows;
  else if(anchor.source==='clear')selected=rows.slice(0,anchorIndex);
  else if(anchor.source==='choices'){
    if(Date.now()-Date.parse(anchor.available_at??anchor.occurred_at)>choiceLifetime)return {...none(),status:'stale'};
    selected=rows.slice(0,anchorIndex+1);
    if(anchorIndex===0)pending=(JSON.parse(anchor.data) as FocusData).pending;
  }else selected=rows.filter((row,index)=>index<anchorIndex||row.source==='assistant_result'&&row.turn_key===anchor.turn_key);
  if(!selected.length)return none();
  const candidates=new Map<string,ConversationFocusCandidate>(),seenTasks=new Set<string>();let stale=false;
  for(const row of selected){
    const data=JSON.parse(row.data) as FocusData;
    for(const reference of data.tasks){
      if(seenTasks.has(reference.id))continue;seenTasks.add(reference.id);
      try{
        const task=getPersonalTask(actor,reference.id);
        if(task.status!=='open'||(task.version??0)!==reference.version){stale=true;continue;}
        if(row.source==='reminder'){
          const receipt=data.sourceEventId?reminderReference(actor,conversationId,data.sourceEventId):null;
          if(!receipt||receipt.task.id!==reference.id||(receipt.task.version??0)!==reference.version){stale=true;continue;}
        }
        const key=`${reference.id}:${reference.version}`;
        if(!candidates.has(key))candidates.set(key,{...reference,title:task.title,source:row.source as ConversationFocusCandidate['source'],createdAt:row.available_at??row.occurred_at});
      }catch(error){if(error instanceof AppError&&[403,404].includes(error.status)){stale=true;continue;}throw error;}
    }
  }
  const values=[...candidates.values()];
  return {kind:'task',status:stale?'stale':values.length>1?'ambiguous':values.length===1?'ready':'none',candidates:values,...(pending&&!stale?{pending}:{})};
}
