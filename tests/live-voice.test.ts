import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../src/server/db';
import * as service from '../src/server/services';
import { grantLegacyTestWorkforce } from './fixtures';
import { createVoiceSession, connectVoiceSession, endVoiceSession, getVoiceStatus, resetVoiceRuntimeForTests } from '../src/server/voice';
import { realtimeUsage } from '../src/server/voice-usage';
import { providerOperations } from '../src/server/provider-runtime';
import { usageBalances } from '../src/server/metering';
import { simulateLifecycle, subscription } from '../src/server/billing';
import { recordDemoDisclosure, DISCLOSURE_VERSION } from '../src/server/intelligence';
import { saveTemplate } from '../src/server/workflows';

interface FakeSocket {url:string;options:{headers:{Authorization:string}};readyState:number;send:ReturnType<typeof vi.fn>;emit:(name:string,value?:unknown)=>void;close:()=>void;terminate:()=>void}
const sockets=vi.hoisted(()=>({instances:[] as FakeSocket[]}));
vi.mock('ws',async()=>{
  const {EventEmitter}=await import('node:events');
  class MockSocket extends EventEmitter {
    static OPEN=1;readyState=1;send=vi.fn();
    constructor(public url:string,public options:{headers:{Authorization:string}}){super();sockets.instances.push(this);queueMicrotask(()=>this.emit('open'));}
    close(){this.readyState=3;this.emit('close');}
    terminate(){this.close();}
  }
  return {default:MockSocket};
});
const offer='v=0\r\no=agentdesk-offer';
let actor:ReturnType<typeof service.demoActor>;
let fetchMock:ReturnType<typeof vi.fn>;
const voiceBalance=()=>usageBalances(actor).find(item=>item.category==='voice_minutes')!;
async function drain(){await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));}
async function connected(){const prepared=await createVoiceSession(actor);await connectVoiceSession(actor,prepared.voiceSessionId,offer);return prepared;}
function emit(event:unknown){sockets.instances.at(-1)!.emit('message',Buffer.from(JSON.stringify(event)));}
beforeEach(()=>{
  resetVoiceRuntimeForTests();closeDb();process.env.AGENTDESK_DB_PATH=':memory:';
  vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','server-only-test-key');vi.stubEnv('AGENTDESK_VOICE_MAX_SECONDS','600');
  grantLegacyTestWorkforce();actor=service.demoActor();sockets.instances=[];
  fetchMock=vi.fn(async(url:string)=>url.endsWith('/client_secrets')?new Response(JSON.stringify({value:'short-lived-test-secret'})):url.endsWith('/calls')?new Response('v=0\r\no=provider-answer',{headers:{Location:'/v1/realtime/calls/rtc_trusted123'}}):new Response(null,{status:200}));vi.stubGlobal('fetch',fetchMock);
});
afterEach(async()=>{resetVoiceRuntimeForTests();await drain();closeDb();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});

describe('trusted Realtime voice boundary',()=>{
  it('does not contact a provider or reserve usage when no API key exists',async()=>{
    vi.stubEnv('OPENAI_API_KEY','');await expect(createVoiceSession(actor)).rejects.toThrow('API key');expect(fetchMock).not.toHaveBeenCalled();expect(voiceBalance().reserved).toBe(0);
  });
  it('mints a short-lived credential but persists neither credential nor audio',async()=>{
    const prepared=await createVoiceSession(actor);const request=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.expires_after.seconds).toBe(60);expect(request.session.audio.input.turn_detection).toMatchObject({interrupt_response:true,create_response:true});
    expect(voiceBalance()).toMatchObject({reserved:10,consumed:0});
    expect(JSON.stringify(getDb().prepare('SELECT * FROM voice_live_sessions').all())).not.toMatch(/short-lived-test-secret|server-only-test-key/);
    expect(service.getConversation(actor,prepared.conversationId).messages).toHaveLength(0);
    await expect(createVoiceSession(actor)).rejects.toThrow('already have');
    endVoiceSession(actor,prepared.voiceSessionId);endVoiceSession(actor,prepared.voiceSessionId);expect(voiceBalance()).toMatchObject({reserved:0,consumed:0});
  });
  it('uses a trusted provider call ID, ephemeral SDP authentication and server-only sideband authentication',async()=>{
    const prepared=await connected();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer short-lived-test-secret');
    expect(sockets.instances[0].url).toBe('wss://api.openai.com/v1/realtime?call_id=rtc_trusted123');
    expect(sockets.instances[0].options.headers.Authorization).toBe('Bearer server-only-test-key');
    expect(getVoiceStatus(actor,prepared.voiceSessionId).status).toBe('connected');
    await expect(connectVoiceSession(actor,prepared.voiceSessionId,offer)).rejects.toThrow('already been attempted');
    endVoiceSession(actor,prepared.voiceSessionId);await drain();expect(fetchMock.mock.calls.some(call=>String(call[0]).endsWith('/rtc_trusted123/hangup'))).toBe(true);
  });
  it('isolates connection, status, and termination by owner and office',async()=>{
    const prepared=await createVoiceSession(actor);const other=service.demoActor('manager');
    await expect(connectVoiceSession(other,prepared.voiceSessionId,offer)).rejects.toThrow('not found');
    expect(()=>getVoiceStatus(other,prepared.voiceSessionId)).toThrow('not found');expect(()=>endVoiceSession(other,prepared.voiceSessionId)).toThrow('not found');
  });
  it('executes authenticated sideband tools once and persists only trusted transcripts and usage',async()=>{
    const prepared=await connected();const response={type:'response.done',response:{id:'resp_tools',status:'completed',usage:{input_tokens:20,output_tokens:7,input_token_details:{audio_tokens:12,text_tokens:8},output_token_details:{audio_tokens:5,text_tokens:2}},output:[{type:'function_call',call_id:'call_create',name:'create_task',arguments:JSON.stringify({title:'Voice saved task',dueAt:null,investorId:null})}]}};
    emit(response);emit(response);emit({type:'conversation.item.input_audio_transcription.completed',event_id:'event_one',item_id:'item_one',transcript:'Save my task.',usage:{type:'duration',seconds:1.75}});emit({type:'conversation.item.input_audio_transcription.completed',event_id:'event_repeat',item_id:'item_one',transcript:'Save my task.',usage:{type:'duration',seconds:1.75}});await drain();
    expect(service.listTasks(actor).filter(item=>item.title==='Voice saved task')).toHaveLength(1);
    expect(service.getConversation(actor,prepared.conversationId).messages.filter(item=>item.content.includes('[Voice transcript]'))).toHaveLength(1);
    expect(sockets.instances[0].send.mock.calls.filter(call=>JSON.parse(call[0]).type==='response.create')).toHaveLength(1);
    const receipts=providerOperations(actor);expect(receipts.find(item=>item.kind==='voice_response')?.usage).toMatchObject({input_tokens:20,output_tokens:7,input_audio_tokens:12,output_audio_tokens:5});
    expect(receipts.find(item=>item.kind==='voice_transcription')?.usage).toEqual({transcription_audio_seconds:1.75});expect(voiceBalance()).toMatchObject({reserved:10,consumed:0});
  });
  it('does not execute interrupted function calls or infer minutes from audio tokens',async()=>{
    const prepared=await connected();emit({type:'response.done',response:{id:'resp_canceled',status:'cancelled',usage:{input_tokens:20,output_tokens:3,output_token_details:{audio_tokens:3}},output:[{type:'function_call',call_id:'call_cancel',name:'create_task',arguments:JSON.stringify({title:'Must not be saved',dueAt:null,investorId:null})}]}});await drain();
    expect(service.listTasks(actor).some(item=>item.title==='Must not be saved')).toBe(false);expect(providerOperations(actor).find(item=>item.kind==='voice_response')?.status).toBe('canceled');
    endVoiceSession(actor,prepared.voiceSessionId);await drain();expect(getVoiceStatus(actor,prepared.voiceSessionId).metering).toBe('reconciliation_required');expect(voiceBalance()).toMatchObject({reserved:10,consumed:0});
    expect(providerOperations(actor).every(item=>item.actualCostCents===null)).toBe(true);
  });
  it('retains an unknown receipt rather than fabricating zero usage',async()=>{
    await connected();emit({type:'response.done',response:{id:'resp_missing_usage',status:'completed',output:[]}});await drain();
    expect(providerOperations(actor).find(item=>item.kind==='voice_response')).toMatchObject({status:'unknown',usage:{},errorCode:'usage_missing'});
    expect(realtimeUsage({input_tokens:-1,output_tokens:Infinity})).toBeNull();
  });
  it('releases failed setup and unconnected reservations but retains uncertain connection holds',async()=>{
    fetchMock.mockResolvedValueOnce(new Response(null,{status:401}));await expect(createVoiceSession(actor)).rejects.toThrow('401');expect(voiceBalance().reserved).toBe(0);
    const prepared=await createVoiceSession(actor);fetchMock.mockRejectedValueOnce(new Error('Network interrupted after request'));await expect(connectVoiceSession(actor,prepared.voiceSessionId,offer)).rejects.toThrow('connection failed');
    expect(getVoiceStatus(actor,prepared.voiceSessionId)).toMatchObject({status:'failed',metering:'reconciliation_required'});expect(voiceBalance().reserved).toBe(10);
  });
  it('records late trusted receipts after subscription cancellation and blocks further tools',async()=>{
    const prepared=await connected();simulateLifecycle(actor,{action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:'voice-cancel'});
    emit({type:'response.done',response:{id:'resp_late',status:'completed',usage:{input_tokens:12,output_tokens:2},output:[{type:'function_call',call_id:'call_late',name:'create_task',arguments:JSON.stringify({title:'Blocked after cancellation',dueAt:null,investorId:null})}]}});await drain();
    expect(providerOperations(actor).find(item=>item.kind==='voice_response')?.usage).toMatchObject({input_tokens:12,output_tokens:2});expect(service.listTasks(actor).some(item=>item.title==='Blocked after cancellation')).toBe(false);expect(getVoiceStatus(actor,prepared.voiceSessionId).status).toBe('failed');
  });
  it('terminates remotely at the configured cap and preserves saved conversation on reconnect',async()=>{
    vi.stubEnv('AGENTDESK_VOICE_MAX_SECONDS','60');const prepared=await connected();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(Date.now()+61_000));
    expect(getVoiceStatus(actor,prepared.voiceSessionId)).toMatchObject({status:'ended',metering:'reconciliation_required'});await drain();
    const next=await createVoiceSession(actor,prepared.conversationId);expect(next.conversationId).toBe(prepared.conversationId);
  });
  it('ends when disclosure eligibility changes even though investor ownership is unchanged',async()=>{
    const prepared=await connected();recordDemoDisclosure(service.demoActor('manager'),'investor-mike',{status:'declined',version:DISCLOSURE_VERSION,documentRef:null});
    emit({type:'response.output_audio_transcript.done',item_id:'stale_transcript',transcript:'This stale property detail must not be saved.'});await drain();
    expect(getVoiceStatus(actor,prepared.voiceSessionId).status).toBe('failed');expect(service.getConversation(actor,prepared.conversationId).messages.some(item=>item.content.includes('stale property detail'))).toBe(false);
  });
  it('refreshes sensitive template state without interrupting ordinary task updates',async()=>{
    const manager=service.demoActor('manager');const template=saveTemplate(manager,{name:'Voice test template',channel:'email',intro:'A property for your review.',closing:'Please reply with questions.',approved:true});
    const prepared=await connected();service.createTask(actor,{title:'Normal work should not end voice'});expect(getVoiceStatus(actor,prepared.voiceSessionId).status).toBe('connected');
    saveTemplate(manager,{id:template.id,name:template.name,channel:template.channel,intro:template.intro,closing:template.closing,approved:false});
    expect(getVoiceStatus(actor,prepared.voiceSessionId)).toMatchObject({status:'ended',reason:expect.stringContaining('Protected workspace')});
  });
  it('caps tool chains per response and across the entire session',async()=>{
    vi.stubEnv('AGENTDESK_VOICE_MAX_TOOL_CALLS','1');const prepared=await connected();const output=(call:string,title:string)=>({type:'function_call',call_id:call,name:'create_task',arguments:JSON.stringify({title,dueAt:null,investorId:null})});
    emit({type:'response.done',response:{id:'resp_budget_one',status:'completed',usage:{input_tokens:3,output_tokens:1},output:[output('first','Allowed action')]}});await drain();
    emit({type:'response.done',response:{id:'resp_budget_two',status:'completed',usage:{input_tokens:3,output_tokens:1},output:[output('second','Blocked action')]}});await drain();
    expect(service.listTasks(actor).some(item=>item.title==='Allowed action')).toBe(true);expect(service.listTasks(actor).some(item=>item.title==='Blocked action')).toBe(false);expect(getVoiceStatus(actor,prepared.voiceSessionId).reason).toContain('action limit');
    vi.stubEnv('AGENTDESK_VOICE_MAX_TOOL_CALLS','32');const next=await connected();emit({type:'response.done',response:{id:'resp_too_many',status:'completed',usage:{input_tokens:3,output_tokens:1},output:Array.from({length:5},(_,index)=>output(`batch_${index}`,`Overfull batch ${index}`))}});await drain();
    expect(service.listTasks(actor).some(item=>item.title.startsWith('Overfull batch'))).toBe(false);expect(getVoiceStatus(actor,next.voiceSessionId).status).toBe('ended');
  });
  it('expires unused credentials and rejects a provider answer without a trusted call ID',async()=>{
    const prepared=await createVoiceSession(actor);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(Date.now()+61_000));expect(getVoiceStatus(actor,prepared.voiceSessionId)).toMatchObject({status:'ended',metering:'released'});expect(voiceBalance().reserved).toBe(0);vi.useRealTimers();
    const next=await createVoiceSession(actor);fetchMock.mockResolvedValueOnce(new Response('v=0\r\no=answer-without-location'));await expect(connectVoiceSession(actor,next.voiceSessionId,offer)).rejects.toThrow('trusted call identifier');expect(sockets.instances).toHaveLength(0);expect(getVoiceStatus(actor,next.voiceSessionId).metering).toBe('reconciliation_required');
  });
  it('hangs up a late provider connection after the user already ended setup',async()=>{
    const prepared=await createVoiceSession(actor);let release:(value:Response)=>void=()=>{};fetchMock.mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve;}));
    const pending=connectVoiceSession(actor,prepared.voiceSessionId,offer);endVoiceSession(actor,prepared.voiceSessionId);release(new Response('v=0\r\no=late-answer',{headers:{Location:'/v1/realtime/calls/rtc_late'}}));await expect(pending).rejects.toThrow('ended during connection');await drain();
    expect(getVoiceStatus(actor,prepared.voiceSessionId)).toMatchObject({status:'ended',hangup:'confirmed'});expect(fetchMock.mock.calls.filter(call=>String(call[0]).endsWith('/rtc_late/hangup'))).toHaveLength(1);expect(sockets.instances).toHaveLength(0);
  });
});
