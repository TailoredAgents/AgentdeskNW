'use client';
import {useEffect,useRef,useState} from 'react';
import {Check,Clock,MoreHorizontal,CalendarClock,X} from 'lucide-react';
import type {Actor,Investor,Task} from '@/lib/contracts';
import {api,Badge,day,Modal,Spinner} from './ui';

type Props={tasks:Task[];actor:Actor;investors:Investor[];onChange:(message?:string)=>Promise<void>;onError:(error:unknown)=>void};
type TaskChange={action:'complete'|'cancel'|'reschedule'|'snooze';dueAt?:string;minutes?:number};
function localInput(value:string|null){if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}

export function TaskList({tasks,actor,investors,onChange,onError}:Props){
 const [busy,setBusy]=useState<string|null>(null),[editing,setEditing]=useState<Task|null>(null),[due,setDue]=useState(''),[error,setError]=useState('');
 const attempt=useRef<{fingerprint:string;eventKey:string}|null>(null);
 const [clock,setClock]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return ()=>clearInterval(timer);},[]);
 async function change(task:Task,input:TaskChange){
  setBusy(task.id);setError('');
  const payload={...input,expectedVersion:task.version??0};
  const fingerprint=JSON.stringify({taskId:task.id,...payload});
  if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,eventKey:crypto.randomUUID()};
  try{
   await api(`/tasks/${encodeURIComponent(task.id)}`,{...payload,eventKey:attempt.current.eventKey},'PATCH');
   attempt.current=null;setEditing(null);
   await onChange(input.action==='complete'?'Task completed':input.action==='cancel'?'Task canceled':input.action==='snooze'?'Reminder snoozed for two hours':'Reminder rescheduled');
  }catch(e){setError(e instanceof Error?e.message:'The task could not be updated.');onError(e);}finally{setBusy(null);}
 }
 return <>
  {error&&!editing&&<p className="error-text" role="alert">{error}</p>}
  {tasks.map(task=>{
   const closed=task.status!=='open',own=task.ownerId===actor.id;
   return <div className={`queue-task ${closed?'completed':''}`} key={task.id}>
    <button className={`task-check ${task.status==='completed'?'checked':''}`} disabled={closed||!own||busy!==null} aria-label={`Complete ${task.title}`} onClick={()=>void change(task,{action:'complete'})}>{busy===task.id?<Spinner/>:task.status==='canceled'?<X size={13}/>:<Check size={13}/>}</button>
    <div className="task-row-copy"><strong>{task.title}</strong><p>{task.investorId?investors.find(investor=>investor.id===task.investorId)?.name||'Investor follow-up':'Personal task'}<span>·</span>{task.dueAt?`${day(task.dueAt)} at ${new Date(task.dueAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`:'No deadline'}{!own&&<span>· Teammate’s task</span>}</p></div>
    <Badge tone={task.status==='completed'?'green':task.status==='canceled'?'neutral':task.dueAt&&Date.parse(task.dueAt)<clock?'amber':'neutral'}>{task.status==='completed'?'Complete':task.status==='canceled'?'Canceled':task.dueAt&&Date.parse(task.dueAt)<clock?'Overdue':'To do'}</Badge>
    {own&&!closed&&<details className="task-actions-menu"><summary aria-label={`Actions for ${task.title}`}><MoreHorizontal size={18}/></summary><div>
     <button disabled={busy!==null} onClick={()=>{setError('');setEditing(task);setDue(localInput(task.dueAt));}}><CalendarClock size={14}/>Reschedule</button>
     <button disabled={busy!==null} onClick={()=>void change(task,{action:'snooze',minutes:120})}><Clock size={14}/>Snooze 2 hours</button>
     <button disabled={busy!==null} onClick={()=>void change(task,{action:'cancel'})}><X size={14}/>Cancel task</button>
    </div></details>}
   </div>;
  })}
  {editing&&<Modal title="Reschedule your reminder" onClose={()=>{if(!busy)setEditing(null);}}>
   <p className="panel-description">{editing.title}</p>
   <form onSubmit={event=>{event.preventDefault();const submitted=new FormData(event.currentTarget).get('dueAt');if(typeof submitted==='string'&&submitted)void change(editing,{action:'reschedule',dueAt:new Date(submitted).toISOString()});}}>
    <label className="task-reschedule-label">Due date and time (your local time)<input name="dueAt" type="datetime-local" required value={due} onChange={event=>setDue(event.target.value)} disabled={!!busy}/></label>
    {error&&<p className="error-text" role="alert">{error}</p>}
    <div className="form-footer"><p>The task stays in your history.</p><button className="button primary" disabled={!!busy}>{busy?<Spinner label="Saving"/>:'Save reminder'}</button></div>
   </form>
  </Modal>}
 </>;
}
