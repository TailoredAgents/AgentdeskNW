import { createHash } from 'node:crypto';
import type { Actor, ToolResult } from '@/lib/contracts';
import { getDb,newId,now,audit } from './db';
import * as service from './services';
import { assistantInstructions,dispatchTool,toolDefinitions } from './orchestrator';

interface VoiceSession { id:string;organization_id:string;office_id:string;user_id:string;conversation_id:string;started_at:string;ended_at:string|null }
function voiceSession(actor:Actor,id:string,allowEnded=false):VoiceSession{
  service.assertActor(actor);
  const session=getDb().prepare('SELECT * FROM voice_sessions WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as VoiceSession|undefined;
  if(!session)throw new service.AppError(404,'Voice session not found.');
  if(!allowEnded&&(session.ended_at||Date.now()-Date.parse(session.started_at)>10*60_000))throw new service.AppError(410,'This voice session has ended. Start a new session.');
  service.getConversation(actor,session.conversation_id);
  return session;
}

export async function createVoiceSession(actor:Actor,conversationId?:string){
  if(!process.env.OPENAI_API_KEY)throw new service.AppError(503,'Live voice needs a server-side OpenAI API key. Configure OPENAI_API_KEY and restart the app.');
  const conversation=conversationId?service.getConversation(actor,conversationId):service.createConversation(actor,'Voice conversation');
  const context=service.getBootstrap(actor);
  const instructions=`${assistantInstructions(actor)}\nSpeak naturally and briefly. Use tools for all work and status checks. Never say a task was saved until its tool succeeds. Ask permission to start new tasks when the user has not requested them. Authorized context: ${JSON.stringify({investors:context.investors,properties:context.properties,tasks:context.tasks,history:conversation.messages.slice(-12)})}`;
  const response=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json','OpenAI-Safety-Identifier':createHash('sha256').update(`${actor.organizationId}:${actor.id}`).digest('hex')},body:JSON.stringify({expires_after:{anchor:'created_at',seconds:60},session:{type:'realtime',model:process.env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1',instructions,tools:toolDefinitions().map(tool=>({type:tool.type,name:tool.name,description:tool.description,parameters:tool.parameters})),tool_choice:'auto',audio:{input:{transcription:{model:'gpt-4o-mini-transcribe'},turn_detection:{type:'server_vad',interrupt_response:true,create_response:true}},output:{voice:'marin'}}}}),signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new service.AppError(502,`Voice provider could not start a session (${response.status}). Check your key and Realtime model access.`);
  const data=await response.json() as {value?:string;expires_at?:number};
  if(!data.value)throw new service.AppError(502,'Voice provider returned an invalid session credential.');
  const id=newId('voice');getDb().prepare('INSERT INTO voice_sessions VALUES(?,?,?,?,?,?,NULL)').run(id,actor.organizationId,actor.officeId,actor.id,conversation.id,now());
  service.recordUsage(actor,'voice_sessions_started',1);audit(actor,'voice.started',id);
  return {value:data.value,expiresAt:data.expires_at,voiceSessionId:id,conversationId:conversation.id,maxSeconds:600};
}

export async function executeVoiceTool(actor:Actor,sessionId:string,callId:string,name:string,args:unknown):Promise<ToolResult>{
  const session=voiceSession(actor,sessionId);
  const prior=getDb().prepare('SELECT status,result FROM voice_calls WHERE session_id=? AND call_id=?').get(sessionId,callId) as {status:string;result:string|null}|undefined;
  if(prior){if(prior.result)return JSON.parse(prior.result) as ToolResult;throw new service.AppError(409,'This voice tool call is already processing.');}
  getDb().prepare('INSERT INTO voice_calls VALUES(?,?,?,NULL)').run(sessionId,callId,'running');
  try{
    const result=await dispatchTool(actor,name,args);
    getDb().prepare('UPDATE voice_calls SET status=?,result=? WHERE session_id=? AND call_id=?').run('completed',JSON.stringify(result),sessionId,callId);
    service.addMessage(actor,session.conversation_id,{role:'assistant',content:`Voice tool result: ${result.message}`,specialistIds:result.specialistIds,artifacts:result.artifacts});
    return result;
  }catch(error){
    const result:ToolResult={specialistIds:[],message:error instanceof service.AppError?error.message:'The voice tool could not complete the request.',artifacts:[],data:{completed:false}};
    getDb().prepare('UPDATE voice_calls SET status=?,result=? WHERE session_id=? AND call_id=?').run('failed',JSON.stringify(result),sessionId,callId);
    return result;
  }
}

export function saveVoiceTranscript(actor:Actor,sessionId:string,eventId:string,role:'user'|'assistant',text:string){
  const session=voiceSession(actor,sessionId);
  getDb().transaction(()=>{
    const insert=getDb().prepare('INSERT OR IGNORE INTO voice_events VALUES(?,?)').run(sessionId,eventId);
    if(insert.changes)service.addMessage(actor,session.conversation_id,{role,content:`[Voice transcript] ${text}`});
  })();
  return {saved:true};
}

export function endVoiceSession(actor:Actor,sessionId:string){
  const session=voiceSession(actor,sessionId,true);
  if(!session.ended_at){
    getDb().transaction(()=>{
      const update=getDb().prepare('UPDATE voice_sessions SET ended_at=? WHERE id=? AND ended_at IS NULL').run(now(),sessionId);
      if(!update.changes)return;
      const seconds=Math.min(600,Math.max(0,Math.round((Date.now()-Date.parse(session.started_at))/1000)));
      service.recordUsage(actor,'voice_elapsed_seconds_estimate',seconds);audit(actor,'voice.ended',sessionId,{seconds,metering:'elapsed_estimate_not_provider_billing'});
    })();
  }
  return {ended:true};
}
