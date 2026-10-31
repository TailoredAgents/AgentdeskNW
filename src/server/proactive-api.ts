import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {AppError} from './db';
import type {Actor} from '../lib/contracts';
import {getProactiveState,saveProactivePreferences,processProactiveActor,readProactiveUpdate} from './proactive';
export async function proactiveRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='updates')return undefined;const json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path.length===1&&request.method==='GET')return json(getProactiveState(actor));
 if(request.method!=='POST')throw new AppError(405,'Unsupported update request.');
 const input=await body();
 if(path.length===1)return json(saveProactivePreferences(actor,input as Parameters<typeof saveProactivePreferences>[1]));
 if(path.length===2&&path[1]==='check'){z.object({}).strict().parse(input);processProactiveActor(actor);return json(getProactiveState(actor));}
 if(path.length===2&&path[1]==='read'){const value=z.object({updateId:z.string().min(1).max(150),eventKey:z.string().min(1).max(150)}).strict().parse(input);return json(readProactiveUpdate(actor,value.updateId,value.eventKey));}
 throw new z.ZodError([{code:'custom',path:[],message:'Unknown update action.'}]);
}
