import {receiveThreadDemoReply,receiveThreadDemoSchema} from './communications';
import {NextRequest,NextResponse} from 'next/server';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {communicationDocumentOptions} from './communication-documents';
import {composeCommunication,composeCommunicationSchema,discardDraftSchema,discardInboxDraft,getInboxState,getInboxThread,linkInboxInvestor,linkInvestorSchema,receiveDemoCommunication,receiveDemoSchema,saveDraftSchema,saveInboxDraft,threadUpdateSchema,updateInboxThread} from './communications';
import {createInboxFollowUp,getInboxAssistance,inboxFollowUpSchema,inboxObservationSchema,inboxWorkflowMutationSchema,prepareInboxReply,recordInboxObservation,reviewInboxSend,simulateInboxSend,simulateInboxSendSchema} from './communications-workflow';

/** The main route supplies authentication, origin checks, rate limits and the bounded JSON reader. */
export async function communicationsRoute(request:NextRequest,actor:Actor,path:string[],readBody:()=>Promise<unknown>){
 if(path[0]!=='inbox')return;
 const [,id,action]=path,method=request.method,json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path.length===1&&method==='GET')return json(getInboxState(actor,Object.fromEntries(request.nextUrl.searchParams.entries())));
 if(path.length===2&&id==='document-options'&&method==='GET')return json(communicationDocumentOptions(actor));
 if(path.length===2&&id==='compose'&&method==='POST')return json(composeCommunication(actor,composeCommunicationSchema.parse(await readBody())));
 if(path.length===2&&id==='receive-demo'&&method==='POST')return json(receiveDemoCommunication(actor,receiveDemoSchema.parse(await readBody())));
 if(path.length===2&&method==='GET')return json(getInboxThread(actor,id));
 if(path.length===2&&method==='PATCH')return json(updateInboxThread(actor,id,threadUpdateSchema.parse(await readBody())));
 if(path.length===3&&action==='assist'&&method==='GET')return json(getInboxAssistance(actor,id));
 if(path.length===3&&method==='POST'){
  if(action==='receive-demo-reply')return json(receiveThreadDemoReply(actor,id,receiveThreadDemoSchema.parse(await readBody())));
  if(action==='draft')return json(saveInboxDraft(actor,id,saveDraftSchema.parse(await readBody())));
  if(action==='discard-draft')return json(discardInboxDraft(actor,id,discardDraftSchema.parse(await readBody())));
  if(action==='link')return json(linkInboxInvestor(actor,id,linkInvestorSchema.parse(await readBody())));
  if(action==='prepare-reply')return json(prepareInboxReply(actor,id,inboxWorkflowMutationSchema.parse(await readBody())));
  if(action==='review-send')return json(reviewInboxSend(actor,id,inboxWorkflowMutationSchema.parse(await readBody())));
  if(action==='simulate-send')return json(simulateInboxSend(actor,id,simulateInboxSendSchema.parse(await readBody())));
  if(action==='record-observation')return json(recordInboxObservation(actor,id,inboxObservationSchema.parse(await readBody())));
  if(action==='follow-up')return json(createInboxFollowUp(actor,id,inboxFollowUpSchema.parse(await readBody())));
 }
 throw new AppError(404,'This inbox action is not available. Live sending and provider connections are not enabled.');
}
