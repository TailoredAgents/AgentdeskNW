import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {VoiceConversation,type SpeechEvents} from '../src/lib/voice-conversation';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {chat} from '../src/server/orchestrator';
import {messagingConversation} from '../src/server/messaging';
import {getConversation,listTasks} from '../src/server/services';
import {listAssignmentReviews,getAssignmentReview} from '../src/server/assignment-reviews';
import {processApprovedTextRequests} from '../src/server/text-worker';
import {getAssignmentBinding} from '../src/server/assignment-roots';
import {getChatRequest} from '../src/server/chat-requests';

let sequence=0;const key=()=>`spoken-shared-${++sequence}`;
beforeEach(()=>{closeDb();sequence=0;for(const [name,value] of Object.entries({AGENTDESK_DB_PATH:':memory:',AGENTDESK_DEMO:'true',AGENTDESK_ALLOW_PRODUCTION_DEMO:'true',OPENAI_API_KEY:'mock-not-sent',OPENAI_MODEL:'gpt-6-astra',AGENTDESK_TEXT_SPENDING_MODE:'admitted_demo',AGENTDESK_TEXT_MAX_ROUNDS:'2',AGENTDESK_TEXT_MAX_INPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_OUTPUT_TOKENS:'512',AGENTDESK_TEXT_MAX_CONTEXT_BYTES:'300000'}))vi.stubEnv(name,value);vi.stubEnv('AGENTDESK_TEXT_CUSTOMER_TARIFFS',JSON.stringify([{model:'gpt-6-astra',serviceTier:'default',source:'Fictional spoken request tariff',validFrom:'2020-01-01T00:00:00Z',validUntil:'2040-01-01T00:00:00Z',customerNanosPerUnit:{input_tokens:1000000,cached_input_tokens:0,output_tokens:1000000}}]));});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(channel:'web'|'mobile'='mobile'){
 const actor=demoActor(),conversationId=messagingConversation(actor),requests:string[]=[];let events!:SpeechEvents,spokenDone=()=>{};
 const request=vi.fn(async(text:string)=>{const requestId=key();requests.push(requestId);const response=await chat(actor,text,conversationId,requestId,channel);return response.result;});
 const loop=new VoiceConversation({listen:async(next)=>{events=next;next.started();return ()=>{};},speak:(_text,done)=>{spokenDone=done;return ()=>{};},request,changed:()=>{}});
 return {actor,conversationId,requests,request,loop,say:async(text:string)=>{await loop.start();events.text(text,true);await flush();},done:async()=>{spokenDone();await flush();}};
}
describe('spoken turns use the real shared Copilot host',()=>{
 it.each(['web','mobile'] as const)('holds the entire %s spoken job above $1 and continues only its exact reviewed original request',async channel=>{
  const fetcher=vi.fn(async(url:unknown)=>new Response(JSON.stringify(String(url).endsWith('/input_tokens')?{object:'response.input_tokens',input_tokens:40}:{id:key(),model:'gpt-6-astra',service_tier:'default',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'The fictional analysis is saved.'}]}],usage:{input_tokens:20,output_tokens:10}})));vi.stubGlobal('fetch',fetcher);
  const f=setup(channel);await f.say('Explain the current fictional repair evidence.');await vi.waitFor(()=>expect(f.loop.snapshot().phase).toBe('speaking'));expect(fetcher).not.toHaveBeenCalled();expect(listAssignmentReviews(f.actor)[0]).toMatchObject({canDecide:true,maximumCents:205});await f.done();expect(f.loop.snapshot().phase).toBe('paused');
  const original=f.requests[0],root=getAssignmentBinding(f.actor,{kind:'turn',id:original}),review=listAssignmentReviews(f.actor)[0];await f.say(`Review spending ${review.conversationReference}`);await vi.waitFor(()=>expect(f.loop.snapshot().phase).toBe('speaking'));const code=f.loop.snapshot().answer.match(/Approve (R[0-9A-F]{16})/)?.[1];expect(code).toBeTruthy();await f.done();
  await f.say(`Approve ${code}`);expect(f.loop.snapshot().phase).toBe('review');expect(getAssignmentReview(f.actor,review.id).canDecide).toBe(true);expect(fetcher).not.toHaveBeenCalled();f.loop.confirm(f.loop.snapshot().reviewText);await vi.waitFor(()=>expect(getAssignmentReview(f.actor,review.id).state).toBe('ready'));
  await processApprovedTextRequests(f.actor);expect(getAssignmentBinding(f.actor,{kind:'turn',id:original})).toEqual(root);expect(getConversation(f.actor,f.conversationId).messages.at(-1)?.content).toBe('The fictional analysis is saved.');expect(getAssignmentReview(f.actor,review.id)).toMatchObject({spentCents:3,heldCents:0});expect(fetcher).toHaveBeenCalledTimes(2);expect(getDb().prepare('SELECT count(*) n FROM voice_sessions').get()).toEqual({n:0});f.loop.dispose();
 });
 it('lets a spoken control stop the same job created in a typed channel without another model call',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const f=setup();await chat(f.actor,'Explain the fictional property evidence.',f.conversationId,key(),'web');const review=listAssignmentReviews(f.actor)[0];await f.say(`Pause ${review.conversationReference}`);await vi.waitFor(()=>expect(f.loop.snapshot().phase).toBe('speaking'));expect(getAssignmentReview(f.actor,review.id)).toMatchObject({executionState:'paused',canContinue:true});expect(fetcher).not.toHaveBeenCalled();f.loop.dispose();
 });
 it('saves actual fictional task effects once and exposes the same result through read-only reconciliation',async()=>{
  vi.stubEnv('OPENAI_API_KEY','');const f=setup();await f.say('Create a task to ask Alex for the current repair estimate');await vi.waitFor(()=>expect(f.loop.snapshot().phase).toBe('speaking'));expect(listTasks(f.actor).some(t=>t.title.toLowerCase().includes('alex'))).toBe(true);
  const saved=getChatRequest(f.actor,f.conversationId,f.requests[0]);expect(saved.status).toBe('completed');expect(saved.conversation.messages.at(-1)?.content).toBe(f.loop.snapshot().answer);expect(()=>getChatRequest(demoActor('manager'),f.conversationId,f.requests[0])).toThrow();f.loop.dispose();
 });
});
