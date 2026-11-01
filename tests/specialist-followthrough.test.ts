import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Evidence,Prospect} from '../src/lib/contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {grantLegacyTestWorkforce} from './fixtures';
import {reviewResearchEvidence} from '../src/server/research-evidence';
import {scoreExternalProspect} from '../src/server/external-research-provider';
import {createDebrief,proposeDebrief} from '../src/server/debrief';
import {createTask,decideAction,getInvestor,getDailyBrief,listTasks,proposeInvestorUpdate,proposeNote,summarizeNotes} from '../src/server/services';
import {dispatchTool} from '../src/server/orchestrator';
import {getProactiveState,saveProactivePreferences} from '../src/server/proactive';
const actor=()=>demoActor(),manager=()=>demoActor('manager');
beforeEach(()=>{closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubEnv('OPENAI_API_KEY','');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));actor();grantLegacyTestWorkforce();});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();});
const evidence=(patch:Partial<Evidence>={}):Evidence=>({id:'sale',title:'Fictional source fixture',url:'https://example.com/sale',observedAt:'2026-10-30T12:00:00Z',detail:'Unverified fictional test claim',synthetic:false,kind:'reported_transaction',transactionDate:'2026-10-10',price:240000,propertyAddress:'12 Fictional Street',propertyType:'House',...patch});
const candidate=(items:Evidence[]):Prospect=>({id:'candidate',name:'Fictional Company',company:'Fictional Company',county:'Cobb',strategy:'Fix & flip',typicalPrice:0,transactionCount:0,lastActivityAt:'',score:0,scoreBreakdown:{},rationale:'',duplicateStatus:'uncertain',matchedInvestorId:null,phone:null,contactStatus:'missing',evidence:items,synthetic:false});
describe('research evidence that preserves unknowns',()=>{
 it.each(['2026-02-30','2026-10','10/10/26','unknown','2026-10-31'])('withholds an impossible, ambiguous or not-yet-observed sale date: %s',transactionDate=>{const review=reviewResearchEvidence(candidate([evidence({transactionDate})]));expect(review.transactions).toEqual([]);expect(review.nextAction).toContain('dated transaction');});
 it.each(['unknown','N/A','   '])('does not treat a placeholder address as a distinct purchase: %s',propertyAddress=>{expect(reviewResearchEvidence(candidate([evidence({propertyAddress})])).transactions).toEqual([]);});
 it('chooses a complete actual source record once, independent of discovery order, without merging evidence',()=>{
  const partial=evidence({id:'partial',price:null,propertyType:undefined}),complete=evidence({id:'complete',url:'https://other.example/sale'});
  for(const items of [[partial,complete],[complete,partial]]){const scored=scoreExternalProspect(candidate(items),{address:'Subject fixture',county:'Cobb',price:240000,strategy:'Fix & flip',propertyType:'House',limit:10});expect(scored.transactionCount).toBe(1);expect(scored.typicalPrice).toBe(240000);expect(scored.evidenceReview?.transactions).toEqual([complete]);expect(scored.contactStatus).toBe('missing');}
 });
 it('excludes invalid observation dates and credential-bearing URLs without changing raw evidence',()=>{for(const patch of [{observedAt:'2026-09-31'},{url:'https://user:secret@example.com/sale'}]){const source=evidence(patch),value=candidate([source]);expect(reviewResearchEvidence(value).transactions).toEqual([]);expect(value.evidence).toEqual([source]);}});
});
describe('attributed recap follow-through',()=>{
 it('does not assign Sarah’s requested callback to selected Mike, including continued sentences',()=>{
  const before=listTasks(actor()).length,d=createDebrief(actor(),{investorId:'investor-mike',recap:'Mike: I buy rentals in Cobb County.\nSarah: I buy with cash. Call me tomorrow.'});
  expect(d.suggestedFollowUpAt).toBeNull();expect(proposeDebrief(actor(),d.id,{createFollowUp:true}).tasks).toEqual([]);expect(listTasks(actor())).toHaveLength(before);
 });
 it('keeps an explicitly attributed request for the selected investor and saves its reminder only once',()=>{
  const d=createDebrief(actor(),{investorId:'investor-mike',recap:'Sarah: I buy rentals.\nMike: I buy with cash. Call me tomorrow.'});expect(d.suggestedFollowUpAt).toBeTruthy();
  const first=proposeDebrief(actor(),d.id,{createFollowUp:true}),again=proposeDebrief(actor(),d.id,{createFollowUp:true});expect(first.tasks).toHaveLength(1);expect(first.tasks[0].investorId).toBe('investor-mike');expect(again.tasks).toEqual(first.tasks);
 });
 it('does not turn the employee’s call-me request into an investor callback',()=>{const d=createDebrief(actor(),{investorId:'investor-mike',recap:'Agent: I reviewed the property with Mike. Call me tomorrow.'});expect(d.suggestedFollowUpAt).toBeNull();});
 it.each(['repair budget of $50k','repairs under $50k','deposit under $20k','monthly rent under $2k'])('keeps %s separate from the purchase budget',amount=>{const d=createDebrief(actor(),{investorId:'investor-mike',recap:`Mike: I want ${amount}. I buy rental properties.`});expect(d.extractedChanges.budgetMax).toBeUndefined();expect(d.ambiguities.join(' ')).toContain('expense');});
 it('retains competing financing choices as a question without discarding independent criteria',()=>{const d=createDebrief(actor(),{investorId:'investor-mike',recap:'Mike: I use cash or hard money. I buy rental properties.'});expect(d.extractedChanges.financing).toBeUndefined();expect(d.extractedChanges.strategy).toBe('Buy & hold');expect(d.ambiguities.join(' ')).toContain('financing alternatives');});
});
describe('CRM correction context and atomic outcomes',()=>{
 it('rejects a related minimum change that would make a prepared maximum inconsistent',()=>{
  const current=getInvestor(actor(),'investor-mike'),old=proposeInvestorUpdate(actor(),current.id,{budgetMax:current.budgetMax-1000});
  expect(decideAction(manager(),proposeInvestorUpdate(manager(),current.id,{budgetMin:current.budgetMax}).id,'approve').status).toBe('executed');
  const result=decideAction(actor(),old.id,'approve');expect(result.status).toBe('failed');expect(result.error).toContain('related qualification');expect(getInvestor(actor(),current.id).budgetMax).toBe(current.budgetMax);
 });
 it('retires a proposal after a same-value source revision, then permits one exact current replacement',()=>{
  const old=proposeInvestorUpdate(actor(),'investor-mike',{timeframe:'90 days'}),current=getInvestor(actor(),'investor-mike');
  decideAction(actor(),proposeInvestorUpdate(actor(),current.id,{budgetMax:current.budgetMax}).id,'approve');
  expect(decideAction(actor(),old.id,'approve').status).toBe('failed');
  const fresh=proposeInvestorUpdate(actor(),current.id,{timeframe:'90 days'}),first=decideAction(actor(),fresh.id,'approve');expect(first.status).toBe('executed');expect(decideAction(actor(),fresh.id,'approve')).toEqual(first);
 });
 it('keeps unrelated appended notes from invalidating a qualification proposal',()=>{const update=proposeInvestorUpdate(actor(),'investor-mike',{timeframe:'90 days'}),note=proposeNote(actor(),'investor-mike',summarizeNotes(actor(),'Mike: We discussed the fictional walkthrough today.'));decideAction(actor(),note.id,'approve');expect(decideAction(actor(),update.id,'approve').status).toBe('executed');});
 it('checks range consistency even for legacy proposals without a context snapshot',()=>{
  const current=getInvestor(actor(),'investor-mike'),action=proposeInvestorUpdate(actor(),current.id,{budgetMax:current.budgetMax-1000});delete action.payload.qualificationContext;getDb().prepare('UPDATE proposed_actions SET data=? WHERE id=?').run(JSON.stringify(action),action.id);
  decideAction(manager(),proposeInvestorUpdate(manager(),current.id,{budgetMin:current.budgetMax}).id,'approve');expect(decideAction(actor(),action.id,'approve').status).toBe('failed');expect(getInvestor(actor(),current.id).budgetMin).toBeLessThanOrEqual(getInvestor(actor(),current.id).budgetMax);
 });
});
describe('personal priorities in the employee timezone',()=>{
 it('explains overdue/today/undated work and pending reviews without exposing team tasks',async()=>{
  const person=manager();vi.setSystemTime(new Date('2026-10-31T04:30:00Z'));
  const {version,updatedAt,...preferences}=getProactiveState(person).preferences;void updatedAt;
  saveProactivePreferences(person,{...preferences,timeZone:'America/Los_Angeles',expectedVersion:version,eventKey:'set-zone'});
  const overdue=createTask(person,{title:'My overdue review',dueAt:'2026-10-31T04:00:00Z'}),today=createTask(person,{title:'My evening follow-through',dueAt:'2026-10-31T06:00:00Z'}),undated=createTask(person,{title:'My undated plan'});
  const approval=proposeInvestorUpdate(person,'investor-mike',{timeframe:'90 days'}),privateTask=createTask(actor(),{title:'Alex private follow-up',dueAt:'2026-10-30T00:00:00Z'}),before=listTasks(person);
  const brief=getDailyBrief(person);expect(brief.priorities.map(item=>item.id)).toEqual([overdue.id,today.id,approval.id,undated.id]);
  expect(brief.priorities[1].reason).toContain('Due today');expect(brief.priorities[1].reason).toContain('America/Los_Angeles');expect(brief.priorities[1].reason).toContain('Oct 30');expect(JSON.stringify(brief)).not.toContain(privateTask.id);
  const tool=await dispatchTool(person,'daily_priorities',{});expect(tool.message).toContain('Waiting for your exact CRM review');expect(tool.artifacts.find(item=>item.id===approval.id)?.type).toBe('approval');expect(listTasks(person)).toEqual(before);
 });
});

it('does not reinterpret an already-prepared recap as work for a different investor',()=>{
 const d=createDebrief(actor(),{investorId:'investor-mike',recap:'Mike: I buy rental properties. Call me tomorrow.'}),first=proposeDebrief(actor(),d.id,{createFollowUp:true});
 expect(()=>proposeDebrief(actor(),d.id,{investorId:'investor-sarah',createFollowUp:true})).toThrow('different investor');expect(proposeDebrief(actor(),d.id,{investorId:'investor-mike',createFollowUp:true}).tasks).toEqual(first.tasks);
});
