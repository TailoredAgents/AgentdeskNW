'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { BookOpen,Check,Clipboard,ClipboardList,MessageSquare,Plus,RefreshCw,Sparkles,TriangleAlert } from 'lucide-react';
import type { InvestorJourney,InvestorNextStep,JourneyEvidence,JourneyObservationKind,JourneyVerification } from '@/lib/journey-contracts';
import { api,Badge,day,Panel,readable,SectionHead,Spinner } from './ui';

const verificationLabels:Record<JourneyVerification,string>={seeded_demo:'Demo fixture',reviewed_record:'Reviewed record',employee_reported:'Employee reported',unreviewed_extraction:'Needs review'};
const observationLabels:Record<JourneyObservationKind,string>={objection:'Concern or objection',property_pass:'Passed on a property',preference:'New preference',resolved:'Resolve an earlier concern'};
const evidenceDate=(value:string|null)=>value?new Date(value).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):'Date not recorded';

export function JourneyPanel({investorId,propertyId,onChange,canEdit=true}:{investorId:string;propertyId?:string;onChange?:()=>Promise<void>;canEdit?:boolean}){
 const [journey,setJourney]=useState<InvestorJourney|null>(null),[recommendation,setRecommendation]=useState<InvestorNextStep|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[recommendationError,setRecommendationError]=useState(''),[notice,setNotice]=useState('');
 const [kind,setKind]=useState<JourneyObservationKind>('objection'),[text,setText]=useState(''),[resolvesId,setResolvesId]=useState(''),[copied,setCopied]=useState(false);
 const request=useRef({version:0}),observationRequest=useRef<{fingerprint:string;eventKey:string}|null>(null);
 const path=`/investors/${encodeURIComponent(investorId)}`;
 const load=useCallback(async()=>{
  const current=++request.current.version;setLoading(true);setError('');setRecommendationError('');setCopied(false);
  const [journeyResult,recommendationResult]=await Promise.allSettled([api<InvestorJourney>(`${path}/journey`),api<InvestorNextStep>(`${path}/recommendation`,{propertyId:propertyId??null})]);
  if(current!==request.current.version)return;
  if(journeyResult.status==='fulfilled')setJourney(journeyResult.value);else{setJourney(null);setError(journeyResult.reason instanceof Error?journeyResult.reason.message:'Could not load this relationship.');}
  if(recommendationResult.status==='fulfilled')setRecommendation(recommendationResult.value);else{setRecommendation(null);setRecommendationError(recommendationResult.reason instanceof Error?recommendationResult.reason.message:'Could not prepare a next step.');}
  setLoading(false);
 },[path,propertyId]);
 useEffect(()=>{const tracker=request.current;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);tracker.version++;};},[load]);
 async function refreshRecommendation(){
  setBusy(true);setRecommendationError('');setCopied(false);
  try{await load();}
  catch(e){setRecommendation(null);setRecommendationError(e instanceof Error?e.message:'Could not prepare a next step.');}finally{setBusy(false);}
 }
 async function saveObservation(){
  if(text.trim().length<3){setError('Add a short note about what you learned.');return;}
  if(kind==='resolved'&&!resolvesId){setError('Choose the earlier concern that this note resolves.');return;}
  if(kind==='property_pass'&&!propertyId){setError('Select a property before recording a property pass.');return;}
  setBusy(true);setError('');setNotice('');
  const observation={kind,text:text.trim(),...(kind==='resolved'?{resolvesId}:{propertyId:propertyId??null})};
  const fingerprint=JSON.stringify(observation);
  if(observationRequest.current?.fingerprint!==fingerprint)observationRequest.current={fingerprint,eventKey:crypto.randomUUID()};
  try{
   await api(`${path}/journey/observations`,{...observation,eventKey:observationRequest.current.eventKey});
   observationRequest.current=null;setText('');setResolvesId('');setNotice('Saved. This observation is now part of the relationship history.');
   await load();await onChange?.();
  }catch(e){setError(e instanceof Error?e.message:'Could not save this observation.');}finally{setBusy(false);}
 }
 async function copyDraft(){
  if(!recommendation?.draftEligibility.allowed||!recommendation.draft)return;
  setBusy(true);setCopied(false);setRecommendationError('');
  try{
   const current=await api<InvestorNextStep>(`${path}/recommendation`,{propertyId:propertyId??null});setRecommendation(current);
   if(!current.draftEligibility.allowed||!current.draft)return;
   if(current.draft!==recommendation.draft){setNotice('The draft changed with your latest records or preferences. Review it before copying.');return;}
   await navigator.clipboard.writeText(current.draft);setCopied(true);
  }catch(e){setRecommendation(null);setRecommendationError(e instanceof Error?e.message:'Could not refresh this draft. Try again.');}finally{setBusy(false);}
 }
 const evidence:JourneyEvidence[]=[...new Map([...(recommendation?.evidence??[]),...(journey?.evidence??[])].map(item=>[item.id,item])).values()];
 const unknowns=[...new Set([...(recommendation?.unknowns??[]),...(journey?.unknowns??[])])];
 const preferences=recommendation?.preferencesUsed;
 const hasPreferences=!!preferences&&(!!preferences.tone||!!preferences.length||preferences.avoidPhrases.length>0||preferences.priorities.length>0);
 return <Panel className="journey-panel"><SectionHead title="Relationship intelligence" aside={<BookOpen size={21}/>}/>
  <p className="panel-description">A useful next step, grounded in what you know about this investor.</p>
  {error&&<div className="intelligence-message intelligence-message-error" role="alert"><p>{error}</p><button className="text-link" disabled={busy||loading} onClick={()=>void load()}>Reload relationship</button></div>}
  {notice&&<p className="intelligence-message intelligence-message-success" role="status"><Check size={16}/>{notice}</p>}
  {loading?<div className="intelligence-loading"><Spinner label="Reading the relationship"/></div>:journey&&<>
   <div className="journey-header-meta"><Badge tone="green">{journey.activity==='unknown'?'Buying status unconfirmed':readable(journey.activity)}</Badge>{journey.synthetic&&<Badge>Fictional demo</Badge>}<span className="subtle-note">{journey.investorName}</span></div>
   {recommendationError&&<p className="intelligence-message intelligence-message-error" role="alert">{recommendationError}</p>}
   {recommendation&&<section className="journey-next-action"><p className="eyebrow"><Sparkles size={14}/>Recommended next step</p><h3>{recommendation.action.title}</h3><p>{recommendation.action.description}</p>{recommendation.why.length>0&&<ul className="journey-reasons">{recommendation.why.map((reason,index)=><li key={index}>{reason.replace(/\s*\(source [^)]+\)/g,'')}</li>)}</ul>}</section>}
   <div className="journey-recommendation-actions"><button className="button secondary" disabled={busy||loading} onClick={()=>void refreshRecommendation()}>{busy?<Spinner label="Updating"/>:<><RefreshCw size={14}/>{recommendation?'Refresh next step':'Prepare next step'}</>}</button><span className="subtle-note">Uses your current saved preferences.</span></div>
   {recommendation&&<section className="journey-draft"><div className="journey-draft-heading"><h3><MessageSquare size={16}/>Suggested message</h3>{recommendation.draftEligibility.allowed&&recommendation.draft&&<button className="button ghost small" disabled={busy||loading} onClick={()=>void copyDraft()}>{copied?<Check size={14}/>:<Clipboard size={14}/>}<span aria-live="polite">{copied?'Copied':'Copy draft'}</span></button>}</div>
    {recommendation.draftEligibility.allowed&&recommendation.draft?<pre>{recommendation.draft}</pre>:<div className="journey-draft-blocked"><Badge tone="amber">Draft unavailable</Badge><ul className="journey-reasons">{recommendation.draftEligibility.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></div>}
    <div className="journey-style-note"><span>{hasPreferences?'Your saved preferences:':'No personal writing preferences saved.'}</span>{preferences?.tone&&<Badge>{readable(preferences.tone)}</Badge>}{preferences?.length&&<Badge>{readable(preferences.length)}</Badge>}{!!preferences?.avoidPhrases.length&&<Badge>{preferences.avoidPhrases.length} phrase{preferences.avoidPhrases.length===1?'':'s'} avoided</Badge>}{!!preferences?.priorities.length&&<Badge>{preferences.priorities.length} saved priorit{preferences.priorities.length===1?'y':'ies'}</Badge>}</div>
    <p className="subtle-note">Review the wording and facts before using it. This is a draft; no message has been sent.</p>
   </section>}
   {unknowns.length>0&&<section className="journey-unknowns"><h3><TriangleAlert size={15}/>What still needs checking</h3><ul>{unknowns.map((item,index)=><li key={index}>{item}</li>)}</ul></section>}
   <p className="journey-summary">{journey.summary}</p>
   <div className="journey-facts"><section className="journey-fact"><h3><MessageSquare size={15}/>Open concerns</h3>{journey.openIssues.length?<ul>{journey.openIssues.map(item=><li key={item.id}>{item.text}</li>)}</ul>:<p>No open concerns have been recorded.</p>}</section><section className="journey-fact"><h3><ClipboardList size={15}/>Open follow-up work</h3>{journey.commitments.length?<ul>{journey.commitments.map(item=><li key={item.id}>{item.title}{item.dueAt&&<span className="journey-due"> · Due {day(item.dueAt)}</span>}</li>)}</ul>:<p>No open follow-up tasks have been recorded.</p>}</section></div>
   {evidence.length>0&&<details className="journey-evidence"><summary>View supporting records ({evidence.length})</summary><div className="journey-evidence-list">{evidence.map(item=><article className="journey-evidence-item" key={item.id}><div><strong>{item.label}</strong><Badge tone={item.verification==='unreviewed_extraction'?'amber':'neutral'}>{verificationLabels[item.verification]}</Badge></div><p>{item.text}</p><small>{item.source} · {evidenceDate(item.recordedAt)}</small></article>)}</div>{!!recommendation?.method.length&&<div className="journey-method"><strong>How this suggestion was prepared</strong><ul className="journey-reasons">{recommendation.method.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}</details>}
   {canEdit&&<details className="journey-observation"><summary>Record something you learned</summary><p className="panel-description">Capture a concern, preference, or reason for passing. Resolving an earlier concern changes what Copilot recommends next.</p><form className="journey-observation-form" onSubmit={e=>{e.preventDefault();void saveObservation();}}><fieldset disabled={busy}><legend className="visually-hidden">New relationship observation</legend><label>What changed?<select value={kind} onChange={e=>setKind(e.target.value as JourneyObservationKind)}>{Object.entries(observationLabels).map(([value,label])=><option key={value} value={value} disabled={(value==='resolved'&&!journey.openIssues.length)||(value==='property_pass'&&!propertyId)}>{label}</option>)}</select></label>{kind==='resolved'&&<label>Earlier concern<select value={resolvesId} onChange={e=>setResolvesId(e.target.value)} required><option value="">Choose a concern</option>{journey.openIssues.map(item=><option key={item.id} value={item.id}>{item.text.slice(0,100)}</option>)}</select></label>}<label>What did you learn?<textarea value={text} onChange={e=>setText(e.target.value)} rows={3} required minLength={3} maxLength={2000} placeholder={kind==='resolved'?'What answered the concern, and how was it confirmed?':'For example: He passed because the repair costs were unclear.'}/><span className="memory-field-help">Saved as your observation. Existing CRM details stay subject to review.</span></label></fieldset><button className="button secondary" disabled={busy||!text.trim()||(kind==='resolved'&&!resolvesId)}>{busy?<Spinner label="Saving"/>:<><Plus size={14}/>Save observation</>}</button></form>
    {journey.observations.length>0&&<div className="journey-observation-list">{[...journey.observations].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)).slice(0,5).map(item=><article className="journey-observation-item" key={item.id}><div><Badge tone={item.status==='resolved'?'green':'neutral'}>{item.kind==='resolved'?'Resolution recorded':item.status==='resolved'?'Resolved':observationLabels[item.kind]}</Badge><small>{day(item.recordedAt)}</small></div><p>{item.text}</p><small>Employee reported</small></article>)}</div>}
   </details>}
  </>}
  {!loading&&!journey&&recommendationError&&!error&&<p className="intelligence-message intelligence-message-error" role="alert">{recommendationError}</p>}
 </Panel>;
}
