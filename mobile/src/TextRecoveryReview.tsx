import {useEffect,useRef,useState} from 'react';
import type {AssignmentReview,TextRecoveryPreview,TextRecoveryDecision} from '../../src/lib/assignment-review-contracts';
import {Text,TextInput,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import {createApi,ApiError} from './client';
import {Button} from './WorkScreen';
import {styles as s} from './styles';

export function TextRecoveryReview({api,review,disabled,onActivity,onSaved,onAuthError}:{api:ReturnType<typeof createApi>;onAuthError:(error:unknown)=>void;review:AssignmentReview;disabled:boolean;onActivity:(active:boolean)=>void;onSaved:(next:AssignmentReview)=>void}){
 const [open,setOpen]=useState(false),[instructions,setInstructions]=useState(''),[preview,setPreview]=useState<TextRecoveryPreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const pending=useRef<TextRecoveryDecision|null>(null),alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function submit(apply:boolean){
  if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');onActivity(true);
  try{
   if(apply){
    if(!preview)return;
    const request=pending.current??{quoteId:review.quoteId,revision:review.revision,instructions:preview.instructions,token:preview.token,eventKey:Crypto.randomUUID()};pending.current=request;
    const next=await api<AssignmentReview>(`/assignment-reviews/${encodeURIComponent(review.id)}/recover`,request);
    if(alive.current){pending.current=null;setUncertain(false);onSaved(next);}
   }else{
    const next=await api<TextRecoveryPreview>(`/assignment-reviews/${encodeURIComponent(review.id)}/recovery-preview`,{quoteId:review.quoteId,revision:review.revision,instructions});
    if(alive.current)setPreview(next);
   }
  }catch(e){if(alive.current){if(e instanceof ApiError&&e.status>=400&&e.status<500){pending.current=null;setPreview(null);setUncertain(false);}else setUncertain(!!pending.current);setError(e instanceof Error?e.message:'Recovery could not be confirmed. Retry the same review.');onAuthError(e);}}
  finally{lock.current=false;if(alive.current){setBusy(false);onActivity(false);}}
 }
 if(!open)return <Button secondary label="Review changed workspace" disabled={disabled} onPress={()=>setOpen(true)}/>;
 return <View style={{gap:12}}><Text style={s.cardTitle}>Continue with current information</Text><Text style={s.help}>Restate the remaining task. Review current sources before updating the Agent’s working information. Earlier actions and charges stay saved.</Text><Text style={s.copy}>Remaining instructions</Text><TextInput accessibilityLabel="Remaining instructions" multiline maxLength={2000} editable={!disabled&&!busy&&!uncertain} value={instructions} onChangeText={value=>{setInstructions(value);setPreview(null);}} style={[s.input,{minHeight:100}]}/>{!!error&&<Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}{preview?<><Text style={s.copy}>{preview.notice}</Text><Text style={s.copy}>Changed areas: {preview.changedAreas.join(', ')}.</Text><Text style={s.cardTitle}>Current records included in this review</Text>{preview.currentRecords.map((record,index)=><Text key={index} style={s.help}>{record}</Text>)}<Text style={s.copy}>{preview.completedTools} completed steps retained · ${(preview.spentCents/100).toFixed(2)} already spent.{preview.discardedResponse?' The earlier unfinished response will stay in history.':''}</Text><Text style={s.copy}>{preview.instructions}</Text><Button label={uncertain?'Retry the same recovery':'Prepare updated cost review'} disabled={disabled||busy} onPress={()=>void submit(true)}/></>:<Button secondary label="Review recovery" disabled={disabled||busy||instructions.trim().length<3} onPress={()=>void submit(false)}/>}<Text style={s.help}>This does not approve a charge. Save the recovery before leaving this screen.</Text></View>;
}
