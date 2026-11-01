import type {ToolResult} from './contracts';

export type VoicePhase='idle'|'starting'|'listening'|'thinking'|'speaking'|'paused'|'review'|'error';
export interface VoiceView {phase:VoicePhase;heard:string;answer:string;notice:string;reviewText:string;turns:number;pending:boolean;artifacts:ToolResult['artifacts']}
export interface SpeechEvents {started:()=>void;text:(text:string,final:boolean)=>void;ended:()=>void;error:(message:string)=>void}
export interface VoicePorts {
 listen:(events:SpeechEvents,signal:AbortSignal)=>Promise<()=>void>;
 speak:(text:string,done:()=>void,error:(message:string)=>void)=>()=>void;
 request:(text:string)=>Promise<ToolResult>;
 changed:(view:VoiceView)=>void;
}
export const initialVoiceView=():VoiceView=>({phase:'idle',heard:'',answer:'',notice:'',reviewText:'',turns:0,pending:false,artifacts:[]});
/** Speech is input to the same authenticated chat host, never an approval/receipt API.
 * Misheard decisions must be inspected and tapped; server reviews still decide authority. */
export function spokenDecisionNeedsReview(text:string){return /\b(approv\w*|den(?:y|ied|ial)|confirm\w*|authoriz\w*|purchas\w*|pay(?:ment)?|top[ -]?up|buy\s+(?:credits?|tokens?))\b/i.test(text);}
export function voiceReplyNeedsReview(result:ToolResult){return result.artifacts.some(a=>['approval','work_run'].includes(a.type))||/\b(?:needs your spending decision|approve or deny|awaiting (?:your )?approval)\b/i.test(result.message);}
export function spokenAnswer(text:string){const clean=text.replace(/```[\s\S]*?```/g,' Code is available in the saved answer. ').replace(/\[([^\]]+)\]\([^\s)]+\)/g,'$1').replace(/https?:\/\/\S+/g,'link in the saved answer').replace(/[*#`_]/g,'').trim();return clean.length<=1800?clean:`${clean.slice(0,1700).replace(/\s+\S*$/,'')}… The full answer is saved in your conversation.`;}

/** One foreground, turn-based speech loop. It owns audio only; the parent chat owns
 * durable request identity and uncertainty recovery even when this view is closed. */
export class VoiceConversation {
 private view=initialVoiceView();private epoch=0;private ended=false;private inFlight=false;private deadline=0;
 private listenAbort:AbortController|null=null;private stopAudio:(()=>void)|null=null;private timer:ReturnType<typeof setTimeout>|null=null;
 constructor(private ports:VoicePorts,private now=()=>Date.now()){}
 snapshot(){return {...this.view,artifacts:[...this.view.artifacts]};}
 private emit(change:Partial<VoiceView>){this.view={...this.view,...change};if(!this.ended)this.ports.changed(this.snapshot());}
 private clearAudio(){this.listenAbort?.abort();this.listenAbort=null;const stop=this.stopAudio;this.stopAudio=null;stop?.();if(this.timer)clearTimeout(this.timer);this.timer=null;}
 pause(notice='Voice paused. Saved work continues; use Work to pause or cancel a job.'){
  this.epoch++;this.clearAudio();this.emit({phase:'paused',reviewText:'',notice});
 }
 dispose(){this.ended=true;this.epoch++;this.clearAudio();this.view=initialVoiceView();}
 async start(){
  if(this.ended||this.inFlight||['starting','listening','speaking','thinking','review'].includes(this.view.phase))return;
  if(!this.deadline||this.now()>=this.deadline||this.view.turns>=20){this.deadline=this.now()+10*60_000;this.emit({turns:0});}
  await this.listen();
 }
 private async listen(){
  if(this.ended||this.inFlight)return;
  if(this.now()>=this.deadline||this.view.turns>=20){this.pause('Voice reached its session limit. Your conversation is saved.');return;}
  const token=++this.epoch;this.clearAudio();const abort=new AbortController();this.listenAbort=abort;
  const current=()=>!this.ended&&token===this.epoch&&!abort.signal.aborted;
  this.emit({phase:'starting',heard:'',reviewText:'',notice:'Opening the microphone…'});
  this.timer=setTimeout(()=>{if(current())this.pause('No request was sent. Tap Start when you are ready to speak.');},Math.min(60_000,this.deadline-this.now()));
  try{
   const stop=await this.ports.listen({
    started:()=>{if(current())this.emit({phase:'listening',notice:'Listening. Your completed spoken request is sent automatically.'});},
    text:(raw,final)=>{
     if(!current())return;const text=raw.trim();if(!text)return;
     if(text.length>12000){this.pause('That request is too long. Type or dictate a shorter request; nothing was sent.');return;}
     this.emit({heard:text});if(!final)return;
     this.epoch++;this.clearAudio();
     if(/^(?:please\s+)?(?:pause voice|stop listening|end voice|stop voice)[.!?]*$/i.test(text)){this.pause('Voice paused. Saved jobs are unchanged.');return;}
     if(spokenDecisionNeedsReview(text)){this.emit({phase:'review',reviewText:text,notice:'Check these words before sending a decision. Nothing has been sent.'});return;}
     void this.submit(text);
    },
    ended:()=>{if(current())this.pause('Listening ended without a completed request. Tap Start to try again.');},
    error:message=>{if(current())this.fail(message);},
   },abort.signal);
   if(current())this.stopAudio=stop;else stop();
  }catch(error){if(current())this.fail(error instanceof Error?error.message:'Speech could not start. You can still type.');}
 }
 /** An explicit button submits only the text the employee inspected. */
 editReview(text:string){if(this.view.phase==='review'&&!this.ended&&text.length<=12000)this.emit({reviewText:text});}
 confirm(text:string){if(this.view.phase!=='review'||this.inFlight||this.ended)return;const value=text.trim();if(!value||value.length>12000)return;void this.submit(value);}
 private fail(notice:string){this.epoch++;this.clearAudio();this.emit({phase:'error',reviewText:'',notice});}
 private async submit(text:string){
  if(this.inFlight||this.ended)return;const token=++this.epoch;this.clearAudio();this.inFlight=true;
  this.emit({phase:'thinking',pending:true,heard:text,reviewText:'',notice:'Your Agent is working. This request uses the same tools and spending rules as typing.',turns:this.view.turns+1});
  try{
   const result=await this.ports.request(text);this.inFlight=false;this.emit({pending:false});if(this.ended||token!==this.epoch)return;
   const review=voiceReplyNeedsReview(result);this.emit({phase:'speaking',answer:result.message,artifacts:result.artifacts,notice:review?'Review saved work or spending before continuing.':'Speaking. Tap Interrupt to ask the next question.'});
   const done=()=>{if(this.ended||token!==this.epoch)return;this.stopAudio=null;if(this.timer)clearTimeout(this.timer);this.timer=null;if(review)this.pause('Open the saved review to make the decision, or tap Start for another question.');else void this.listen();};
   this.timer=setTimeout(()=>{if(!this.ended&&token===this.epoch)this.fail('Spoken playback could not be confirmed. The complete answer is saved below.');},120_000);
   const stop=this.ports.speak(spokenAnswer(result.message),done,message=>{if(!this.ended&&token===this.epoch)this.fail(message);});
   if(!this.ended&&token===this.epoch)this.stopAudio=stop;else stop();
  }catch(error){this.inFlight=false;this.emit({pending:false});if(!this.ended&&token===this.epoch)this.fail(error instanceof Error?error.message:'The request could not be confirmed. Check the saved request before starting more work.');}
 }
 interrupt(){if(this.view.phase!=='speaking')return;this.epoch++;this.clearAudio();void this.listen();}
}
