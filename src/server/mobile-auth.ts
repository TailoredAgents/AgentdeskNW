import {createHash,randomBytes,randomInt} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {z} from 'zod';
import type {Actor,Role} from '../lib/contracts';
import type {MobileConnection,MobileDevices,MobilePairResult,MobilePairing,MobileSession} from '../lib/mobile-contracts';
import {AppError,assertActor,audit,getDb,newId,now} from './db';
import {requireFeature} from './billing';
import {messagingConversation} from './messaging';
import {demoOrigin,hostedDemo,validateHostedDemo} from './demo-config';

interface SessionRow {id:string;organization_id:string;office_id:string;user_id:string;role:Role;device_name:string;token_hash:string;created_at:string;expires_at:string;revoked_at:string|null}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const scope=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
const toSession=(row:SessionRow):MobileSession=>({id:row.id,organizationId:row.organization_id,officeId:row.office_id,userId:row.user_id,role:row.role,deviceName:row.device_name,createdAt:row.created_at,expiresAt:row.expires_at,revokedAt:row.revoked_at});
const localhost=(hostname:string)=>['localhost','127.0.0.1','[::1]','10.0.2.2'].includes(hostname);
const privateHost=(hostname:string)=>localhost(hostname)||/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)||/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)||/^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
/** Separate native transport admission. Browser cookie/origin behavior is not relaxed. */
export function assertMobileRequest(request:NextRequest):void {
 const host=request.headers.get('host');let requested:URL;
 try{requested=new URL(`${request.nextUrl.protocol}//${host??''}`);}catch{throw new AppError(403,'This mobile request address is invalid.');}
 if(!host||requested.host!==host||requested.username||requested.password||requested.pathname!=='/'||requested.search||requested.hash||!['http:','https:'].includes(requested.protocol))throw new AppError(403,'This mobile request address is invalid.');
 let expected:string;
 if(hostedDemo()){
  try{validateHostedDemo();expected=demoOrigin();}catch{throw new AppError(503,'The private mobile demonstration is not configured.');}
 }else{
  if(process.env.AGENTDESK_DEMO!=='true'||process.env.NODE_ENV==='production'&&process.env.AGENTDESK_ALLOW_PRODUCTION_DEMO!=='true')throw new AppError(403,'Mobile demonstration access is disabled.');
  const configured=process.env.AGENTDESK_MOBILE_DEV_ORIGIN;
  if(configured){let url:URL;try{url=new URL(configured);}catch{throw new AppError(503,'The mobile development origin is invalid.');}
   if(!privateHost(url.hostname)||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new AppError(503,'Use an explicit private development origin.');
   expected=url.origin;
   if(localhost(requested.hostname))expected=requested.origin;
  }else{if(!localhost(requested.hostname))throw new AppError(403,'Configure the exact private development address before connecting a phone.');expected=requested.origin;}
 }
 const origin=request.headers.get('origin');
 if(request.headers.get('host')!==new URL(expected).host||origin&&origin!==expected||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'This mobile request origin is not authorized.');
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('x-agentdesk-request')!=='1')throw new AppError(403,'Request verification is required.');
}
function actorFor(row:{organization_id:string;office_id:string;user_id:string;role:Role}):Actor {
 const member=getDb().prepare('SELECT u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.office_id=? AND m.user_id=?').get(row.organization_id,row.office_id,row.user_id) as {name:string;role:Role}|undefined;
 if(!member||member.role!==row.role)throw new AppError(401,'This phone connection is no longer authorized. Connect it again from your workspace.');
 return {id:row.user_id,name:member.name,organizationId:row.organization_id,officeId:row.office_id,role:member.role};
}
export function requireMobileSession(sessionId:string):{actor:Actor;session:MobileSession} {
 const row=getDb().prepare('SELECT * FROM mobile_sessions WHERE id=?').get(sessionId) as SessionRow|undefined;
 if(!row||row.revoked_at||Date.parse(row.expires_at)<=Date.now())throw new AppError(401,'This phone connection expired or was disconnected. Connect it again from your workspace.');
 return {actor:actorFor(row),session:toSession(row)};
}
export function getMobileAuthentication(request:NextRequest):{actor:Actor;session:MobileSession}|null {
 const auth=request.headers.get('authorization');if(!auth)return null;
 assertMobileRequest(request);
 const match=/^Bearer (adnw_[A-Za-z0-9_-]{43})$/.exec(auth);if(!match)throw new AppError(401,'The phone connection is invalid.');
 const row=getDb().prepare('SELECT id FROM mobile_sessions WHERE token_hash=?').get(hash(match[1])) as {id:string}|undefined;
 if(!row)throw new AppError(401,'The phone connection is invalid.');return requireMobileSession(row.id);
}
export function createMobilePairing(actor:Actor):MobilePairing {
 assertActor(actor);requireFeature(actor,'core');return getDb().transaction(()=>{
  const db=getDb();db.prepare('UPDATE mobile_pairings SET consumed_at=? WHERE organization_id=? AND office_id=? AND user_id=? AND consumed_at IS NULL').run(now(),...scope(actor));
  let code='';for(let tries=0;tries<8;tries++){code=String(randomInt(100_000_000)).padStart(8,'0');if(!db.prepare('SELECT 1 FROM mobile_pairings WHERE code_hash=?').get(hash(code)))break;}
  const expiresAt=new Date(Date.now()+10*60_000).toISOString(),id=newId('mobile_pair');
  db.prepare('INSERT INTO mobile_pairings VALUES(?,?,?,?,?,?,?,?,NULL)').run(id,...scope(actor),actor.role,hash(code),now(),expiresAt);
  audit(actor,'mobile.pairing_created',id);return {code,expiresAt};
 }).immediate();
}
function limitPairAttempts(){
 const db=getDb(),stamp=Date.now();db.transaction(()=>{
  const row=db.prepare('SELECT started_at,attempts FROM mobile_pair_rate_limits WHERE id=?').get('global') as {started_at:number;attempts:number}|undefined;
  if(row&&stamp-row.started_at<60_000&&row.attempts>=20)throw new AppError(429,'Too many connection attempts. Wait a minute and try again.');
  if(!row||stamp-row.started_at>=60_000)db.prepare("INSERT INTO mobile_pair_rate_limits VALUES('global',?,1) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at,attempts=1").run(stamp);
  else db.prepare("UPDATE mobile_pair_rate_limits SET attempts=attempts+1 WHERE id='global'").run();
 }).immediate();
}
export function pairMobileDevice(input:unknown):MobilePairResult {
 limitPairAttempts();const parsed=z.object({code:z.string().regex(/^\d{8}$/),deviceName:z.string().trim().min(1).max(80)}).strict().parse(input);
 return getDb().transaction(()=>{
  const db=getDb(),pair=db.prepare('SELECT * FROM mobile_pairings WHERE code_hash=?').get(hash(parsed.code)) as {id:string;organization_id:string;office_id:string;user_id:string;role:Role;expires_at:string;consumed_at:string|null}|undefined;
  if(!pair||pair.consumed_at||Date.parse(pair.expires_at)<=Date.now())throw new AppError(401,'That connection code is invalid or expired. Create a new code in your workspace.');
  const actor=actorFor(pair);requireFeature(actor,'core');
  const active=(db.prepare('SELECT count(*) AS n FROM mobile_sessions WHERE organization_id=? AND office_id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?').get(...scope(actor),now()) as {n:number}).n;
  if(active>=10)throw new AppError(409,'Disconnect an unused phone before adding another.');
  const id=newId('mobile'),token=`adnw_${randomBytes(32).toString('base64url')}`,expiresAt=new Date(Date.now()+30*24*60*60_000).toISOString();
  db.prepare('INSERT INTO mobile_sessions VALUES(?,?,?,?,?,?,?,?,?,NULL)').run(id,...scope(actor),actor.role,parsed.deviceName,hash(token),now(),expiresAt);
  db.prepare('UPDATE mobile_pairings SET consumed_at=? WHERE id=?').run(now(),pair.id);
  const conversationId=messagingConversation(actor);audit(actor,'mobile.connected',id);
  return {token,expiresAt,actor,conversationId,sessionId:id};
 }).immediate();
}
export function mobileConnection(sessionId:string):MobileConnection {
 const {actor,session}=requireMobileSession(sessionId);return {actor,conversationId:messagingConversation(actor),expiresAt:session.expiresAt,sessionId};
}
export function listMobileDevices(actor:Actor):MobileDevices {
 assertActor(actor);return {mode:'demonstration',devices:(getDb().prepare('SELECT * FROM mobile_sessions WHERE organization_id=? AND office_id=? AND user_id=? ORDER BY created_at DESC LIMIT 30').all(...scope(actor)) as SessionRow[]).map(row=>{const value=toSession(row);return {id:value.id,deviceName:value.deviceName,createdAt:value.createdAt,expiresAt:value.expiresAt,revokedAt:value.revokedAt};})};
}
export function revokeMobileSession(actor:Actor,sessionId:string):void {
 assertActor(actor);const result=getDb().prepare('UPDATE mobile_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').run(now(),sessionId,...scope(actor));
 if(!result.changes)throw new AppError(404,'Phone connection not found in your workspace.');audit(actor,'mobile.disconnected',sessionId);
}
