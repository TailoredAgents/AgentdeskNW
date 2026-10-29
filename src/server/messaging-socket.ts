import { SocketModeClient,LogLevel } from '@slack/socket-mode';
import { channelConfigured } from './messaging-config';
import { acceptSlackEvent } from './messaging-providers';
import { ZodError } from 'zod';
import { AppError } from './db';
export function startSlackSocket(){
 if(!channelConfigured('slack')||process.env.SLACK_TRANSPORT!=='socket')return null;
 // Never log SDK payloads or token-bearing connection URLs.
 const logger={debug:()=>{},info:()=>{},warn:()=>{},error:()=>console.error('slack_socket_connection_error'),setLevel:()=>{},getLevel:()=>LogLevel.ERROR,setName:()=>{}};
 const client=new SocketModeClient({appToken:process.env.SLACK_APP_TOKEN!,logger,clientOptions:{retryConfig:{retries:2}}});
 client.on('events_api',async({body,ack}:{body:unknown;ack:()=>Promise<void>})=>{
  try{acceptSlackEvent(body);await ack();}
  catch(error){if(error instanceof ZodError||error instanceof AppError&&error.status<500)await ack();else console.error('slack_event_processing_failed');}
 });
 client.on('error',()=>console.error('slack_socket_error'));
 void client.start().catch(()=>console.error('slack_socket_start_failed'));
 return client;
}
