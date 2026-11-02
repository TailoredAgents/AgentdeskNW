import type {Actor,Role,Task} from '../lib/contracts';
import type {Opportunity} from '../lib/opportunity-contracts';
import type {HandoffItem,HandoffRecord} from '../lib/handoff-contracts';
import {managementActivityIds,type ManagementActivity,type ManagementProgress,type ManagementQuery} from '../lib/management-contracts';
import {getDb} from './db';

export const reportingTimeZone='America/New_York';
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:reportingTimeZone,year:'numeric',month:'2-digit',day:'2-digit'});
export const reportDay=(stamp:string)=>dateFormat.format(new Date(stamp));
export function shiftReportDay(day:string,days:number){const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
const labels:Record<ManagementActivity['kind'],string>={followup_created:'Buyer follow-ups created',followup_completed:'Buyer follow-ups completed',opportunity_submitted:'Opportunities submitted',opportunity_revised:'Opportunity revisions saved',handoff_assigned:'Handoffs assigned',handoff_acknowledged:'Assignments acknowledged',blocker_reported:'Blockers reported',completion_reported:'Completions reported',handoff_resolved:'Follow-ups reviewed and resolved'};
export type ReportingPerson={id:string;name:string;role:Role};
export interface ReportingSources {people:ReportingPerson[];tasks:Array<{id:string;ownerId:string;task:Task}>;opportunities:Opportunity[];handoffs:HandoffItem[]}
interface Timing {kind:'acknowledgment'|'review';hours:number;actorId:string;at:string;eventKey:string}

/** Minimal current-source metadata. Never expose historical note/message bodies. */
export function collectManagementActivity(actor:Actor,sources:ReportingSources,checkedAt:string){
 const db=getDb(),people=new Map(sources.people.map(person=>[person.id,person]));
 const events:ManagementActivity[]=[],timings:Timing[]=[];
 const add=(event:Omit<ManagementActivity,'actorName'|'role'>)=>{
  const person=people.get(event.actorId);
  if(person&&Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=Date.parse(checkedAt))events.push({...event,actorName:person.name,role:person.role});
 };
 for(const {id,ownerId,task} of sources.tasks){
  const base={actorId:ownerId,title:task.title,destination:{kind:'investor' as const,id:task.investorId!},sourceLabel:'Current buyer follow-up',sourceVersion:task.version??0};
  add({...base,key:`task:${id}:created`,kind:'followup_created',at:task.createdAt});
  if(task.status==='completed'&&task.completedAt)add({...base,key:`task:${id}:completed`,kind:'followup_completed',at:task.completedAt});
 }
 for(const opportunity of sources.opportunities){
  const rows=db.prepare('SELECT id,actor_id,created_at,json_extract(data,\'$.version\') AS version FROM acquisition_opportunity_events WHERE organization_id=? AND office_id=? AND opportunity_id=? ORDER BY rowid').all(actor.organizationId,actor.officeId,opportunity.id) as {id:string;actor_id:string;created_at:string;version:number}[];
  for(const row of rows)add({key:`opportunity:${row.id}`,actorId:row.actor_id,title:opportunity.address,at:row.created_at,kind:row.version===1?'opportunity_submitted':'opportunity_revised',sourceLabel:`Historical opportunity revision v${row.version}; current v${opportunity.version}`,sourceVersion:opportunity.version,destination:{kind:'opportunity',id:opportunity.id}});
 }
 for(const item of sources.handoffs){
  const current=item.record;
  if(!current||item.sourceChanged||item.attention==='source_changed')continue;
  const table=item.sourceKind==='opportunity'?'opportunity_handoff_events':'handoff_events';
  const rows=(db.prepare(`SELECT id,actor_id,action,created_at,data FROM ${table} WHERE organization_id=? AND office_id=? AND handoff_id=? ORDER BY rowid`).all(actor.organizationId,actor.officeId,current.id) as {id:string;actor_id:string;action:string;created_at:string;data:string}[]).map(row=>({...row,record:JSON.parse(row.data) as HandoffRecord}));
  const assignment=rows.filter(row=>row.action==='assign').at(-1);
  if(!assignment||assignment.record.releaseVersion!==item.releaseVersion||assignment.record.assignedTo!==current.assignedTo)continue;
  let completion:typeof assignment|undefined;
  for(const row of rows.filter(row=>row.record.version>=assignment.record.version&&row.record.releaseVersion===item.releaseVersion&&row.record.assignedTo===current.assignedTo)){
   if(!people.has(row.actor_id))continue;
   const kind=row.action==='assign'?'handoff_assigned':row.action==='acknowledge'?'handoff_acknowledged':row.action==='resolve'?'handoff_resolved':row.action==='report'?(row.record.outcome?.kind==='blocked'?'blocker_reported':'completion_reported'):null;
   if(!kind)continue;
   const key=`handoff:${row.id}`;
   add({key,kind,actorId:row.actor_id,title:item.address,at:row.created_at,sourceLabel:`Current assignment cycle · source v${item.releaseVersion}`,sourceVersion:item.releaseVersion,destination:{kind:'handoff',id:item.releaseId}});
   if(kind==='handoff_acknowledged'&&people.has(assignment.actor_id))timings.push({kind:'acknowledgment',hours:(Date.parse(row.created_at)-Date.parse(assignment.created_at))/3600000,actorId:row.actor_id,at:row.created_at,eventKey:key});
   if(kind==='blocker_reported')completion=undefined;
   if(kind==='completion_reported')completion=row;
   if(kind==='handoff_resolved'&&completion)timings.push({kind:'review',hours:(Date.parse(row.created_at)-Date.parse(completion.created_at))/3600000,actorId:row.actor_id,at:row.created_at,eventKey:key});
  }
 }
 events.sort((a,b)=>b.at.localeCompare(a.at)||a.key.localeCompare(b.key));
 return {events,timings:timings.filter(item=>item.hours>=0&&item.at<=checkedAt)};
}

export function projectManagementProgress(history:ReturnType<typeof collectManagementActivity>,query:ManagementQuery,checkedAt:string):ManagementProgress {
 const days=query.period==='30d'?30:7,today=reportDay(checkedAt),start=shiftReportDay(today,-days),previousStart=shiftReportDay(start,-days);
 const scoped=history.events.filter(event=>(!query.role||query.role===event.role)&&(!query.employeeId||query.employeeId===event.actorId));
 const inPeriod=(event:ManagementActivity,from:string,to:string)=>{const date=reportDay(event.at);return date>=from&&date<to;};
 const current=scoped.filter(event=>inPeriod(event,start,today)),previous=scoped.filter(event=>inPeriod(event,previousStart,start)),todayEvents=scoped.filter(event=>reportDay(event.at)===today);
 const summaries=managementActivityIds.map(id=>({activity:id,label:labels[id],current:current.filter(event=>event.kind===id).length,previous:previous.filter(event=>event.kind===id).length,today:todayEvents.filter(event=>event.kind===id).length}));
 const selected=query.activityWindow==='previous'?previous:query.activityWindow==='today'?todayEvents:current;
 const filtered=selected.filter(event=>!query.activity||event.kind===query.activity),offset=query.activityOffset??0,size=20;
 const selectedKeys=new Set(selected.map(event=>event.key));
 const timings=(['acknowledgment','review'] as const).map(kind=>{const samples=history.timings.filter(item=>item.kind===kind&&selectedKeys.has(item.eventKey));return {kind,label:kind==='acknowledgment'?'Assignment to acknowledgment':'Completion report to manager review',sampleCount:samples.length,meanHours:samples.length?Math.round(samples.reduce((n,item)=>n+item.hours,0)/samples.length*10)/10:null,eventKind:kind==='acknowledgment'?'handoff_acknowledged' as const:'handoff_resolved' as const};});
 return {timeZone:reportingTimeZone,days,start,endExclusive:today,previousStart,today,firstRecordedAt:scoped.at(-1)?.at??null,summary:`${current.length} recorded business events in the last ${days} completed days; ${previous.length} in the preceding ${days} days. ${todayEvents.length} recorded today so far. These are observed events, not a complete sales-performance comparison.`,metrics:summaries,timings,daily:Array.from({length:days},(_,i)=>{const date=shiftReportDay(start,i);return {date,count:current.filter(event=>reportDay(event.at)===date).length};}),events:filtered.slice(offset,offset+size),page:{offset,size,total:filtered.length,hasMore:filtered.length>offset+size},coverage:'Saved fictional operations only. Both closed windows use the same currently authorized sources and current employee membership. Older handoff assignment cycles and changed sources are excluded. Activity is attributed to the recorded actor; task dates use their current owner. Counts are not unique deals, complete CRM coverage, conversion, or an employee ranking. Zero means no eligible event recorded. Timing averages cover only pairs whose acknowledgment or manager review occurred in the selected window.'};
}
