import type {Task} from '../../src/lib/contracts';
export type TaskChange={action:'complete'|'cancel'}|{action:'snooze';minutes:number}|{action:'reschedule';dueAt:string|null};
export interface TaskReview {task:Task;change:TaskChange;eventKey:string}
export function taskReviewCurrent(review:TaskReview,current:Task|null):boolean {
 return !!current&&current.id===review.task.id&&current.ownerId===review.task.ownerId&&current.status==='open'&&(current.version??0)===(review.task.version??0)&&current.title===review.task.title&&current.dueAt===review.task.dueAt;
}
export function localDeadline(date:string,time:string):string {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Use YYYY-MM-DD and a 24-hour time such as 09:00.');
 const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),value=new Date(year,month-1,day,hour,minute);
 if(value.getFullYear()!==year||value.getMonth()!==month-1||value.getDate()!==day||value.getHours()!==hour||value.getMinutes()!==minute)throw new Error('That date or local time does not exist. Choose another time.');
 if(value.getTime()<=Date.now())throw new Error('Choose a future reminder time.');return value.toISOString();
}
export function tomorrowFields(){const value=new Date();value.setDate(value.getDate()+1);return {date:`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`,time:'09:00'};}
export function sortTasks(tasks:Task[]):Task[]{return [...tasks].sort((a,b)=>Number(a.status!=='open')-Number(b.status!=='open')||(a.dueAt?Date.parse(a.dueAt):Infinity)-(b.dueAt?Date.parse(b.dueAt):Infinity)||a.title.localeCompare(b.title));}
