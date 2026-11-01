import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {closeDb,demoActor,getDb,newId} from '../src/server/db';
import {prepareDemoScenario} from '../src/server/demo-scenario';
import {getInboxState,getInboxThread,receiveDemoCommunication,receiveThreadDemoReply} from '../src/server/communications';
import {getInboxAssistance,getInboxDraftRevisionContext,prepareInboxReply,recordInboxObservation,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {inboxContextFingerprint} from '../src/server/communications-context';
import {preparePropertyOutreachResult} from '../src/server/package-correspondence';
import {listPackages} from '../src/server/workflows';
import {getInvestorJourney} from '../src/server/journey';
import {getEmployeeMemory} from '../src/server/memory';
import {readInvestor} from '../src/server/access';
import {reviewCorrespondenceIntent} from '../src/server/correspondence-intent';

// Emulate an older deployed method when preparing a review, retaining the actual
// parser/services. A version change must invalidate protected saved context.
const method=vi.hoisted(()=>({version:'correspondence-review-v3'}));
vi.mock('../src/server/correspondence-intent',async importOriginal=>{const actual=await importOriginal<typeof import('../src/server/correspondence-intent')>();return {...actual,get correspondenceMethodVersion(){return method.version;}};});
let sequence=0;const key=()=>`pause-test-${++sequence}`,actor=()=>demoActor();
const mutation=(id:string)=>({expectedVersion:getInboxThread(actor(),id).thread.version,eventKey:key()});
const count=(table:string)=>(getDb().prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n;
const ordinary=()=>{const inbox=getInboxState(actor());return inbox.threads.find(thread=>thread.correspondent.address==='mike@example.com'&&inbox.accounts.find(account=>account.id===thread.accountId)?.provider==='gmail')!.id;};
const send=(id:string)=>{const review=reviewInboxSend(actor(),id,mutation(id));return simulateInboxSend(actor(),id,{reviewId:review.id,eventKey:key()});};
function packagePause(){
 const value=listPackages(actor()).find(item=>item.investorId==='investor-mike'&&item.channel==='email')!;
 const prepared=preparePropertyOutreachResult(actor(),{packageId:value.id,accountId:null}),id=(prepared.data as {threadId:string}).threadId;send(id);
 receiveThreadDemoReply(actor(),id,{...mutation(id),scenario:'timing'});return id;
}
function appendFixture(id:string,body:string){
 const detail=getInboxThread(actor(),id),original=detail.messages.find(message=>message.direction==='inbound')!,message={...original,id:newId('pause_fixture'),body,attachments:[],sourceRef:`demo:pause:${key()}`};
 getDb().prepare('INSERT INTO communication_messages VALUES(?,?,?,?,?,?,?,?)').run(message.id,actor().organizationId,actor().officeId,actor().id,detail.account.id,id,message.sourceRef,JSON.stringify(message));return message;
}
function protectedState(){return {investor:readInvestor(actor(),'investor-mike'),activity:getInvestorJourney(actor(),'investor-mike').activity,memory:getEmployeeMemory(actor()),tasks:count('tasks'),observations:count('journey_observations'),outbox:count('messaging_outbox'),receipts:count('communication_send_receipts')};}
beforeEach(()=>{closeDb();sequence=0;method.version='correspondence-review-v3';vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('AGENTDESK_HOSTED_DEMO','false');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));prepareDemoScenario();});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('conservative current-sender buying-pause cues',()=>{
 it.each(['I am pausing purchases.','I’m pausing purchases for now.','We have paused buying.','My buying plans are on hold.','I am putting purchases on hold.'])('recognizes a source report, not verification: %s',text=>{
  expect(reviewCorrespondenceIntent(text).buyingPause).toMatchObject({reported:true,conflicting:false,requestedCheckIn:null});
 });
 it.each([
  'If repairs are expensive, I am pausing purchases.',
  'I might be pausing purchases.',
  'I am not pausing purchases.',
  'I am pausing purchases?',
  'Should I be pausing purchases?',
  '> I am pausing purchases.\nThanks for the update.',
  '“I am pausing purchases.”',
  '"Example message:\nI am pausing purchases for now.\nPlease check with me next month.\n"',
  '‘Example message:\nI’m pausing purchases for now.\nPlease check with me next month.\n’',
  "'Example message:\nI'm pausing purchases for now.\nPlease check with me next month.\n'",
  'Mike: I am pausing purchases.',
  'The investor said I am pausing purchases.',
  'I am pausing purchases of equipment.',
  'I am pausing purchases in Dallas, but keep sending Houston properties.',
  'I am pausing purchases, but only equipment purchases.',
  'I am pausing purchases, but keep sending Houston properties.',
  'I am pausing purchases was what I said last month.',
  'I am pausing purchases. That was last month.',
  'Thanks.\nOn Monday Mike wrote:\nI am pausing purchases.',
  '```\nI am pausing purchases.\n```',
 ])('does not promote conditional, negated, questioned or quoted content: %s',text=>{expect(reviewCorrespondenceIntent(text).buyingPause.reported).toBe(false);});
 it('reads current text after a closed quoted block and preserves contractions',()=>{expect(reviewCorrespondenceIntent('"Example message:\nI am pausing purchases.\n"\nI’m pausing purchases for now. Please check with me next month.').buyingPause).toMatchObject({reported:true,requestedCheckIn:'next_month'});});
 it.each(['I am pausing purchases. I am not pausing purchases.','I am pausing purchases, but I am ready to buy again.'])('keeps contradictory current statements unresolved: %s',text=>{expect(reviewCorrespondenceIntent(text).buyingPause).toMatchObject({reported:false,conflicting:true,requestedCheckIn:null});});
 it('keeps an explicitly requested check-in relative and does not infer it from a passing mention',()=>{
  expect(reviewCorrespondenceIntent('I am pausing purchases. Please check with me next month before sending more properties.').buyingPause.requestedCheckIn).toBe('next_month');
  for(const text of ['I am pausing purchases. My vacation is next month.','I am pausing purchases. Please check with me next month if my lender agrees.','I am pausing purchases.\n> Please check with me next month.'])expect(reviewCorrespondenceIntent(text).buyingPause.requestedCheckIn).toBeNull();
 });
});

describe('source-grounded pause replies through ordinary services',()=>{
 it('saves an appropriate reply to the real fictional timing fixture in a package-origin thread without gaining other authority',()=>{
  const id=packagePause(),before=protectedState(),assistance=getInboxAssistance(actor(),id),latest=getInboxThread(actor(),id).messages.at(-1)!;
  expect(before.activity).not.toBe('paused');expect(assistance.summary).toContain('reports a pause');expect(assistance.summary).toContain('has not changed');
  expect(assistance.suggestedReply.body).toContain('you’re pausing purchases');expect(assistance.suggestedReply.body).toContain('next month');expect(assistance.suggestedReply.body).not.toMatch(/marked as paused|buying criteria changed|What purchase timing/);
  expect(assistance.suggestedObservation).toMatchObject({messageId:latest.id,kind:'preference'});expect(assistance.suggestedFollowUp).toMatchObject({messageId:latest.id,dueAt:null});expect(assistance.suggestedFollowUp?.title).toContain('next month');expect(assistance.sources.some(source=>source.id===latest.id&&source.verification==='fictional_unverified_correspondence')).toBe(true);
  const input=mutation(id),saved=prepareInboxReply(actor(),id,input);expect(saved.draft).toMatchObject({body:assistance.suggestedReply.body,authorship:'copilot',deliveryStatus:'not_sent'});expect(prepareInboxReply(actor(),id,input).draft).toEqual(saved.draft);
  expect(getInboxDraftRevisionContext(actor(),id)).toMatchObject({eligible:false,reason:expect.stringContaining('Property packages')});expect(protectedState()).toEqual(before);
 });
 it('retains exact source provenance on repeated pause observations without setting CRM activity',()=>{
  const id=packagePause(),before=protectedState(),first=getInboxAssistance(actor(),id).suggestedObservation!,input={...mutation(id),...first},saved=recordInboxObservation(actor(),id,input);expect(recordInboxObservation(actor(),id,input).observation.id).toBe(saved.observation.id);
  prepareInboxReply(actor(),id,mutation(id));send(id);receiveThreadDemoReply(actor(),id,{...mutation(id),scenario:'timing'});
  const second=getInboxAssistance(actor(),id).suggestedObservation!,next=recordInboxObservation(actor(),id,{...mutation(id),...second});expect(next.observation.id).not.toBe(saved.observation.id);expect(second.messageId).not.toBe(first.messageId);
  const receipts=(getDb().prepare("SELECT data FROM communication_workflow_actions WHERE thread_id=? ORDER BY rowid").all(id) as {data:string}[]).map(row=>JSON.parse(row.data));expect(receipts.map(receipt=>receipt.messageId)).toEqual([first.messageId,second.messageId]);expect(receipts.every(receipt=>receipt.sourceRef.startsWith('demo-reply:')&&receipt.reviewedText.includes('sender reports pausing'))).toBe(true);
  expect(getInvestorJourney(actor(),'investor-mike').activity).toBe(before.activity);expect(readInvestor(actor(),'investor-mike')).toEqual(before.investor);expect(getEmployeeMemory(actor())).toEqual(before.memory);expect(count('tasks')).toBe(before.tasks);
 });
 it('respects a contact stop before any otherwise useful pause acknowledgment',()=>{
  const id=ordinary();appendFixture(id,'I am pausing purchases. Please check with me next month. Stop emailing me.');const before=protectedState(),advice=getInboxAssistance(actor(),id);
  expect(advice.suggestedReply).toMatchObject({eligible:false,body:''});expect(advice.nextStep).toContain('Respect the contact request');expect(advice.suggestedObservation).toBeNull();expect(()=>prepareInboxReply(actor(),id,mutation(id))).toThrow('contact-stop');expect(protectedState()).toEqual(before);
 });
 it('clarifies conflicting reports without saving a pause observation or asserting a changed activity',()=>{
  const id=ordinary();appendFixture(id,'I am pausing purchases, but I am ready to buy again.');const advice=getInboxAssistance(actor(),id);expect(advice.summary).toContain('conflicting');expect(advice.suggestedReply.body).toContain('Could you clarify');expect(advice.suggestedObservation).toBeNull();expect(getInvestorJourney(actor(),'investor-mike').activity).not.toBe('paused');
 });
 it.each(['I am pausing purchases of equipment.','I am pausing purchases in Dallas, but keep sending Houston properties.','I am pausing purchases was what I said last month.'])('retains scoped or historical statements without drafting a blanket stop: %s',body=>{
  const id=ordinary(),source=appendFixture(id,body),before=protectedState(),advice=getInboxAssistance(actor(),id);expect(advice.sources.some(item=>item.id===source.id&&item.excerpt===body)).toBe(true);expect(advice.summary).not.toContain('reports a pause');expect(advice.suggestedReply.body).not.toMatch(/hold off on sharing more properties|you’re pausing purchases|marked as paused/);expect(advice.suggestedReply.body).toContain('What purchase timing works for you now');expect(prepareInboxReply(actor(),id,mutation(id)).draft?.body).toBe(advice.suggestedReply.body);expect(protectedState()).toEqual(before);
 });
 it('invalidates prior reviews and recommendations when a new incoming source changes the question',()=>{
  const id=ordinary();appendFixture(id,'I am pausing purchases. Please check with me next month.');prepareInboxReply(actor(),id,mutation(id));const reviewed=reviewInboxSend(actor(),id,mutation(id)),fingerprint=inboxContextFingerprint(actor());
  receiveDemoCommunication(actor(),{scenarioId:'mike-repair-followup',eventKey:key()});expect(inboxContextFingerprint(actor())).not.toBe(fingerprint);expect(()=>simulateInboxSend(actor(),id,{reviewId:reviewed.id,eventKey:key()})).toThrow(/changed/i);
  const advice=getInboxAssistance(actor(),id);expect(advice.suggestedReply.body).toContain('repair');expect(advice.suggestedReply.body).not.toContain('you’re pausing purchases');expect(prepareInboxReply(actor(),id,mutation(id)).draft?.body).toBe(advice.suggestedReply.body);
 });
 it('invalidates old exact send reviews, ordinary draft references and opaque model context when the method changes',()=>{
  const id=ordinary();method.version='correspondence-review-v2';prepareInboxReply(actor(),id,mutation(id));const reviewed=reviewInboxSend(actor(),id,mutation(id)),oldContext=inboxContextFingerprint(actor()),oldDraft=getInboxDraftRevisionContext(actor(),id).sourceReference;
  method.version='correspondence-review-v3';expect(inboxContextFingerprint(actor())).not.toBe(oldContext);expect(getInboxDraftRevisionContext(actor(),id).sourceReference).not.toBe(oldDraft);expect(()=>simulateInboxSend(actor(),id,{reviewId:reviewed.id,eventKey:key()})).toThrow(/changed/i);
 });
});
