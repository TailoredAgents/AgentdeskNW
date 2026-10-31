import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import type {ComposeCommunication} from '../src/lib/communications-contracts';
import {simulateLifecycle,subscription} from '../src/server/billing';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {composeCommunication,getInboxState,getInboxThread,receiveDemoCommunication,saveInboxDraft} from '../src/server/communications';
import {getInboxAssistance,prepareInboxReply,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
let actor:Actor,sequence=0;const key=()=>`compose-${++sequence}`;
const input=(overrides:Partial<ComposeCommunication>={}):ComposeCommunication=>({accountId:getInboxState(actor).preferredAccountId!,to:{name:'Mike',address:'mike@example.com'},subject:'Walkthrough details',body:'Please confirm a suitable time.',cc:[{name:'Coordinator',address:'coordinator@example.com'}],eventKey:key(),...overrides});
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');actor=demoActor();sequence=0;});
afterEach(()=>{closeDb();vi.unstubAllEnvs();});
describe('new private correspondence',()=>{
 it('creates one unsent draft with its real selected envelope and no invented incoming source',()=>{
  const request=input(),first=composeCommunication(actor,request),second=composeCommunication(actor,request);
  expect(second.thread).toEqual(first.thread);expect(second.draft).toEqual(first.draft);expect(first.messages).toEqual([]);expect(first.thread.messageCount).toBe(0);expect(first.thread.unread).toBe(false);expect(first.thread.association.investor?.id).toBe('investor-mike');
  expect(first.draft).toMatchObject({body:request.body,subject:request.subject,cc:request.cc,authorship:'employee',deliveryStatus:'not_sent',from:{address:first.account.address}});
  expect(()=>composeCommunication(actor,{...request,body:'Different'})).toThrow('different inbox action');
  const help=getInboxAssistance(actor,first.thread.id);expect(help.summary).toContain('No incoming message');expect(help.suggestedReply.eligible).toBe(false);expect(help.suggestedReply.body).toBe('');expect(help.suggestedFollowUp).toBeNull();expect(()=>prepareInboxReply(actor,first.thread.id,{eventKey:key(),expectedVersion:1})).toThrow('no incoming message');
 });
 it('reviews then simulates the opening draft exactly once and replays current state',()=>{
  const request=input(),detail=composeCommunication(actor,request),review=reviewInboxSend(actor,detail.thread.id,{eventKey:key(),expectedVersion:1}),send={reviewId:review.id,eventKey:key()};
  const first=simulateInboxSend(actor,detail.thread.id,send),again=simulateInboxSend(actor,detail.thread.id,send);
  expect(again.receipt).toEqual(first.receipt);expect(first.detail.messages).toHaveLength(1);expect(first.detail.messages[0]).toMatchObject({direction:'outbound',body:request.body,cc:request.cc});expect(first.detail.thread.status).toBe('waiting');receiveDemoCommunication(actor,{scenarioId:'company-revoke-access',eventKey:key()});expect(getInboxThread(actor,detail.thread.id).messages[0].cc).toEqual([]);receiveDemoCommunication(actor,{scenarioId:'company-restore-access',eventKey:key()});expect(composeCommunication(actor,request).draft).toBeNull();
 });
 it('keeps foreign accounts and conversations private even from office management',()=>{
  const request=input(),detail=composeCommunication(actor,request),manager=demoActor('manager');
  expect(()=>composeCommunication(manager,request)).toThrow('private workspace');expect(()=>getInboxThread(manager,detail.thread.id)).toThrow('private workspace');
  expect(()=>composeCommunication({...actor,organizationId:'other'},request)).toThrow();expect(()=>composeCommunication({...actor,role:'manager'},request)).toThrow();
 });
 it('requires an active workforce subscription for new composition and replay',()=>{
  const request=input();composeCommunication(actor,request);simulateLifecycle(demoActor('manager'),{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:key()});expect(()=>composeCommunication(actor,request)).toThrow('subscription');expect(()=>composeCommunication(actor,{...request,eventKey:key()})).toThrow('subscription');
 });
 it('rechecks source access on both new composition and exact replay',()=>{
  const request=input();composeCommunication(actor,request);receiveDemoCommunication(actor,{scenarioId:'company-revoke-access',eventKey:key()});expect(()=>composeCommunication(actor,request)).toThrow('revoked');expect(()=>composeCommunication(actor,{...request,eventKey:key()})).toThrow('revoked');
 });
 it('respects incomplete source coverage without fabricating a delivery route',()=>{
  const accounts=getInboxState(actor).accounts,headers=accounts.find(a=>a.source.coverage==='headers_only')!,activity=accounts.find(a=>a.source.coverage==='crm_activity')!;
  expect(()=>composeCommunication(actor,input({accountId:headers.id}))).toThrow('Headers only');
  const detail=composeCommunication(actor,input({accountId:activity.id}));expect(detail.draft).not.toBeNull();expect(()=>reviewInboxSend(actor,detail.thread.id,{eventKey:key(),expectedVersion:1})).toThrow('sending is unavailable');
 });
 it('rejects malformed addresses, duplicate recipients, headers and client-forged authoring authority',()=>{
  const base=input();for(const patch of [{to:{name:'',address:'bad'}},{to:{name:'bad\r\nname',address:'a@example.com'}},{to:{name:'',address:getInboxState(actor).accounts[0].address}},{subject:''},{subject:'Bad\r\nBcc: x@example.com'},{cc:[{name:'',address:'MIKE@example.com'}]},{cc:[{name:'',address:'x@example.com'},{name:'',address:'X@example.com'}]},{authorship:'copilot'},{from:{address:'forged@example.com'}},{body:''}])expect(()=>composeCommunication(actor,{...base,...patch} as ComposeCommunication)).toThrow();
  expect(getInboxState(actor).threads).toHaveLength(8);
 });
 it('validates one-to-one international business texts with bounded message size',()=>{
  const account=getInboxState(actor).accounts.find(a=>a.channel==='sms')!,base=input({accountId:account.id,to:{name:'New buyer',address:'+14045550999'},subject:undefined,cc:undefined});
  for(const patch of [{subject:'Subject'},{cc:[{name:'',address:'x@example.com'}]},{body:'x'.repeat(1601)},{to:{name:'',address:'4045550999'}}])expect(()=>composeCommunication(actor,{...base,...patch})).toThrow();
  const detail=composeCommunication(actor,base);expect(detail.thread.channel).toBe('sms');expect(detail.thread.association.status).toBe('unmatched');expect(detail.draft?.cc).toEqual([]);
 });
 it('does not auto-link name resemblance and invalidates review after a new edit',()=>{
  const detail=composeCommunication(actor,input({to:{name:'Mike Thompson',address:'unverified@example.com'}}));expect(detail.thread.association.investor).toBeNull();
  const review=reviewInboxSend(actor,detail.thread.id,{expectedVersion:1,eventKey:key()});saveInboxDraft(actor,detail.thread.id,{expectedVersion:1,eventKey:key(),body:'Changed opening message'});
  expect(()=>simulateInboxSend(actor,detail.thread.id,{reviewId:review.id,eventKey:key()})).toThrow('changed');
  expect((getDb().prepare('SELECT COUNT(*) n FROM communication_send_receipts').get() as {n:number}).n).toBe(0);
 });
});
