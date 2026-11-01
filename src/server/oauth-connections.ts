import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {ConnectionCapability} from '../lib/connection-contracts';
import {AppError,assertActor,getDb,audit,now} from './db';
import {fingerprint} from './provider-runtime';
import {sealCredential,openCredential,tokenHash,boundedProviderJson} from './credential-vault';

const https=z.string().url().max(1000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search;});
const profileSchema=z.object({connectionId:z.string().min(1).max(160).optional(),remoteTenant:z.string().min(1).max(160).optional(),provider:z.literal('salesforce'),authorizationEndpoint:https,tokenEndpoint:https,revocationEndpoint:https,userinfoEndpoint:https,instanceOrigin:https,clientId:z.string().min(1).max(240),clientSecretEnv:z.string().regex(/^AGENTDESK_OAUTH_[A-Z0-9_]+_SECRET$/),redirectUri:https,scopes:z.array(z.enum(['api','refresh_token','openid'])).min(1).max(3)}).strict().refine(v=>!!v.connectionId!==!!v.remoteTenant,'Choose one connection or one approved company tenant.');
type Profile=z.infer<typeof profileSchema>;
interface Connection {id:string;version:number;state:string;mode:string;provider:string;remote_tenant:string;remote_user:string;data:string}
interface Tokens {accessToken:string;refreshToken?:string;scopes:string[]}
interface Grant {connection_id:string;connection_version:number;profile_hash:string;version:number;status:string;secret:string;expires_at:string}
const owner=(actor:Actor)=>[actor.organizationId,actor.officeId,actor.id];
function connection(actor:Actor,id:string){assertActor(actor);const row=getDb().prepare('SELECT * FROM capability_connections WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id,...owner(actor)) as Connection|undefined;if(!row||row.state!=='prepared'||row.mode!=='live')throw new AppError(403,'This live source is not currently authorized for your workspace.');return row;}
/** Operator-approved profiles only: endpoints, scopes and secrets can never come from client/model input. */
export function oauthProfile(id:string):Profile {
 try{const raw=process.env.AGENTDESK_OAUTH_PROFILES??'[]';if(raw.length>40000)throw new Error();const values=z.array(profileSchema).max(20).parse(JSON.parse(raw));if(new Set(values.map(v=>v.connectionId?`connection:${v.connectionId}`:`tenant:${v.remoteTenant}`)).size!==values.length)throw new Error();const source=getDb().prepare('SELECT remote_tenant,provider FROM capability_connections WHERE id=?').get(id) as {remote_tenant:string;provider:string}|undefined;const profile=values.find(v=>v.connectionId===id)??values.find(v=>!!source&&v.remoteTenant===source.remote_tenant&&v.provider===source.provider);if(!profile||!process.env[profile.clientSecretEnv])throw new Error();
  for(const url of [profile.authorizationEndpoint,profile.tokenEndpoint,profile.revocationEndpoint,profile.userinfoEndpoint,profile.instanceOrigin]){const parsed=new URL(url);if(parsed.port||!/^([a-z0-9-]+\.)+(salesforce\.com|force\.com)$/i.test(parsed.hostname))throw new Error();}
  if(new URL(profile.instanceOrigin).origin!==profile.instanceOrigin||!profile.scopes.includes('api')||!profile.scopes.includes('openid')||new Set(profile.scopes).size!==profile.scopes.length)throw new Error();return profile;
 }catch{throw new AppError(503,'The approved Salesforce OAuth profile is unavailable or invalid.');}
}
export function connectionAuthorizationStatus(id:string):'not_connected'|'connected'|'needs_attention'|'revoked'{const grant=getDb().prepare('SELECT status,profile_hash FROM oauth_grants WHERE connection_id=?').get(id) as {status:string;profile_hash:string}|undefined;if(!grant)return 'not_connected';if(grant.status==='revoked')return 'revoked';try{return grant.status==='active'&&grant.profile_hash===fingerprint(oauthProfile(id))?'connected':'needs_attention';}catch{return 'needs_attention';}}
const purpose=(id:string,version:number)=>`oauth:${id}:${version}`;
export function beginConnectionOAuth(actor:Actor,id:string,expectedVersion:number){
 const row=connection(actor,id),profile=oauthProfile(id);if(row.version!==expectedVersion||row.provider!==profile.provider)throw new AppError(409,'Review the current connection before authorizing it.');
 const state=randomBytes(32).toString('base64url'),browser=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),hash=tokenHash(state);
 getDb().transaction(()=>{
  getDb().prepare('DELETE FROM oauth_transactions WHERE expires_at<?').run(now());
  if((getDb().prepare('SELECT COUNT(*) n FROM oauth_transactions').get() as {n:number}).n>=200)throw new AppError(429,'Too many pending connection requests.');
  getDb().prepare("UPDATE oauth_transactions SET status='failed',secret='' WHERE connection_id=? AND status IN ('pending','claimed')").run(id);
  getDb().prepare("INSERT INTO oauth_transactions VALUES(?,?,?,?,?,?,?,'pending')").run(hash,id,row.version,fingerprint(profile),tokenHash(browser),sealCredential({verifier},`oauth-login:${hash}`),new Date(Date.now()+600_000).toISOString());
 }).immediate();
 const url=new URL(profile.authorizationEndpoint);for(const [key,value] of Object.entries({response_type:'code',client_id:profile.clientId,redirect_uri:profile.redirectUri,scope:profile.scopes.join(' '),state,code_challenge:Buffer.from(tokenHash(verifier),'hex').toString('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
 return {url:url.href,browser,maxAge:600};
}
const tokenResponse=z.object({access_token:z.string().min(1).max(16000),refresh_token:z.string().min(1).max(16000).optional(),token_type:z.string().refine(v=>v.toLowerCase()==='bearer'),expires_in:z.number().int().min(60).max(86400).optional(),scope:z.string().max(1000).optional(),instance_url:https.optional()});
function normalizeToken(raw:unknown,profile:Profile,prior?:Tokens){
 const value=tokenResponse.safeParse(raw);if(!value.success)throw new AppError(502,'The token response is incomplete. Reconnect this source.');
 if(value.data.instance_url&&value.data.instance_url!==profile.instanceOrigin)throw new AppError(403,'The authorized Salesforce instance differs from the approved source.');
 const scopes=value.data.scope?.trim().split(/\s+/)??prior?.scopes??profile.scopes;
 if(scopes.some(scope=>!profile.scopes.includes(scope as Profile['scopes'][number]))||!scopes.includes('api'))throw new AppError(403,'The granted permissions differ from the approved scope.');
 // Salesforce may omit expires_in. Use a short local validity window and refresh explicitly.
 return {tokens:{accessToken:value.data.access_token,refreshToken:value.data.refresh_token??prior?.refreshToken,scopes} satisfies Tokens,expiresAt:new Date(Date.now()+(value.data.expires_in??300)*1000).toISOString()};
}
async function verifyProviderIdentity(profile:Profile,tokens:Tokens,row:Connection){
 const response=await fetch(profile.userinfoEndpoint,{headers:{Authorization:`Bearer ${tokens.accessToken}`},redirect:'error',signal:AbortSignal.timeout(10_000)});
 const identity=z.object({organization_id:z.string(),user_id:z.string()}).safeParse(await boundedProviderJson(response));
 if(!identity.success||identity.data.organization_id!==row.remote_tenant||identity.data.user_id!==row.remote_user)throw new AppError(403,'This Salesforce account is not the employee and organization approved for this source.');
}
export async function completeConnectionOAuth(actor:Actor,input:{state:string;code:string;browser:string}){
 if(!/^[A-Za-z0-9_-]{43}$/.test(input.state)||!input.code||input.code.length>4000)throw new AppError(401,'Invalid connection callback.');const hash=tokenHash(input.state);
 const saved=getDb().transaction(()=>{
  const tx=getDb().prepare('SELECT * FROM oauth_transactions WHERE state_hash=?').get(hash) as {connection_id:string;connection_version:number;profile_hash:string;browser_hash:string;secret:string;expires_at:string;status:string}|undefined;
  if(!tx||tx.status!=='pending'||tx.browser_hash!==tokenHash(input.browser)||tx.expires_at<=now())throw new AppError(401,'Connection authorization expired or was already used.');
  const row=connection(actor,tx.connection_id),profile=oauthProfile(row.id);if(row.version!==tx.connection_version||fingerprint(profile)!==tx.profile_hash)throw new AppError(409,'The connection scope changed.');
  getDb().prepare("UPDATE oauth_transactions SET status='claimed' WHERE state_hash=?").run(hash);return {tx,row,profile};
 }).immediate();
 try{
  const {verifier}=openCredential<{verifier:string}>(saved.tx.secret,`oauth-login:${hash}`),profile=saved.profile;
  const response=await fetch(profile.tokenEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:input.code,client_id:profile.clientId,client_secret:process.env[profile.clientSecretEnv]!,redirect_uri:profile.redirectUri,code_verifier:verifier})});
  const parsed=normalizeToken(await boundedProviderJson(response),profile);await verifyProviderIdentity(profile,parsed.tokens,saved.row);
  return getDb().transaction(()=>{
   const tx=getDb().prepare('SELECT status FROM oauth_transactions WHERE state_hash=?').get(hash) as {status:string};if(tx.status!=='claimed')throw new AppError(409,'This authorization was revoked while connecting.');
   const row=connection(actor,saved.row.id);if(row.version!==saved.row.version||fingerprint(oauthProfile(row.id))!==saved.tx.profile_hash)throw new AppError(409,'Connection authority changed during authorization.');
   const prior=getDb().prepare('SELECT version,status FROM oauth_grants WHERE connection_id=?').get(row.id) as {version:number;status:string}|undefined;
   if(prior?.status==='refreshing')throw new AppError(409,'An earlier token refresh is unresolved. Stop it before reconnecting.');
   const version=(prior?.version??0)+1;
   getDb().prepare("INSERT INTO oauth_grants VALUES(?,?,?,?,'active',?,?,?) ON CONFLICT(connection_id) DO UPDATE SET connection_version=excluded.connection_version,profile_hash=excluded.profile_hash,version=excluded.version,status='active',secret=excluded.secret,expires_at=excluded.expires_at,updated_at=excluded.updated_at").run(row.id,row.version,saved.tx.profile_hash,version,sealCredential(parsed.tokens,purpose(row.id,version)),parsed.expiresAt,now());
   getDb().prepare("UPDATE oauth_transactions SET status='completed',secret='' WHERE state_hash=?").run(hash);audit(actor,'connection.authorized',row.id,{provider:profile.provider});return {connectionId:row.id,authorized:true as const};
  }).immediate();
 }catch(error){getDb().prepare("UPDATE oauth_transactions SET status='failed',secret='' WHERE state_hash=?").run(hash);if(error instanceof AppError)throw error;throw new AppError(502,'The authorization outcome could not be verified. Start a new connection authorization.');}
}
/** Trusted adapters only. This module has no route that returns tokens. */
export async function connectionAccessToken(actor:Actor,id:string,expectedVersion:number,capability:ConnectionCapability){
 const row=connection(actor,id),profile=oauthProfile(id);if(row.version!==expectedVersion||!(JSON.parse(row.data) as {capabilities:string[]}).capabilities.includes(capability))throw new AppError(403,'This source does not authorize that capability.');
 const claim=getDb().transaction(()=>{
  const grant=getDb().prepare('SELECT * FROM oauth_grants WHERE connection_id=?').get(id) as Grant|undefined;
  if(!grant||grant.status!=='active'||grant.connection_version!==row.version||grant.profile_hash!==fingerprint(profile))throw new AppError(409,'This connection needs authorization or token recovery.');
  const tokens=openCredential<Tokens>(grant.secret,purpose(id,grant.version));
  if(Date.parse(grant.expires_at)>Date.now()+60_000)return {grant,tokens,refresh:false};
  if(!tokens.refreshToken)throw new AppError(401,'Reconnect this source to renew its authorization.');
  getDb().prepare("UPDATE oauth_grants SET status='refreshing',updated_at=? WHERE connection_id=? AND version=? AND status='active'").run(now(),id,grant.version);return {grant,tokens,refresh:true};
 }).immediate();
 if(!claim.refresh)return claim.tokens.accessToken;
 try{
  const response=await fetch(profile.tokenEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:claim.tokens.refreshToken!,client_id:profile.clientId,client_secret:process.env[profile.clientSecretEnv]!})});
  const parsed=normalizeToken(await boundedProviderJson(response),profile,claim.tokens);await verifyProviderIdentity(profile,parsed.tokens,row);
  return getDb().transaction(()=>{
   const current=connection(actor,id);if(current.version!==row.version||fingerprint(oauthProfile(id))!==claim.grant.profile_hash)throw new AppError(409,'Connection authority changed during renewal.');
   const version=claim.grant.version+1,updated=getDb().prepare("UPDATE oauth_grants SET version=?,status='active',secret=?,expires_at=?,updated_at=? WHERE connection_id=? AND version=? AND status='refreshing'").run(version,sealCredential(parsed.tokens,purpose(id,version)),parsed.expiresAt,now(),id,claim.grant.version);
   if(!updated.changes)throw new AppError(409,'This connection was revoked or changed during renewal.');return parsed.tokens.accessToken;
  }).immediate();
 }catch(error){getDb().prepare("UPDATE oauth_grants SET status='unknown',updated_at=? WHERE connection_id=? AND version=? AND status='refreshing'").run(now(),id,claim.grant.version);if(error instanceof AppError)throw error;throw new AppError(502,'Token renewal is uncertain. Reconnect explicitly; it will not be repeated automatically.');}
}
/** Local revocation is immediate even if the provider is unavailable. */
export function revokeSavedConnectionCredentials(actor:Actor,id:string){assertActor(actor);const owned=getDb().prepare('SELECT 1 FROM capability_connections WHERE id=? AND organization_id=? AND office_id=? AND user_id=?').get(id,...owner(actor));if(!owned)throw new AppError(404,'Source not found.');getDb().prepare("UPDATE oauth_grants SET status='revoked',secret='',updated_at=? WHERE connection_id=?").run(now(),id);getDb().prepare("UPDATE oauth_transactions SET status='failed',secret='' WHERE connection_id=? AND status IN ('pending','claimed')").run(id);}
export async function disconnectOAuthProvider(actor:Actor,id:string,expectedVersion?:number){
 const row=connection(actor,id);if(expectedVersion!==undefined&&row.version!==expectedVersion)throw new AppError(409,'Review the current connection before disconnecting.');const grant=getDb().prepare('SELECT * FROM oauth_grants WHERE connection_id=?').get(id) as Grant|undefined;
 let profile:Profile|undefined,token:Tokens|undefined;
 // Local removal must work even after a lost key or withdrawn provider profile.
 // Never send an old credential to a newly configured revocation destination.
 try{const current=oauthProfile(id);if(grant?.secret&&grant.profile_hash===fingerprint(current)){token=openCredential<Tokens>(grant.secret,purpose(id,grant.version));profile=current;}}catch{}
 revokeSavedConnectionCredentials(actor,id);audit(actor,'connection.credentials_revoked',id);
 if(!token||!profile)return {localRevoked:true,providerRevoked:false};
 try{const response=await fetch(profile.revocationEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refreshToken??token.accessToken})});return {localRevoked:true,providerRevoked:response.ok,connectionVersion:row.version};}catch{return {localRevoked:true,providerRevoked:false,connectionVersion:row.version};}
}
