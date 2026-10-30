import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import type {CommunicationAccount,InboxThreadDetail,InboxScenarioId} from '../src/lib/communications-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInboxState,getInboxThread,linkInboxInvestor,receiveDemoCommunication,saveInboxDraft,updateInboxThread} from '../src/server/communications';
import {createInboxFollowUp,getInboxAssistance,prepareInboxReply,recordInboxObservation,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {getCommunicationAccount} from '../src/server/communications-capabilities';
import {simulateLifecycle,subscription} from '../src/server/billing';

let actor:Actor,sequence=0;
const key=()=>`company-${++sequence}`;
const state=()=>getInboxState(actor);
const company=()=>{const inbox=state();return getInboxThread(actor,inbox.threads.find(thread=>thread.accountId===inbox.preferredAccountId)!.id);};
const variant=(coverage:'crm_activity'|'headers_only')=>{const inbox=state(),account=inbox.accounts.find(item=>item.provider==='salesforce'&&item.source.coverage===coverage)!;return getInboxThread(actor,inbox.threads.find(thread=>thread.accountId===account.id)!.id);};
const mutation=(detail:InboxThreadDetail)=>({expectedVersion:detail.thread.version,eventKey:key()});
const scenario=(scenarioId:InboxScenarioId)=>receiveDemoCommunication(actor,{scenarioId,eventKey:key()});
const count=(table:string)=>(getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;
const prepare=()=>{const detail=company();return prepareInboxReply(actor,detail.thread.id,mutation(detail));};
const review=()=>{const detail=prepare();return reviewInboxSend(actor,detail.thread.id,mutation(detail));};
function changeAccount(id:string,change:Partial<CommunicationAccount>){const current=getCommunicationAccount(actor,id);getDb().prepare('UPDATE communication_accounts SET data=? WHERE id=?').run(JSON.stringify({...current,...change}),id);}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T15:00:00Z'));actor=demoActor();sequence=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('Salesforce company-email demonstration',()=>{
 it('adds company sources once and keeps the three legacy accounts separately identifiable',()=>{
  const first=state();expect(first.accounts).toHaveLength(6);expect(first.threads).toHaveLength(8);expect(first.accounts.filter(item=>item.provider!=='salesforce').map(item=>item.provider)).toEqual(['gmail','outlook','twilio']);
  expect(first.accounts[0]).toMatchObject({id:first.preferredAccountId,provider:'salesforce',primary:true,status:'demo',transport:'demo_company_email',access:'available',accessVersion:1,source:{system:'salesforce',coverage:'mailbox'},capabilities:{readBody:true,localDraft:true,simulateSend:true,attachments:false}});
  expect(first.accounts[0].address).toMatch(/@company\.example$/);expect(state()).toEqual(first);expect(count('communication_company_demo_seeds')).toBe(1);expect(count('communication_source_links')).toBe(3);
 });
 it('preserves exact legacy source and draft bytes through company seed reads and scenario actions',()=>{
  const inbox=state(),legacy=inbox.accounts.find(item=>item.provider==='gmail')!,thread=inbox.threads.find(item=>item.accountId===legacy.id)!;
  saveInboxDraft(actor,thread.id,{body:'Preserve this employee-written legacy draft.',expectedVersion:thread.version,eventKey:key()});
  const snapshots=()=>['communication_accounts','communication_threads','communication_messages','communication_drafts','communication_draft_revisions'].map(table=>getDb().prepare(`SELECT * FROM ${table} WHERE ${table==='communication_accounts'?'id':table==='communication_threads'||table==='communication_messages'?'account_id':'thread_id'}=? ORDER BY id`).all(table.includes('draft')?thread.id:legacy.id));
  const before=snapshots();state();scenario('company-repair-followup');scenario('company-duplicate-source');scenario('company-revoke-access');scenario('company-restore-access');expect(snapshots()).toEqual(before);
 });
 it('grounds the primary company reply in Mike’s permitted relationship and private source',()=>{
  const detail=company(),assistance=getInboxAssistance(actor,detail.thread.id);
  expect(detail.thread.association.investor?.id).toBe('investor-mike');expect(detail.investorContext?.investorId).toBe('investor-mike');expect(detail.messages[0].provenance?.[0]).toMatchObject({system:'company_mailbox',synthetic:true});
  expect(assistance.sources.some(item=>item.kind==='message'&&item.excerpt.includes('supporting sources'))).toBe(true);expect(assistance.suggestedReply.body).toContain('cannot yet confirm');expect(assistance.suggestedReply.body).not.toContain('http');
 });
 it('stores and reconciles an exact reviewed company simulation without a provider call',()=>{
  const fetch=vi.fn(()=>{throw new Error('Unexpected provider request');});vi.stubGlobal('fetch',fetch);
  const reviewed=review(),send={reviewId:reviewed.id,eventKey:key()},sent=simulateInboxSend(actor,reviewed.threadId,send);
  expect(reviewed.accountContext).toMatchObject({source:{system:'salesforce',coverage:'mailbox'},transport:'demo_company_email',capabilities:{simulateSend:true},accessVersion:1});
  expect(sent.detail.account.transport).toBe('demo_company_email');expect(sent.receipt).toMatchObject({status:'simulated_sent',liveDelivery:false});expect(sent.detail.messages.at(-1)).toMatchObject({body:reviewed.body,from:reviewed.from,to:[reviewed.to],deliveryStatus:'simulated_sent'});
  expect(simulateInboxSend(actor,reviewed.threadId,send).receipt.id).toBe(sent.receipt.id);expect(company().messages.filter(item=>item.direction==='outbound')).toHaveLength(1);expect(fetch).not.toHaveBeenCalled();expect(count('provider_operations')).toBe(0);expect(count('wallet_operations')).toBe(0);
 });
 it('keeps CRM activity reading separate from sending permission',()=>{
  const detail=variant('crm_activity');expect(detail.bodyAccess).toBe('full');expect(detail.messages[0].body).toContain('operating costs');expect(detail.account.capabilities).toMatchObject({readBody:true,threadHistory:false,localDraft:true,simulateSend:false});
  expect(getInboxAssistance(actor,detail.thread.id).unknowns.join(' ')).toContain('not a complete mailbox');
  const prepared=prepareInboxReply(actor,detail.thread.id,mutation(detail));expect(prepared.draft).not.toBeNull();expect(()=>reviewInboxSend(actor,detail.thread.id,mutation(prepared))).toThrow('sending route');expect(()=>simulateInboxSend(actor,detail.thread.id,{reviewId:'forged-review',eventKey:key()})).toThrow('sending route');expect(prepared.messages).toHaveLength(1);
 });
 it('never invents header-only subject, body, intent, reply, observation or follow-up',()=>{
  const detail=variant('headers_only'),assistance=getInboxAssistance(actor,detail.thread.id);
  expect(detail.bodyAccess).toBe('headers_only');expect(detail.messages[0]).toMatchObject({subject:'Subject unavailable · headers only',body:'',attachments:[],bodyAvailability:'headers_only'});expect(detail.investorContext).toBeNull();
  expect(assistance.suggestedReply).toMatchObject({body:'',eligible:false});expect(assistance.suggestedObservation).toBeNull();expect(assistance.suggestedFollowUp).toBeNull();expect(assistance.processing.messageCount).toBe(0);
  expect(()=>saveInboxDraft(actor,detail.thread.id,{...mutation(detail),body:'Invented reply'})).toThrow('Headers only');expect(()=>prepareInboxReply(actor,detail.thread.id,mutation(detail))).toThrow('Headers only');
  const source=detail.messages[0];expect(()=>recordInboxObservation(actor,detail.thread.id,{...mutation(detail),messageId:source.id,kind:'objection',text:'Invented investor concern'})).toThrow('Headers only');expect(()=>createInboxFollowUp(actor,detail.thread.id,{...mutation(detail),messageId:source.id,title:'Invented follow-up',dueAt:null})).toThrow('Headers only');
  const raw=JSON.parse((getDb().prepare('SELECT data FROM communication_messages WHERE id=?').get(source.id) as {data:string}).data);expect(raw.body).toBe('');expect(raw.subject).toBe('Subject unavailable · headers only');
 });
 it('masks pre-existing bodies and drafts on a header-only downgrade, including search',()=>{
  const saved=prepare();changeAccount(saved.account.id,{source:{...saved.account.source,coverage:'headers_only'},transport:'none'});
  const detail=company();expect(detail.messages[0].body).toBe('');expect(detail.thread.preview).not.toContain('contractor');expect(detail.draft).toBeNull();expect(detail.draftHistory).toEqual([]);
  expect(getInboxState(actor,{accountId:saved.account.id,q:'contractor'}).threads).toHaveLength(0);expect(()=>reviewInboxSend(actor,saved.thread.id,mutation(detail))).toThrow('Headers only');
 });
 it('blocks source-linked observations and their replays after a linked source becomes headers only',()=>{
  const detail=company(),assistance=getInboxAssistance(actor,detail.thread.id),input={...mutation(detail),...assistance.suggestedObservation!};
  const recorded=recordInboxObservation(actor,detail.thread.id,input);expect(recorded.observation.id).toBeTruthy();
  changeAccount(detail.account.id,{source:{...detail.account.source,coverage:'headers_only'},transport:'none'});
  const masked=company();expect(masked.thread.association.investor?.id).toBe('investor-mike');
  expect(()=>recordInboxObservation(actor,detail.thread.id,input)).toThrow('Headers only');
  expect(()=>recordInboxObservation(actor,detail.thread.id,{...input,...mutation(masked),text:'A new unsupported interpretation of hidden correspondence'})).toThrow('Headers only');
 });
 it('correlates a second known source without duplicating the original message or resetting the draft',()=>{
  const saved=prepare(),original=saved.messages[0],input={scenarioId:'company-duplicate-source' as const,eventKey:key()},linked=receiveDemoCommunication(actor,input);
  expect(linked.messages).toHaveLength(1);expect(linked.messages[0].id).toBe(original.id);expect(linked.messages[0].provenance?.map(item=>item.system)).toEqual(['company_mailbox','salesforce']);expect(linked.draft?.id).toBe(saved.draft?.id);expect(linked.draft?.body).toBe(saved.draft?.body);
  expect(receiveDemoCommunication(actor,input)).toEqual(linked);const again=scenario('company-duplicate-source');expect(again.messages).toEqual(linked.messages);expect(again.thread.version).toBe(linked.thread.version);expect(count('communication_source_links')).toBe(4);
  expect(()=>getDb().prepare('UPDATE communication_source_links SET source_ref=?').run('forged')).toThrow('immutable');
 });
 it('adds a company reply once and invalidates earlier unsent reviews',()=>{
  const reviewed=review(),before=company(),input={scenarioId:'company-repair-followup' as const,eventKey:key()},arrived=receiveDemoCommunication(actor,input);
  expect(arrived.messages).toHaveLength(before.messages.length+1);expect(arrived.thread).toMatchObject({unread:true,status:'needs_reply'});expect(arrived.draft?.body).toBe(before.draft?.body);expect(receiveDemoCommunication(actor,input).messages).toEqual(arrived.messages);expect(()=>simulateInboxSend(actor,reviewed.threadId,{reviewId:reviewed.id,eventKey:key()})).toThrow('changed');
 });
 it('revokes source access across detail, search, drafts, context and mutation replays',()=>{
  const before=company(),input={...mutation(before),body:'Private company-only draft-marker'},saved=saveInboxDraft(actor,before.thread.id,input),reviewed=review();const revoked=scenario('company-revoke-access');
  expect(revoked.account).toMatchObject({access:'revoked',accessVersion:2,capabilities:{readBody:false,localDraft:false,simulateSend:false}});expect(revoked).toMatchObject({canEdit:false,bodyAccess:'revoked',draft:null,investorContext:null,draftHistory:[]});
  expect(JSON.stringify(revoked)).not.toContain('mike@example.com');expect(JSON.stringify(revoked)).not.toContain('Private company-only draft-marker');expect(revoked.messages.every(item=>!item.body&&!item.sourceRef&&!item.to.length)).toBe(true);
  expect(getInboxState(actor,{accountId:saved.account.id,q:'contractor'}).threads).toHaveLength(0);expect(getInboxState(actor,{accountId:saved.account.id,q:'draft-marker'}).threads).toHaveLength(0);
  expect(()=>getInboxAssistance(actor,revoked.thread.id)).toThrow('revoked');expect(()=>saveInboxDraft(actor,before.thread.id,input)).toThrow('revoked');expect(()=>updateInboxThread(actor,before.thread.id,{...mutation(revoked),status:'done'})).toThrow('revoked');expect(()=>linkInboxInvestor(actor,before.thread.id,{...mutation(revoked),investorId:'investor-mike'})).toThrow('revoked');expect(()=>simulateInboxSend(actor,reviewed.threadId,{reviewId:reviewed.id,eventKey:key()})).toThrow('revoked');
 });
 it('restores content without resurrecting old reviews or replaying a previous revocation',()=>{
  const reviewed=review(),revoke={scenarioId:'company-revoke-access' as const,eventKey:key()};receiveDemoCommunication(actor,revoke);const restored=scenario('company-restore-access');
  expect(restored.account).toMatchObject({access:'available',accessVersion:3});expect(restored.messages[0].body).toContain('supporting sources');expect(restored.draft).not.toBeNull();expect(receiveDemoCommunication(actor,revoke).account.access).toBe('available');expect(()=>simulateInboxSend(actor,reviewed.threadId,{reviewId:reviewed.id,eventKey:key()})).toThrow('changed');
  const fresh=reviewInboxSend(actor,restored.thread.id,mutation(restored));expect(simulateInboxSend(actor,restored.thread.id,{reviewId:fresh.id,eventKey:key()}).receipt.status).toBe('simulated_sent');
 });
 it('checks current capabilities before returning a completed simulated-send replay',()=>{
  const reviewed=review(),input={reviewId:reviewed.id,eventKey:key()};simulateInboxSend(actor,reviewed.threadId,input);
  scenario('company-revoke-access');expect(()=>simulateInboxSend(actor,reviewed.threadId,input)).toThrow('revoked');
  const restored=scenario('company-restore-access');changeAccount(restored.account.id,{source:{...restored.account.source,coverage:'crm_activity'},transport:'none'});
  expect(()=>simulateInboxSend(actor,reviewed.threadId,input)).toThrow('sending route');
  expect(company().messages.filter(message=>message.direction==='outbound')).toHaveLength(1);
 });
 it('retains source evidence and explicit personal actions on the company workflow',()=>{
  const detail=scenario('company-repair-followup'),assistance=getInboxAssistance(actor,detail.thread.id);expect(assistance.suggestedObservation).not.toBeNull();expect(assistance.suggestedFollowUp).not.toBeNull();
  const note=recordInboxObservation(actor,detail.thread.id,{...mutation(detail),...assistance.suggestedObservation!});expect(note.observation.communicationSource?.label).toBe('Employee-reviewed fictional correspondence');
  const taskInput={...mutation(note.detail),...assistance.suggestedFollowUp!,dueAt:'2026-11-02T14:00:00Z'},task=createInboxFollowUp(actor,detail.thread.id,taskInput);expect(task.task).toMatchObject({investorId:'investor-mike',dueAt:'2026-11-02T14:00:00.000Z'});expect(createInboxFollowUp(actor,detail.thread.id,taskInput).task.id).toBe(task.task.id);
 });
 it('isolates company accounts and scenarios across employee, office, organization and forged identities',()=>{
  const detail=company();const actors=[demoActor('manager'),demoActor('acquisitions'),{id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions' as const},{id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions' as const}];
  for(const other of actors){expect(()=>getInboxThread(other,detail.thread.id)).toThrow('private workspace');expect(()=>getCommunicationAccount(other,detail.account.id)).toThrow('private workspace');expect(()=>reviewInboxSend(other,detail.thread.id,mutation(detail))).toThrow('private workspace');expect(getInboxState(other).accounts.find(item=>item.primary)?.address).not.toBe(detail.account.address);}
  expect(()=>getInboxState({...actor,role:'manager'})).toThrow('identity');
 });
 it('rejects client-supplied company sources and keeps access changes behind active entitlements',()=>{
  const detail=company();expect(()=>receiveDemoCommunication(actor,{scenarioId:'company-repair-followup',eventKey:key(),accountId:detail.account.id} as never)).toThrow();
  simulateLifecycle(demoActor('manager'),{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:key()});expect(()=>scenario('company-revoke-access')).toThrow();expect(()=>prepare()).toThrow();expect(company().messages[0].body).toContain('supporting sources');
 });
});
