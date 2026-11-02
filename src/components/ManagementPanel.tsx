'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,RefreshCw,ShieldCheck} from 'lucide-react';
import type {ManagementReport,ManagementMetricId,Role} from '../lib/contracts';
import type {WorkspaceDestination} from '../lib/workspace-links';
import {api,PageHeading,Panel,SectionHead} from './ui';

const primaryMetrics:ManagementMetricId[]=['followups','opportunities','blocked','review'];
const roleNames:Record<Role,string>={dispositions:'Dispositions',acquisitions:'Acquisitions',manager:'Management'};
export function ManagementPanel({onOpen}:{onOpen:(target:WorkspaceDestination)=>void}){
 const [role,setRole]=useState<Role|''>(''),[employee,setEmployee]=useState(''),[metric,setMetric]=useState<ManagementMetricId|''>(''),[offset,setOffset]=useState(0);
 const [loaded,setLoaded]=useState<{key:string;report:ManagementReport}|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(true);
 const params=new URLSearchParams();if(role)params.set('role',role);if(employee)params.set('employeeId',employee);if(metric)params.set('metric',metric);if(offset)params.set('offset',String(offset));const key=params.toString();
 useEffect(()=>{
  let active=true,reading=false;
  async function load(){if(reading)return;reading=true;setBusy(true);try{const report=await api<ManagementReport>(`/management-report?${key}`);if(active){setLoaded({key,report});setError('');}}catch(e){if(active){setLoaded(null);setError(e instanceof Error?e.message:'Could not refresh the office report.');}}finally{reading=false;if(active)setBusy(false);}}
  void load();const timer=setInterval(()=>void load(),15000);return()=>{active=false;clearInterval(timer);};
 },[key,refresh]);
 const report=loaded?.key===key?loaded.report:null;
 const selectMetric=(value:ManagementMetricId|'')=>{setMetric(value);setOffset(0);};
 const people=loaded?.report.employees.filter(person=>!role||person.role===role)??[];
 const selected=report?.metrics.find(value=>value.id===metric);
 return <div className="management-report">
  <PageHeading eyebrow="TEAM OVERVIEW" title="Know what needs your attention." description="Follow the work, understand the hold-ups, and help your team move forward." action={<button className="button secondary" disabled={busy} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={15}/>Refresh</button>}/>
  <div className="management-toolbar"><label>Role<select aria-label="Report role" value={role} onChange={e=>{setRole(e.target.value as Role|'');setEmployee('');setOffset(0);}}><option value="">All roles</option>{Object.entries(roleNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Employee<select aria-label="Report employee" value={employee} onChange={e=>{setEmployee(e.target.value);setOffset(0);}}><option value="">Everyone in this view</option>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="management-asof"><span className="management-demo">Fictional demonstration</span><small>{report?`${report.office} · Updated ${new Date(report.checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',timeZoneName:'short'})}`:error?'Report unavailable':'Refreshing current records…'}</small></div></div>
  {error&&<p className="error-text" role="alert">{error} <button className="button secondary" onClick={()=>{setEmployee('');setOffset(0);setRefresh(value=>value+1);}}>Reload office report</button></p>}
  {!report&&!error&&<p role="status">Loading the current office report…</p>}
  {report&&<>
   <p className="management-summary">{report.summary}</p>
   <div className="management-metrics">{report.metrics.filter(item=>primaryMetrics.includes(item.id)).map(item=><button key={item.id} className={`management-metric ${metric===item.id?'selected':''}`} aria-pressed={metric===item.id} disabled={item.value===null} onClick={()=>selectMetric(metric===item.id?'':item.id)}><span>{item.label}</span><strong>{item.value??'—'}{item.denominator!==null&&<small> / {item.denominator}</small>}</strong><small>{item.value===null?'Source unavailable':item.denominator!==null?'of the relevant current work':'View supporting records'} <ArrowUpRight size={12}/></small></button>)}</div>
   <details className="management-additional"><summary>More work measures · relationships, overdue work and inventory</summary><div className="management-metrics">{report.metrics.filter(item=>!primaryMetrics.includes(item.id)).map(item=><button key={item.id} className={`management-metric ${metric===item.id?'selected':''}`} aria-pressed={metric===item.id} disabled={item.value===null} onClick={()=>selectMetric(metric===item.id?'':item.id)}><span>{item.label}</span><strong>{item.value??'—'}{item.denominator!==null&&<small> / {item.denominator}</small>}</strong><small>{item.value===null?'Source unavailable':item.denominator!==null?'of the relevant current work':'View supporting records'} <ArrowUpRight size={12}/></small></button>)}</div></details>
   <div className="management-columns">
    <Panel><SectionHead title={selected?selected.label:'Work that needs attention'}/><p className="panel-description">{selected?.definition??'Current handoff changes, blockers and reviews come first, followed by buyer follow-ups and opportunity gaps. These are work signals, not employee rankings.'}</p>
     {(metric||employee)&&<button className="text-link" onClick={()=>{setEmployee('');selectMetric('');}}>Show all work in this role</button>}
     <p className="subtle-note">{report.page.total===0?'No matching current records.':`Showing ${report.page.offset+1}–${Math.min(report.page.offset+report.records.length,report.page.total)} of ${report.page.total} source records.`}</p>
     <div className="management-evidence">{report.records.map(item=><article key={item.key}><div className="management-evidence-head"><span className="management-kind">{item.kind.replace('followup','Buyer follow-up')}</span><span>{item.status}</span></div><h3>{item.title}</h3><p className="management-owner">{item.ownerName}{item.role?` · ${roleNames[item.role]}`:''}{item.dueAt?` · Due ${new Date(item.dueAt).toLocaleString([], {timeZoneName:'short'})}`:''}</p><p>{item.nextStep}</p><details><summary>Why this is here</summary><p>{item.reason}</p></details><button className="button secondary" onClick={()=>onOpen(item.destination)}>Open {item.destination.kind==='investor'?'relationship':item.destination.kind==='handoff'?'shared handoff':'source'}<ArrowUpRight size={14}/></button></article>)}</div>
     {(offset>0||report.page.hasMore)&&<div className="form-footer"><button className="button secondary" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-report.page.size))}>Previous records</button><button className="button secondary" disabled={!report.page.hasMore} onClick={()=>setOffset(offset+report.page.size)}>More records</button></div>}
    </Panel>
    <div className="management-sidebar"><Panel><SectionHead title="People & current work"/><p className="panel-description">Choose a person to inspect their recorded work. Counts describe workload, not effectiveness.</p>{people.map(person=><button className={`management-person ${employee===person.id?'selected':''}`} key={person.id} onClick={()=>{setEmployee(employee===person.id?'':person.id);selectMetric('');}}><strong>{person.name}<ArrowUpRight size={14}/></strong><span>{roleNames[person.role]}</span><small>{person.counts.followups} buyer follow-ups · {person.counts.opportunities??'—'} opportunities</small><small>{person.counts.blocked} blocked · {person.counts.review} awaiting management</small></button>)}</Panel>
     <Panel><SectionHead title="What management can see"/><p className="panel-description"><ShieldCheck size={17}/> Current authorized business records in this office. Assignments do not grant access to private sources.</p><details><summary>Included sources & counting rules</summary><p>{report.coverage.basis}</p>{report.metrics.map(item=><p key={item.id}><strong>{item.label}:</strong> {item.definition}</p>)}{report.coverage.opportunities==='restricted'&&<p>Opportunity reporting is unavailable under the current access policy. The dash does not mean zero.</p>}</details><details><summary>Private information excluded</summary><ul>{report.coverage.excluded.map(item=><li key={item}>{item}</li>)}</ul><p>{report.coverage.usage}</p></details><details><summary>Not measured yet</summary><ul>{report.coverage.unavailable.map(item=><li key={item}>{item}</li>)}</ul></details></Panel>
    </div>
   </div>
  </>}
 </div>;
}
