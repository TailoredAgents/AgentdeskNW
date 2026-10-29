'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Radio, Volume2, X } from 'lucide-react';

interface Props {conversationId?:string;configured:boolean;onClose:()=>void;onUpdate:()=>void}
type State = 'idle'|'permission'|'connecting'|'connected'|'reconnecting'|'ended'|'error';
interface ServerStatus {status:'prepared'|'connecting'|'connected'|'ended'|'failed';reason?:string;metering:'reserved'|'released'|'reconciliation_required';responseReceipts:number;hangup:string;maxSeconds:number}
interface RealtimeEvent {type:string;event_id?:string;item_id?:string;transcript?:string}
async function post<T>(url:string,payload:unknown,keepalive=false):Promise<T> {
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-AgentDesk-Request':'1'},body:JSON.stringify(payload),keepalive,signal:keepalive?undefined:AbortSignal.timeout(40_000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Voice request failed.');return data as T;
}

export default function VoicePanel({conversationId,configured,onClose,onUpdate}:Props) {
  const dialog=useRef<HTMLDialogElement>(null),audio=useRef<HTMLAudioElement>(null);
  const connection=useRef<RTCPeerConnection|null>(null),microphone=useRef<MediaStream|null>(null),channel=useRef<RTCDataChannel|null>(null);
  const session=useRef<string|null>(null),savedConversation=useRef(conversationId);
  const poll=useRef<ReturnType<typeof setInterval>|null>(null),countdown=useRef<ReturnType<typeof setInterval>|null>(null),disconnect=useRef<ReturnType<typeof setTimeout>|null>(null);
  const mounted=useRef(true),starting=useRef(false),generation=useRef(0),seen=useRef(new Set<string>()),callbacks=useRef({onClose,onUpdate});
  const [status,setStatus]=useState<State>('idle'),[activity,setActivity]=useState('Listening'),[error,setError]=useState('');
  const [muted,setMuted]=useState(false),[playbackBlocked,setPlaybackBlocked]=useState(false),[remaining,setRemaining]=useState(0),[usageNote,setUsageNote]=useState('');
  const [transcripts,setTranscripts]=useState<{role:string;text:string}[]>([]);
  useEffect(()=>{callbacks.current={onClose,onUpdate};},[onClose,onUpdate]);
  useEffect(()=>{if(conversationId)savedConversation.current=conversationId;},[conversationId]);

  const cleanup=useCallback(()=>{
    generation.current++;
    starting.current=false;
    if(poll.current)clearInterval(poll.current);if(countdown.current)clearInterval(countdown.current);if(disconnect.current)clearTimeout(disconnect.current);
    poll.current=null;countdown.current=null;disconnect.current=null;
    microphone.current?.getTracks().forEach(track=>{track.onended=null;track.stop();});microphone.current=null;
    if(channel.current){channel.current.onmessage=null;channel.current.onopen=null;channel.current.close();channel.current=null;}
    if(connection.current){connection.current.onconnectionstatechange=null;connection.current.ontrack=null;connection.current.close();connection.current=null;}
    if(audio.current){audio.current.pause();audio.current.srcObject=null;}
    const id=session.current;session.current=null;
    if(id)void post('/api/voice/end',{voiceSessionId:id},true).then(async()=>{
      const response=await fetch(`/api/voice/status?voiceSessionId=${encodeURIComponent(id)}`,{cache:'no-store'});
      if(response.ok){const result=await response.json() as ServerStatus;if(mounted.current)setUsageNote(result.metering==='released'?'Unused voice allowance was released.':'Usage is awaiting reconciliation. Reserved allowance is not a charge.');}
      callbacks.current.onUpdate();
    }).catch(()=>{if(mounted.current)setUsageNote('Audio is off. The server could not confirm finalization; reserved usage remains pending.');});
  },[]);
  const end=useCallback((message?:string)=>{cleanup();if(mounted.current){setStatus('ended');setActivity('Listening');if(message)setError(message);}},[cleanup]);
  useEffect(()=>{
    mounted.current=true;dialog.current?.showModal();
    const hidden=()=>{if(document.visibilityState==='hidden'&&(starting.current||session.current||microphone.current))end('Voice paused because the app moved to the background. Return here and reconnect to continue.');};
    const offline=()=>{if(starting.current||session.current||microphone.current)end('Your network connection was lost. Reconnect when you are back online.');};
    const leaving=()=>cleanup();
    document.addEventListener('visibilitychange',hidden);window.addEventListener('offline',offline);window.addEventListener('pagehide',leaving);
    return()=>{mounted.current=false;document.removeEventListener('visibilitychange',hidden);window.removeEventListener('offline',offline);window.removeEventListener('pagehide',leaving);cleanup();};
  },[cleanup,end]);

  async function start() {
    if(!configured)return;
    cleanup();setStatus('permission');setError('');setUsageNote('');setMuted(false);setPlaybackBlocked(false);setActivity('Listening');seen.current.clear();
    starting.current=true;
    const run=++generation.current;
    const active=()=>mounted.current&&generation.current===run;
    try {
      if(!navigator.onLine)throw new Error('Connect to the internet before starting voice.');
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Voice requires microphone support on localhost or HTTPS.');
      const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(!active()){media.getTracks().forEach(track=>track.stop());return;}
      microphone.current=media;media.getAudioTracks().forEach(track=>{track.onended=()=>end('Microphone access ended. Check permissions and reconnect.');});setStatus('connecting');
      const prepared=await post<{voiceSessionId:string;conversationId:string;maxSeconds:number}>('/api/voice/session',{conversationId:savedConversation.current});
      if(!active()){void post('/api/voice/end',{voiceSessionId:prepared.voiceSessionId},true);return;}
      session.current=prepared.voiceSessionId;savedConversation.current=prepared.conversationId;setRemaining(prepared.maxSeconds);
      const pc=new RTCPeerConnection();connection.current=pc;
      pc.ontrack=event=>{if(audio.current&&active()){audio.current.srcObject=event.streams[0]||new MediaStream([event.track]);void audio.current.play().catch(()=>{if(active())setPlaybackBlocked(true);});}};
      media.getTracks().forEach(track=>pc.addTrack(track,media));
      const dc=pc.createDataChannel('oai-events');channel.current=dc;
      dc.onmessage=({data})=>{
        if(!active())return;
        try {
          const event=JSON.parse(data) as RealtimeEvent;
          if(event.type==='input_audio_buffer.speech_started'||event.type==='output_audio_buffer.cleared')setActivity('Listening');
          if(event.type==='response.created')setActivity('Thinking');
          if(event.type==='output_audio_buffer.started')setActivity('Speaking');
          if(event.type==='output_audio_buffer.stopped'||event.type==='response.done')setActivity('Listening');
          if(event.type==='error'){setError('The voice service reported an error. If speech stops, reconnect.');return;}
          const input=event.type==='conversation.item.input_audio_transcription.completed',output=event.type==='response.output_audio_transcript.done';
          if((input||output)&&event.transcript){const key=event.event_id||`${event.type}:${event.item_id}:${event.transcript}`;if(!seen.current.has(key)){seen.current.add(key);setTranscripts(current=>[...current.slice(-15),{role:input?'user':'assistant',text:event.transcript!}]);}}
          // Tools, persisted transcripts and usage receipts are handled by the authenticated server connection.
        } catch { /* Ignore unrecognized presentation events; the server owns persistence. */ }
      };
      let connected=false;
      const ready=()=>{
        if(!active()||connected)return;connected=true;starting.current=false;setStatus('connected');
        const deadline=Date.now()+prepared.maxSeconds*1000;
        countdown.current=setInterval(()=>{if(!active())return;const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));setRemaining(seconds);if(seconds===0)end('This session reached its voice time limit. Saved work is available in your conversation.');},1000);
      };
      dc.onopen=ready;
      pc.onconnectionstatechange=()=>{
        if(!active())return;
        if(pc.connectionState==='connected'){if(disconnect.current)clearTimeout(disconnect.current);if(connected)setStatus('connected');}
        if(pc.connectionState==='disconnected'){setStatus('reconnecting');disconnect.current=setTimeout(()=>{if(active())end('Voice could not reconnect. Start again to continue with your saved conversation.');},8_000);}
        if(pc.connectionState==='failed'||pc.connectionState==='closed')end('Voice disconnected. Reconnect to continue with your saved conversation.');
      };
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      if(pc.iceGatheringState!=='complete')await new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('Connection setup timed out. Check your network and reconnect.'));},10_000);
        function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',check);resolve();}}
        pc.addEventListener('icegatheringstatechange',check);check();
      });
      if(!active())return;
      const answer=await post<{sdp:string}>('/api/voice/connect',{voiceSessionId:prepared.voiceSessionId,sdp:pc.localDescription?.sdp});
      if(!active())return;
      await pc.setRemoteDescription({type:'answer',sdp:answer.sdp});
      let failures=0,receipts=0,checking=false;
      poll.current=setInterval(async()=>{
        if(!active()||checking)return;checking=true;
        try {
          const response=await fetch(`/api/voice/status?voiceSessionId=${encodeURIComponent(prepared.voiceSessionId)}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
          if(!response.ok)throw new Error('Voice status unavailable');
          const result=await response.json() as ServerStatus;if(!active())return;failures=0;
          if(result.responseReceipts!==receipts){receipts=result.responseReceipts;callbacks.current.onUpdate();}
          if(result.status==='ended'||result.status==='failed')end(result.reason||'The voice session ended.');
        } catch {if(active()&&++failures>=3)end('Voice status could not be confirmed. Reconnect when your connection is stable.');}
        finally {checking=false;}
      },3000);
    } catch(startError) {
      if(!active())return;cleanup();setStatus('error');
      const message=startError instanceof DOMException&&startError.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access in your browser, then try again.':startError instanceof DOMException&&startError.name==='NotFoundError'?'No microphone was found. Connect a microphone and try again.':startError instanceof Error?startError.message:'Could not start voice.';
      setError(message);
    }
  }
  function toggleMute(){const value=!muted;microphone.current?.getAudioTracks().forEach(track=>{track.enabled=!value;});setMuted(value);}
  function close(){end();callbacks.current.onClose();}
  const busy=status==='permission'||status==='connecting',talking=status==='connected'||status==='reconnecting';
  const title=status==='permission'?'Allow microphone access.':status==='connecting'?'Connecting your conversation…':status==='reconnecting'?'Reconnecting…':status==='connected'?(muted?'Your microphone is muted.':`${activity}…`):configured?'Let’s talk it through.':'Connect your voice assistant.';
  return <dialog ref={dialog} aria-labelledby="voice-title" onCancel={event=>{event.preventDefault();close();}} style={{width:'min(540px,calc(100vw - 24px))',maxHeight:'calc(100dvh - 32px)',overflowY:'auto',padding:'clamp(18px,5vw,32px)',color:'#eff3f7',background:'#111a25',border:'1px solid #344451',borderRadius:24,boxShadow:'0 32px 100px #0009'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontSize:12,letterSpacing:2,color:'#98acbc'}}>AGENTDESK LIVE VOICE</span><button className="icon-button" onClick={close} aria-label="Close voice"><X size={20}/></button></div>
    <div aria-hidden="true" style={{width:80,height:80,borderRadius:'50%',background:'#1c4945',display:'grid',placeItems:'center',margin:'24px auto',boxShadow:status==='connected'?'0 0 40px #65dec52a':undefined}}><Radio size={34} color="#a3efdc"/></div>
    <h2 id="voice-title" aria-live="polite" style={{fontSize:25,textAlign:'center',marginBottom:12}}>{title}</h2>
    <p style={{color:'#acbbc6',textAlign:'center',lineHeight:1.6}}>{!configured?'Live voice is not connected yet. Add an OpenAI API key to the server configuration and restart AgentDesk to enable two-way conversation.':talking?'Speak naturally, interrupt, ask about your work, or start an authorized task. Your saved conversation continues when you reconnect.':'Your conversation and completed work are saved with Copilot. Audio is sent to OpenAI; AgentDesk does not save a recording.'}</p>
    {configured&&<p style={{fontSize:12,textAlign:'center',color:'#8299a9',margin:'15px 0'}}>Keep this screen open while talking. Voice ends when the app moves to the background or loses its connection. Starting voice permits microphone audio to be sent to OpenAI.</p>}
    {talking&&<p style={{textAlign:'center',color:remaining<=60?'#ffd19b':'#a3efdc',fontSize:13}}>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')} left in this session{remaining<=60?' · Session ending soon':''}</p>}
    {error&&<p role="alert" style={{background:'#523932',padding:12,borderRadius:8,fontSize:13}}>{error}</p>}
    {usageNote&&<p role="status" style={{fontSize:12,color:'#acbbc6',marginTop:12}}>{usageNote}</p>}
    <audio ref={audio} autoPlay controls style={{width:'100%',display:talking?'block':'none',margin:'16px 0'}}/>
    {playbackBlocked&&talking&&<button className="button secondary" onClick={()=>{void audio.current?.play().then(()=>setPlaybackBlocked(false)).catch(()=>setError('Your browser is blocking audio. Use the audio controls to enable playback.'));}}><Volume2 size={16}/> Enable spoken replies</button>}
    <div style={{display:'flex',justifyContent:'center',flexWrap:'wrap',gap:12,marginTop:22}}>{talking?<><button className="button secondary" onClick={toggleMute}>{muted?<MicOff size={16}/>:<Mic size={16}/>} {muted?'Unmute':'Mute'}</button><button className="button primary" onClick={()=>end()}><PhoneOff size={16}/> End conversation</button></>:<><button className="button primary" disabled={!configured||busy} onClick={()=>void start()}><Mic size={16}/> {busy?'Connecting…':configured?(status==='ended'||status==='error'?'Reconnect voice':'Start voice conversation'):'API key required'}</button>{busy&&<button className="button secondary" onClick={()=>end()}>Cancel</button>}</>}</div>
    {transcripts.length>0&&<div aria-live="polite" style={{marginTop:24,maxHeight:220,overflowY:'auto'}}>{transcripts.map((entry,index)=><p key={index} style={{fontSize:13,padding:'10px 0',borderTop:'1px solid #293b47'}}><strong>{entry.role==='user'?'You':'AgentDesk'}: </strong>{entry.text}</p>)}</div>}
  </dialog>;
}
export { VoicePanel };
