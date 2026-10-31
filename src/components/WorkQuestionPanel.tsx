'use client';
import {useEffect,useRef,useState} from 'react';
import type {AnswerWorkInput,WorkRun} from '../lib/work-contracts';
import {api,ApiError} from './ui';

export function WorkQuestionPanel({run,onSaved}:{run:WorkRun;onSaved:(run:WorkRun)=>void}){
 const [answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pending,setPending]=useState<AnswerWorkInput|null>(null);
 const alive=useRef(true),saving=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const question=run.question;if(!question)return null;
 async function save(){
  if(saving.current||!question)return;saving.current=true;setBusy(true);setError('');
  const input=pending??{expectedVersion:run.version,questionReference:question.reference,eventKey:crypto.randomUUID(),answer};setPending(input);
  try{const next=await api<WorkRun>(`/work/${encodeURIComponent(run.id)}/answer`,input);if(alive.current){setPending(null);onSaved(next);}}
  catch(e){if(alive.current){if(e instanceof ApiError&&e.status>=400&&e.status<500)setPending(null);setError(e instanceof Error?e.message:'The outcome needs checking. Retry the same answer.');}}
  finally{saving.current=false;if(alive.current)setBusy(false);}
 }
 return <div className="work-cost-request"><h4>One detail to continue</h4><p>{question.prompt}</p><p className="subtle-note">Your answer supplies information for this job. Any required spending approval remains separate.</p>{question.choices.length?<label>Answer<select aria-label="Job answer" value={answer} disabled={busy||!!pending} onChange={e=>setAnswer(e.target.value)}><option value="">Choose a record</option>{question.choices.map(choice=><option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>:<label>Answer<textarea aria-label="Job answer" value={answer} disabled={busy||!!pending} maxLength={2000} onChange={e=>setAnswer(e.target.value)}/>{question.answerType==='datetime'&&<small>Include timezone, for example 2026-11-03T09:00:00-05:00.</small>}</label>}{error&&<p role="alert" className="error-text">{error}</p>}<button className="button primary" disabled={busy||!answer.trim()} onClick={()=>void save()}>{busy?'Saving answer…':pending?'Retry the same answer':'Save answer & continue'}</button></div>;
}
