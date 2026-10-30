'use client';
import {useRef,useState} from 'react';
import {ArrowRight,Check,History,Plus,TriangleAlert} from 'lucide-react';
import type {BuyBox} from '@/lib/intelligence-contracts';
import {relationshipTopics,type RelationshipFactSource,type RelationshipRecord,type RelationshipReport,type RelationshipReportInput,type RelationshipTopic} from '@/lib/relationship-record-contracts';
import {api,ApiError,Badge,Modal,Spinner} from './ui';

const date=(value:string|null,statement=false)=>value?new Date(value).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric',...(statement?{timeZone:'UTC'}:{})}):'Not recorded';
const labelValue=(value:RelationshipReportInput['value'])=>Array.isArray(value)?value.join(' · '):[value.min===null?'No minimum':'$'+value.min.toLocaleString(),value.max===null?'No maximum':'$'+value.max.toLocaleString()].join(' — ');
function Source({source}:{source:RelationshipFactSource}){
 return <div className="relationship-source"><div><span>{source.sourceKind==='recorded_criteria'?'Recorded criteria':'Employee report'}</span><Badge tone={source.freshness==='review_due'?'amber':'neutral'}>{source.freshness==='review_due'?'Reconfirm':source.sourceKind==='employee_report'&&source.freshness==='undated'?'Statement date unknown':source.verification==='seeded_demo'?'Demo fixture':source.sourceKind==='employee_report'?'Reported':'Reviewed record'}</Badge></div><strong>{source.displayValue}</strong><details><summary>Source and dates</summary><p>{source.statement}</p><small>Captured {date(source.recordedAt)}{source.sourceKind==='employee_report'?' · Stated '+date(source.statedAt,true):' · Oldest capture for grouped values; original statement date not established'}</small></details></div>;
}
export function RelationshipRecordPanel({record,buyBoxes,onSaved}:{record:RelationshipRecord;buyBoxes:BuyBox[];onSaved:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[review,setReview]=useState<RelationshipReportInput|null>(null),[fresh,setFresh]=useState<RelationshipRecord|null>(null);
 const [topic,setTopic]=useState<RelationshipTopic>('budget'),[boxId,setBoxId]=useState(buyBoxes.find(box=>box.active)?.id??'');
 const [minimum,setMinimum]=useState(''),[maximum,setMaximum]=useState(''),[values,setValues]=useState(''),[statement,setStatement]=useState(''),[statedAt,setStatedAt]=useState('');
 const [correction,setCorrection]=useState<RelationshipReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const event=useRef<{fingerprint:string;key:string}|null>(null);
 const current=fresh??record,path='/investors/'+encodeURIComponent(record.investorId)+'/relationship-record';
 const scope=topic==='timing'||topic==='contact'?null:boxId;
 function start(earlier?:RelationshipReport){
  setReview(null);setError('');setCorrection(earlier??null);setFresh(null);
  if(earlier){setTopic(earlier.topic);setBoxId(earlier.buyBoxId??'');setValues(Array.isArray(earlier.value)?earlier.value.join('\n'):'');setMinimum(!Array.isArray(earlier.value)&&earlier.value.min!==null?String(earlier.value.min):'');setMaximum(!Array.isArray(earlier.value)&&earlier.value.max!==null?String(earlier.value.max):'');setStatement('');setStatedAt('');}
  else{setTopic('budget');setBoxId(buyBoxes.find(box=>box.active)?.id??'');setMinimum('');setMaximum('');setValues('');setStatement('');setStatedAt('');}
  setOpen(true);
 }
 async function prepare(){
  setBusy(true);setError('');
  try{
   const latest=await api<RelationshipRecord>(path);setFresh(latest);
   const draft:RelationshipReportInput={investorId:record.investorId,buyBoxId:scope,topic,
    value:topic==='budget'?{min:minimum===''?null:Number(minimum),max:maximum===''?null:Number(maximum)}:values.split('\n').map(v=>v.trim()).filter(Boolean),
    statement:statement.trim(),statedAt:statedAt?statedAt+'T00:00:00.000Z':null,supersedesId:correction?.id??null,expectedVersion:latest.version,expectedContext:latest.contextVersion,eventKey:''};
   if(draft.statement.length<8)throw new Error('Include a source note describing what was reported.');
   if(topic==='budget'){const value=draft.value as {min:number|null;max:number|null};if(value.min===null&&value.max===null||value.min!==null&&value.max!==null&&value.min>value.max)throw new Error('Enter a valid purchase range.');}
   else if(!(draft.value as string[]).length)throw new Error('Enter at least one reported value.');
   if(!['timing','contact'].includes(topic)&&!scope)throw new Error('Choose the buy box this report belongs to.');
   const fingerprint=JSON.stringify(draft);
   if(event.current?.fingerprint!==fingerprint)event.current={fingerprint,key:crypto.randomUUID()};
   setReview({...draft,eventKey:event.current.key});
  }catch(e){setError(e instanceof Error?e.message:'Could not prepare the review.');}finally{setBusy(false);}
 }
 async function save(){
  if(!review)return;setBusy(true);setError('');
  try{await api(path+'/reports',review);event.current=null;setFresh(null);setOpen(false);setReview(null);await onSaved();}
  catch(e){
   if(e instanceof ApiError&&e.status===409){setReview(null);setError(e.message+' Your entered report is preserved. Review it again against the latest record.');}
   else setError(e instanceof Error?e.message:'Could not save this report.');
  }finally{setBusy(false);}
 }
 const changed=current.facts.filter(f=>f.reports.length);
 const reviewFact=review?current.facts.find(f=>f.topic===review.topic&&f.buyBoxId===review.buyBoxId):null;
 return <section className="relationship-record" aria-label="Investor understanding">
  <div className="relationship-record-heading"><div><p className="eyebrow">Investor understanding</p><h3>What we know. What changed.</h3></div>{current.canEdit&&<button className="button secondary small" onClick={()=>start()}><Plus size={14}/>Record investor update</button>}</div>
  <p className="panel-description">Keep recorded criteria alongside what the investor has reported. Clarify differences before changing their CRM details.</p>
  <div className="relationship-record-stats"><Badge tone={current.conflicts.length?'amber':'green'}>{current.conflicts.length?current.conflicts.length+' to clarify':'No differing reports'}</Badge><Badge>{current.reviewDue.length} fields to reconfirm</Badge><Badge>{current.reports.filter(r=>r.status==='active').length} active reports</Badge></div>
  {changed.length>0&&<div className="relationship-fact-list">{changed.map(fact=><article className="relationship-fact" key={fact.key}><div className="relationship-fact-heading"><h4>{fact.label}</h4><span>{fact.scopeLabel}</span></div><div className="relationship-source-grid">{fact.recorded&&<Source source={fact.recorded}/>} {fact.reports.map(source=><Source key={source.id} source={source}/>)}</div>{fact.question&&<p className="relationship-question"><TriangleAlert size={15}/>{fact.question}</p>}</article>)}</div>}
  <details className="relationship-all-facts"><summary>View the complete investor record ({current.facts.length} fields)</summary><div className="relationship-fact-list">{current.facts.map(fact=><article className="relationship-fact" key={fact.key}><div className="relationship-fact-heading"><h4>{fact.label}</h4><span>{fact.scopeLabel}</span></div><div className="relationship-source-grid">{fact.recorded&&<Source source={fact.recorded}/>} {fact.reports.map(source=><Source key={source.id} source={source}/>)}</div>{fact.status==='unknown'&&<p>Not recorded. Ask the investor before relying on an assumption.</p>}{fact.question&&<p className="relationship-question">{fact.question}</p>}<small>Reconfirmation guide: {fact.reconfirmAfterDays} days. A review flag does not mean the information is false.</small></article>)}</div></details>
  {!!current.reports.length&&<details className="relationship-report-history"><summary><History size={14}/>Report and correction history ({current.reports.length})</summary>{[...current.reports].reverse().map(report=><article key={report.id}><div><strong>{relationshipTopics[report.topic]} · {labelValue(report.value)}</strong><Badge tone={report.status==='superseded'?'neutral':'green'}>{report.status==='superseded'?'Superseded':'Active report'}</Badge></div><p>{report.statement}</p><small>Stated {date(report.statedAt,true)} · Captured {date(report.recordedAt)} · Employee reported</small>{report.supersedesId&&<p className="subtle-note">Explicit correction of an earlier report; the original is retained below.</p>}{current.canEdit&&report.status==='active'&&(!report.buyBoxId||buyBoxes.some(box=>box.id===report.buyBoxId&&box.active))&&<button className="text-link" onClick={()=>start(report)}>Correct this report</button>}</article>)}</details>}
  <p className="subtle-note">{current.notice}</p>
  {open&&<Modal title={review?'Review investor update':correction?'Correct an earlier report':'Record investor update'} onClose={()=>{if(!busy)setOpen(false);}} wide>
   <div className="relationship-report-modal">{error&&<p className="intelligence-message intelligence-message-error" role="alert">{error}</p>}
   {review?<><p>This will be shared with people authorized to view this investor. It records your report; it does not verify the statement or update CRM criteria.</p><h3>{relationshipTopics[review.topic]}</h3><p><strong>{labelValue(review.value)}</strong></p><p>{review.statement}</p><p className="subtle-note">Statement date: {date(review.statedAt,true)}. Capture time is recorded when saved.</p>{correction&&<div className="relationship-correction"><span>Earlier report</span><p>{labelValue(correction.value)} — {correction.statement}</p><ArrowRight size={16}/><p>The original will remain visible as superseded.</p></div>}{reviewFact?.recorded&&<Source source={reviewFact.recorded}/>}<div className="relationship-modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setReview(null)}>Back to edit</button><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?<Spinner label="Saving"/>:<><Check size={15}/>Save reviewed report</>}</button></div></>:<form onSubmit={e=>{e.preventDefault();void prepare();}}><fieldset disabled={busy}><legend className="visually-hidden">Investor report</legend><label>What changed?<select value={topic} disabled={!!correction} onChange={e=>setTopic(e.target.value as RelationshipTopic)}>{Object.entries(relationshipTopics).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{scope!==null&&<label>Buying criteria<select value={boxId} disabled={!!correction} onChange={e=>setBoxId(e.target.value)} required><option value="">Select a buy box</option>{buyBoxes.filter(box=>box.active).map(box=><option key={box.id} value={box.id}>{box.label}</option>)}</select></label>}{topic==='budget'?<div className="relationship-budget"><label>Minimum purchase price<input type="number" min="0" max="100000000" step="1" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label><label>Maximum purchase price<input type="number" min="0" max="100000000" step="1" value={maximum} onChange={e=>setMaximum(e.target.value)}/></label></div>:<label>Reported values<textarea rows={3} maxLength={2200} value={values} onChange={e=>setValues(e.target.value)} required placeholder="One value per line"/>{topic==='geography'&&<span className="memory-field-help">For locations, include State:, County:, City: or ZIP: to match the recorded format.</span>}</label>}<label>What was reported, and where did it come from?<textarea rows={3} value={statement} onChange={e=>setStatement(e.target.value)} required minLength={8} maxLength={2000} placeholder="For example: In today's call, Mike said his purchase budget is now $200,000–$280,000."/></label><label>Date the investor stated this <span className="subtle-note">(optional)</span><input type="date" value={statedAt} onChange={e=>setStatedAt(e.target.value)} max={new Date().toISOString().slice(0,10)}/><span className="memory-field-help">Leave blank if unknown. This is separate from when you enter the report.</span></label></fieldset><p className="subtle-note">You will review the report before saving. Include only information intended for this investor’s shared relationship record.</p><div className="relationship-modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy?<Spinner label="Preparing"/>:'Review report'}</button></div></form>}
   </div>
  </Modal>}
 </section>;
}
