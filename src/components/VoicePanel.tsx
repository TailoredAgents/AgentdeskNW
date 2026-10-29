'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Mic,MicOff,PhoneOff,Radio,X } from 'lucide-react';

interface Props {conversationId?:string;configured:boolean;onClose:()=>void;onUpdate:()=>void}
interface RealtimeEvent {type:string;event_id?:string;item_id?:string;transcript?:string;error?:{message?:string};response?:{output?:{type:string;name?:string;arguments?:string;call_id?:string}[]}}
async function post<T>(url:string,payload:unknown):Promise<T>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Voice request failed.');return data as T;}

export default function VoicePanel({conversationId,configured,onClose,onUpdate}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const connection=useRef<RTCPeerConnection|null>(null);
  const microphone=useRef<MediaStream|null>(null);
  const audio=useRef<HTMLAudioElement>(null);
  const channel=useRef<RTCDataChannel|null>(null);
  const session=useRef<string|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mounted=useRef(true);
  const generation=useRef(0);
  const [status,setStatus]=useState<'idle'|'connecting'|'connected'|'ended'|'error'>('idle');
  const [error,setError]=useState('');
  const [muted,setMuted]=useState(false);
  const [transcripts,setTranscripts]=useState<{role:string;text:string}[]>([]);
  const callbacks=useRef({onClose,onUpdate});
  useEffect(()=>{callbacks.current={onClose,onUpdate};},[onClose,onUpdate]);
  const cleanup=useCallback(()=>{
    generation.current++;
    if(timer.current)clearTimeout(timer.current);
    microphone.current?.getTracks().forEach(track=>track.stop());microphone.current=null;
    if(channel.current){channel.current.onmessage=null;channel.current.close();channel.current=null;}
    if(connection.current){connection.current.onconnectionstatechange=null;connection.current.close();connection.current=null;}
    if(audio.current)audio.current.srcObject=null;
    const id=session.current;session.current=null;
    if(id)void post('/api/voice/end',{voiceSessionId:id}).then(()=>callbacks.current.onUpdate()).catch(()=>{if(mounted.current)setError('Audio has ended. Usage finalization could not be confirmed.');});
  },[]);
  const end=useCallback(()=>{cleanup();if(mounted.current)setStatus('ended');},[cleanup]);
  useEffect(()=>{mounted.current=true;dialog.current?.showModal();return()=>{mounted.current=false;cleanup();};},[cleanup]);

  async function start(){
    if(!configured)return;
    setStatus('connecting');setError('');setMuted(false);
    const run=++generation.current;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Voice requires microphone support on localhost or HTTPS.');
      const media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(run!==generation.current){media.getTracks().forEach(track=>track.stop());return;}
      microphone.current=media;
      const token=await post<{value:string;voiceSessionId:string;conversationId:string;maxSeconds:number}>('/api/voice/session',{conversationId});
      if(run!==generation.current){void post('/api/voice/end',{voiceSessionId:token.voiceSessionId});return;}
      session.current=token.voiceSessionId;
      const pc=new RTCPeerConnection();connection.current=pc;
      pc.ontrack=event=>{if(audio.current){audio.current.srcObject=event.streams[0]||new MediaStream([event.track]);void audio.current.play().catch(()=>setError('Use the audio player below to enable playback.'));}};
      media.getTracks().forEach(track=>pc.addTrack(track,media));
      const dc=pc.createDataChannel('oai-events');channel.current=dc;
      dc.onopen=()=>{if(mounted.current)setStatus('connected');timer.current=setTimeout(end,token.maxSeconds*1000);};
      dc.onmessage=async({data})=>{
        try{
          const event=JSON.parse(data) as RealtimeEvent;
          if(event.type==='error'){setError(event.error?.message||'The voice provider reported an error.');return;}
          const input=event.type==='conversation.item.input_audio_transcription.completed';
          const output=event.type==='response.output_audio_transcript.done';
          if((input||output)&&event.transcript){
            const role=input?'user':'assistant';setTranscripts(current=>[...current.slice(-15),{role,text:event.transcript!}]);
            await post('/api/voice/transcript',{voiceSessionId:token.voiceSessionId,eventId:event.event_id||event.item_id||crypto.randomUUID(),role,text:event.transcript});callbacks.current.onUpdate();
          }
          if(event.type==='response.done'){
            const calls=event.response?.output?.filter(item=>item.type==='function_call')||[];
            for(const call of calls){
              let result:unknown;
              try{result=await post('/api/voice/tool',{voiceSessionId:token.voiceSessionId,callId:call.call_id,name:call.name,args:JSON.parse(call.arguments||'{}')});}
              catch(toolError){result={completed:false,error:toolError instanceof Error?toolError.message:'The tool could not complete.'};}
              if(dc.readyState==='open')dc.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)}}));
            }
            if(calls.length&&dc.readyState==='open'){dc.send(JSON.stringify({type:'response.create'}));callbacks.current.onUpdate();}
          }
        }catch(eventError){if(mounted.current)setError(eventError instanceof Error?eventError.message:'A voice event could not be saved.');}
      };
      pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState)){cleanup();if(mounted.current){setStatus('error');setError('Voice disconnected. Your saved work is still available. Start again to reconnect.');}}};
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      if(pc.iceGatheringState!=='complete')await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('Connection setup timed out.'));},10000);function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',check);resolve();}}pc.addEventListener('icegatheringstatechange',check);check();});
      const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',body:pc.localDescription?.sdp,headers:{Authorization:`Bearer ${token.value}`,'Content-Type':'application/sdp'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`Voice connection failed (${response.status}). Check model access and retry.`);
      await pc.setRemoteDescription({type:'answer',sdp:await response.text()});
    }catch(startError){cleanup();if(mounted.current){setStatus('error');setError(startError instanceof Error?startError.message:'Could not start voice.');}}
  }
  function toggleMute(){const value=!muted;microphone.current?.getAudioTracks().forEach(track=>track.enabled=!value);setMuted(value);}
  function close(){end();callbacks.current.onClose();}
  return <dialog ref={dialog} aria-labelledby="voice-title" onCancel={event=>{event.preventDefault();close();}} style={{width:'min(540px,calc(100vw - 32px))',padding:32,color:'#eff3f7',background:'#111a25',border:'1px solid #344451',borderRadius:24,boxShadow:'0 32px 100px #0009'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontSize:12,letterSpacing:2,color:'#98acbc'}}>AGENTDESK LIVE VOICE</span><button className="icon-button" onClick={close} aria-label="Close voice"><X size={20}/></button></div>
    <div style={{width:90,height:90,borderRadius:'50%',background:'#1c4945',display:'grid',placeItems:'center',margin:'30px auto',boxShadow:status==='connected'?'0 0 40px #65dec52a':undefined}}><Radio size={38} color="#a3efdc"/></div>
    <h2 id="voice-title" style={{fontSize:27,textAlign:'center',marginBottom:12}}>{status==='connected'?'I’m listening.':configured?'Let’s talk it through.':'Connect your voice assistant.'}</h2>
    <p style={{color:'#acbbc6',textAlign:'center',lineHeight:1.6}}>{!configured?'Live voice is not connected yet. Add an OpenAI API key to the server configuration and restart AgentDesk to enable two-way conversation.':status==='connecting'?'Connecting your microphone securely…':status==='connected'?'Speak naturally. You can interrupt, ask about your work, or start a task.':'Your conversation and tool results will be saved with your assistant history. Audio goes to OpenAI; AgentDesk does not save the recording.'}</p>
    {configured&&<p style={{fontSize:12,textAlign:'center',color:'#8299a9',margin:'15px 0'}}>Starting voice allows microphone audio to be sent to OpenAI. Sessions end after 10 minutes. Usage is estimated locally.</p>}
    {error&&<p role="alert" style={{background:'#523932',padding:12,borderRadius:8,fontSize:13}}>{error}</p>}
    <audio ref={audio} autoPlay controls style={{width:'100%',display:status==='connected'?'block':'none',margin:'16px 0'}}/>
    <div style={{display:'flex',justifyContent:'center',gap:12,marginTop:24}}>{status==='connected'?<><button className="button secondary" onClick={toggleMute}>{muted?<MicOff size={16}/>:<Mic size={16}/>} {muted?'Unmute':'Mute'}</button><button className="button primary" onClick={end}><PhoneOff size={16}/> End conversation</button></>:<button className="button primary" disabled={!configured||status==='connecting'} onClick={()=>void start()}><Mic size={16}/> {status==='connecting'?'Connecting…':configured?'Start voice conversation':'API key required'}</button>}</div>
    {transcripts.length>0&&<div aria-live="polite" style={{marginTop:24,maxHeight:220,overflowY:'auto'}}>{transcripts.map((entry,index)=><p key={index} style={{fontSize:13,padding:'10px 0',borderTop:'1px solid #293b47'}}><strong>{entry.role==='user'?'You':'AgentDesk'}: </strong>{entry.text}</p>)}</div>}
  </dialog>;
}
export { VoicePanel };
