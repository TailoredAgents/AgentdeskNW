import type {Task,ProposedAction,ResearchJob} from '../lib/contracts';
import {localClock} from './proactive-time';

export interface DailyPriority {kind:'task'|'approval'|'job';id:string;title:string;reason:string;dueAt:string|null}
/** Inputs must already be employee-owned, source-checked records. Ranking never performs work. */
export function dailyPriorities(tasks:Task[],approvals:ProposedAction[],jobs:ResearchJob[],timeZone:string,at=new Date()):DailyPriority[]{
 const today=localClock(timeZone,at).date;
 const entries:Array<DailyPriority&{rank:number;order:number}>=tasks.filter(task=>task.status==='open').map(task=>{
  const due=task.dueAt?Date.parse(task.dueAt):NaN,known=Number.isFinite(due),overdue=known&&due<at.getTime(),dueToday=known&&localClock(timeZone,new Date(due)).date===today;
  const when=known?new Intl.DateTimeFormat('en-US',{timeZone,dateStyle:'medium',timeStyle:'short'}).format(new Date(due)):'';
  return {kind:'task',id:task.id,title:task.title,dueAt:task.dueAt,rank:overdue?0:dueToday?1:known?4:5,order:known?due:Number.MAX_SAFE_INTEGER,reason:overdue?`Overdue since ${when} (${timeZone}); confirm the outcome or choose a new date.`:dueToday?`Due today at ${when} (${timeZone}); this is a saved reminder, not a confirmed appointment.`:known?`Upcoming: ${when} (${timeZone}).`:task.dueAt?'The saved deadline is unreadable; review the date.':'No deadline is set; choose a date if this needs timed follow-through.'};
 });
 for(const action of approvals.filter(item=>item.status==='pending'))entries.push({kind:'approval',id:action.id,title:action.title,dueAt:null,rank:2,order:Date.parse(action.createdAt),reason:'Waiting for your exact CRM review. Preparing the change has not applied it.'});
 for(const job of jobs.filter(item=>item.status==='awaiting_input'))entries.push({kind:'job',id:job.id,title:`Review research for ${job.input.address}`,dueAt:null,rank:3,order:Date.parse(job.createdAt),reason:'Research is waiting for input. Open its current question or requirement before continuing; no retry or paid work is authorized by this reminder.'});
 return entries.sort((a,b)=>a.rank-b.rank||a.order-b.order||a.id.localeCompare(b.id)).slice(0,8).map(({kind,id,title,reason,dueAt})=>({kind,id,title,reason,dueAt}));
}
