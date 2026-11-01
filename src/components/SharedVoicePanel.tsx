'use client';
import {useEffect,useRef,useState} from 'react';
import {AudioLines,Mic,Pause,Volume2} from 'lucide-react';
import type {Artifact,ToolResult} from '@/lib/contracts';
import {VoiceConversation,initialVoiceView} from '@/lib/voice-conversation';
import {browserSpeech,browserSpeechAvailable} from '@/lib/browser-speech';
import {Modal} from './ui';

interface Props {blocked:boolean;onRequest:(text:string)=>Promise<ToolResult>;onClose:()=>void;onArtifact:(artifact:Artifact)=>void;onConversation:()=>void}
const labels={idle:'Let’s talk it through.',starting:'Opening your microphone…',listening:'I’m listening.',thinking:'Your Agent is working…',speaking:'Here’s what I found.',paused:'Voice is paused.',review:'Check your spoken decision.',error:'Let’s check the connection.'};
export function SharedVoicePanel(props:Props){
 const [view,setView]=useState(initialVoiceView),[supported,setSupported]=useState(true);const controller=useRef<VoiceConversation|null>(null),callbacks=useRef(props);
 useEffect(()=>{callbacks.current=props;},[props]);
 useEffect(()=>{
  const loop=new VoiceConversation({...browserSpeech(),request:text=>callbacks.current.onRequest(text),changed:setView});controller.current=loop;
  const detect=setTimeout(()=>setSupported(browserSpeechAvailable()),0);
  const hidden=()=>{if(document.visibilityState!=='visible')loop.pause('Voice paused when this screen left the foreground. Tap Start when you return.');};
  const offline=()=>loop.pause('Voice paused because the connection was lost. Check your saved request before continuing.');
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',offline);window.addEventListener('offline',offline);
  return()=>{clearTimeout(detect);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',offline);window.removeEventListener('offline',offline);loop.dispose();controller.current=null;};
 },[]);
 const close=()=>{controller.current?.dispose();props.onClose();};
 const active=['starting','listening','thinking','speaking'].includes(view.phase);
 return <Modal title="Talk to your Agent" onClose={close}>
  <div className="shared-voice-intro"><div className={`shared-voice-orb ${active?'active':''}`}><AudioLines size={32} aria-hidden="true"/></div><p className="eyebrow">ONE CONVERSATION · ALL YOUR AGENT’S TOOLS</p><h3 aria-live="polite">{labels[view.phase]}</h3><p>Speak a request, hear the answer, then keep going. Your work stays in the same conversation.</p></div>
  <p className="shared-voice-note">Starting voice sends completed spoken requests automatically. Your browser’s speech service handles audio and may process it online. AgentDesk saves the words and results, not a recording. AI usage follows the same rules as typing.</p>
  {!supported&&<p className="error-text" role="status">Speech is unavailable in this browser. Continue by typing or use a phone development build with speech enabled.</p>}
  {props.blocked&&!view.pending&&<p role="status" className="shared-voice-note">Finish your draft or check the outstanding request in Copilot before starting another spoken turn.</p>}
  {view.notice&&<p role={view.phase==='error'?'alert':'status'} className="shared-voice-status">{view.notice}</p>}
  {view.heard&&<div className="shared-voice-transcript"><strong>You said</strong><p>{view.heard}</p></div>}
  {view.phase==='review'&&<div className="shared-voice-transcript"><label htmlFor="spoken-decision">Review the exact words</label><textarea id="spoken-decision" rows={3} maxLength={12000} value={view.reviewText} onChange={e=>controller.current?.editReview(e.target.value)}/><div className="shared-voice-actions"><button className="button primary" disabled={!view.reviewText.trim()||props.blocked} onClick={()=>controller.current?.confirm(view.reviewText)}>Send reviewed words</button><button className="button secondary" onClick={()=>controller.current?.pause('Decision discarded. Nothing was sent.')}>Discard</button></div></div>}
  <div className="shared-voice-actions">{view.phase==='speaking'&&<button className="button primary" onClick={()=>controller.current?.interrupt()}><Mic size={16}/>Interrupt and speak</button>}{active?<button className="button secondary" onClick={()=>controller.current?.pause()}><Pause size={16}/>Pause voice</button>:view.phase!=='review'&&<button className="button primary" disabled={!supported||props.blocked||view.pending} onClick={()=>void controller.current?.start()}><Mic size={16}/>{view.pending?'Waiting for saved request…':'Start voice'}</button>}<button className="button secondary" onClick={()=>{close();props.onConversation();}}>Open conversation</button></div>
  {view.answer&&<section className="shared-voice-answer"><h4><Volume2 size={16}/>Saved answer</h4><p>{view.answer}</p>{view.artifacts.map((artifact,index)=><button key={`${artifact.type}:${artifact.id??index}`} className="button secondary" onClick={()=>{close();props.onArtifact(artifact);}}>{artifact.title} →</button>)}</section>}
  <p className="shared-voice-note">Keep this screen open. Listening pauses during replies; use Interrupt to speak sooner. Pausing voice stops audio, while saved jobs keep their own controls.</p>
 </Modal>;
}
