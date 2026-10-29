import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from '../lib/contracts';
import { AppError, assertActor, audit, getDb, requireRole } from './db';
import { actorForMember } from './services';

/** Foundation only. No HTTP ingress or Slack send adapter is enabled. See official Slack signing docs. */
export function verifySlackSignature(rawBody:string,timestamp:string,signature:string,secret=process.env.SLACK_SIGNING_SECRET,currentTime=Date.now()):boolean {
 if(!secret||!/^\d{10}$/.test(timestamp)||!/^v0=[a-f0-9]{64}$/.test(signature)||Buffer.byteLength(rawBody)>1_000_000)return false;
 if(Math.abs(currentTime/1000-Number(timestamp))>300)return false;
 const expected=`v0=${createHmac('sha256',secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
 return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
/** Local test fixture linking. Production needs an authorized OAuth installation and verified user binding. */
export function linkDemoSlackIdentity(actor:Actor,input:{userId:string;workspaceId:string;externalId:string}) {
 requireRole(actor,['manager']);const parsed=z.object({userId:z.string().min(1).max(150),workspaceId:z.string().regex(/^T[A-Z0-9]+$/),externalId:z.string().regex(/^U[A-Z0-9]+$/)}).strict().parse(input);
 actorForMember(actor.organizationId,actor.officeId,parsed.userId);
 const existing=getDb().prepare('SELECT organization_id,office_id,user_id FROM channel_links WHERE provider=? AND workspace_id=? AND external_id=?').get('slack_demo',parsed.workspaceId,parsed.externalId) as {organization_id:string;office_id:string;user_id:string}|undefined;
 if(existing&&(existing.organization_id!==actor.organizationId||existing.office_id!==actor.officeId||existing.user_id!==parsed.userId))throw new AppError(409,'This external identity is already linked.');
 getDb().prepare('INSERT OR IGNORE INTO channel_links VALUES(?,?,?,?,?,?)').run(actor.organizationId,actor.officeId,parsed.userId,'slack_demo',parsed.workspaceId,parsed.externalId);audit(actor,'channel.demo_identity_linked',parsed.userId,{provider:'slack_demo'});
 return {status:'local_demo_link' as const,providerConnected:false};
}
export function resolveDemoSlackRequest(input:{rawBody:string;timestamp:string;signature:string},secret=process.env.SLACK_SIGNING_SECRET):Actor {
 if(!verifySlackSignature(input.rawBody,input.timestamp,input.signature,secret))throw new AppError(401,'Slack signature or timestamp is invalid.');
 let json:unknown;try{json=JSON.parse(input.rawBody);}catch{throw new AppError(422,'Use a valid Slack event body.');}
 const body=z.object({team_id:z.string(),event:z.object({user:z.string()})}).parse(json);
 const link=getDb().prepare('SELECT organization_id,office_id,user_id FROM channel_links WHERE provider=? AND workspace_id=? AND external_id=?').get('slack_demo',body.team_id,body.event.user) as {organization_id:string;office_id:string;user_id:string}|undefined;
 if(!link)throw new AppError(403,'This Slack identity is not linked to an authorized employee.');
 return actorForMember(link.organization_id,link.office_id,link.user_id);
}
export function getSmsEntitlement(actor:Actor) {
 assertActor(actor);const row=getDb().prepare('SELECT settings FROM organizations WHERE id=?').get(actor.organizationId) as {settings:string};const settings=JSON.parse(row.settings) as {smsAddonEnabled?:boolean;smsMonthlyLimit?:number};
 const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);
 const used=(getDb().prepare("SELECT COALESCE(SUM(quantity),0) AS used FROM usage_events WHERE organization_id=? AND kind='sms_provider_segments' AND created_at>=?").get(actor.organizationId,month.toISOString()) as {used:number}).used;
 const limit=Number.isFinite(settings.smsMonthlyLimit)?Math.max(0,settings.smsMonthlyLimit!):0;
 return {enabled:settings.smsAddonEnabled===true,monthlyLimit:limit,used,remaining:Math.max(0,limit-used),providerConfigured:false,source:'Local entitlement foundation; no billable SMS has been sent.'};
}
export function requestSmsDelivery(actor:Actor) {
 const entitlement=getSmsEntitlement(actor);
 if(!entitlement.enabled||!entitlement.remaining)throw new AppError(402,'SMS requires a separately enabled paid add-on and available allowance.');
 throw new AppError(503,'SMS delivery is not configured. Prepare a reviewed copy-only draft in AgentDesk.');
}
