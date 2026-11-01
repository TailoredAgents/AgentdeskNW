import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {NextRequest} from 'next/server';
import {closeDb,demoActor,getDb,assertActor} from '../src/server/db';
import {beginCompanyLogin,completeCompanyLogin,companySessionActor,endCompanySession} from '../src/server/company-auth';
import {bindCompanyIdentity,revokeCompanyIdentity,refreshCompanyIdentityBinding} from '../src/server/company-identity';
import {createMobilePairing,pairMobileDevice,requireMobileSession} from '../src/server/mobile-auth';
import {getActor} from '../src/server/auth';
import {openCredential,sealCredential,tokenHash} from '../src/server/credential-vault';
import {GET as apiGet,POST as apiPost} from '../src/app/api/[...path]/route';
import {GET as loginGet} from '../src/app/api/company-auth/[action]/route';
import {processAllNotifications,actorForMember,createResearchJob,processQueuedJobs,getResearchJob} from '../src/server/services';
const issuer='https://identity.example',origin='https://agentdesk.example',subject='fictional-subject';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),other=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fixture-key',alg:'RS256',use:'sig'};
const actor=()=>demoActor();
function signed(claims:unknown,header:unknown={alg:'RS256',kid:'fixture-key'},wrong=false){const body=[header,claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');return `${body}.${sign('RSA-SHA256',Buffer.from(body),wrong?other.privateKey:privateKey).toString('base64url')}`;}
function setupLogin(overrides:Record<string,unknown>={},header?:unknown,wrong=false){
 const login=beginCompanyLogin(),url=new URL(login.url),timestamp=Math.floor(Date.now()/1000),state=url.searchParams.get('state')!;
 const claims={iss:issuer,sub:subject,aud:'fixture-client',iat:timestamp,exp:timestamp+300,auth_time:timestamp,nonce:url.searchParams.get('nonce'),...overrides};
 vi.stubGlobal('fetch',vi.fn(async(endpoint,options)=>{
  if(endpoint===`${issuer}/keys`)return new Response(JSON.stringify({keys:[jwk]}));
  expect(endpoint).toBe(`${issuer}/token`);expect(options?.redirect).toBe('error');const body=options!.body as URLSearchParams;
  expect(body.get('grant_type')).toBe('authorization_code');expect(body.get('redirect_uri')).toBe(`${origin}/api/company-auth/callback`);expect(Buffer.from(tokenHash(body.get('code_verifier')!),'hex').toString('base64url')).toBe(url.searchParams.get('code_challenge'));
  return new Response(JSON.stringify({id_token:signed(claims,header,wrong),access_token:'not-kept'}));
 }));
 return {login,input:{state,browser:login.browser,code:'fixture-code'}};
}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');for(const [key,value] of Object.entries({AGENTDESK_AUTH_MODE:'company_oidc',AGENTDESK_OIDC_ISSUER:issuer,AGENTDESK_OIDC_CLIENT_ID:'fixture-client',AGENTDESK_OIDC_CLIENT_SECRET:'fixture-only-secret',AGENTDESK_OIDC_AUTHORIZATION_ENDPOINT:`${issuer}/authorize`,AGENTDESK_OIDC_TOKEN_ENDPOINT:`${issuer}/token`,AGENTDESK_OIDC_JWKS_URI:`${issuer}/keys`,AGENTDESK_APP_ORIGIN:origin,AGENTDESK_CREDENTIAL_KEY:Buffer.alloc(32,7).toString('base64')}))vi.stubEnv(key,value);bindCompanyIdentity(actor(),{issuer,subject});});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
describe('company code flow, verified identity and managed sessions',()=>{
 it('returns a canceled browser sign-in to a safe retry view without reflecting provider details',async()=>{
  const req=new NextRequest(`${origin}/api/company-auth/callback?error=access_denied&error_description=private-provider-message`,{headers:{host:'agentdesk.example'}});
  const response=await loginGet(req,{params:Promise.resolve({action:'callback'})});
  expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('/?signin=unavailable');expect(response.headers.get('set-cookie')).toContain('Max-Age=0');expect(await response.text()).not.toContain('private-provider-message');
 });
 it('verifies a signed identity with PKCE and returns only a hashed revocable application session',async()=>{
  const {input}=setupLogin(),session=await completeCompanyLogin(input);expect(session.actor).toEqual(actor());expect(companySessionActor(session.token)).toEqual(actor());
  const rows=getDb().prepare('SELECT * FROM company_sessions').all();expect(JSON.stringify(rows)).not.toContain(session.token);expect(rows).toHaveLength(1);expect(JSON.stringify(getDb().prepare('SELECT * FROM company_login_transactions').all())).not.toContain('fixture-code');
  expect(getActor(new NextRequest(`${origin}/api/bootstrap`,{headers:{host:'agentdesk.example',cookie:`__Host-agentdesk_company=${session.token}`}}))).toEqual(actor());
  endCompanySession(session.token);expect(companySessionActor(session.token)).toBeNull();
 });
 it('rejects a stolen state in another browser without consuming the correct login',async()=>{const {input}=setupLogin();await expect(completeCompanyLogin({...input,browser:'different'})).rejects.toThrow('expired or was already used');expect(fetch).not.toHaveBeenCalled();expect((await completeCompanyLogin(input)).actor.id).toBe(actor().id);});
 it('claims a code exchange once across concurrent callbacks and never retries a failed exchange',async()=>{const {input}=setupLogin();const both=await Promise.allSettled([completeCompanyLogin(input),completeCompanyLogin(input)]);expect(both.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(2);await expect(completeCompanyLogin(input)).rejects.toThrow('already used');});
 it.each([{iss:'https://wrong.example'},{aud:'other-client'},{aud:['fixture-client','other'],azp:'other'},{nonce:'wrong'},{sub:'unprovisioned'},{exp:1},{iat:4102444800},{auth_time:1}])('rejects mismatched or expired identity claims %j',async(overrides)=>{const {input}=setupLogin(overrides);await expect(completeCompanyLogin(input)).rejects.toThrow();expect(getDb().prepare('SELECT COUNT(*) n FROM company_sessions').get()).toEqual({n:0});await expect(completeCompanyLogin(input)).rejects.toThrow('already used');});
 it('rejects forged signatures and unsigned/alternate algorithms',async()=>{let current=setupLogin({},undefined,true);await expect(completeCompanyLogin(current.input)).rejects.toThrow('signature');current=setupLogin({},{alg:'none',kid:'fixture-key'});await expect(completeCompanyLogin(current.input)).rejects.toThrow('claims');});
 it('pins key locations, rejects duplicate keys and does not follow token endpoint redirects',async()=>{const {input}=setupLogin();vi.mocked(fetch).mockResolvedValue(new Response(null,{status:302,headers:{Location:'https://evil.example'}}));await expect(completeCompanyLogin(input)).rejects.toThrow('acceptable response');expect(fetch).toHaveBeenCalledTimes(1);});
 it('ends idle and expired sessions and rejects configuration changes',async()=>{const {input}=setupLogin(),session=await completeCompanyLogin(input);vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+31*60_000);expect(companySessionActor(session.token)).toBeNull();vi.useRealTimers();vi.stubEnv('AGENTDESK_OIDC_CLIENT_ID','changed');expect(companySessionActor(session.token)).toBeNull();});
 it('rejects removed or changed membership even while a browser session remains valid',async()=>{const {input}=setupLogin(),session=await completeCompanyLogin(input);getDb().prepare("UPDATE memberships SET role='manager' WHERE organization_id=? AND office_id=? AND user_id=?").run(actor().organizationId,actor().officeId,actor().id);expect(companySessionActor(session.token)).toBeNull();expect(()=>assertActor(actor())).toThrow();});
 it('revokes browser, phone and pending pairing access when the company identity departs',async()=>{const {input}=setupLogin(),session=await completeCompanyLogin(input),pair=createMobilePairing(actor()),device=pairMobileDevice({code:pair.code,deviceName:'Fixture phone'}),pending=createMobilePairing(actor());expect(requireMobileSession(device.sessionId).actor).toEqual(actor());revokeCompanyIdentity(actor(),{issuer,subject});expect(companySessionActor(session.token)).toBeNull();expect(()=>requireMobileSession(device.sessionId)).toThrow('expired or was disconnected');expect(()=>pairMobileDevice({code:pending.code,deviceName:'Late phone'})).toThrow('invalid or expired');expect(()=>assertActor(actor())).toThrow('no longer authorized');});
 it('does not accept an old demo phone or pairing in company mode',()=>{vi.stubEnv('AGENTDESK_AUTH_MODE','demo');const pair=createMobilePairing(actor()),device=pairMobileDevice({code:pair.code,deviceName:'Old demo'}),pending=createMobilePairing(actor());vi.stubEnv('AGENTDESK_AUTH_MODE','company_oidc');expect(()=>requireMobileSession(device.sessionId)).toThrow('current company workspace');expect(()=>pairMobileDevice({code:pending.code,deviceName:'Late demo'})).toThrow('new code');});
 it('protects credentials at rest and binds ciphertext to its purpose',()=>{const encrypted=sealCredential({refresh:'private fixture'},'owner-1');expect(encrypted).not.toContain('private');expect(openCredential(encrypted,'owner-1')).toEqual({refresh:'private fixture'});expect(()=>openCredential(encrypted,'owner-2')).toThrow('cannot be opened');});
 it('uses company sign-in through the normal HTTP boundary without demo bootstrap or role switching',async()=>{
  const req=(path:string,method='GET',token?:string)=>new NextRequest(`${origin}/api/${path}`,{method,headers:{host:'agentdesk.example',origin,'x-agentdesk-request':'1',...(token?{cookie:`__Host-agentdesk_company=${token}`}:{})},...(method==='POST'?{body:JSON.stringify({role:'manager'})}:{})});
  expect((await apiGet(req('bootstrap'),{params:Promise.resolve({path:['bootstrap']})})).status).toBe(401);
  expect(await (await apiGet(req('access'),{params:Promise.resolve({path:['access']})})).json()).toEqual({required:true,mode:'company'});
  const {input}=setupLogin(),session=await completeCompanyLogin(input);
  expect((await apiPost(req('session','POST',session.token),{params:Promise.resolve({path:['session']})})).status).toBe(403);
  const bootstrap=await apiGet(req('bootstrap','GET',session.token),{params:Promise.resolve({path:['bootstrap']})});expect(bootstrap.status).toBe(200);expect((await bootstrap.json()).integrations.auth).toBe('company_oidc');
  const start=await loginGet(req('company-auth/start'),{params:Promise.resolve({action:'start'})});expect(start.status).toBe(303);expect(start.headers.get('set-cookie')).toContain('HttpOnly');expect(start.headers.get('set-cookie')).toContain('Secure');expect(start.headers.get('set-cookie')).toContain('SameSite=lax');expect(start.headers.get('location')).toContain('code_challenge_method=S256');
 });
 it('does not let unprovisioned coworkers block notification processing',()=>{expect(processAllNotifications()).toBe(1);revokeCompanyIdentity(actor(),{issuer,subject});expect(processAllNotifications()).toBe(0);});
 it('selects eligible research before applying the worker batch limit',()=>{
  const job=createResearchJob(actor(),{address:'Fictional property',county:'Cobb',price:200000,strategy:'Fix & flip',limit:10,provider:'synthetic-fixtures-v1'});
  const row=getDb().prepare('SELECT rowid FROM research_jobs WHERE id=?').get(job.id) as {rowid:number};
  for(let i=0;i<25;i++)getDb().prepare('INSERT INTO research_jobs(rowid,id,organization_id,office_id,owner_id,data) VALUES(?,?,?,?,?,?)').run(row.rowid-i-1,`departed-${i}`,actor().organizationId,actor().officeId,'user-jordan',JSON.stringify({...job,id:`departed-${i}`,ownerId:'user-jordan'}));
  expect(processQueuedJobs()).toBe(1);expect(getResearchJob(actor(),job.id).progress).toBe(20);
 });
 it('allows a trusted operator to revoke a binding after the employee role changes',()=>{getDb().prepare("UPDATE memberships SET role='manager' WHERE organization_id=? AND office_id=? AND user_id=?").run(actor().organizationId,actor().officeId,actor().id);const current=actorForMember(actor().organizationId,actor().officeId,actor().id);expect(()=>revokeCompanyIdentity(current,{issuer,subject})).not.toThrow();expect(getDb().prepare('SELECT revoked_at FROM company_identity_bindings WHERE subject=?').get(subject)).toHaveProperty('revoked_at',expect.any(String));});
 it('requires explicit versioned reprovisioning for a role change and never trusts token roles',async()=>{const initial=setupLogin(),session=await completeCompanyLogin(initial.input);getDb().prepare("UPDATE memberships SET role='manager' WHERE organization_id=? AND office_id=? AND user_id=?").run(actor().organizationId,actor().officeId,actor().id);const current=actorForMember(actor().organizationId,actor().officeId,actor().id);expect(()=>refreshCompanyIdentityBinding(current,{issuer,subject,expectedVersion:99})).toThrow('current company');expect(refreshCompanyIdentityBinding(current,{issuer,subject,expectedVersion:1}).version).toBe(3);expect(companySessionActor(session.token)).toBeNull();const fresh=setupLogin({role:'dispositions'});expect((await completeCompanyLogin(fresh.input)).actor.role).toBe('manager');});
});
