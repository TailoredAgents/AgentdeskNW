import { grantLegacyTestWorkforce } from './fixtures';
import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest';
import { NextRequest,NextResponse } from 'next/server';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb,getDb } from '../src/server/db';
import * as services from '../src/server/services';
import { chat,dispatchTool,toolDefinitions } from '../src/server/orchestrator';
import { assertLocalDemo,getActor,setSession } from '../src/server/auth';
import { createVoiceSession,executeVoiceTool,saveVoiceTranscript,endVoiceSession } from '../src/server/voice';
import { listDebriefs } from '../src/server/debrief';
import { getInvestorIntelligence } from '../src/server/intelligence';

beforeEach(()=>{closeDb();process.env.AGENTDESK_DB_PATH=':memory:';delete process.env.OPENAI_API_KEY;process.env.AGENTDESK_DEMO='true';process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO='true';grantLegacyTestWorkforce();});
afterEach(()=>{closeDb();vi.unstubAllGlobals();});
describe('manager and tools',()=>{
 it('registers strict tool schemas without any approval or external send tool',()=>{
   const tools=toolDefinitions();expect(tools.length).toBeGreaterThan(8);expect(tools.every(t=>t.strict&&t.parameters.additionalProperties===false)).toBe(true);expect(tools.map(t=>t.name).join(' ')).not.toMatch(/approve|execute_action|send_email/);
   for(const tool of tools){const properties=Object.keys(tool.parameters.properties as object);expect(tool.parameters.required??[]).toEqual(properties);}
 });
 it('routes a calling queue and pre-call briefing to the same scoped services',async()=>{
   const actor=services.demoActor();const queue=await chat(actor,'Who should I call today?');expect(queue.result.artifacts[0].type).toBe('calling_queue');expect(queue.result.message).toContain('Mike');expect(queue.result.message).not.toContain('Jordan private');
   const brief=await chat(actor,'Get me ready to call Mike',queue.conversation.id);expect(brief.result.artifacts[0].type).toBe('briefing');expect(brief.result.message).toContain('Disclosure: signed');expect(brief.conversation.messages).toHaveLength(4);
 });
 it('captures a personal-phone recap without applying criteria or silently creating follow-ups',async()=>{
   const actor=services.demoActor();const before=getInvestorIntelligence(actor,'investor-mike');const tasks=services.listTasks(actor).length;
   const response=await chat(actor,'I just talked to Mike. He wants cosmetic flips in Cobb County under $250k, using cash. I will call him tomorrow.');
   expect(response.result.artifacts[0].type).toBe('debrief');expect(listDebriefs(actor)).toHaveLength(1);expect(getInvestorIntelligence(actor,'investor-mike').buyBoxes).toEqual(before.buyBoxes);expect(services.listTasks(actor)).toHaveLength(tasks);
 });
 it('requires exact package context and never offers a model handoff or approval tool',async()=>{
   const actor=services.demoActor();const response=await chat(actor,'Send property details and photos to Mike');expect(response.result.message).toContain('exact property release');
   await expect(dispatchTool(actor,'handoff_package',{id:'fake'})).rejects.toThrow('Unknown');expect(toolDefinitions().some(tool=>!['handoff_overview','prepare_handoff_action'].includes(tool.name)&&/handoff|approve|send_/.test(tool.name))).toBe(false);
 });
 it('dispatches real services, persists a conversation, and retrieves actual work',async()=>{
   const actor=services.demoActor();const first=await chat(actor,'What should I focus on today?');expect(first.conversation.messages).toHaveLength(2);expect(first.result.specialistIds).toContain('daily-coordinator');expect(first.result.message).toContain('Confirm Mike’s purchase timeline');expect(first.result.artifacts[0].type).toBe('task');
   const second=await chat(actor,'What should I do next with Mike?',first.conversation.id);expect(second.conversation.messages).toHaveLength(4);expect(second.result.message).toContain('purchase timeline');
 });
 it('recovers conversations and queued work after closing and reopening the database',async()=>{
   const directory=mkdtempSync(join(tmpdir(),'agentdesk-persistence-'));closeDb();process.env.AGENTDESK_DB_PATH=join(directory,'workspace.sqlite');
   try{const actor=services.demoActor();grantLegacyTestWorkforce();const conversation=services.createConversation(actor,'Durability check');services.addMessage(actor,conversation.id,{role:'user',content:'Resume this work after restart.'});const job=services.createResearchJob(actor,{address:'123 Example Street',county:'Cobb',price:235000,strategy:'Fix & flip',limit:10});closeDb();expect(services.getConversation(actor,conversation.id).messages[0].content).toContain('after restart');expect(services.getResearchJob(actor,job.id).status).toBe('queued');}
   finally{closeDb();rmSync(directory,{recursive:true,force:true});}
 });
 it('requires declared tool names, valid parameters, and authorized roles',async()=>{
   const actor=services.demoActor('acquisitions');await expect(dispatchTool(actor,'research_investors',{address:'123 Example Street',county:'Cobb',price:235000,strategy:'Fix & flip',limit:10})).rejects.toThrow('role');
   await expect(dispatchTool(actor,'approve_action',{id:'fake'})).rejects.toThrow('Unknown');await expect(dispatchTool(actor,'__proto__',{})).rejects.toThrow('Unknown');await expect(dispatchTool(actor,'create_task',{title:'x',dueAt:null,investorId:null})).rejects.toThrow();
 });
 it('does not create guessed research or silently schedule ambiguous offline dates',async()=>{
   const actor=services.demoActor();await chat(actor,'Find 100 new investors for an unknown house');expect(services.listJobs(actor)).toHaveLength(0);
   const taskCount=services.listTasks(actor).length;const response=await chat(actor,'Remind me to call Mike tomorrow morning');expect(response.result.message).toContain('haven’t created');expect(services.listTasks(actor)).toHaveLength(taskCount);
 });
 it('uses model function calls and then supplies verified outputs to the model',async()=>{
   process.env.OPENAI_API_KEY='test-key-not-real';const mocked=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:crypto.randomUUID(),model:'gpt-6-astra',service_tier:'default',status:'completed',output:[{type:'function_call',name:'create_task',arguments:JSON.stringify({title:'Review call notes',dueAt:null,investorId:null}),call_id:'call-1'}],usage:{input_tokens:20,output_tokens:10}}))).mockResolvedValueOnce(new Response(JSON.stringify({id:crypto.randomUUID(),model:'gpt-6-astra',service_tier:'default',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Your review task is saved.'}]}],usage:{input_tokens:25,output_tokens:8}})));vi.stubGlobal('fetch',mocked);
   const actor=services.demoActor();const response=await chat(actor,'Create a task to review call notes');expect(services.listTasks(actor).some(t=>t.title==='Review call notes')).toBe(true);expect(response.result.artifacts[0].type).toBe('task');expect(mocked).toHaveBeenCalledTimes(2);
   const second=JSON.parse(mocked.mock.calls[1][1].body as string);expect(second.input.find((i:{type?:string})=>i.type==='function_call_output').output).toContain('Created your task');expect(second.store).toBe(false);
 });
 it('preserves completed work and reports a provider failure without replaying it',async()=>{
   process.env.OPENAI_API_KEY='test-key-not-real';const mocked=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:crypto.randomUUID(),model:'gpt-6-astra',service_tier:'default',status:'completed',output:[{type:'function_call',name:'create_task',arguments:JSON.stringify({title:'Saved before interruption',dueAt:null,investorId:null}),call_id:'call-2'}],usage:{input_tokens:20,output_tokens:10}}))).mockRejectedValueOnce(new Error('Network down'));vi.stubGlobal('fetch',mocked);
   const actor=services.demoActor();const result=await chat(actor,'Save a reminder');expect(result.result.message).toContain('connection failed');expect(result.result.artifacts).toHaveLength(1);expect(services.listTasks(actor).filter(t=>t.title==='Saved before interruption')).toHaveLength(1);
 });
});
describe('voice integration contract with mocked provider',()=>{
 it('fails honestly without credentials and keeps long-lived secrets on the server',async()=>{
   await expect(createVoiceSession(services.demoActor())).rejects.toThrow('API key');
   process.env.OPENAI_API_KEY='server-key-test';const mocked=vi.fn().mockResolvedValue(new Response(JSON.stringify({value:'ephemeral-test',expires_at:123})));vi.stubGlobal('fetch',mocked);
   const session=await createVoiceSession(services.demoActor());expect(session.value).toBe('ephemeral-test');expect(JSON.stringify(session)).not.toContain('server-key-test');expect(mocked.mock.calls[0][0]).toContain('/realtime/client_secrets');
   const config=JSON.parse(mocked.mock.calls[0][1].body as string);expect(config.expires_after.seconds).toBe(60);expect(config.session.audio.input.turn_detection.interrupt_response).toBe(true);
 });
 it('isolates sessions, deduplicates tools/transcripts, and records duration only once',async()=>{
   process.env.OPENAI_API_KEY='server-key-test';vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({value:'ephemeral-test'}))));
   const actor=services.demoActor();const session=await createVoiceSession(actor);const args={title:'Voice review task',dueAt:null,investorId:null};
   await executeVoiceTool(actor,session.voiceSessionId,'call-1','create_task',args);await executeVoiceTool(actor,session.voiceSessionId,'call-1','create_task',args);expect(services.listTasks(actor).filter(t=>t.title==='Voice review task')).toHaveLength(1);
   await expect(executeVoiceTool(services.demoActor('manager'),session.voiceSessionId,'call-2','daily_priorities',{})).rejects.toThrow('not found');
   saveVoiceTranscript(actor,session.voiceSessionId,'event-1','user','Please review my saved work.');saveVoiceTranscript(actor,session.voiceSessionId,'event-1','user','Please review my saved work.');expect(services.getConversation(actor,session.conversationId).messages.filter(m=>m.content.includes('[Voice transcript]'))).toHaveLength(1);
   expect(()=>saveVoiceTranscript(actor,session.voiceSessionId,'event-too-large','user','x'.repeat(51000))).toThrow();expect(getDb().prepare('SELECT 1 FROM voice_events WHERE event_id=?').get('event-too-large')).toBeUndefined();
   endVoiceSession(actor,session.voiceSessionId);endVoiceSession(actor,session.voiceSessionId);expect((getDb().prepare("SELECT COUNT(*) AS n FROM usage_events WHERE kind='voice_elapsed_seconds_estimate'").get() as {n:number}).n).toBe(1);
   await expect(executeVoiceTool(actor,session.voiceSessionId,'call-3','daily_priorities',{})).rejects.toThrow('ended');
 });
});
describe('local-only authentication',()=>{
 it('signs sessions and rejects forged cookies',()=>{
   const response=NextResponse.json({});setSession(response,'manager');const cookie=response.headers.get('set-cookie')!.split(';')[0];const request=new NextRequest('http://127.0.0.1:3000/api/bootstrap',{headers:{host:'127.0.0.1:3000',cookie}});expect(getActor(request)?.role).toBe('manager');
   const forged=new NextRequest('http://127.0.0.1:3000/api/bootstrap',{headers:{host:'127.0.0.1:3000',cookie:`${cookie}x`}});expect(getActor(forged)).toBeNull();
 });
 it('rejects remote hosts, cross-origin requests and writes without request protection',()=>{
   expect(()=>assertLocalDemo(new NextRequest('http://example.com/api/bootstrap',{headers:{host:'example.com'}}))).toThrow('local demo');
   expect(()=>assertLocalDemo(new NextRequest('http://localhost:3000/api/tasks',{method:'POST',headers:{host:'localhost:3000',origin:'https://evil.example','x-agentdesk-request':'1'}}))).toThrow('Cross-origin');
   expect(()=>assertLocalDemo(new NextRequest('http://localhost:3000/api/tasks',{method:'POST',headers:{host:'localhost:3000'}}))).toThrow('verification');
 });
});
