import {decideRolePreparation,listRolePreparations} from '@/server/role-preparations';
import {reviewOpportunityScreening} from '@/server/opportunity-screening';
import {transactionsRoute} from '@/server/transactions-api';
import {documentsRoute} from '@/server/documents-api';
import {knowledgeRoute} from '@/server/knowledge-api';
import {proactiveRoute} from '@/server/proactive-api';
import {getAnalysisBoard,getAnalysis,previewAnalysis,saveAnalysis} from '@/server/deal-analysis';
import {analysisPreviewSchema,analysisSaveSchema} from '@/server/analysis-schema';
import {getOpportunityBoard,previewOpportunity,saveOpportunity,opportunityPreviewSchema,opportunitySaveSchema} from '@/server/opportunities';
import {getHandoffBoard,getHandoff,handoffMutationSchema,mutateHandoff} from '@/server/handoffs';
import {acquisitionInputSchema,recordAcquisitionSubmission,reviewAcquisition} from '@/server/acquisitions';
import {assertMobileRequest,getMobileAuthentication,pairMobileDevice} from '@/server/mobile-auth';
import {mobileRoute} from '@/server/mobile-api';
import { workRoute } from '@/server/work-api';
import {assignmentReviewRoute} from '@/server/assignment-review-api';
import { getPersonalTaskDetail } from '@/server/task-context';
import { messagingRoute } from '@/server/messaging-api';
import { getPersonalTask, listPersonalTasks, mutateTask, taskMutationSchema } from '@/server/task-actions';
import { memoryJourneyRoute } from '@/server/memory-journey-api';
import { billingRoute } from '@/server/billing-api';
import { walletRoute } from '@/server/wallet-api';
import { communicationsRoute } from '@/server/communications-api';
import { EntitlementError } from '@/server/billing';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import * as service from '@/server/services';
import { assertLocalDemo,getActor,setSession,rateLimit,verifyDemoAccess } from '@/server/auth';
import { chat,researchSchema,qualificationChangesSchema } from '@/server/orchestrator';
import { createVoiceSession,connectVoiceSession,getVoiceStatus,endVoiceSession } from '@/server/voice';
import { providerStatus } from '@/server/providers';
import { hostedDemo } from '@/server/demo-config';
import { phaseTwoRoute } from '@/server/phase-two-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';

const idSchema=z.string().min(1).max(150);
const summarySchema=z.object({summary:z.string().max(10000),parties:z.array(z.string().max(300)).max(100),facts:z.array(z.string().max(3000)).max(100),criteria:z.record(z.string().max(100),z.string().max(3000)),commitments:z.array(z.string().max(3000)).max(100),questions:z.array(z.string().max(3000)).max(100),objections:z.array(z.string().max(3000)).max(100),missingInformation:z.array(z.string().max(3000)).max(100),suggestedTasks:z.array(z.string().max(3000)).max(100),proposedNote:z.string().max(30000),mode:z.enum(['local_extraction','model']),source:z.literal('employee_transcript'),sourceExcerpts:z.array(z.string().max(5000)).max(100)}).strict();
async function body(request:NextRequest):Promise<unknown>{
  const limit=request.method==='POST'&&request.nextUrl.pathname==='/api/documents/import'?2_680_000:96_000;
  if(Number(request.headers.get('content-length'))>limit)throw new service.AppError(413,'This request is too large.');
  const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
  if(reader)try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>limit){await reader.cancel();throw new service.AppError(413,'This request is too large.');}chunks.push(item.value);}}finally{reader.releaseLock();}
  const text=Buffer.concat(chunks).toString('utf8');
  try{return text?JSON.parse(text):{};}catch{throw new service.AppError(400,'Request body must be valid JSON.');}
}
function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function csvCell(value:unknown){let text=String(value??'');if(/^\s*[=+@\-\t\r]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;}
async function route(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  try{
    const {path}=await params;const [resource,id,operation]=path;const method=request.method;
    // Health checks expose no workspace data and do not initialize the database.
    if(resource==='health'&&path.length===1&&method==='GET')return json({status:'ok'});
    if(resource==='mobile'&&id==='pair'&&path.length===2&&method==='POST'){assertMobileRequest(request);return json(pairMobileDevice(await body(request)),201);}
    assertLocalDemo(request);
    const mobile=request.headers.has('authorization')?getMobileAuthentication(request):null;
    if(mobile&&['session','access'].includes(resource))throw new service.AppError(403,'A phone connection cannot change employee identity.');
    if(resource==='access'&&path.length===1){
      if(method==='GET')return json({required:hostedDemo()&&!getActor(request)});
      if(method==='POST'){
        const {code}=z.object({code:z.string().min(1).max(256)}).strict().parse(await body(request));
        verifyDemoAccess(code);const response=json({ok:true});setSession(response,'dispositions');return response;
      }
    }
    if(hostedDemo()&&!getActor(request))throw new service.AppError(401,'Enter your access code to open the private demonstration.');
    if(resource==='session'&&method==='POST'){
      const {role}=z.object({role:z.enum(['dispositions','acquisitions','manager'])}).strict().parse(await body(request));
      const actor=service.demoActor(role);const response=json({actor});setSession(response,role);return response;
    }
    let actor=getActor(request);const newSession=!actor;
    if(!hostedDemo()&&!actor&&resource==='bootstrap'&&method==='GET')actor=service.demoActor();
    if(!actor)throw new service.AppError(401,'Open the workspace to start a local demo session.');
    rateLimit(actor,'all',300);
    if(method!=='GET')rateLimit(actor,resource,resource==='chat'?20:resource==='voice'?90:60);
    if(resource==='bootstrap'&&method==='GET'){
      await service.tickJobs(actor);
      const response=json(service.getBootstrap(actor));if(newSession)setSession(response,actor.role);return response;
    }
    if(resource==='providers'&&method==='GET')return json(providerStatus(actor));
    if(resource==='voice'&&id==='status'&&method==='GET')return json(getVoiceStatus(actor,idSchema.parse(request.nextUrl.searchParams.get('voiceSessionId'))));
    const mobileResponse=await mobileRoute(request,actor,path,()=>body(request),mobile?.session);if(mobileResponse)return mobileResponse;
    const messaging=await messagingRoute(request,actor,path,()=>body(request));if(messaging)return messaging;
    const billing=await billingRoute(request,actor,path,()=>body(request));if(billing)return billing;
    if(resource==='role-preparations'&&path.length===1&&method==='GET')return json(listRolePreparations(actor));
    if(resource==='role-preparations'&&path.length===3&&operation==='decision'&&method==='POST')return json(decideRolePreparation(actor,id,await body(request)));
    const inbox=await communicationsRoute(request,actor,path,()=>body(request));if(inbox)return inbox;
    const transactions=await transactionsRoute(request,actor,path,()=>body(request));if(transactions)return transactions;
    const documents=await documentsRoute(request,actor,path,()=>body(request));if(documents)return documents;
    const knowledge=await knowledgeRoute(request,actor,path,()=>body(request));if(knowledge)return knowledge;
    const updates=await proactiveRoute(request,actor,path,()=>body(request));if(updates)return updates;
    const wallet=await walletRoute(request,actor,path,()=>body(request));if(wallet)return wallet;
    const assignmentReview=await assignmentReviewRoute(request,actor,path,()=>body(request));if(assignmentReview)return assignmentReview;
    const work=await workRoute(request,actor,path,()=>body(request));if(work)return work;
    const memoryJourney=await memoryJourneyRoute(request,actor,path,()=>body(request));if(memoryJourney)return memoryJourney;
    const phaseTwo=await phaseTwoRoute(request,actor,path,()=>body(request));if(phaseTwo)return phaseTwo;
    if(resource==='chat'&&method==='POST'){
      const input=z.object({conversationId:idSchema.optional(),requestId:idSchema.optional(),message:z.string().trim().min(1).max(12000)}).strict().parse(await body(request));
      return json(await chat(actor,input.message,input.conversationId,input.requestId,mobile?'mobile':'web'));
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
          if(!job.prospects.length)throw new service.AppError(409,'No saved research candidates are available to export.');
          const headers=['Name','Company','County','Strategy','Score','Duplicate status','Phone','Contact status','Rationale','Evidence','Synthetic'];
          const rows=job.prospects.map(p=>[p.name,p.company,p.county,p.strategy,p.score,p.duplicateStatus,p.phone,p.contactStatus,p.rationale,p.evidence.map(e=>`${e.title}: ${e.detail} [${e.url||'synthetic fixture; no live source'}]`).join(' | '),p.synthetic?'YES — fictional demonstration':'NO — public sources; unverified']);
          return new NextResponse([headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="agentdesk-research.csv"`,'Cache-Control':'no-store'}});
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
    if(resource==='handoffs'&&path.length<=2){
      if(method==='GET')return json(id?getHandoff(actor,id):getHandoffBoard(actor));
      if(method==='POST'&&id)return json(mutateHandoff(actor,id,handoffMutationSchema.parse(await body(request))));
    }
    if(resource==='analyses'&&path.length<=2){
      if(method==='GET')return json(id?getAnalysis(actor,id):getAnalysisBoard(actor));
      if(method==='POST'&&id==='preview')return json(previewAnalysis(actor,analysisPreviewSchema.parse(await body(request))));
      if(method==='POST'&&!id)return json(saveAnalysis(actor,analysisSaveSchema.parse(await body(request))));
    }
    if(resource==='opportunities'&&path.length<=2){
      if(method==='GET')return json(id?reviewOpportunityScreening(actor,id):getOpportunityBoard(actor));
      if(method==='POST'&&id==='preview')return json(previewOpportunity(actor,opportunityPreviewSchema.parse(await body(request))));
      if(method==='POST'&&!id)return json(reviewOpportunityScreening(actor,saveOpportunity(actor,opportunitySaveSchema.parse(await body(request))).opportunity.id));
    }
    if(resource==='acquisitions'&&id&&path.length===2){
      if(method==='GET')return json(reviewAcquisition(actor,id));
      if(method==='POST')return json(recordAcquisitionSubmission(actor,id,acquisitionInputSchema.parse(await body(request))));
    }
    if(resource==='tasks'&&id&&operation==='detail'&&method==='GET'&&path.length===3)return json(getPersonalTaskDetail(actor,id));
    if(resource==='tasks'&&method==='GET'&&path.length<=2)return json(id?getPersonalTask(actor,id):listPersonalTasks(actor));
    if(resource==='tasks'&&id&&method==='PATCH'&&path.length===2)return json(mutateTask(actor,id,taskMutationSchema.parse(await body(request))));
    if(resource==='tasks'&&method==='POST'){
      if(id&&operation==='complete')return json(service.completeTask(actor,id));
      const input=z.object({title:z.string().trim().min(3).max(240),dueAt:z.string().datetime({offset:true}).nullable().optional(),investorId:idSchema.nullable().optional()}).strict().parse(await body(request));return json(service.createTask(actor,input),201);
    }
    if(resource==='notifications'&&id&&operation==='read'&&method==='POST')return json(service.readNotification(actor,id));
    if(resource==='settings'&&method==='PATCH'){
      const input=z.object({guidance:z.enum(['concise','guided']).optional(),notifications:z.boolean().optional(),quietHoursStart:z.number().int().min(0).max(23).optional(),quietHoursEnd:z.number().int().min(0).max(23).optional()}).strict().parse(await body(request));return json(service.updateSettings(actor,input));
    }
    if(resource==='voice'&&method==='POST'){
      if(id==='session'){rateLimit(actor,'voice_session',5);const input=z.object({conversationId:idSchema.optional()}).strict().parse(await body(request));const {voiceSessionId,conversationId,maxSeconds,expiresAt}=await createVoiceSession(actor,input.conversationId);return json({voiceSessionId,conversationId,maxSeconds,expiresAt},201);}
      if(id==='connect'){const input=z.object({voiceSessionId:idSchema,sdp:z.string().min(1).max(64000)}).strict().parse(await body(request));return json(await connectVoiceSession(actor,input.voiceSessionId,input.sdp));}
      if(id==='tool'||id==='transcript')throw new service.AppError(403,'Voice events are accepted only from the trusted provider connection.');
      if(id==='end'){const {voiceSessionId}=z.object({voiceSessionId:idSchema}).strict().parse(await body(request));return json(endVoiceSession(actor,voiceSessionId));}
    }
    throw new service.AppError(404,'This endpoint is not available.');
  }catch(error){
    if(error instanceof z.ZodError)return json({error:error.issues.map(x=>`${x.path.join('.')||'Input'}: ${x.message}`).slice(0,4).join('; ')},400);
    if(error instanceof EntitlementError)return json({error:error.message,featureId:error.featureId,upgrade:'marketplace'},error.status);
    if(error instanceof service.AppError)return json({error:error.message},error.status);
    console.error(JSON.stringify({event:'request_failed',errorType:error instanceof Error?error.name:'unknown'}));return json({error:'The operation could not be completed. Please try again.'},500);
  }
}
export { route as GET,route as POST,route as PATCH,route as DELETE };
