import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInvestorJourney,recommendInvestorNextStep,recordJourneyObservation} from '../src/server/journey';
import {getInboxState,getInboxThread} from '../src/server/communications';
import {getInboxAssistance,prepareInboxReply,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {relationshipGuidance,relationshipMethods,selectRelationshipMethod} from '../src/server/relationship-methods';
import * as methods from '../src/server/relationship-methods';
import type {Actor} from '../src/lib/contracts';
let actor:Actor;
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T14:00:00Z'));actor=demoActor();});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('provisional relationship working methods',()=>{
 it.each([['confirm_timing','reactivation'],['resolve_objection','objections'],['review_pass','objections'],['fulfill_commitment','follow-through'],['clarify_qualification','qualification'],['clarify_fit','qualification']] as const)('traces %s to a current source/version', (kind,id)=>{
  const result=selectRelationshipMethod(kind,actor.role);expect(result).toMatchObject({id,version:2,authority:'provisional',status:'active',source:{document:'docs/RELATIONSHIP_METHODS.md',revision:'2026-10-31.2'}});expect(result!.requiredFacts.length).toBeGreaterThan(1);
 });
 it('does not apply the dispositions method to acquisitions or missing sharing eligibility',()=>{expect(selectRelationshipMethod('resolve_objection','acquisitions')).toBeNull();expect(selectRelationshipMethod('resolve_eligibility','manager')).toBeNull();});
 it('honors effective versions, withdrawal and removed role access without resurrecting old revisions',()=>{
  const original=relationshipMethods.find(method=>method.id==='objections')!,next={...original,version:original.version+1,status:'withdrawn' as const};
  expect(selectRelationshipMethod('resolve_objection','dispositions',[original,next])).toBeNull();
  expect(selectRelationshipMethod('resolve_objection','dispositions',[original,{...next,status:'active',roles:['manager']}])).toBeNull();
  expect(selectRelationshipMethod('resolve_objection','dispositions',[original,{...next,effectiveAt:'2027-01-01T00:00:00Z'}])?.version).toBe(original.version);
  expect(selectRelationshipMethod('resolve_objection','manager',[original,{...next,status:'active',roles:['manager']}])?.version).toBe(original.version+1);
 });
 it('new repair evidence changes the method and useful question with a traceable source',()=>{
  const before=recommendInvestorNextStep(actor,'investor-mike');expect(before.workingMethod?.method.id).toBe('follow-through');
  const issue=recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Repair scope and costs were unclear.',eventKey:'method-concern'});
  const next=recommendInvestorNextStep(actor,'investor-mike');expect(next.workingMethod?.method.id).toBe('objections');expect(next.action.description).toContain('Which repair items');expect(next.workingMethod?.evidenceIds).toContain(`observation:${issue.id}`);expect(next.workingMethod?.missingFacts.join(' ')).toContain('supporting material');
  recordJourneyObservation(actor,{investorId:'investor-mike',kind:'resolved',text:'Investor says the repair breakdown addressed this concern.',resolvesId:issue.id,eventKey:'method-resolution'});
  expect(recommendInvestorNextStep(actor,'investor-mike').workingMethod?.method.id).toBe('follow-through');
 });
 it('pause overrides a repair concern without implying marketing permission',()=>{
  recordJourneyObservation(actor,{investorId:'investor-mike',kind:'objection',text:'Repair figures needed',eventKey:'pause-concern'});
  getInvestorJourney(actor,'investor-mike');
  const row=getDb().prepare('SELECT data FROM investor_intelligence WHERE investor_id=?').get('investor-mike') as {data:string};getDb().prepare('UPDATE investor_intelligence SET data=? WHERE investor_id=?').run(JSON.stringify({...JSON.parse(row.data),currentActivity:'paused'}),'investor-mike');
  const next=recommendInvestorNextStep(actor,'investor-mike');expect(next.workingMethod?.method.id).toBe('reactivation');expect(next.workingMethod?.question).toContain('later check-in');expect(next.workingMethod?.method.limits.join(' ')).toContain('not permission');
 });
 it('takes only authorized context and returns independent catalog snapshots',()=>{
  const original=relationshipMethods.find(method=>method.id==='objections')!,copy=selectRelationshipMethod('resolve_objection','manager')!;copy.steps.push('Changed');expect(original.steps).not.toContain('Changed');
  expect(()=>recommendInvestorNextStep(demoActor('acquisitions'),'investor-mike')).toThrow();
  const journey=getInvestorJourney(actor,'investor-mike');expect(relationshipGuidance(journey,'resolve_eligibility','dispositions')).toBeNull();
 });
 it('uses the same provisional method in company-email assistance and withholds it for headers-only sources',()=>{
  const state=getInboxState(actor),thread=state.threads.find(item=>item.accountId===state.preferredAccountId)!;
  expect(getInboxAssistance(actor,thread.id).workingMethod?.method.id).toBe('objections');
  const header=state.threads.find(item=>state.accounts.find(account=>account.id===item.accountId)?.source.coverage==='headers_only')!;
  expect(getInboxAssistance(actor,header.id).workingMethod).toBeNull();
 });
 it('invalidates a send review when its method revision changes',()=>{
  const state=getInboxState(actor),id=state.threads.find(item=>item.accountId===state.preferredAccountId)!.id;
  prepareInboxReply(actor,id,{expectedVersion:getInboxThread(actor,id).thread.version,eventKey:'prepare'});
  const review=reviewInboxSend(actor,id,{expectedVersion:getInboxThread(actor,id).thread.version,eventKey:'review'});
  vi.spyOn(methods,'relationshipMethodFingerprint').mockReturnValue('new-method-revision');
  expect(()=>simulateInboxSend(actor,id,{reviewId:review.id,eventKey:'send'})).toThrow('changed');expect((getDb().prepare('SELECT COUNT(*) n FROM communication_send_receipts').get() as {n:number}).n).toBe(0);
 });
});
