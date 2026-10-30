import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '../src/app/api/[...path]/route';
import { assertLocalDemo, getActor, setSession, verifyDemoAccess } from '../src/server/auth';
import { closeDb, demoActor, getDb } from '../src/server/db';
import { prepareDemoScenario } from '../src/server/demo-scenario';
import { featureAccess, trial } from '../src/server/billing';
import { listApprovals } from '../src/server/services';
import { listPackages, listReleases } from '../src/server/workflows';
const origin='https://agentdesk.example';
const code='0427';
function request(path:string,method='GET',body?:unknown,cookie?:string,headers:Record<string,string>={}){
 return new NextRequest(`${origin}/api/${path}`,{method,headers:{host:'agentdesk.example',origin,'x-agentdesk-request':'1',...(cookie?{cookie}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
function route(path:string,method='GET',body?:unknown,cookie?:string,headers:Record<string,string>={}){
 return (method==='GET'?GET:POST)(request(path,method,body,cookie,headers),{params:Promise.resolve({path:path.split('/')})});
}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_HOSTED_DEMO','true');vi.stubEnv('AGENTDESK_APP_ORIGIN',origin);vi.stubEnv('AGENTDESK_SESSION_SECRET','test-secret-that-has-at-least-thirty-two-characters');vi.stubEnv('AGENTDESK_DEMO_ACCESS_CODE',code);vi.stubEnv('OPENAI_API_KEY','');});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.useRealTimers();});
describe('private hosted demonstration',()=>{
 it('accepts a four-digit PIN including leading zeroes, preserves longer codes, and rejects malformed short codes',()=>{
  expect(()=>verifyDemoAccess(code)).not.toThrow();
  expect(()=>verifyDemoAccess('427')).toThrow('not recognized');
  for(const invalid of ['', '123', '12345', 'abcd', ' 0427']){vi.stubEnv('AGENTDESK_DEMO_ACCESS_CODE',invalid);expect(()=>verifyDemoAccess(invalid)).toThrow('not fully configured');}
  vi.stubEnv('AGENTDESK_DEMO_ACCESS_CODE','existing-long-invitation-code');expect(()=>verifyDemoAccess('existing-long-invitation-code')).not.toThrow();
 });
 it('never auto-authenticates a visitor or permits role switching before entry',async()=>{
  expect((await route('bootstrap')).status).toBe(401);
  expect((await route('session','POST',{role:'manager'})).status).toBe(401);
  expect((await route('providers')).status).toBe(401);
  expect(await (await route('access')).json()).toEqual({required:true});
 });
 it('requires the code, signs a secure scoped session, and permits normal demo work after entry',async()=>{
  expect((await route('access','POST',{code:'wrong'})).status).toBe(401);
  const response=await route('access','POST',{code});expect(response.status).toBe(200);
  const cookie=response.headers.get('set-cookie')!;
  expect(cookie).toContain('Secure');expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=strict');
  const token=cookie.split(';')[0];
  expect((await route('bootstrap','GET',undefined,token)).status).toBe(200);
  expect((await route('session','POST',{role:'manager'},token)).status).toBe(200);
  expect(getActor(request('bootstrap','GET',undefined,`${token}tampered`))).toBeNull();
 });
 it('rejects unexpected hosts, cross-site requests and mutation requests without the verification header',()=>{
  expect(()=>assertLocalDemo(request('access','POST',{code},undefined,{host:'evil.example'}))).toThrow('address');
  expect(()=>assertLocalDemo(request('access','POST',{code},undefined,{origin:'https://evil.example'}))).toThrow('Cross-origin');
  expect(()=>assertLocalDemo(request('access','POST',{code},undefined,{'sec-fetch-site':'cross-site'}))).toThrow('Cross-site');
  expect(()=>assertLocalDemo(request('access','POST',{code},undefined,{'x-agentdesk-request':''}))).toThrow('verification');
 });
 it('rejects local cookies, expired cookies and sessions issued for a different deployment',()=>{
  vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');const local=NextResponse.json({});setSession(local,'manager');
  vi.stubEnv('AGENTDESK_HOSTED_DEMO','true');expect(getActor(request('bootstrap','GET',undefined,local.headers.get('set-cookie')!.split(';')[0]))).toBeNull();
  const response=NextResponse.json({});setSession(response,'manager');const cookie=response.headers.get('set-cookie')!.split(';')[0];
  vi.useFakeTimers();vi.setSystemTime(Date.now()+9*3600_000);expect(getActor(request('bootstrap','GET',undefined,cookie))).toBeNull();vi.useRealTimers();
  vi.stubEnv('AGENTDESK_APP_ORIGIN','https://another.example');expect(getActor(new NextRequest('https://another.example/api/bootstrap',{headers:{host:'another.example',cookie}}))).toBeNull();
 });
 it('fails closed for incomplete configuration while exposing only a minimal health response',async()=>{
  vi.stubEnv('AGENTDESK_SESSION_SECRET','short');expect((await route('access')).status).toBe(503);
  expect(await (await route('health','GET',undefined,undefined,{host:'internal-render-host'})).json()).toEqual({status:'ok'});
  vi.stubEnv('AGENTDESK_APP_ORIGIN','http://agentdesk.example');expect((await route('access')).status).toBe(503);
 });
 it('limits code guesses without relying on a client-supplied IP header',()=>{
  vi.useFakeTimers();vi.setSystemTime(Date.now()+120_000);
  for(let i=0;i<20;i++)expect(()=>verifyDemoAccess('wrong')).toThrow('not recognized');
  expect(()=>verifyDemoAccess(code)).toThrow('wait a minute');vi.advanceTimersByTime(60_001);expect(()=>verifyDemoAccess(code)).not.toThrow();
 });
});
describe('repeatable fictional presentation setup',()=>{
 it('creates reviewable work and role-scoped temporary access once, without applying proposals or sending messages',()=>{
  expect(prepareDemoScenario()).toEqual({prepared:true});
  const actor=demoActor(),before=getDb().prepare('SELECT data FROM investors WHERE id=?').get('investor-mike');
  expect(featureAccess(actor,'investor-hunter').source).toBe('bundle');
  expect(featureAccess(actor,'team-performance').allowed).toBe(false);
  expect(featureAccess(actor,'deal-analyst').allowed).toBe(false);
  expect(listReleases(actor)).toHaveLength(1);expect(listPackages(actor).length).toBeGreaterThan(0);
  expect(listPackages(actor).every(p=>['draft','blocked'].includes(p.status))).toBe(true);
  const approvals=listApprovals(actor);expect(approvals.length).toBeGreaterThan(0);expect(approvals.every(a=>a.status==='pending')).toBe(true);
  const end=trial(actor)!.endsAt;expect(prepareDemoScenario()).toEqual({prepared:false});expect(trial(actor)!.endsAt).toBe(end);
  expect(listApprovals(actor)).toHaveLength(approvals.length);expect(getDb().prepare('SELECT data FROM investors WHERE id=?').get('investor-mike')).toEqual(before);
 });
});
