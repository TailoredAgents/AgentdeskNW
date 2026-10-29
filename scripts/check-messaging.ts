import { existsSync } from 'node:fs';
import twilio from 'twilio';
import { channelConfigured,sendingEnabled } from '../src/server/messaging-config';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
// Read-only probes. Never print provider response bodies, tokens or phone numbers.
console.info(`Outbound sending: ${sendingEnabled()?'enabled':'off'}`);
for(const provider of ['slack','sms'] as const){
 if(!channelConfigured(provider)){console.info(`${provider}: setup incomplete or channels disabled`);continue;}
 try{
  if(provider==='slack'){
   const response=await fetch('https://slack.com/api/auth.test',{method:'POST',headers:{Authorization:`Bearer ${process.env.SLACK_BOT_TOKEN}`},signal:AbortSignal.timeout(15000)});
   const result=await response.json() as {ok?:boolean;team_id?:string;bot_id?:string};
   if(!response.ok||!result.ok||result.team_id!==process.env.SLACK_TEAM_ID||!result.bot_id)throw new Error('Slack credential or workspace mismatch');
   const scopes=(response.headers.get('x-oauth-scopes')||'').split(',').map(value=>value.trim());if(!['chat:write','im:history'].every(scope=>scopes.includes(scope)))throw new Error('Required Slack scopes not confirmed');
   console.info('slack: bot credentials, workspace and scopes verified; real DM round-trip still required');
  }else{
   const client=twilio(process.env.TWILIO_ACCOUNT_SID!,process.env.TWILIO_AUTH_TOKEN!,{autoRetry:false,timeout:15000});
   const numbers=await client.incomingPhoneNumbers.list({phoneNumber:process.env.TWILIO_PHONE_NUMBER,limit:1});
   if(!numbers.some(number=>number.phoneNumber===process.env.TWILIO_PHONE_NUMBER&&number.capabilities.sms))throw new Error('Configured SMS-capable number not found');
   console.info('sms: account credentials and SMS-capable number verified; registration, recipient eligibility and real delivery still require confirmation');
  }
 }catch{console.error(`${provider}: verification failed; check account setup and credentials`);process.exitCode=1;}
}
