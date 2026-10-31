import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {transactionMilestones} from '../lib/transaction-contracts';
import type {TransactionTeamMember,TransactionTeamSnapshot,TransactionTeamTask,TransactionTeamItem,TransactionTeamSetup,TransactionTeamReview,TransactionTeamPublish,TransactionTeamAction,TransactionTeamBoard} from '../lib/transaction-team-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {featureAccess,requireFeature} from './billing';
import {readProperty} from './access';
import {getTransaction,transactionTeamSourceReference} from './transactions';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=z.string().trim().min(1).max(150),note=z.string().trim().min(6).max(1200);
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId];
const notice='Fictional shared coordination. Milestones and outcomes are employee reports. Access does not include private investors, correspondence or documents. No message, payment, title or inventory action is performed.';
export const transactionTeamPublishSchema=z.object({transactionId:id,expectedVersion:z.number().int().nonnegative(),sourceReference:z.string().length(64),memberIds:z.array(id).min(1).max(30),summary:note,milestones:z.array(z.enum(transactionMilestones)).max(7),eventKey:id}).strict();
export const transactionTeamCommitSchema=z.object({request:transactionTeamPublishSchema,reviewHash:z.string().length(64)}).strict();
const base={expectedVersion:z.number().int().positive(),eventKey:id};
export const transactionTeamActionSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('withdraw')}).strict(),
 z.object({...base,action:z.literal('assign'),assignedTo:id,instruction:note,dueDate:z.iso.date()}).strict(),
 z.object({...base,action:z.literal('acknowledge'),taskId:id}).strict(),
 z.object({...base,action:z.literal('report'),taskId:id,kind:z.enum(['blocked','completed']),note,source:note}).strict(),
 z.object({...base,action:z.literal('resolve'),taskId:id,note}).strict(),
]);
interface TeamRecord {id:string;version:number;generation:number;transactionId:string;ownerId:string;sourceReference:string;members:TransactionTeamMember[];snapshot:TransactionTeamSnapshot;tasks:TransactionTeamTask[];withdrawn:boolean}
interface TeamRow {id:string;owner_id:string;transaction_id:string;data:string}
function people(actor:Actor):TransactionTeamMember[]{return getDb().prepare('SELECT m.user_id id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.office_id=? ORDER BY m.user_id').all(...scope(actor)) as TransactionTeamMember[];}
function ownerActor(actor:Actor,record:TeamRecord):Actor {const person=people(actor).find(p=>p.id===record.ownerId);if(!person)throw new AppError(404,'The coordination owner no longer belongs to this office.');return {...person,organizationId:actor.organizationId,officeId:actor.officeId};}
function byTransaction(actor:Actor,transactionId:string){const row=getDb().prepare('SELECT data FROM transaction_teams WHERE organization_id=? AND office_id=? AND owner_id=? AND transaction_id=?').get(...scope(actor),actor.id,transactionId) as {data:string}|undefined;return row?JSON.parse(row.data) as TeamRecord:null;}
function recordFor(actor:Actor,teamId:string):TeamRecord {assertActor(actor);const row=getDb().prepare('SELECT id,owner_id,transaction_id,data FROM transaction_teams WHERE id=? AND organization_id=? AND office_id=?').get(id.parse(teamId),...scope(actor)) as TeamRow|undefined;if(!row)throw new AppError(404,'This shared transaction is unavailable.');const record=JSON.parse(row.data) as TeamRecord;if(record.ownerId!==actor.id&&!record.members.some(m=>m.id===actor.id&&m.role===actor.role))throw new AppError(404,'This shared transaction is unavailable.');return record;}
function sourceCurrent(actor:Actor,record:TeamRecord){try{const owner=ownerActor(actor,record);readProperty(actor,record.snapshot.propertyId);return transactionTeamSourceReference(owner,record.transactionId)===record.sourceReference;}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}}
function project(actor:Actor,record:TeamRecord):TransactionTeamItem {
 const current=sourceCurrent(actor,record),canManage=record.ownerId===actor.id;
 if(record.withdrawn&&!canManage)throw new AppError(404,'This shared transaction is unavailable.');
 const members=people(actor).filter(p=>record.members.some(m=>m.id===p.id&&m.role===p.role)),owner=people(actor).find(p=>p.id===record.ownerId)??{id:record.ownerId,name:'Unavailable owner',role:'dispositions' as const};
 const status=record.withdrawn?'withdrawn':current?'current':'source_changed',tasks=status==='current'?record.tasks.filter(t=>t.generation===record.generation):[];
 const attention={overdue:tasks.filter(t=>t.state!=='resolved'&&t.dueDate<now().slice(0,10)).length,blocked:tasks.filter(t=>t.state==='blocked').length,review:tasks.filter(t=>t.state==='reported').length,open:tasks.filter(t=>t.state!=='resolved').length};
 const item={id:record.id,version:record.version,generation:record.generation,viewerId:actor.id,privateTransactionId:canManage?record.transactionId:null,owner,members,snapshot:status==='current'?record.snapshot:null,tasks,status,canManage,canAct:status==='current'&&featureAccess(actor,'core').allowed,attention,notice} satisfies Omit<TransactionTeamItem,'reference'>;
 return {...item,reference:`${record.id}@${hash({actor:[...scope(actor),actor.id,actor.role],item})}`};
}
export function getTransactionTeam(actor:Actor,teamId:string){return project(actor,recordFor(actor,teamId));}
export function getTransactionTeams(actor:Actor):TransactionTeamBoard {
 assertActor(actor);const rows=getDb().prepare('SELECT id FROM transaction_teams WHERE organization_id=? AND office_id=? ORDER BY rowid DESC').all(...scope(actor)) as {id:string}[];
 const items=rows.flatMap(row=>{try{return [getTransactionTeam(actor,row.id)];}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return [];throw error;}});
 items.sort((a,b)=>(b.attention.blocked+b.attention.overdue+b.attention.review)-(a.attention.blocked+a.attention.overdue+a.attention.review));return {items,notice};
}
export function transactionTeamReferenceCurrent(actor:Actor,reference:string){try{return getTransactionTeam(actor,reference.split('@')[0]).reference===reference;}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}}
export function transactionTeamSetup(actor:Actor,transactionId:string):TransactionTeamSetup {
 const detail=getTransaction(actor,transactionId),record=byTransaction(actor,transactionId);
 return {transactionId,expectedVersion:record?.version??0,sourceReference:transactionTeamSourceReference(actor,transactionId),members:people(actor).filter(p=>p.id!==actor.id),current:record?project(actor,record):null,preview:{propertyId:detail.property.id,address:detail.property.address,closingDate:detail.record.input.closingDate,summary:'',milestones:Object.fromEntries(transactionMilestones.flatMap(key=>detail.record.input.milestones[key]?[[key,detail.record.input.milestones[key]!.date]]:[]))},canPublish:featureAccess(actor,'core').allowed};
}
export function reviewTransactionTeam(actor:Actor,raw:TransactionTeamPublish):TransactionTeamReview {
 assertActor(actor);requireFeature(actor,'core');const request=transactionTeamPublishSchema.parse(raw),setup=transactionTeamSetup(actor,request.transactionId);
 if(setup.expectedVersion!==request.expectedVersion||setup.sourceReference!==request.sourceReference)throw new AppError(409,'The transaction or coordination changed. Review the current summary before sharing.');
 if(new Set(request.memberIds).size!==request.memberIds.length||new Set(request.milestones).size!==request.milestones.length)throw new AppError(422,'Choose each teammate and milestone once.');
 const members=request.memberIds.map(id=>setup.members.find(m=>m.id===id));if(members.some(m=>!m))throw new AppError(422,'Choose current teammates from this office.');
 for(const member of members)readProperty({...member!,organizationId:actor.organizationId,officeId:actor.officeId},setup.preview.propertyId);
 if(request.milestones.some(key=>!setup.preview.milestones[key]))throw new AppError(422,'Only existing employee-reported milestone dates can be included.');
 const snapshot={...setup.preview,summary:request.summary,milestones:Object.fromEntries(request.milestones.map(key=>[key,setup.preview.milestones[key]!]))};
 const reviewNotice=`${notice} Share only the displayed property, closing target, summary and selected reported dates with these teammates. Private names, contacts, file text and email are excluded. Refreshing begins a new coordination cycle; previous assignments and outcomes remain in audit history and do not carry forward.`;
 const prepared={request,snapshot,members:members as TransactionTeamMember[],notice:reviewNotice};return {...prepared,reviewHash:hash({actor:[...scope(actor),actor.id,actor.role],...prepared})};
}
function prior(actor:Actor,eventKey:string,payload:unknown){const row=getDb().prepare('SELECT payload_hash,team_id FROM transaction_team_events WHERE organization_id=? AND office_id=? AND actor_id=? AND event_key=?').get(...scope(actor),actor.id,eventKey) as {payload_hash:string;team_id:string}|undefined;if(row&&row.payload_hash!==hash(payload))throw new AppError(409,'This action key belongs to a different coordination request.');return row;}
function persist(actor:Actor,record:TeamRecord,eventKey:string,payload:unknown,action:string){
 getDb().prepare('INSERT INTO transaction_teams VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.id,...scope(actor),record.ownerId,record.transactionId,JSON.stringify(record));
 getDb().prepare('INSERT INTO transaction_team_events VALUES(?,?,?,?,?,?,?,?,?)').run(newId('team_event'),...scope(actor),actor.id,eventKey,hash(payload),record.id,JSON.stringify({action,record}),now());audit(actor,`transaction.team.${action}`,record.id,{version:record.version,generation:record.generation});
}
export function publishTransactionTeam(actor:Actor,raw:{request:TransactionTeamPublish;reviewHash:string}):TransactionTeamItem {
 assertActor(actor);requireFeature(actor,'core');const input=transactionTeamCommitSchema.parse(raw);
 return getDb().transaction(()=>{
  const replay=prior(actor,input.request.eventKey,input);if(replay)return getTransactionTeam(actor,replay.team_id);
  const review=reviewTransactionTeam(actor,input.request);if(review.reviewHash!==input.reviewHash)throw new AppError(409,'The exact sharing review changed. Review the current summary and teammates again.');
  const previous=byTransaction(actor,input.request.transactionId),record:TeamRecord={id:previous?.id??newId('transaction_team'),version:(previous?.version??0)+1,generation:(previous?.generation??0)+1,transactionId:input.request.transactionId,ownerId:actor.id,sourceReference:input.request.sourceReference,members:review.members,snapshot:review.snapshot,tasks:[],withdrawn:false};
  persist(actor,record,input.request.eventKey,input,'publish');return project(actor,record);
 }).immediate();
}
export function mutateTransactionTeam(actor:Actor,teamId:string,raw:TransactionTeamAction):TransactionTeamItem {
 assertActor(actor);const input=transactionTeamActionSchema.parse(raw);
 return getDb().transaction(()=>{
  const record=recordFor(actor,teamId),payload={teamId,input},replay=prior(actor,input.eventKey,payload);if(replay)return getTransactionTeam(actor,replay.team_id);
  if(input.expectedVersion!==record.version)throw new AppError(409,'This coordination changed. Review its latest version.');
  const owner=record.ownerId===actor.id;
  if(input.action==='withdraw'){if(!owner)throw new AppError(403,'Only the owner can withdraw this shared summary.');record.withdrawn=true;}
  else {
   requireFeature(actor,'core');if(record.withdrawn||!sourceCurrent(actor,record))throw new AppError(409,'Refresh the shared summary from the current transaction before continuing.');
   if(input.action==='assign'){
    if(!owner)throw new AppError(403,'Only the coordination owner can assign next steps.');
    if(!people(actor).some(p=>p.id===input.assignedTo&&(p.id===record.ownerId||record.members.some(m=>m.id===p.id&&m.role===p.role))))throw new AppError(422,'Choose a current member of this coordination.');
    if(record.tasks.length>=20)throw new AppError(422,'This coordination cycle already has twenty follow-ups.');
    if(input.dueDate<now().slice(0,10))throw new AppError(422,'Choose today or a future follow-up date.');
    record.tasks.push({id:newId('transaction_task'),generation:record.generation,assignedTo:input.assignedTo,instruction:input.instruction,dueDate:input.dueDate,state:'assigned',acknowledgedAt:null,report:null,resolution:null});
   }else {
    const task=record.tasks.find(t=>t.id===input.taskId&&t.generation===record.generation);if(!task)throw new AppError(404,'This follow-up is unavailable.');
    if(task.state==='resolved')throw new AppError(409,'This follow-up has already been resolved.');
    if(input.action==='resolve'){
     if(!owner)throw new AppError(403,'Only the coordination owner can resolve a reported outcome.');
     if(task.state!=='reported'||task.report?.kind!=='completed')throw new AppError(409,'A completed employee report is required before resolving this follow-up.');
     task.state='resolved';task.resolution={note:input.note,by:actor.id,at:now()};
    }else {
     if(task.assignedTo!==actor.id)throw new AppError(403,'Only the assigned teammate can acknowledge or report this follow-up.');
     if(input.action==='acknowledge'){if(task.acknowledgedAt)throw new AppError(409,'This follow-up is already acknowledged.');task.acknowledgedAt=now();task.state='acknowledged';}
     if(input.action==='report'){if(!task.acknowledgedAt)throw new AppError(409,'Acknowledge this assignment before reporting its outcome.');task.state=input.kind==='blocked'?'blocked':'reported';task.report={kind:input.kind,note:input.note,source:input.source,by:actor.id,at:now()};task.resolution=null;}
    }
   }
  }
  record.version++;persist(actor,record,input.eventKey,payload,input.action);return project(actor,record);
 }).immediate();
}
