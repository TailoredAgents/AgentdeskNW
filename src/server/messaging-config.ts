import { z } from 'zod';
export type MessagingProvider='slack'|'sms';
export function messagingEnabled(){return process.env.AGENTDESK_CHANNELS_ENABLED==='true';}
export function sendingEnabled(){return messagingEnabled()&&process.env.AGENTDESK_CHANNEL_SEND_ENABLED==='true';}
export function messagingOrigin(){
 const raw=process.env.AGENTDESK_CHANNEL_PUBLIC_ORIGIN||process.env.AGENTDESK_APP_ORIGIN||process.env.RENDER_EXTERNAL_URL;
 if(!raw)return null;
 try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;return url.origin;}catch{return null;}
}
export function channelAccount(provider:MessagingProvider){return provider==='slack'?process.env.SLACK_TEAM_ID||'':process.env.TWILIO_ACCOUNT_SID||'';}
export function channelConfigured(provider:MessagingProvider){
 if(!messagingEnabled())return false;
 if(provider==='slack')return !!(process.env.SLACK_BOT_TOKEN&&/^T[A-Z0-9]+$/.test(channelAccount(provider))&&/^A[A-Z0-9]+$/.test(process.env.SLACK_APP_ID||'')&&(process.env.SLACK_TRANSPORT==='socket'?process.env.SLACK_APP_TOKEN:process.env.SLACK_SIGNING_SECRET));
 return !!(/^AC[a-fA-F0-9]{32}$/.test(channelAccount(provider))&&process.env.TWILIO_AUTH_TOKEN&&/^\+[1-9]\d{7,14}$/.test(process.env.TWILIO_PHONE_NUMBER||'')&&messagingOrigin());
}
export function dailyMessageLimit(){return z.coerce.number().int().min(1).max(200).parse(process.env.AGENTDESK_CHANNEL_DAILY_LIMIT||50);}
export function conversationLink(conversationId:string){const origin=messagingOrigin();return origin?`${origin}/?conversation=${encodeURIComponent(conversationId)}`:null;}
