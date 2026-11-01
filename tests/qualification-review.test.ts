import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import type {BuyBox} from '../src/lib/intelligence-contracts';
import type {RelationshipTopic,RelationshipValue} from '../src/lib/relationship-record-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getInvestorIntelligence,recordCallOutcome} from '../src/server/intelligence';
import {getRelationshipRecord,recordRelationshipReport} from '../src/server/relationship-record';
import {qualificationReferenceCurrent,qualificationResult,reviewQualification} from '../src/server/qualification-review';
import {collectHistoryReferences,historyReferencesVisible} from '../src/server/history';
import {chat,dispatchTool} from '../src/server/orchestrator';
import {deriveWorkSourceReferences} from '../src/server/work-provenance';
import {createWorkRun,getWorkRun,processWorkRuns} from '../src/server/work-runs';
import {voiceContextSnapshot} from '../src/server/voice-context';
import {billingPolicy,saveBillingPolicy} from '../src/server/billing';
let actor:Actor,seq:number;
const key=()=>`qualification-${++seq}`;
const review=()=>reviewQualification(actor,'investor-mike');
function box(change:Partial<BuyBox>={}){const original=getInvestorIntelligence(actor,'investor-mike').buyBoxes[0],value={...original,...change};getDb().prepare('INSERT INTO buy_boxes VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(value.id,actor.organizationId,actor.officeId,'investor-mike',JSON.stringify(value));return value;}
function report(statement:string,value:RelationshipValue,options:{statedAt?:string|null;supersedesId?:string;buyBoxId?:string;topic?:RelationshipTopic}={}){const current=getRelationshipRecord(actor,'investor-mike');return recordRelationshipReport(actor,{investorId:'investor-mike',buyBoxId:options.buyBoxId??box().id,topic:options.topic??'financing',value,statement,statedAt:options.statedAt===undefined?'2026-10-31T15:00:00Z':options.statedAt,supersedesId:options.supersedesId??null,expectedVersion:current.version,expectedContext:current.contextVersion,eventKey:key()});}
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No provider calls');}));vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-31T16:00:00Z'));actor=demoActor();seq=0;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('evidence-led qualification decisions',()=>{
 it('asks one prioritized useful question and distinguishes criteria from verified readiness',()=>{const result=qualificationResult(actor,'investor-mike');expect(review().nextQuestion).not.toBeNull();expect(result.message).toContain('Ask the next useful question');expect(result.message).toContain('not verified funding');expect(fetch).not.toHaveBeenCalled();});
 it('keeps a recorded pause ahead of missing or complete criteria',()=>{recordCallOutcome(actor,'investor-mike',{outcome:'paused',notes:'Employee reports a pause.'});expect(review()).toMatchObject({readiness:'paused',nextQuestion:{kind:'pause'}});expect(review().nextQuestion?.reason).toContain('Do not restart');});
 it('retains disagreeing funding evidence and asks a reconciliation question before a pitch',()=>{report('Employee reports seller financing only.',['Seller financing only']);const result=review();expect(result.nextQuestion).toMatchObject({kind:'conflict'});expect(result.nextQuestion?.sourceIds).toHaveLength(2);expect(result.evidence.some(e=>e.value==='Seller financing only')).toBe(true);expect(getInvestorIntelligence(actor,'investor-mike').investor.financing).not.toBe('Seller financing only');});
 it.each(['I can use cash only after my other closing.','I might use cash if the current sale completes.','Cash funding is subject to the other property selling.'])('preserves conditional meaning without upgrading it to a confirmed commitment: %s',statement=>{box({financing:[]});report(statement,['Cash']);const result=review();expect(result.nextQuestion?.kind).toBe('conditional');expect(result.evidence.some(e=>e.statement===statement)).toBe(true);expect(result.nextQuestion?.reason).toContain('Do not turn a possibility');});
 it('explicitly corrected testimony changes the next question and invalidates earlier guidance',()=>{box({financing:[]});const first=report('Cash only after another closing.',['Cash']).reports[0],before=review();report('Correction: cash is the intended method; no sale contingency was reported.',['Cash'],{supersedesId:first.id});expect(review().questions.some(q=>q.kind==='conditional')).toBe(false);expect(review().evidence.some(e=>e.id===first.id)).toBe(false);expect(qualificationReferenceCurrent(actor,before.qualificationReference)).toBe(false);});
 it('does not merge separate strategies or apply an inactive strategy conflict',()=>{const other=box({id:'qualification-other-box',label:'Rental strategy',financing:['Cash']}),record=report('Rental strategy financing differs.',['Hard money'],{buyBoxId:other.id});expect(review().questions.find(q=>q.kind==='conflict')?.scope).toBe('Rental strategy');box({...other,active:false});expect(review().evidence.some(e=>e.id===record.reports[0].id)).toBe(false);expect(review().buyBoxes).toHaveLength(1);});
 it('asks for a reviewed strategy when all boxes are inactive or pending',()=>{box({active:false});expect(review().questions[0]).toMatchObject({kind:'missing',scope:'Buying strategy'});});
 it('treats unknown funding and a missing budget ceiling as unanswered',()=>{box({financing:['Unknown'],priceMax:null});const value=review();expect(value.questions.filter(q=>q.kind==='missing').length).toBeGreaterThanOrEqual(2);expect(value.questions.some(q=>q.question.includes('financing'))).toBe(true);});
 it('does not equate recently entered historical testimony with current knowledge',()=>{box({financing:[]});report('Employee recalls old funding plans.',['Cash'],{statedAt:'2025-01-01T00:00:00Z'});const value=review();expect(value.questions.some(q=>q.kind==='reconfirm'&&q.question.includes('financing'))).toBe(true);expect(value.evidence.find(e=>e.statement.includes('recalls'))?.freshness).toBe('review_due');});
 it('keeps undated testimony explicitly undated and changes references when freshness expires',()=>{box({financing:[]});report('Employee reports cash.',['Cash'],{statedAt:null});expect(review().evidence.find(e=>e.statement==='Employee reports cash.')?.statedAt).toBeNull();const before=review().qualificationReference;vi.setSystemTime(new Date('2027-07-01T16:00:00Z'));expect(qualificationReferenceCurrent(actor,before)).toBe(false);});
 it('enforces investor scope, role, subscription restriction and reference identity',()=>{const before=review().qualificationReference;expect(qualificationReferenceCurrent(demoActor('manager'),before)).toBe(false);expect(qualificationReferenceCurrent(actor,before+'@forged')).toBe(false);expect(()=>reviewQualification(demoActor('acquisitions'),'investor-mike')).toThrow();expect(()=>reviewQualification(actor,'investor-foreign')).toThrow();const admin=demoActor('manager');saveBillingPolicy(admin,{...billingPolicy(admin),restricted:['investor-qualification']});expect(qualificationReferenceCurrent(actor,before)).toBe(false);});
 it('uses the same read in Copilot and saved work and retires changed testimony across both',async()=>{const tool=await dispatchTool(actor,'qualification_review',{investorId:'investor-mike'}),refs=collectHistoryReferences(actor,tool.artifacts);expect(refs.qualificationReviews).toHaveLength(1);const run=createWorkRun(actor,{requestId:key(),title:'Review investor qualification',instructions:'Review only; do not update or contact.',steps:[{key:'review',capabilityId:'review_qualification',input:{investorId:'investor-mike'},dependsOn:[]}]});processWorkRuns(actor,5);expect(getWorkRun(actor,run.id).steps[0].result?.message).toBe(tool.message);report('Funding changed.',['Seller financing only']);expect(historyReferencesVisible(actor,refs)).toBe(false);expect(getWorkRun(actor,run.id).contentRestricted).toBe(true);});
 it('carries source references into derived work and protects active voice from changed testimony',async()=>{const response=await chat(actor,'Qualify Mike',undefined,key()),refs=deriveWorkSourceReferences(actor,response.conversation.id,key()),before=voiceContextSnapshot(actor);expect(refs.qualificationReviews).toHaveLength(1);report('Employee corrects funding.',['Seller financing only']);expect(voiceContextSnapshot(actor)).not.toEqual(before);expect(historyReferencesVisible(actor,{...refs,workRuns:[]})).toBe(false);});
 it('shares correction-sensitive advice across web, mobile, SMS and Slack entry points without external transport',async()=>{let conversationId:string|undefined;for(const channel of ['web','mobile','sms','slack'] as const){if(channel==='mobile')recordCallOutcome(actor,'investor-mike',{outcome:'paused',notes:'Pause while plans change.'});const response=await chat(actor,'Qualify Mike',conversationId,key(),channel);conversationId=response.conversation.id;expect(response.result.message).toContain(channel==='web'?'Qualification review':'recorded pause');}expect(fetch).not.toHaveBeenCalled();});
});


describe('source-specific qualification questions',()=>{
 it('asks one reconciliation question for a conflicting incomplete budget and retains every source',()=>{
  const currentBox=box({priceMax:null}),record=report('Employee reports a revised maximum purchase price.',{min:150000,max:280000},{topic:'budget'});
  const current=review(),question=current.questions.filter(q=>q.factKey===currentBox.id+':budget');
  expect(question).toHaveLength(1);
  expect(question[0]).toMatchObject({kind:'conflict',buyBoxId:currentBox.id,topic:'budget'});
  expect(question[0].question).toContain('Recorded:');expect(question[0].question).toContain('Reported:');expect(question[0].question).toContain('$280,000');
  expect(question[0].reason).toContain('newest report does not automatically win');
  expect(question[0].sourceIds).toContain(record.reports[0].id);
  expect(current.evidence.filter(e=>e.factKey===question[0].factKey)).toHaveLength(2);
  expect(getInvestorIntelligence(actor,'investor-mike').buyBoxes.find(b=>b.id===currentBox.id)?.priceMax).toBeNull();
 });
 it('asks for the missing ceiling instead of treating a lower bound as a complete budget',()=>{
  const currentBox=box({priceMax:null}),question=review().questions.find(q=>q.factKey===currentBox.id+':budget');
  expect(question).toMatchObject({kind:'missing',topic:'budget'});expect(question?.question).toContain('maximum purchase price');expect(question?.question).toContain('lower bound is not a spending ceiling');
 });
 it('retains an unresolved option even when another financing value is supplied',()=>{
  const currentBox=box({financing:['Cash','Unknown']}),question=review().questions.find(q=>q.factKey===currentBox.id+':financing');
  expect(question).toMatchObject({kind:'missing'});expect(question?.question).toContain('availability, approval or conditions');
 });
 it('quotes a relevant conditional excerpt without losing the full original statement',()=>{
  box({financing:[]});const statement='Employee supplied background context. '.repeat(15)+'Cash is available only after the other property closes. '+ 'Additional supplied context. '.repeat(15);
  const recorded=report(statement,['Cash']),current=review(),question=current.questions.find(q=>q.topic==='financing');
  expect(question).toMatchObject({kind:'conditional'});expect(question?.question).toContain('only after the other property closes');expect(question?.question.length).toBeLessThan(500);expect(question?.question).toContain('…');
  expect(current.evidence.find(e=>e.id===recorded.reports[0].id)?.statement).toBe(statement.trim());
 });
 it.each(['I cannot use cash for this strategy.','I do not have funding available.'])("clarifies funding-denial wording despite a structured Cash value: %s",statement=>{
  const currentBox=box({financing:[]});report(statement,['Cash']);const current=review();
  expect(current.nextQuestion).toMatchObject({kind:'wording',buyBoxId:currentBox.id,topic:'financing'});expect(current.nextQuestion?.question).toContain(statement);expect(current.nextQuestion?.reason).toContain('neither confirms nor rejects funding');
  expect(getInvestorIntelligence(actor,'investor-mike').buyBoxes.find(b=>b.id===currentBox.id)?.financing).toEqual([]);
 });
 it('an explicit correction removes old funding-denial wording without verifying the replacement',()=>{
  box({financing:[]});const first=report('I cannot use cash for this strategy.',['Cash']).reports[0],before=review();
  report('Correction: cash is my intended method; availability has not been verified.',['Cash'],{supersedesId:first.id});const current=review();
  expect(current.questions.some(q=>q.kind==='wording')).toBe(false);expect(current.evidence.some(e=>e.id===first.id)).toBe(false);expect(qualificationReferenceCurrent(actor,before.qualificationReference)).toBe(false);
  expect(current.method.notice).toContain('not verified funding');expect(current.evidence.find(e=>e.topic==='financing')?.verification).toBe('employee_reported');
 });
 it('does not revive an explicitly removed condition but still finds a separate remaining condition',()=>{
  box({financing:[]});const first=report('Cash is subject to selling my other property.',['Cash']).reports[0];
  const second=report('Correction: cash is no longer subject to selling that property.',['Cash'],{supersedesId:first.id}).reports.find(r=>r.status==='active')!;
  expect(review().questions.some(q=>q.topic==='financing'&&q.kind==='conditional')).toBe(false);
  report('Cash is no longer subject to selling that property, but loan approval is pending.',['Cash'],{supersedesId:second.id});
  expect(review().questions.find(q=>q.topic==='financing')).toMatchObject({kind:'conditional'});expect(review().questions.find(q=>q.topic==='financing')?.question).toContain('loan approval is pending');
 });
 it('keeps exact strategy identities even when two approved buy boxes share the same label',()=>{
  const original=box({label:'Same label',financing:[]}),other=box({id:'qualification-same-label',label:'Same label',financing:['Cash']});
  const conditional=report('Cash only after my other closing.',['Cash'],{buyBoxId:original.id}).reports.find(r=>r.buyBoxId===original.id)!;
  const conflicting=report('Employee reports hard money for the second strategy.',['Hard money'],{buyBoxId:other.id}).reports.find(r=>r.buyBoxId===other.id)!;
  const current=review(),first=current.questions.find(q=>q.buyBoxId===original.id&&q.topic==='financing'),second=current.questions.find(q=>q.buyBoxId===other.id&&q.topic==='financing');
  expect(first).toMatchObject({kind:'conditional',scope:'Same label'});expect(second).toMatchObject({kind:'conflict',scope:'Same label'});
  expect(first?.sourceIds).toContain(conditional.id);expect(first?.sourceIds).not.toContain(conflicting.id);expect(second?.sourceIds).toContain(conflicting.id);expect(second?.sourceIds).not.toContain(conditional.id);
  expect(new Set(current.questions.filter(q=>q.factKey!==null).map(q=>q.factKey)).size).toBe(current.questions.filter(q=>q.factKey!==null).length);
 });
});
