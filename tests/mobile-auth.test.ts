import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {createMobilePairing,pairMobileDevice,requireMobileSession,revokeMobileSession,listMobileDevices,getMobileAuthentication,assertMobileRequest,mobileConnection} from '../src/server/mobile-auth';
import {getActor} from '../src/server/auth';
import {messagingConversation} from '../src/server/messaging';
import {GET,POST} from '../src/app/api/[...path]/route';

beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('AGENTDESK_MOBILE_DEV_ORIGIN','');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_MOBILE_PUSH_SEND_ENABLED','false');});
afterEach(()=>{closeDb();vi.unstubAllEnvs();vi.restoreAllMocks();});
const connect=(role:'dispositions'|'manager'|'acquisitions'='dispositions')=>{const actor=demoActor(role);const pairing=createMobilePairing(actor);return pairMobileDevice({code:pairing.code,deviceName:'Test phone'});};
const request=(path:string,token?:string,body?:unknown,origin='http://localhost:3000')=>new NextRequest(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{host:new URL(origin).host,'x-agentdesk-request':'1',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
async function route(path:string,token?:string,body?:unknown){return (body===undefined?GET:POST)(request(path,token,body),{params:Promise.resolve({path:path.split('/')})});}

describe('scoped demonstration phone identity',()=>{
 it('pairs one employee into the existing ongoing conversation and stores neither code nor bearer in clear text',()=>{
  const actor=demoActor(),code=createMobilePairing(actor),paired=pairMobileDevice({code:code.code,deviceName:'Alex phone'});
  expect(paired.actor.id).toBe(actor.id);expect(paired.conversationId).toBe(messagingConversation(actor));
  expect(mobileConnection(paired.sessionId).conversationId).toBe(paired.conversationId);
  expect(JSON.stringify(getDb().prepare('SELECT * FROM mobile_pairings').all())).not.toContain(code.code);
  expect(JSON.stringify(getDb().prepare('SELECT * FROM mobile_sessions').all())).not.toContain(paired.token);
  expect(getActor(request('bootstrap',paired.token))?.id).toBe(actor.id);
 });
 it('rejects replay and replacement of a single-use pairing code',()=>{
  const actor=demoActor(),old=createMobilePairing(actor),fresh=createMobilePairing(actor);
  expect(()=>pairMobileDevice({code:old.code,deviceName:'Old'})).toThrow(/invalid or expired/);
  pairMobileDevice({code:fresh.code,deviceName:'First'});
  expect(()=>pairMobileDevice({code:fresh.code,deviceName:'Replay'})).toThrow(/invalid or expired/);
 });
 it('expires unclaimed codes',()=>{
  const actor=demoActor(),pair=createMobilePairing(actor);getDb().prepare("UPDATE mobile_pairings SET expires_at='2000-01-01T00:00:00.000Z'").run();
  expect(()=>pairMobileDevice({code:pair.code,deviceName:'Phone'})).toThrow(/expired/);
 });
 it('revokes a device without affecting another and rejects expired credentials',()=>{
  const first=connect(),second=connect();revokeMobileSession(first.actor,first.sessionId);
  expect(()=>requireMobileSession(first.sessionId)).toThrow(/disconnected/);expect(requireMobileSession(second.sessionId).actor.id).toBe(first.actor.id);
  getDb().prepare("UPDATE mobile_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(second.sessionId);
  expect(()=>requireMobileSession(second.sessionId)).toThrow(/expired/);
 });
 it('does not let a manager inspect or disconnect another employee phone',()=>{
  const paired=connect(),manager=demoActor('manager');expect(listMobileDevices(manager).devices).toEqual([]);
  expect(()=>revokeMobileSession(manager,paired.sessionId)).toThrow(/not found/);expect(requireMobileSession(paired.sessionId).actor.id).toBe(paired.actor.id);
 });
 it('revokes access when membership role changes instead of silently promoting the phone',()=>{
  const paired=connect();getDb().prepare("UPDATE memberships SET role='manager' WHERE user_id=?").run(paired.actor.id);
  expect(()=>requireMobileSession(paired.sessionId)).toThrow(/no longer authorized/);
 });
 it('binds a pending code to its original role',()=>{
  const actor=demoActor(),pair=createMobilePairing(actor);getDb().prepare("UPDATE memberships SET role='manager' WHERE user_id=?").run(actor.id);
  expect(()=>pairMobileDevice({code:pair.code,deviceName:'Changed'})).toThrow(/no longer authorized/);
 });
 it('rejects caller identity fields and forged bearers',()=>{
  const actor=demoActor(),pair=createMobilePairing(actor);
  expect(()=>pairMobileDevice({code:pair.code,deviceName:'Phone',role:'manager'})).toThrow();
  expect(()=>getMobileAuthentication(request('bootstrap','adnw_'+'x'.repeat(43)))).toThrow(/invalid/);
  expect(()=>getMobileAuthentication(request('bootstrap','not-a-token'))).toThrow(/invalid/);
 });
 it('persists a bounded global pairing-attempt limit',()=>{
  for(let index=0;index<20;index++)expect(()=>pairMobileDevice({code:'00000000',deviceName:'Wrong'})).toThrow();
  expect(()=>pairMobileDevice({code:'00000000',deviceName:'Wrong'})).toThrow(/Too many/);
 });
 it('requires explicit private dev origin and retains cross-origin/browser request checks',()=>{
  expect(()=>assertMobileRequest(request('mobile/pair',undefined,{},'http://192.168.10.20:3000'))).toThrow(/Configure/);
  vi.stubEnv('AGENTDESK_MOBILE_DEV_ORIGIN','http://192.168.10.20:3000');expect(()=>assertMobileRequest(request('mobile/pair',undefined,{},'http://192.168.10.20:3000'))).not.toThrow();
  expect(()=>assertMobileRequest(request('mobile/pair',undefined,{},'http://192.168.10.21:3000'))).toThrow(/origin/);
  const cross=request('mobile/pair',undefined,{});cross.headers.set('origin','https://different.example');expect(()=>assertMobileRequest(cross)).toThrow(/origin/);
  const missing=request('mobile/pair',undefined,{});missing.headers.delete('x-agentdesk-request');expect(()=>assertMobileRequest(missing)).toThrow(/verification/);
  vi.stubEnv('AGENTDESK_MOBILE_DEV_ORIGIN','https://public.example');expect(()=>assertMobileRequest(request('mobile/pair',undefined,{}))).toThrow(/private development/);
 });
 it('returns private actor data but cannot switch demo identity or mint another phone',async()=>{
  const paired=connect();const bootstrap=await route('bootstrap',paired.token);expect(bootstrap.status).toBe(200);expect((await bootstrap.json()).actor.id).toBe(paired.actor.id);
  expect((await route('session',paired.token,{role:'manager'})).status).toBe(403);
  expect((await route('mobile/pairing',paired.token,{})).status).toBe(403);
  expect((await route('mobile/devices',paired.token)).status).toBe(403);
 });
 it('validates the actual host when Next normalizes a loopback request URL',()=>{
  const normalized=request('mobile/pair',undefined,{});
  normalized.headers.set('host','127.0.0.1:3000');normalized.headers.set('origin','http://127.0.0.1:3000');
  expect(()=>assertMobileRequest(normalized)).not.toThrow();
  normalized.headers.set('host','attacker.example');normalized.headers.delete('origin');
  expect(()=>assertMobileRequest(normalized)).toThrow(/Configure/);
  normalized.headers.set('host','localhost:3000@attacker.example');
  expect(()=>assertMobileRequest(normalized)).toThrow(/invalid/);
 });
 it('supports session check and explicit logout, then rejects every replay',async()=>{
  const paired=connect();const session=await route('mobile/session',paired.token);expect(session.status).toBe(200);expect((await session.json()).conversationId).toBe(paired.conversationId);
  expect((await route('mobile/logout',paired.token,{})).status).toBe(200);
  expect((await route('bootstrap',paired.token)).status).toBe(401);
  expect((await route('mobile/notifications',paired.token)).status).toBe(401);
 });
 it('does not grant anonymous hosted bootstrap access through the native routes',async()=>{
  vi.stubEnv('AGENTDESK_HOSTED_DEMO','true');vi.stubEnv('AGENTDESK_APP_ORIGIN','https://demo.example.com');vi.stubEnv('AGENTDESK_SESSION_SECRET','fictional-session-secret-with-more-than32-characters');vi.stubEnv('AGENTDESK_DEMO_ACCESS_CODE','1234');
  const response=await GET(request('bootstrap',undefined,undefined,'https://demo.example.com'),{params:Promise.resolve({path:['bootstrap']})});expect(response.status).toBe(401);
  expect(()=>assertMobileRequest(request('mobile/pair',undefined,{},'http://localhost:3000'))).toThrow(/origin/);
 });
 it('keeps a chat turn shared with the ongoing conversation and retry-safe',async()=>{
  const paired=connect(),input={message:'Show my open reminders.',conversationId:paired.conversationId,requestId:'mobile-chat-retry'};
  const first=await route('chat',paired.token,input),again=await route('chat',paired.token,input);expect(first.status).toBe(200);expect(again.status).toBe(200);
  const a=await first.json(),b=await again.json();expect(a.conversation.id).toBe(paired.conversationId);expect(a.conversation.messages).toEqual(b.conversation.messages);
 });
});
