import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {MobileSession} from '../lib/mobile-contracts';
import {AppError} from './db';
import {createMobilePairing,listMobileDevices,mobileConnection,revokeMobileSession} from './mobile-auth';
import {mobileNotificationState,registerPushDevice} from './mobile-notifications';

export async function mobileRoute(request:NextRequest,actor:Actor,path:string[],readBody:()=>Promise<unknown>,session?:MobileSession){
 if(path[0]!=='mobile')return undefined;
 const json=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
 if(path.length===2&&path[1]==='session'&&request.method==='GET'){
  if(!session)throw new AppError(401,'Connect the phone before opening its session.');return json(mobileConnection(session.id));
 }
 if(path.length===2&&path[1]==='logout'&&request.method==='POST'){
  if(!session)throw new AppError(401,'No phone connection is active.');z.object({}).strict().parse(await readBody());revokeMobileSession(actor,session.id);return json({ok:true});
 }
 if(path.length===2&&path[1]==='notifications'){
  if(!session)throw new AppError(401,'Notification settings belong to the connected phone.');
  if(request.method==='GET')return json(mobileNotificationState(actor,session.id));
  if(request.method==='POST')return json(registerPushDevice(actor,session.id,await readBody()));
 }
 if(session)throw new AppError(403,'Phone pairing and device management require your signed-in web workspace.');
 if(path.length===2&&path[1]==='pairing'&&request.method==='POST'){z.object({}).strict().parse(await readBody());return json(createMobilePairing(actor));}
 if(path.length===2&&path[1]==='devices'&&request.method==='GET')return json(listMobileDevices(actor));
 if(path.length===4&&path[1]==='devices'&&path[3]==='revoke'&&request.method==='POST'){z.object({}).strict().parse(await readBody());revokeMobileSession(actor,z.string().min(1).max(150).parse(path[2]));return json({ok:true});}
 throw new AppError(404,'This phone operation is not available.');
}
