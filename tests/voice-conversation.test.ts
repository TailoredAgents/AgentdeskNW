import {afterEach,describe,it,expect,vi} from 'vitest';
import {VoiceConversation,spokenAnswer,spokenDecisionNeedsReview,type SpeechEvents,type VoiceView} from '../src/lib/voice-conversation';
import type {ToolResult} from '../src/lib/contracts';

const result=(message='Your saved answer.',artifacts:ToolResult['artifacts']=[]):ToolResult=>({message,artifacts,specialistIds:[]});
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function fixture(request=vi.fn(async()=>result())){
 const listens:{events:SpeechEvents;signal:AbortSignal;stop:ReturnType<typeof vi.fn>}[]=[],speech:{text:string;done:()=>void;error:(message:string)=>void;stop:ReturnType<typeof vi.fn>}[]=[],views:VoiceView[]=[];
 const controller=new VoiceConversation({listen:async(events,signal)=>{const stop=vi.fn();listens.push({events,signal,stop});events.started();return stop;},speak:(text,done,error)=>{const stop=vi.fn();speech.push({text,done,error,stop});return stop;},request,changed:v=>views.push(v)});
 return {controller,listens,speech,views,request};
}
afterEach(()=>vi.useRealTimers());
describe('one foreground voice conversation using shared chat',()=>{
 it('sends one final transcript, speaks the saved answer and listens for the next turn',async()=>{
  const f=fixture();await f.controller.start();f.listens[0].events.text('Show my tasks',false);expect(f.request).not.toHaveBeenCalled();f.listens[0].events.text('Show my tasks.',true);await flush();
  expect(f.request).toHaveBeenCalledExactlyOnceWith('Show my tasks.');expect(f.listens[0].signal.aborted).toBe(true);expect(f.controller.snapshot().phase).toBe('speaking');expect(f.speech[0].text).toBe('Your saved answer.');
  f.speech[0].done();await flush();expect(f.listens).toHaveLength(2);expect(f.controller.snapshot().phase).toBe('listening');f.controller.dispose();
 });
 it('ignores duplicate, partial, late and playback-time microphone events',async()=>{
  const f=fixture();await f.controller.start();const old=f.listens[0].events;old.text('First request',true);old.text('First request',true);old.text('Approve everything',true);old.ended();await flush();expect(f.request).toHaveBeenCalledTimes(1);expect(f.controller.snapshot().phase).toBe('speaking');f.speech[0].done();await flush();old.text('Leaked old transcript',true);expect(f.request).toHaveBeenCalledTimes(1);f.controller.dispose();
 });
 it('requires an inspected button decision and sends exactly the edited words',async()=>{
  const f=fixture();await f.controller.start();f.listens[0].events.text('Approve R1234567890ABCDEF',true);await flush();expect(f.controller.snapshot().phase).toBe('review');expect(f.request).not.toHaveBeenCalled();await f.controller.start();expect(f.listens).toHaveLength(1);
  f.controller.editReview('Deny R1234567890ABCDEF');f.controller.confirm(f.controller.snapshot().reviewText);await flush();expect(f.request).toHaveBeenCalledExactlyOnceWith('Deny R1234567890ABCDEF');f.controller.dispose();
 });
 it.each(['Approve the cost','deny this','Purchase credits','top up ten dollars','authorize payment','Confirm this change'])('holds a possible spoken decision: %s',text=>expect(spokenDecisionNeedsReview(text)).toBe(true));
 it('discards an unsubmitted decision without scheduling any work',async()=>{const f=fixture();await f.controller.start();f.listens[0].events.text('Approve this',true);f.controller.pause();f.controller.confirm('Approve this');expect(f.request).not.toHaveBeenCalled();f.controller.dispose();});
 it('stops automatic listening at saved work and spending reviews',async()=>{
  const f=fixture(vi.fn(async()=>result('This request needs your spending decision.',[{type:'work_run',title:'Review saved assignment spending'}])));await f.controller.start();f.listens[0].events.text('Research useful investors',true);await flush();f.speech[0].done();await flush();expect(f.listens).toHaveLength(1);expect(f.controller.snapshot()).toMatchObject({phase:'paused',artifacts:[{type:'work_run',title:'Review saved assignment spending'}]});f.controller.dispose();
 });
 it('does not replay or speak an uncertain request automatically',async()=>{
  const f=fixture(vi.fn(async()=>{throw new Error('Check the outstanding saved request.');}));await f.controller.start();f.listens[0].events.text('Create my task',true);await flush();expect(f.controller.snapshot().phase).toBe('error');expect(f.request).toHaveBeenCalledTimes(1);expect(f.speech).toHaveLength(0);expect(f.listens).toHaveLength(1);f.controller.dispose();
 });
 it('pauses audio immediately while a submitted job retains its own lifecycle',async()=>{
  let resolve!:(value:ToolResult)=>void;const request=vi.fn(()=>new Promise<ToolResult>(done=>{resolve=done;})),f=fixture(request);await f.controller.start();f.listens[0].events.text('Explain this work',true);f.controller.pause('Backgrounded');await f.controller.start();expect(f.listens).toHaveLength(1);resolve(result());await flush();expect(f.controller.snapshot()).toMatchObject({phase:'paused',pending:false,notice:'Backgrounded'});expect(f.speech).toHaveLength(0);expect(request).toHaveBeenCalledTimes(1);f.controller.dispose();
 });
 it('does not start audio when microphone permission returns after backgrounding',async()=>{
  let resolve!:(stop:()=>void)=>void;let signal:AbortSignal|undefined;const stop=vi.fn(),changed=vi.fn();const controller=new VoiceConversation({listen:async(_events,s)=>{signal=s;return new Promise(done=>{resolve=done;});},speak:vi.fn(),request:vi.fn(),changed});const start=controller.start();controller.pause();expect(signal?.aborted).toBe(true);resolve(stop);await start;expect(stop).toHaveBeenCalledOnce();expect(controller.snapshot().phase).toBe('paused');controller.dispose();
 });
 it('interrupts playback once and ignores its late completion callback',async()=>{const f=fixture();await f.controller.start();f.listens[0].events.text('What is next?',true);await flush();f.controller.interrupt();await flush();expect(f.speech[0].stop).toHaveBeenCalledOnce();expect(f.listens).toHaveLength(2);f.speech[0].done();expect(f.listens).toHaveLength(2);f.controller.dispose();});
 it('never invents a second turn after silence or a recognition error',async()=>{const f=fixture();await f.controller.start();f.listens[0].events.ended();expect(f.controller.snapshot().phase).toBe('paused');await f.controller.start();f.listens[1].events.error('Speech unavailable');expect(f.controller.snapshot().phase).toBe('error');expect(f.request).not.toHaveBeenCalled();f.controller.dispose();});
 it('has a bounded listening interval and does not transmit overlong speech',async()=>{vi.useFakeTimers();const f=fixture();await f.controller.start();await vi.advanceTimersByTimeAsync(60_000);expect(f.controller.snapshot().phase).toBe('paused');await f.controller.start();f.listens[1].events.text('x'.repeat(12001),true);expect(f.request).not.toHaveBeenCalled();expect(f.controller.snapshot().notice).toContain('too long');f.controller.dispose();});
 it.each(['pause voice','Stop listening.','Please end voice'])('handles the local audio control %s without canceling a job',async text=>{const f=fixture();await f.controller.start();f.listens[0].events.text(text,true);expect(f.request).not.toHaveBeenCalled();expect(f.controller.snapshot().phase).toBe('paused');f.controller.dispose();});
 it('keeps job controls in the shared Agent instead of treating them as audio controls',async()=>{const f=fixture();await f.controller.start();f.listens[0].events.text('Pause S1234567890ABCDEF',true);await flush();expect(f.request).toHaveBeenCalledExactlyOnceWith('Pause S1234567890ABCDEF');f.controller.dispose();});
 it('stops at twenty turns and resets only on a new explicit start',async()=>{const f=fixture();await f.controller.start();for(let i=0;i<20;i++){f.listens[i].events.text(`Question ${i}`,true);await flush();f.speech[i].done();await flush();}expect(f.listens).toHaveLength(20);expect(f.controller.snapshot().phase).toBe('paused');await f.controller.start();expect(f.listens).toHaveLength(21);f.controller.dispose();});
 it('retains the complete answer while disclosing abbreviated spoken playback',async()=>{const answer='A detailed answer. '.repeat(200),f=fixture(vi.fn(async()=>result(answer)));await f.controller.start();f.listens[0].events.text('Explain the analysis',true);await flush();expect(f.controller.snapshot().answer).toBe(answer);expect(f.speech[0].text.length).toBeLessThan(1800);expect(f.speech[0].text).toContain('full answer is saved');f.controller.dispose();});
 it('stops audio on disposal and never reveals late output or recognition',async()=>{let resolve!:(v:ToolResult)=>void;const f=fixture(vi.fn(()=>new Promise<ToolResult>(done=>{resolve=done;})));await f.controller.start();f.listens[0].events.text('Private question',true);f.controller.dispose();const count=f.views.length;resolve(result('Private answer'));await flush();f.listens[0].events.text('Late question',true);expect(f.views).toHaveLength(count);expect(f.speech).toHaveLength(0);expect(f.request).toHaveBeenCalledOnce();});
 it('renders links and code as references instead of reading markup aloud',()=>{expect(spokenAnswer('**Saved** [result](https://example.test)\n```code```')).toBe('Saved result\n Code is available in the saved answer.');});
});
