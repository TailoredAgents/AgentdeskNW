import {createPublicKey,randomBytes,verify} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import {AppError,getDb,now,audit} from './db';
import {resolveVerifiedCompanySubject} from './company-identity';
import {sealCredential,openCredential,tokenHash,boundedProviderJson} from './credential-vault';
import {fingerprint} from './provider-runtime';

export const companyAuthentication=()=>process.env.AGENTDESK_AUTH_MODE==='company_oidc';
const https=z.string().url().max(1000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search;});
const configSchema=z.object({issuer:https,clientId:z.string().min(1).max(240),authorizationEndpoint:https,tokenEndpoint:https,jwksUri:https,origin:https}).strict();
export function companyAuthConfig(){
 if(!companyAuthentication())throw new AppError(404,'Company sign-in is not enabled.');
 const parsed=configSchema.safeParse({issuer:process.env.AGENTDESK_OIDC_ISSUER,clientId:process.env.AGENTDESK_OIDC_CLIENT_ID,authorizationEndpoint:process.env.AGENTDESK_OIDC_AUTHORIZATION_ENDPOINT,tokenEndpoint:process.env.AGENTDESK_OIDC_TOKEN_ENDPOINT,jwksUri:process.env.AGENTDESK_OIDC_JWKS_URI,origin:process.env.AGENTDESK_APP_ORIGIN});
 if(!parsed.success||!process.env.AGENTDESK_OIDC_CLIENT_SECRET)throw new AppError(503,'Company sign-in configuration is incomplete.');
 if(new URL(parsed.data.origin).origin!==parsed.data.origin)throw new AppError(503,'The application origin must have no path.');
 return {...parsed.data,redirectUri:`${parsed.data.origin}/api/company-auth/callback`};
}
type LoginSecrets={verifier:string;nonce:string};
const random=()=>randomBytes(32).toString('base64url');
const loginMinutes=10,sessionHours=8,idleMinutes=30;
export function beginCompanyLogin(){
 const config=companyAuthConfig(),state=random(),browser=random(),verifier=random(),nonce=random(),stamp=now();
 const stateHash=tokenHash(state),secret=sealCredential({verifier,nonce},`oidc:${stateHash}`);
 getDb().transaction(()=>{
  getDb().prepare('DELETE FROM company_login_transactions WHERE expires_at<?').run(stamp);
  const pending=(getDb().prepare('SELECT COUNT(*) n FROM company_login_transactions').get() as {n:number}).n;if(pending>=200)throw new AppError(429,'Too many pending sign-ins. Please try again shortly.');
  getDb().prepare("INSERT INTO company_login_transactions VALUES(?,?,?,?,?,?,'pending')").run(stateHash,tokenHash(browser),fingerprint(config),secret,stamp,new Date(Date.now()+loginMinutes*60_000).toISOString());
 }).immediate();
 const url=new URL(config.authorizationEndpoint);for(const [key,value] of Object.entries({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:'openid',state,nonce,code_challenge:Buffer.from(tokenHash(verifier),'hex').toString('base64url'),code_challenge_method:'S256',max_age:'0'}))url.searchParams.set(key,value);
 return {url:url.href,browser,maxAge:loginMinutes*60};
}
const claimsSchema=z.object({iss:z.string(),sub:z.string().min(1).max(240),aud:z.union([z.string(),z.array(z.string()).min(1)]),exp:z.number().int(),iat:z.number().int(),nbf:z.number().int().optional(),nonce:z.string(),azp:z.string().optional(),auth_time:z.number().int()});
/** RS256 only; remote key URLs and alternate algorithms from JWT headers are never followed. */
async function verifyCompanyIdToken(token:string,nonce:string,config:ReturnType<typeof companyAuthConfig>){
 if(token.length>24000)throw new AppError(401,'Invalid company identity token.');
 const pieces=token.split('.');if(pieces.length!==3||pieces.some(v=>!v||!/^[A-Za-z0-9_-]+$/.test(v)))throw new AppError(401,'Invalid company identity token.');
 let header:{alg:string;kid:string},claims:z.infer<typeof claimsSchema>;
 try{header=z.object({alg:z.literal('RS256'),kid:z.string().min(1).max(240),typ:z.string().optional(),x5t:z.string().optional(),'x5t#S256':z.string().optional()}).strict().parse(JSON.parse(Buffer.from(pieces[0],'base64url').toString()));claims=claimsSchema.parse(JSON.parse(Buffer.from(pieces[1],'base64url').toString()));}catch{throw new AppError(401,'Invalid company identity claims.');}
 const seconds=Math.floor(Date.now()/1000),aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
 if(claims.iss!==config.issuer||!aud.includes(config.clientId)||(aud.length>1||claims.azp!==undefined)&&claims.azp!==config.clientId||claims.nonce!==nonce||claims.exp<=seconds||claims.iat>seconds+30||claims.iat<seconds-600||claims.exp<=claims.iat||claims.nbf!==undefined&&claims.nbf>seconds+30||claims.auth_time>seconds+30||claims.auth_time<seconds-600)throw new AppError(401,'Company identity claims do not match this sign-in.');
 const response=await fetch(config.jwksUri,{redirect:'error',signal:AbortSignal.timeout(10_000),headers:{Accept:'application/json'}});
 const jwks=z.object({keys:z.array(z.object({kty:z.string(),kid:z.string().optional(),alg:z.string().optional(),use:z.string().optional(),key_ops:z.array(z.string()).optional(),n:z.string().optional(),e:z.string().optional()}).passthrough()).max(40)}).safeParse(await boundedProviderJson(response));
 if(!jwks.success)throw new AppError(401,'Company verification keys are invalid.');
 const matches=jwks.data.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig')&&(!k.key_ops||k.key_ops.includes('verify'))&&k.n&&k.e);
 if(matches.length!==1||Buffer.from(matches[0].n!,'base64url').length<256)throw new AppError(401,'Company verification key is unavailable.');
 const publicKey=createPublicKey({key:{kty:'RSA',n:matches[0].n!,e:matches[0].e!},format:'jwk'});
 if(!verify('RSA-SHA256',Buffer.from(`${pieces[0]}.${pieces[1]}`),publicKey,Buffer.from(pieces[2],'base64url')))throw new AppError(401,'Company identity signature is invalid.');
 return claims;
}
export async function completeCompanyLogin(input:{state:string;code:string;browser:string}){
 const config=companyAuthConfig();if(!/^[A-Za-z0-9_-]{43}$/.test(input.state)||!input.browser||!input.code||input.code.length>4000)throw new AppError(401,'The company sign-in transaction is invalid.');
 const stateHash=tokenHash(input.state);
 const saved=getDb().transaction(()=>{
  const row=getDb().prepare('SELECT * FROM company_login_transactions WHERE state_hash=?').get(stateHash) as {browser_hash:string;configuration_hash:string;secret:string;expires_at:string;status:string;created_at:string}|undefined;
  if(!row||row.browser_hash!==tokenHash(input.browser)||row.configuration_hash!==fingerprint(config)||row.expires_at<=now()||row.status!=='pending')throw new AppError(401,'This sign-in expired or was already used. Start again.');
  getDb().prepare("UPDATE company_login_transactions SET status='claimed' WHERE state_hash=?").run(stateHash);return row;
 }).immediate();
 try{
  const secrets=openCredential<LoginSecrets>(saved.secret,`oidc:${stateHash}`);
  const body=new URLSearchParams({grant_type:'authorization_code',code:input.code,client_id:config.clientId,client_secret:process.env.AGENTDESK_OIDC_CLIENT_SECRET!,redirect_uri:config.redirectUri,code_verifier:secrets.verifier});
  const response=await fetch(config.tokenEndpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body});
  const tokens=z.object({id_token:z.string().min(1).max(24000)}).safeParse(await boundedProviderJson(response));if(!tokens.success)throw new AppError(401,'Company sign-in did not return an identity token.');
  const claims=await verifyCompanyIdToken(tokens.data.id_token,secrets.nonce,config);
  if(claims.auth_time*1000<Date.parse(saved.created_at)-30_000)throw new AppError(401,'A fresh company sign-in is required.');
  if(fingerprint(companyAuthConfig())!==fingerprint(config))throw new AppError(409,'Company sign-in configuration changed. Start again.');
  return getDb().transaction(()=>{
   const binding=resolveVerifiedCompanySubject({issuer:claims.iss,subject:claims.sub}),token=random(),stamp=now();
   getDb().prepare('INSERT INTO company_sessions VALUES(?,?,?,?,?,?,?,?,NULL)').run(tokenHash(token),claims.iss,claims.sub,binding.bindingVersion,fingerprint(config),stamp,new Date(Date.now()+sessionHours*3600_000).toISOString(),stamp);
   getDb().prepare("UPDATE company_login_transactions SET status='completed',secret='' WHERE state_hash=?").run(stateHash);audit(binding.actor,'identity.signed_in',binding.actor.id);
   return {token,actor:binding.actor,maxAge:sessionHours*3600};
  }).immediate();
 }catch(error){getDb().prepare("UPDATE company_login_transactions SET status='failed',secret='' WHERE state_hash=?").run(stateHash);if(error instanceof AppError)throw error;throw new AppError(401,'Company sign-in could not be verified. Start again.');}
}
export function companySessionActor(token:string|undefined):Actor|null{
 if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const hash=tokenHash(token),config=companyAuthConfig();
 const row=getDb().prepare('SELECT * FROM company_sessions WHERE token_hash=?').get(hash) as {issuer:string;subject:string;binding_version:number;configuration_hash:string;expires_at:string;last_seen_at:string;revoked_at:string|null}|undefined;
 if(!row||row.revoked_at||row.expires_at<=now()||Date.parse(row.last_seen_at)<Date.now()-idleMinutes*60_000||row.configuration_hash!==fingerprint(config))return null;
 try{const {actor}=resolveVerifiedCompanySubject({issuer:row.issuer,subject:row.subject},row.binding_version);getDb().prepare('UPDATE company_sessions SET last_seen_at=? WHERE token_hash=? AND revoked_at IS NULL').run(now(),hash);return actor;}catch(error){if(!(error instanceof AppError))throw error;getDb().prepare('UPDATE company_sessions SET revoked_at=? WHERE token_hash=?').run(now(),hash);return null;}
}
export function endCompanySession(token:string|undefined){if(token)getDb().prepare('UPDATE company_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(now(),tokenHash(token));}
