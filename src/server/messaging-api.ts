import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import { createPairing,messagingConversation,messagingState,updateMessagingLink } from './messaging';
export async function messagingRoute(request:NextRequest,actor:Actor,path:string[],body:()=>Promise<unknown>){
 if(path[0]!=='messaging')return;
 const json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path.length===1&&request.method==='GET')return json(messagingState(actor));
 if(path.length===2&&path[1]==='pair'&&request.method==='POST'){const {provider}=z.object({provider:z.enum(['slack','sms'])}).strict().parse(await body());return json(createPairing(actor,provider));}
 if(path.length===2&&path[1]==='conversation'&&request.method==='POST')return json({conversationId:messagingConversation(actor)});
 if(path.length===3&&path[1]==='links'&&request.method==='PATCH'){const input=z.object({active:z.literal(false).optional(),reminders:z.boolean().optional()}).strict().parse(await body());return json(updateMessagingLink(actor,z.string().max(150).parse(path[2]),input));}
}
