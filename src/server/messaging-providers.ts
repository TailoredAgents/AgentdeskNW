import twilio from 'twilio';
import { z } from 'zod';
import { AppError,getDb,now } from './db';
import { acceptMessage,actorForLink,getMessagingLink,type MessagingLink,type Outbox } from './messaging';
import { channelConfigured,messagingOrigin,sendingEnabled } from './messaging-config';
import { recordSmsReceipt } from './metering';
import { verifySlackSignature } from './channels';

const sid=z.string().regex(/^(SM|MM)[a-fA-F0-9]{32}$/);
export class DeliveryRejected extends Error {}
export async function readWebhookBody(request:Request){
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>64000){await reader.cancel();throw new AppError(413,'Webhook too large.');}chunks.push(next.value);}
 return Buffer.concat(chunks).toString('utf8');
}
export function acceptSlackEvent(raw:unknown){
 const body=z.object({type:z.string(),team_id:z.string().optional(),api_app_id:z.string().optional(),event_id:z.string().optional(),challenge:z.string().optional(),event:z.unknown().optional()}).parse(raw);
 if(body.api_app_id!==process.env.SLACK_APP_ID||body.team_id!==process.env.SLACK_TEAM_ID)throw new AppError(403,'Unexpected Slack app or workspace.');
 if(body.type!=='event_callback')return {status:'ignored'};
 const event=z.object({type:z.string(),subtype:z.string().optional(),bot_id:z.string().optional(),hidden:z.boolean().optional(),channel_type:z.string().optional(),channel:z.string().optional(),user:z.string().optional(),text:z.string().optional()}).parse(body.event);
 if(event.type!=='message'||event.channel_type!=='im'||event.subtype||event.bot_id||event.hidden||!event.text)return {status:'ignored'};
 if(!/^U[A-Z0-9]+$/.test(event.user||'')||!/^D[A-Z0-9]+$/.test(event.channel||''))return {status:'ignored'};
 return acceptMessage({provider:'slack',accountId:body.team_id!,externalId:event.user!,address:event.channel!,eventId:z.string().min(1).parse(body.event_id),text:event.text});
}
export async function slackWebhook(request:Request){
 if(!channelConfigured('slack')||process.env.SLACK_TRANSPORT==='socket')throw new AppError(503,'Slack HTTP events are disabled.');
 const raw=await readWebhookBody(request);
 if(!verifySlackSignature(raw,request.headers.get('x-slack-request-timestamp')||'',request.headers.get('x-slack-signature')||''))throw new AppError(401,'Invalid signature.');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new AppError(400,'Invalid event.');}
 const challenge=z.object({type:z.literal('url_verification'),challenge:z.string().max(1000)}).safeParse(value);
 if(challenge.success)return {challenge:challenge.data.challenge};
 return acceptSlackEvent(value);
}
export async function verifiedTwilioForm(request:Request,path:'/api/webhooks/twilio'|'/api/webhooks/twilio/status'){
 if(!channelConfigured('sms'))throw new AppError(503,'SMS is disabled.');
 if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new AppError(415,'Expected form data.');
 const url=new URL(request.url);if(url.pathname!==path)throw new AppError(400,'Unexpected callback path.');
 if(path.endsWith('/status')){if([...url.searchParams.keys()].some(key=>key!=='delivery')||url.searchParams.getAll('delivery').length!==1)throw new AppError(400,'Unexpected callback parameters.');}
 else if(url.search)throw new AppError(400,'Unexpected callback parameters.');
 const params=new URLSearchParams(await readWebhookBody(request)),form:Record<string,string>={};
 for(const [key,value] of params){if(key in form)throw new AppError(400,'Duplicate form parameter.');form[key]=value;}
 const canonical=`${messagingOrigin()}${path}${url.search}`;
 if(!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!,request.headers.get('x-twilio-signature')||'',canonical,form))throw new AppError(401,'Invalid signature.');
 if(form.AccountSid!==process.env.TWILIO_ACCOUNT_SID)throw new AppError(403,'Unexpected Twilio account.');
 return form;
}
export async function twilioWebhook(request:Request){
 const form=await verifiedTwilioForm(request,'/api/webhooks/twilio');
 if(form.To!==process.env.TWILIO_PHONE_NUMBER)throw new AppError(403,'Unexpected destination.');
 const phone=z.string().regex(/^\+[1-9]\d{7,14}$/).parse(form.From);
 return acceptMessage({provider:'sms',accountId:form.AccountSid,externalId:phone,address:phone,eventId:sid.parse(form.MessageSid),text:form.Body||'',...(form.NumSegments!==undefined?{segments:z.coerce.number().int().min(0).max(1000).parse(form.NumSegments)}:{}),...(form.OptOutType?{optOut:z.enum(['STOP','START','HELP']).parse(form.OptOutType)}:{})});
}
export function applyTwilioReceipt(id:string,receipt:{sid:string;accountSid:string;from:string;to:string;status:string;numSegments?:string|null}){
 const row=getDb().prepare('SELECT * FROM messaging_outbox WHERE id=?').get(id) as Outbox|undefined;if(!row||!['dispatching','unknown','accepted','delivered','failed'].includes(row.status))return;
 const link=getMessagingLink(row.link_id);
 if(link.provider!=='sms'||receipt.accountSid!==link.account_id||receipt.accountSid!==process.env.TWILIO_ACCOUNT_SID||receipt.from!==process.env.TWILIO_PHONE_NUMBER||receipt.to!==link.address||row.provider_id&&row.provider_id!==receipt.sid)throw new AppError(403,'Receipt does not match the delivery.');
 sid.parse(receipt.sid);const status=z.enum(['accepted','scheduled','queued','sending','sent','delivered','undelivered','failed','canceled','read']).parse(receipt.status);
 let state=['delivered','read'].includes(status)?'delivered':['failed','undelivered','canceled'].includes(status)?'failed':'accepted';
 // Provider callbacks can arrive out of order. Terminal outcomes cannot regress.
 if(['delivered','failed'].includes(row.status))state=row.status;
 let segments:number|null=row.segments_actual;
 if(receipt.numSegments!==undefined&&receipt.numSegments!==null&&receipt.numSegments!==''&&(Number(receipt.numSegments)>0||['failed','undelivered','canceled'].includes(status))){segments=z.coerce.number().int().min(0).max(1000).parse(receipt.numSegments);}
 getDb().transaction(()=>{
  if(segments!==null)recordSmsReceipt(actorForLink(link),`sms:out:${row.id}`,segments);
  getDb().prepare('UPDATE messaging_outbox SET provider_id=?,provider_status=?,status=?,segments_actual=?,updated_at=?,reconcile_at=? WHERE id=?').run(receipt.sid,['delivered','failed'].includes(row.status)?row.provider_status:status,state,segments,now(),now(),id);
 }).immediate();
}
export async function twilioStatusWebhook(request:Request){
 const form=await verifiedTwilioForm(request,'/api/webhooks/twilio/status');
 applyTwilioReceipt(z.string().min(1).max(150).parse(new URL(request.url).searchParams.get('delivery')),{sid:form.MessageSid,accountSid:form.AccountSid,from:form.From,to:form.To,status:form.MessageStatus,numSegments:form.NumSegments});
}
function twilioClient(){return twilio(process.env.TWILIO_ACCOUNT_SID!,process.env.TWILIO_AUTH_TOKEN!,{autoRetry:false,timeout:15000});}
export async function sendChannelMessage(link:MessagingLink,row:Outbox,body:string):Promise<{id:string;status:string;segments?:string}>{
 if(!sendingEnabled()||!channelConfigured(link.provider))throw new DeliveryRejected('Sending disabled');
 if(link.provider==='slack'){
  const response=await fetch('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:`Bearer ${process.env.SLACK_BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({channel:link.address,text:body,mrkdwn:false,parse:'none',unfurl_links:false,unfurl_media:false}),signal:AbortSignal.timeout(15000)});
  if(response.status===429)throw new DeliveryRejected('Provider rate limit');
  if(!response.ok)throw new Error('Slack response unresolved');
  const result=z.object({ok:z.boolean(),ts:z.string().optional()}).parse(await response.json());if(!result.ok)throw new DeliveryRejected('Slack rejected delivery');if(!result.ts)throw new Error('Slack receipt missing');return {id:`slack:${link.account_id}:${link.address}:${result.ts}`,status:'accepted'};
 }
 try{const result=await twilioClient().messages.create({from:process.env.TWILIO_PHONE_NUMBER!,to:link.address,body,statusCallback:`${messagingOrigin()}/api/webhooks/twilio/status?delivery=${encodeURIComponent(row.id)}`});return {id:result.sid,status:result.status,segments:result.numSegments};}
 catch(error){if(error&&typeof error==='object'&&'status' in error&&typeof error.status==='number'&&error.status>=400&&error.status<500)throw new DeliveryRejected('Twilio rejected delivery');throw new Error('Twilio delivery unresolved');}
}
export async function fetchTwilioReceipt(id:string){return twilioClient().messages(id).fetch();}
