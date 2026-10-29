import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import * as service from '@/server/services';
import { assertLocalDemo,getActor,setSession,rateLimit } from '@/server/auth';
import { chat,researchSchema,qualificationChangesSchema } from '@/server/orchestrator';
import { createVoiceSession,executeVoiceTool,saveVoiceTranscript,endVoiceSession } from '@/server/voice';
import { phaseTwoRoute } from '@/server/phase-two-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';

const idSchema=z.string().min(1).max(150);
const summarySchema=z.object({summary:z.string().max(10000),parties:z.array(z.string().max(300)).max(100),facts:z.array(z.string().max(3000)).max(100),criteria:z.record(z.string().max(100),z.string().max(3000)),commitments:z.array(z.string().max(3000)).max(100),questions:z.array(z.string().max(3000)).max(100),objections:z.array(z.string().max(3000)).max(100),missingInformation:z.array(z.string().max(3000)).max(100),suggestedTasks:z.array(z.string().max(3000)).max(100),proposedNote:z.string().max(30000),mode:z.enum(['local_extraction','model']),source:z.literal('employee_transcript'),sourceExcerpts:z.array(z.string().max(5000)).max(100)}).strict();
async function body(request:NextRequest):Promise<unknown>{
  if(Number(request.headers.get('content-length'))>96_000)throw new service.AppError(413,'This request is too large.');
  const text=await request.text();if(text.length>96_000)throw new service.AppError(413,'This request is too large.');
  try{return text?JSON.parse(text):{};}catch{throw new service.AppError(400,'Request body must be valid JSON.');}
}
function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function csvCell(value:unknown){let text=String(value??'');if(/^\s*[=+@\-\t\r]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;}
async function route(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  try{
    assertLocalDemo(request);
    const {path}=await params;const [resource,id,operation]=path;const method=request.method;
    if(resource==='health'&&method==='GET')return json({status:'ok',mode:'local-demo'});
    if(resource==='session'&&method==='POST'){
      const {role}=z.object({role:z.enum(['dispositions','acquisitions','manager'])}).strict().parse(await body(request));
      const actor=service.demoActor(role);const response=json({actor});setSession(response,role);return response;
    }
    let actor=getActor(request);const newSession=!actor;
    if(!actor&&resource==='bootstrap'&&method==='GET')actor=service.demoActor();
    if(!actor)throw new service.AppError(401,'Open the workspace to start a local demo session.');
    rateLimit(actor,'all',300);
    if(method!=='GET')rateLimit(actor,resource,resource==='chat'?20:resource==='voice'?90:60);
    if(resource==='bootstrap'&&method==='GET'){
      await service.tickJobs(actor);
      const response=json(service.getBootstrap(actor));if(newSession)setSession(response,actor.role);return response;
    }
    const phaseTwo=await phaseTwoRoute(request,actor,path,()=>body(request));if(phaseTwo)return phaseTwo;
    if(resource==='chat'&&method==='POST'){
      const input=z.object({conversationId:idSchema.optional(),message:z.string().trim().min(1).max(12000)}).strict().parse(await body(request));
      return json(await chat(actor,input.message,input.conversationId));
    }
    if(resource==='conversations'){
      if(method==='GET')return json(id?service.getConversation(actor,id):service.listConversations(actor));
      if(method==='POST'){const {title}=z.object({title:z.string().max(100).optional()}).strict().parse(await body(request));return json(service.createConversation(actor,title),201);}
    }
    if(resource==='research'){
      if(!id&&method==='POST')return json(service.createResearchJob(actor,researchSchema.parse(await body(request))),201);
      if(id&&method==='GET'){
        const job=service.getResearchJob(actor,id);
        if(operation==='export'){
          if(job.status!=='completed')throw new service.AppError(409,'Finish the research job before exporting.');
          const headers=['Name','Company','County','Strategy','Score','Duplicate status','Phone','Contact status','Rationale','Evidence','Synthetic'];
          const rows=job.prospects.map(p=>[p.name,p.company,p.county,p.strategy,p.score,p.duplicateStatus,p.phone,p.contactStatus,p.rationale,p.evidence.map(e=>`${e.title}: ${e.detail} [${e.url||'synthetic fixture; no live source'}]`).join(' | '),'YES — fictional demonstration']);
          return new NextResponse([headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="agentdesk-demo-research.csv"`,'Cache-Control':'no-store'}});
        }
        return json(job);
      }
      if(id&&method==='POST'&&operation==='cancel')return json(service.cancelJob(actor,id));
      if(id&&method==='POST'&&operation==='retry'){const input=z.object({input:researchSchema.optional()}).strict().parse(await body(request));return json(service.retryJob(actor,id,input.input));}
      if(id&&method==='POST'&&operation==='import'){const {prospectIds}=z.object({prospectIds:z.array(idSchema).min(1).max(100)}).strict().parse(await body(request));return json(service.proposeImport(actor,id,prospectIds),201);}
    }
    if(resource==='notes'&&method==='POST'){
      if(id==='propose'){const input=z.object({investorId:idSchema,summary:summarySchema}).strict().parse(await body(request));return json(service.proposeNote(actor,input.investorId,input.summary),201);}
      const {transcript}=z.object({transcript:z.string().trim().min(15).max(30000)}).strict().parse(await body(request));return json(service.summarizeNotes(actor,transcript));
    }
    if(resource==='approvals'&&id&&method==='POST'){
      const {decision}=z.object({decision:z.enum(['approve','reject'])}).strict().parse(await body(request));return json(service.decideAction(actor,id,decision));
    }
    if(resource==='investors'&&id&&method==='PATCH'){
      const {changes}=z.object({changes:qualificationChangesSchema}).strict().parse(await body(request));return json(service.proposeInvestorUpdate(actor,id,changes),201);
    }
    if(resource==='tasks'&&method==='POST'){
      if(id&&operation==='complete')return json(service.completeTask(actor,id));
      const input=z.object({title:z.string().trim().min(3).max(240),dueAt:z.string().datetime({offset:true}).nullable().optional(),investorId:idSchema.nullable().optional()}).strict().parse(await body(request));return json(service.createTask(actor,input),201);
    }
    if(resource==='notifications'&&id&&operation==='read'&&method==='POST')return json(service.readNotification(actor,id));
    if(resource==='settings'&&method==='PATCH'){
      const input=z.object({guidance:z.enum(['concise','guided']).optional(),notifications:z.boolean().optional(),quietHoursStart:z.number().int().min(0).max(23).optional(),quietHoursEnd:z.number().int().min(0).max(23).optional()}).strict().parse(await body(request));return json(service.updateSettings(actor,input));
    }
    if(resource==='voice'&&method==='POST'){
      if(id==='session'){rateLimit(actor,'voice_session',5);const input=z.object({conversationId:idSchema.optional()}).strict().parse(await body(request));return json(await createVoiceSession(actor,input.conversationId),201);}
      if(id==='tool'){const input=z.object({voiceSessionId:idSchema,callId:idSchema,name:z.string().min(1).max(80),args:z.unknown()}).strict().parse(await body(request));return json(await executeVoiceTool(actor,input.voiceSessionId,input.callId,input.name,input.args));}
      if(id==='transcript'){const input=z.object({voiceSessionId:idSchema,eventId:idSchema,role:z.enum(['user','assistant']),text:z.string().min(1).max(12000)}).strict().parse(await body(request));return json(saveVoiceTranscript(actor,input.voiceSessionId,input.eventId,input.role,input.text));}
      if(id==='end'){const {voiceSessionId}=z.object({voiceSessionId:idSchema}).strict().parse(await body(request));return json(endVoiceSession(actor,voiceSessionId));}
    }
    throw new service.AppError(404,'This endpoint is not available.');
  }catch(error){
    if(error instanceof z.ZodError)return json({error:error.issues.map(x=>`${x.path.join('.')||'Input'}: ${x.message}`).slice(0,4).join('; ')},400);
    if(error instanceof service.AppError)return json({error:error.message},error.status);
    console.error(JSON.stringify({event:'request_failed',errorType:error instanceof Error?error.name:'unknown'}));return json({error:'The operation could not be completed. Please try again.'},500);
  }
}
export { route as GET,route as POST,route as PATCH };
