import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {getKnowledgeState,saveKnowledgeDraft,reviewKnowledge,publishKnowledge,withdrawKnowledge,listCoaching,saveCoaching,searchKnowledge,knowledgeSaveSchema,knowledgePublishSchema,knowledgeWithdrawSchema,coachingSchema} from './knowledge';
export async function knowledgeRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='knowledge')return undefined;
 const json=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 if(request.method==='GET'&&path.length===1)return json({...getKnowledgeState(actor),practice:listCoachingIfAllowed()});
 function listCoachingIfAllowed(){return getKnowledgeState(actor).canCoach?listCoaching(actor):[];}
 if(request.method!=='POST'||path.length!==2)throw new AppError(405,'Unsupported guidance request.');
 const raw=await body();let selectedDocumentId:string|undefined;
 switch(path[1]){
  case 'draft':selectedDocumentId=saveKnowledgeDraft(actor,knowledgeSaveSchema.parse(raw)).id;break;
  case 'review':{const input=z.object({id:z.string(),expectedVersion:z.number().int().positive()}).strict().parse(raw);return json(reviewKnowledge(actor,input.id,input.expectedVersion));}
  case 'publish':publishKnowledge(actor,knowledgePublishSchema.parse(raw));break;
  case 'withdraw':withdrawKnowledge(actor,knowledgeWithdrawSchema.parse(raw));break;
  case 'practice':saveCoaching(actor,coachingSchema.parse(raw));break;
  case 'search':return json(searchKnowledge(actor,z.object({query:z.string()}).strict().parse(raw).query));
  default:throw new AppError(404,'Unknown guidance action.');
 }
 return json({...getKnowledgeState(actor),practice:listCoachingIfAllowed(),selectedDocumentId});
}
