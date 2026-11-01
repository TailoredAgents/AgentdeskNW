import type {VoicePorts} from './voice-conversation';
interface Recognition {
 lang:string;continuous:boolean;interimResults:boolean;maxAlternatives:number;
 onstart:(()=>void)|null;onend:(()=>void)|null;onerror:((event:{error:string})=>void)|null;
 onresult:((event:{resultIndex:number;results:{length:number;[key:number]:{isFinal:boolean;0:{transcript:string}}}})=>void)|null;
 start:()=>void;abort:()=>void;
}
type SpeechWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export function browserSpeechAvailable(){if(typeof window==='undefined')return false;const w=window as SpeechWindow;return !!(w.SpeechRecognition||w.webkitSpeechRecognition)&&'speechSynthesis'in window;}
export function browserSpeech():Pick<VoicePorts,'listen'|'speak'>{return {
 async listen(events,signal){
  if(!browserSpeechAvailable())throw new Error('This browser does not support spoken conversation. Type here, or use the phone app with speech enabled.');
  if(signal.aborted)return ()=>{};
  const w=window as SpeechWindow,Constructor=w.SpeechRecognition??w.webkitSpeechRecognition!,recognition=new Constructor();let closed=false;
  recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
  const stop=()=>{if(closed)return;closed=true;recognition.onstart=null;recognition.onend=null;recognition.onerror=null;recognition.onresult=null;signal.removeEventListener('abort',stop);try{recognition.abort();}catch{}};
  recognition.onstart=events.started;recognition.onend=()=>{if(!closed)events.ended();};
  recognition.onerror=event=>{if(!closed)events.error(event.error==='not-allowed'?'Microphone or speech permission was denied. Allow access, or continue by typing.':event.error==='no-speech'?'No speech was captured. Tap Start and try again.':'Speech input stopped. Check your connection and microphone, or continue by typing.');};
  recognition.onresult=event=>{if(closed)return;const parts:string[]=[];let final=false;for(let i=0;i<event.results.length;i++){parts.push(event.results[i][0].transcript);if(event.results[i].isFinal)final=true;}events.text(parts.join(' '),final);};
  signal.addEventListener('abort',stop,{once:true});try{recognition.start();}catch(error){stop();throw error;}return stop;
 },
 speak(text,done,error){
  if(!('speechSynthesis'in window)){error('Spoken playback is unavailable. Read the saved answer below.');return ()=>{};}
  const utterance=new SpeechSynthesisUtterance(text);let closed=false;utterance.lang='en-US';utterance.rate=1;
  utterance.onend=()=>{if(!closed)done();};utterance.onerror=()=>{if(!closed)error('Spoken playback stopped. The full answer is saved below. Check sound permissions and try again.');};
  speechSynthesis.speak(utterance);return ()=>{if(closed)return;closed=true;utterance.onend=null;utterance.onerror=null;speechSynthesis.cancel();};
 },
};}
