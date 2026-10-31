import {useEffect,useRef,useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import type {AnswerWorkInput,WorkRun} from '../../src/lib/work-contracts';
import {ApiError} from './client';
import {Button} from './Button';
import type {Api} from './WorkScreen';
import {styles as s} from './styles';
export function WorkQuestionCard({run,api,onSaved,onAuthError,onGuard}:{run:WorkRun;api:Api;onSaved:(run:WorkRun)=>void;onAuthError:(error:unknown)=>void;onGuard?:(guard:((leave:()=>void)=>void)|null)=>void}){
 const [answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pending,setPending]=useState<AnswerWorkInput|null>(null);
 const alive=useRef(true),saving=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onGuard?.(leave=>{if(answer.trim()||pending||busy){setError(pending?'Retry the pending answer before leaving.':'Save or discard your answer before leaving.');return;}leave();});return()=>onGuard?.(null);},[answer,pending,busy,onGuard]);
 const question=run.question;if(!question)return null;
 async function save(){
  if(saving.current||!question)return;saving.current=true;setBusy(true);setError('');
  const input=pending??{expectedVersion:run.version,questionReference:question.reference,eventKey:Crypto.randomUUID(),answer};setPending(input);
  try{const next=await api<WorkRun>(`/work/${encodeURIComponent(run.id)}/answer`,input);if(alive.current){setPending(null);onSaved(next);}}
  catch(e){if(alive.current){if(e instanceof ApiError&&e.status>=400&&e.status<500)setPending(null);setError(e instanceof Error?e.message:'The outcome needs checking. Retry the same answer.');onAuthError(e);}}
  finally{saving.current=false;if(alive.current)setBusy(false);}
 }
 return <View style={s.card}><Text style={s.cardTitle}>One detail to continue</Text><Text style={s.copy}>{question.prompt}</Text>{question.choices.map(choice=><Button key={choice.value} label={choice.label} secondary={answer!==choice.value} disabled={busy||!!pending} onPress={()=>setAnswer(choice.value)}/>)}{!question.choices.length&&<TextInput accessibilityLabel="Job answer" value={answer} editable={!busy&&!pending} onChangeText={setAnswer} maxLength={2000} multiline style={s.input}/>}<Text style={s.help}>{question.answerType==='datetime'?'Include date, time and timezone, for example 2026-11-03T09:00:00-05:00. ':''}This supplies information. Required spending approval remains separate.</Text>{Boolean(error)&&<Text style={s.errorText}>{error}</Text>}{Boolean(answer)&&!pending&&<Button secondary label="Discard answer" disabled={busy} onPress={()=>{setAnswer('');setError('');}}/>}<Button label={busy?'Saving answer…':pending?'Retry the same answer':'Save answer & continue'} disabled={busy||!answer.trim()} onPress={()=>void save()}/></View>;
}
