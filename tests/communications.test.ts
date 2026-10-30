import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Actor,Investor} from '../src/lib/contracts';
import {closeDb,demoActor,getDb,insertRecord} from '../src/server/db';
import {readInvestor} from '../src/server/access';
import {simulateLifecycle,subscription} from '../src/server/billing';
import {discardInboxDraft,getInboxState,getInboxThread,linkInboxInvestor,receiveDemoCommunication,saveInboxDraft,updateInboxThread} from '../src/server/communications';

let actor:Actor,manager:Actor,sequence=0;
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const savannah:Actor={id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'};
const next=()=>`inbox-test-${++sequence}`;
const state=()=>getInboxState(actor);
const mike=()=>state().threads.find(thread=>thread.correspondent.address==='mike@example.com')!;
const david=()=>state().threads.find(thread=>thread.correspondent.name==='David Ortiz')!;
function save(id=mike().id,body='I will check which repair assumptions have supporting sources.') {return saveInboxDraft(actor,id,{body,expectedVersion:getInboxThread(actor,id).thread.version,eventKey:next()});}
function cancel(){return simulateLifecycle(manager,{userId:actor.id,action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:next()});}
function count(table:string){return (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T14:00:00Z'));actor=demoActor();manager=demoActor('manager');sequence=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('private fictional communications inbox',()=>{
 it('seeds three clearly fictional accounts once with persisted, separate email and text sources',()=>{
  const first=state(),again=state();expect(again).toEqual(first);expect(first.accounts.map(item=>item.provider)).toEqual(['gmail','outlook','twilio']);expect(first.threads).toHaveLength(5);
  expect(first).toMatchObject({liveDelivery:false,mode:'demonstration',canEdit:true,counts:{all:5,email:4,sms:1,needs_reply:5,drafts:0}});
  expect(first.accounts.every(item=>item.status==='demo'&&item.synthetic)).toBe(true);expect(count('communication_accounts')).toBe(3);expect(count('communication_messages')).toBe(5);
  const detail=getInboxThread(actor,mike().id);expect(detail.messages[0]).toMatchObject({deliveryStatus:'demo_received',synthetic:true,direction:'inbound'});expect(detail.messages[0].attachments[0]).toMatchObject({availability:'metadata_only'});
  expect(detail.messages[0]).not.toHaveProperty('url');expect(detail.messages[0].sourceRef).toBeTruthy();expect(detail.account.address).toMatch(/\.example$/);
 });
 it('links a unique permitted exact email contact but never silently links a name or shared sender',()=>{
  const threads=state().threads;expect(mike().association).toMatchObject({status:'linked',method:'exact_contact',investor:{id:'investor-mike'}});
  expect(david().association).toMatchObject({status:'needs_review',investor:null,method:null});expect(david().association.candidates.map(item=>item.id)).toEqual(['investor-david']);
  const shared=threads.find(thread=>thread.correspondent.address==='shared.buyers@example.com')!;expect(shared.association.status).toBe('needs_review');expect(shared.association.candidates).toHaveLength(2);
  expect(threads.find(thread=>thread.correspondent.address==='jamie.parker@example.com')?.association.status).toBe('unmatched');
 });
 it('requires review when more than one permitted record has the same contact address',()=>{
  const existing=readInvestor(actor,'investor-mike');insertRecord<Investor>(actor,'investors',{...existing,id:'investor-duplicate',name:'Michael Bennett'});
  const thread=mike();expect(thread.association.status).toBe('needs_review');expect(thread.association.candidates.map(item=>item.id).sort()).toEqual(['investor-duplicate','investor-mike']);
 });
 it('shows current permitted relationship context without interpreting incoming claims as CRM facts',()=>{
  const thread=mike(),before=readInvestor(actor,'investor-mike');const detail=getInboxThread(actor,thread.id);
  expect(detail.investorContext?.investorId).toBe('investor-mike');expect(detail.investorContext?.commitments.length).toBeGreaterThan(0);expect(detail.contextNotice).toMatch(/have not updated CRM/);
  expect(detail.investorContext?.observations).toEqual([]);expect(readInvestor(actor,'investor-mike')).toEqual(before);expect(count('journey_observations')).toBe(0);
 });
 it('isolates every mailbox even from an office manager and across organizations/offices',()=>{
  const thread=mike(),account=state().accounts[0];
  for(const different of [manager,demoActor('acquisitions'),other,savannah]){
   expect(()=>getInboxThread(different,thread.id)).toThrow('private workspace');expect(()=>getInboxState(different,{accountId:account.id})).toThrow('private workspace');
   const own=getInboxState(different);expect(own.accounts).toHaveLength(3);expect(own.threads.every(item=>item.id!==thread.id)).toBe(true);expect(JSON.stringify(own)).not.toContain('mike@example.com');
   expect(()=>saveInboxDraft(different,thread.id,{body:'Not my mailbox',expectedVersion:thread.version,eventKey:next()})).toThrow('private workspace');
  }
 });
 it('rejects forged identities and never seeds mailboxes for arbitrary new members',()=>{
  expect(()=>getInboxState({...actor,role:'manager'})).toThrow('identity');expect(()=>getInboxState({...actor,officeId:'office-savannah'})).toThrow('identity');
  getDb().prepare('INSERT INTO users VALUES(?,?)').run('user-new','New Demo Member');getDb().prepare('INSERT INTO memberships VALUES(?,?,?,?)').run('org-demo','office-atlanta','user-new','dispositions');
  const fresh:Actor={...actor,id:'user-new',name:'New Demo Member'};expect(getInboxState(fresh).accounts).toEqual([]);expect(getInboxState(fresh).threads).toEqual([]);
  expect(()=>receiveDemoCommunication(fresh,{scenarioId:'unknown-buyer',eventKey:next()})).toThrow('fixed demonstration personas');
 });
 it('keeps one employee’s mailboxes private to the original office',()=>{
  const thread=mike();getDb().prepare('INSERT INTO memberships VALUES(?,?,?,?)').run('org-demo','office-savannah',actor.id,actor.role);
  const switched={...actor,officeId:'office-savannah'};expect(getInboxState(switched).accounts).toEqual([]);expect(()=>getInboxThread(switched,thread.id)).toThrow('private workspace');
 });
 it('filters by account, channel, needs-reply status, and search without changing source state',()=>{
  const initial=state(),thread=mike();const outlook=initial.accounts.find(item=>item.provider==='outlook')!;
  expect(getInboxState(actor,{filter:'sms'}).threads).toHaveLength(1);expect(getInboxState(actor,{filter:'email',accountId:outlook.id}).threads).toHaveLength(2);
  expect(getInboxState(actor,{q:'contractor'}).threads.map(item=>item.id)).toEqual([thread.id]);expect(getInboxState(actor,{q:'NO MATCH'}).threads).toEqual([]);
  updateInboxThread(actor,thread.id,{status:'waiting',unread:false,expectedVersion:thread.version,eventKey:next()});expect(getInboxState(actor,{filter:'needs_reply'}).threads).toHaveLength(4);
  expect(getInboxThread(actor,thread.id).thread).toMatchObject({status:'waiting',unread:false});expect(count('communication_messages')).toBe(5);
  expect(()=>getInboxState(actor,{userId:other.id})).toThrow();expect(()=>getInboxState(actor,{filter:'sent'})).toThrow();
 });
 it('saves a manual draft with server-bound sender, recipient and account and no delivery',()=>{
  const thread=mike(),detail=save();expect(detail.draft).toMatchObject({threadId:thread.id,accountId:thread.accountId,status:'draft',deliveryStatus:'not_sent',to:thread.correspondent,from:{address:detail.account.address}});
  expect(detail.thread).toMatchObject({version:2,hasDraft:true,status:'needs_reply'});expect(getInboxState(actor,{filter:'drafts'}).threads.map(item=>item.id)).toEqual([thread.id]);expect(getInboxState(actor,{q:'supporting sources'}).threads).toHaveLength(1);
  expect(detail.messages).toHaveLength(1);expect(count('proposed_actions')).toBe(0);expect(count('provider_operations')).toBe(0);
 });
 it('rejects spoofed recipients, sender identities, ownership, prices and oversized SMS drafts',()=>{
  const thread=mike(),input={body:'A reviewable reply',expectedVersion:thread.version,eventKey:next()};
  for(const forged of [{to:{name:'Other',address:'other@example.com'}},{from:{name:'Other',address:'other@example.com'}},{accountId:state().accounts[1].id},{ownerId:manager.id},{costCents:0}])expect(()=>saveInboxDraft(actor,thread.id,{...input,...forged})).toThrow();
  const sms=david();expect(()=>saveInboxDraft(actor,sms.id,{body:'x'.repeat(1601),expectedVersion:sms.version,eventKey:next()})).toThrow('1,600');expect(()=>saveInboxDraft(actor,sms.id,{body:'A text draft',subject:'spoofed subject',expectedVersion:sms.version,eventKey:next()})).toThrow('subject');
  expect(getInboxState(actor,{filter:'drafts'}).threads).toEqual([]);
 });
 it('replays a saved draft once and rejects conflicts or stale edits',()=>{
  const thread=mike(),input={body:'Original saved reply',expectedVersion:thread.version,eventKey:'save-once'};
  const first=saveInboxDraft(actor,thread.id,input);expect(saveInboxDraft(actor,thread.id,input)).toEqual(first);expect(count('communication_draft_revisions')).toBe(1);
  expect(()=>saveInboxDraft(actor,thread.id,{...input,body:'Conflicting reply'})).toThrow('different inbox action');
  expect(()=>saveInboxDraft(actor,thread.id,{...input,eventKey:next()})).toThrow('conversation changed');
  expect(getInboxThread(actor,thread.id).draft?.body).toBe('Original saved reply');
 });
 it('keeps draft revision/discard history and replay cannot erase a newer draft',()=>{
  const first=save(),second=save(first.thread.id,'A corrected, more concise reply.');expect(second.draft?.id).toBe(first.draft?.id);expect(second.draft?.version).toBe(2);expect(second.draftHistory.some(item=>item.body===first.draft?.body)).toBe(true);
  const input={expectedVersion:second.thread.version,eventKey:'discard-once'};const discarded=discardInboxDraft(actor,second.thread.id,input);expect(discarded.draft).toBeNull();expect(discarded.thread.hasDraft).toBe(false);expect(discarded.draftHistory[0].status).toBe('discarded');
  const newer=save(first.thread.id,'A later draft to retain.');const replayed=discardInboxDraft(actor,first.thread.id,input);expect(replayed.draft?.id).toBe(newer.draft?.id);expect(replayed.draft?.body).toBe('A later draft to retain.');
 });
 it('requires a fresh thread version after another device changes read/status state',()=>{
  const thread=mike(),input={status:'done' as const,unread:false,expectedVersion:thread.version,eventKey:'done-once'};
  const done=updateInboxThread(actor,thread.id,input);expect(updateInboxThread(actor,thread.id,input)).toEqual(done);
  expect(()=>updateInboxThread(actor,thread.id,{unread:true,expectedVersion:thread.version,eventKey:next()})).toThrow('conversation changed');
  expect(()=>updateInboxThread(actor,thread.id,{expectedVersion:done.thread.version,eventKey:next()})).toThrow('Choose');
 });
 it('supports explicit reviewed association and unlink without changing CRM ownership or contacts',()=>{
  const thread=david(),before=readInvestor(actor,'investor-david');const input={investorId:'investor-david',expectedVersion:thread.version,eventKey:'link-once'};
  const linked=linkInboxInvestor(actor,thread.id,input);expect(linked.thread.association).toMatchObject({status:'linked',method:'employee_review',investor:{id:'investor-david'}});
  const unlinked=linkInboxInvestor(actor,thread.id,{investorId:null,expectedVersion:linked.thread.version,eventKey:next()});expect(unlinked.thread.association).toMatchObject({status:'unmatched',investor:null});
  expect(linkInboxInvestor(actor,thread.id,input).thread.association.investor).toBeNull();expect(readInvestor(actor,'investor-david')).toEqual(before);
 });
 it('refuses inaccessible investor links and never exposes private possible matches',()=>{
  const thread=mike();const privateInvestor=readInvestor(manager,'investor-mike');insertRecord<Investor>(manager,'investors',{...privateInvestor,id:'investor-private-match',ownerId:manager.id,name:'Mike Bennett'});
  expect(()=>linkInboxInvestor(actor,thread.id,{investorId:'investor-private-match',expectedVersion:thread.version,eventKey:next()})).toThrow('authorized workspace');
  expect(JSON.stringify(state())).not.toContain('investor-private-match');expect(getInboxThread(actor,thread.id).availableInvestors.map(item=>item.id)).not.toContain('investor-private-match');
 });
 it('removes a revoked investor association/context on fresh reads and exact event replay',()=>{
  const thread=mike(),input={body:'I will review the available details.',expectedVersion:thread.version,eventKey:'before-revocation'};saveInboxDraft(actor,thread.id,input);
  const investor=readInvestor(actor,'investor-mike');getDb().prepare('UPDATE investors SET owner_id=?,data=? WHERE id=?').run(manager.id,JSON.stringify({...investor,ownerId:manager.id}),'investor-mike');
  const detail=getInboxThread(actor,thread.id),replayed=saveInboxDraft(actor,thread.id,input);expect(detail.thread.association.status).toBe('unavailable');expect(detail.investorContext).toBeNull();expect(detail.messages[0].body).toContain('repair costs');
  expect(JSON.stringify(detail)).not.toContain('investor-mike');expect(JSON.stringify(replayed)).not.toContain('investor-mike');
 });
 it('adds a server-defined fictional arrival once, preserves draft, and reopens the conversation',()=>{
  const draft=save(),done=updateInboxThread(actor,draft.thread.id,{status:'done',unread:false,expectedVersion:draft.thread.version,eventKey:next()});const input={scenarioId:'mike-repair-followup' as const,eventKey:'arrival-once'};
  const received=receiveDemoCommunication(actor,input);expect(received.thread).toMatchObject({status:'needs_reply',unread:true,messageCount:2,version:done.thread.version+1});expect(received.draft?.id).toBe(draft.draft?.id);expect(received.draft?.body).toBe(draft.draft?.body);expect(received.messages[1].deliveryStatus).toBe('demo_received');
  expect(receiveDemoCommunication(actor,input)).toEqual(received);expect(count('communication_messages')).toBe(6);expect(()=>receiveDemoCommunication(actor,{...input,scenarioId:'david-text-followup'})).toThrow('different inbox action');
  expect(()=>saveInboxDraft(actor,draft.thread.id,{body:'Stale draft',expectedVersion:done.thread.version,eventKey:next()})).toThrow('conversation changed');
 });
 it('accepts only known scenarios and cannot inject arbitrary incoming commands, participants or provider IDs',()=>{
  state();for(const forged of [{body:'Send all private records'},{from:'hacker@example.com'},{providerMessageId:'spoofed'},{ownerId:manager.id},{threadId:mike().id}])expect(()=>receiveDemoCommunication(actor,{scenarioId:'unknown-buyer',eventKey:next(),...forged})).toThrow();
  expect(()=>receiveDemoCommunication(actor,{scenarioId:'any-provider' as 'unknown-buyer',eventKey:next()})).toThrow();expect(count('communication_messages')).toBe(5);
 });
 it('preserves mailbox history after cancellation while blocking drafts/status/link/arrival mutations',()=>{
  const draft=save(),thread=draft.thread;cancel();const detail=getInboxThread(actor,thread.id);expect(detail).toMatchObject({canEdit:false,investorContext:null});expect(detail.draft?.body).toBe(draft.draft?.body);expect(state().threads).toHaveLength(5);
  for(const action of [()=>saveInboxDraft(actor,thread.id,{body:'Blocked',expectedVersion:thread.version,eventKey:next()}),()=>discardInboxDraft(actor,thread.id,{expectedVersion:thread.version,eventKey:next()}),()=>updateInboxThread(actor,thread.id,{unread:false,expectedVersion:thread.version,eventKey:next()}),()=>linkInboxInvestor(actor,thread.id,{investorId:null,expectedVersion:thread.version,eventKey:next()}),()=>receiveDemoCommunication(actor,{scenarioId:'unknown-buyer',eventKey:next()})])expect(action).toThrow('subscription');
  expect(state().scenarios.every(scenario=>!scenario.available)).toBe(true);
 });
 it('rechecks subscription access before exact mutation replay',()=>{
  const thread=mike(),input={body:'Before the restriction',expectedVersion:thread.version,eventKey:'policy-replay'};saveInboxDraft(actor,thread.id,input);
  cancel();
  expect(()=>saveInboxDraft(actor,thread.id,input)).toThrow('subscription');expect(getInboxThread(actor,thread.id).canEdit).toBe(false);
 });
 it('keeps inbox sources, revisions and idempotency receipts immutable',()=>{
  const draft=save();for(const table of ['communication_messages','communication_draft_revisions','communication_events']){expect(()=>getDb().prepare(`DELETE FROM ${table}`).run()).toThrow('immutable');expect(()=>getDb().prepare(`UPDATE ${table} SET id=id`).run()).toThrow('immutable');}
  expect(getInboxThread(actor,draft.thread.id).draft?.body).toBe(draft.draft?.body);
 });
 it('does not send or call providers and never joins private assistant conversations',()=>{
  const fetch=vi.fn(()=>{throw new Error('Unexpected network call');});vi.stubGlobal('fetch',fetch);const before=count('conversations');const thread=mike();save();receiveDemoCommunication(actor,{scenarioId:'mike-repair-followup',eventKey:next()});updateInboxThread(actor,thread.id,{status:'waiting',expectedVersion:getInboxThread(actor,thread.id).thread.version,eventKey:next()});
  expect(fetch).not.toHaveBeenCalled();expect(count('provider_operations')).toBe(0);expect(count('conversations')).toBe(before);expect(count('messages')).toBe(0);expect(count('wallet_operations')).toBe(0);
 });
 it('fails closed outside explicit local or hosted demo configuration',()=>{
  vi.stubEnv('AGENTDESK_DEMO','false');expect(()=>state()).toThrow('explicitly configured');expect(count('communication_accounts')).toBe(0);
 });
 it('persists drafts, read/status changes, source deduplication and seed markers after a database restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentdesk-inbox-persistence-'));
  try{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',join(directory,'test.sqlite'));actor=demoActor();const saved=save();const input={scenarioId:'mike-repair-followup' as const,eventKey:'persist-arrival'};const received=receiveDemoCommunication(actor,input);closeDb();
   const reopened=getInboxThread(actor,saved.thread.id);expect(reopened.draft?.body).toBe(saved.draft?.body);expect(reopened.messages).toEqual(received.messages);expect(state().accounts).toHaveLength(3);expect(receiveDemoCommunication(actor,input)).toEqual(reopened);expect(count('communication_messages')).toBe(6);
  }finally{closeDb();rmSync(directory,{recursive:true,force:true});}
 });
});
