'use client';
import {useEffect,useRef,useState} from 'react';
import type {AssignmentReview,TextRecoveryPreview,TextRecoveryDecision} from '@/lib/assignment-review-contracts';
import {api,ApiError} from './ui';

export function TextRecoveryReview({review,disabled,onActivity,onSaved}:{review:AssignmentReview;disabled:boolean;onActivity:(active:boolean)=>void;onSaved:(next:AssignmentReview)=>void}){
 const [open,setOpen]=useState(false),[instructions,setInstructions]=useState(''),[preview,setPreview]=useState<TextRecoveryPreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const pending=useRef<TextRecoveryDecision|null>(null),alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function submit(apply:boolean){
  if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');onActivity(true);
  try{
   if(apply){
    if(!preview)return;
    const request=pending.current??{quoteId:review.quoteId,revision:review.revision,instructions:preview.instructions,token:preview.token,eventKey:crypto.randomUUID()};pending.current=request;
    const next=await api<AssignmentReview>(`/assignment-reviews/${encodeURIComponent(review.id)}/recover`,request);
    if(alive.current){pending.current=null;setUncertain(false);onSaved(next);}
   }else{
    const next=await api<TextRecoveryPreview>(`/assignment-reviews/${encodeURIComponent(review.id)}/recovery-preview`,{quoteId:review.quoteId,revision:review.revision,instructions});
    if(alive.current)setPreview(next);
   }
  }catch(e){if(alive.current){if(e instanceof ApiError&&e.status>=400&&e.status<500){pending.current=null;setPreview(null);setUncertain(false);}else setUncertain(!!pending.current);setError(e instanceof Error?e.message:'Recovery could not be confirmed. Retry the same review.');}}
  finally{lock.current=false;if(alive.current){setBusy(false);onActivity(false);}}
 }
 if(!open)return <button className="button secondary" disabled={disabled} onClick={()=>setOpen(true)}>Review changed workspace</button>;
 return <section aria-label="Recover with current workspace" className="assignment-review"><h4>Continue with current information</h4><p className="muted">Restate the remaining task. Review current sources before updating the Agent’s working information. Earlier actions and charges stay saved.</p><label>Remaining instructions<textarea value={instructions} maxLength={2000} disabled={disabled||busy||uncertain} onChange={e=>{setInstructions(e.target.value);setPreview(null);}} rows={4}/></label>{error&&<p role="alert" className="work-run-error">{error}</p>}{preview?<><p>{preview.notice}</p><p><strong>Changed areas:</strong> {preview.changedAreas.join(', ')}.</p><details><summary>Current records included in this review</summary><ul>{preview.currentRecords.map((record,index)=><li key={index}>{record}</li>)}</ul></details><p>{preview.completedTools} completed steps retained · ${(preview.spentCents/100).toFixed(2)} already spent.{preview.discardedResponse?' The earlier unfinished response will stay in history.':''}</p><blockquote>{preview.instructions}</blockquote><button className="button primary" disabled={disabled||busy} onClick={()=>void submit(true)}>{uncertain?'Retry the same recovery':'Prepare updated cost review'}</button></>:<button className="button secondary" disabled={disabled||busy||instructions.trim().length<3} onClick={()=>void submit(false)}>Review recovery</button>}<p className="muted">This does not approve a charge. Save the recovery before leaving this screen.</p></section>;
}
