import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError} from './db';
import {listWorkCapabilities} from './work-capabilities';
import {buildWorkPreset,workPresetSchema} from './work-presets';
import {createWorkRun,listWorkRuns,getWorkRun,controlWorkRun,decideWorkCost,reviseWorkRun} from './work-runs';

const id=z.string().trim().min(1).max(150);
const revision=z.object({expectedVersion:z.number().int().positive(),eventKey:id});
export async function workRoute(request:NextRequest,actor:Actor,path:string[],readBody:()=>Promise<unknown>){
 if(path[0]!=='work')return undefined;
 const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(path.length===1&&request.method==='GET')return json({runs:listWorkRuns(actor)});
 if(path.length===2&&path[1]==='capabilities'&&request.method==='GET')return json({capabilities:listWorkCapabilities(actor)});
 if(path.length===2&&request.method==='GET')return json(getWorkRun(actor,id.parse(path[1])));
 if(path.length===1&&request.method==='POST'){
  const input=workPresetSchema.extend({requestId:id}).strict().parse(await readBody());
  const {requestId,...preset}=input;
  return json(createWorkRun(actor,{requestId,...buildWorkPreset(actor,preset)}),201);
 }
 if(path.length===3&&request.method==='POST'){
  const runId=id.parse(path[1]),input=await readBody();
  if(path[2]==='control')return json(controlWorkRun(actor,runId,revision.extend({action:z.enum(['pause','resume','cancel'])}).strict().parse(input)));
  if(path[2]==='decision')return json(decideWorkCost(actor,runId,revision.extend({quoteId:id,decision:z.enum(['approve','deny'])}).strict().parse(input)));
  if(path[2]==='revise'){
   const value=workPresetSchema.extend({...revision.shape,instructions:z.string().trim().min(3).max(4000).optional()}).strict().parse(input);
   const {expectedVersion,eventKey,instructions,...preset}=value,plan=buildWorkPreset(actor,preset);
   return json(reviseWorkRun(actor,runId,{expectedVersion,eventKey,...plan,instructions:instructions??plan.instructions}));
  }
 }
 throw new AppError(404,'This job operation is not available.');
}
