import { AppError } from './db';
import { ZodError } from 'zod';
export async function webhookResponse(operation:()=>Promise<unknown>,xml=false){
 try{const value=await operation();return xml?new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>',{headers:{'Content-Type':'text/xml','Cache-Control':'no-store'}}):Response.json(value??{ok:true},{headers:{'Cache-Control':'no-store'}});}
 catch(error){const status=error instanceof AppError?error.status:error instanceof ZodError?400:500;return Response.json({error:status===500?'Webhook could not be processed.':'Webhook rejected.'},{status,headers:{'Cache-Control':'no-store'}});}
}
