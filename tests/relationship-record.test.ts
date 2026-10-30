import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import type {RelationshipReportInput} from '../src/lib/relationship-record-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getRelationshipRecord,recordRelationshipReport} from '../src/server/relationship-record';
import {getInvestorIntelligence,recordCallOutcome,setInvestorSharing} from '../src/server/intelligence';
import {recommendInvestorNextStep} from '../src/server/journey';
import {getInboxState,getInboxThread} from '../src/server/communications';
import {getInboxAssistance,prepareInboxReply,reviewInboxSend,simulateInboxSend} from '../src/server/communications-workflow';
import {updateOwnershipPolicy} from '../src/server/access';
import {saveEmployeeMemory} from '../src/server/memory';
import {chat,dispatchTool,toolDefinitions} from '../src/server/orchestrator';
import {simulateLifecycle,subscription} from '../src/server/billing';

let actor:Actor,manager:Actor,sequence:number;
beforeEach(()=>{
 closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider call');}));
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T16:00:00Z'));
 actor=demoActor();manager=demoActor('manager');sequence=0;
});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
function input(changes:Partial<RelationshipReportInput>={}):RelationshipReportInput {
 const current=getRelationshipRecord(actor,'investor-mike');
 return {investorId:'investor-mike',topic:'budget',buyBoxId:getInvestorIntelligence(actor,'investor-mike').buyBoxes[0].id,value:{min:120000,max:240000},statement:'Mike reported a revised purchase budget during our call.',statedAt:'2026-10-29T12:00:00Z',supersedesId:null,expectedVersion:current.version,expectedContext:current.contextVersion,eventKey:'report-'+(++sequence),...changes};
}
describe('reviewed investor understanding',()=>{
 it('projects current criteria without fabricating a statement date, report or commitment',()=>{
  const record=getRelationshipRecord(actor,'investor-mike'),budget=record.facts.find(f=>f.topic==='budget')!;
  expect(budget.recorded?.value).toEqual({min:150000,max:320000});expect(budget.recorded?.statedAt).toBeNull();
  expect(record.reports).toEqual([]);expect(record.conflicts).toEqual([]);expect(record.facts.find(f=>f.topic==='timing')?.status).toBe('unknown');
 });
 it('does not refresh a whole budget when only one bound has newer provenance',()=>{
  const box=getInvestorIntelligence(actor,'investor-mike').buyBoxes[0];
  box.fieldProvenance={priceMin:{...box.provenance,capturedAt:'2025-01-01T00:00:00Z',statement:'Original lower bound'},priceMax:{...box.provenance,capturedAt:'2026-10-29T00:00:00Z',statement:'Recent upper-bound review'}};
  getDb().prepare('UPDATE buy_boxes SET data=? WHERE id=?').run(JSON.stringify(box),box.id);
  const source=getRelationshipRecord(actor,'investor-mike').facts.find(f=>f.topic==='budget')?.recorded;
  expect(source).toMatchObject({freshness:'review_due',recordedAt:'2025-01-01T00:00:00Z'});
  expect(source?.statement).toContain('Original lower bound');expect(source?.statement).toContain('Recent upper-bound review');
 });
 it('retains the exact report, value, dates and author without changing approved CRM criteria',()=>{
  const before=getInvestorIntelligence(actor,'investor-mike'),record=recordRelationshipReport(actor,input());
  expect(record.reports[0]).toMatchObject({verification:'employee_reported',recordedBy:actor.id,statedAt:'2026-10-29T12:00:00.000Z',recordedAt:'2026-10-30T16:00:00.000Z'});
  expect(record.conflicts.find(f=>f.topic==='budget')).toMatchObject({recorded:{value:{max:320000}},reports:[{value:{max:240000}}]});
  expect(getInvestorIntelligence(actor,'investor-mike')).toEqual(before);
  expect(getDb().prepare('SELECT count(*) n FROM proposed_actions').get()).toEqual({n:0});
 });
 it('does not silently choose the newest or last-entered statement when sources differ',()=>{
  recordRelationshipReport(actor,input({topic:'timing',buyBoxId:null,value:['Next month'],statedAt:'2026-10-29T00:00:00Z'}));
  const result=recordRelationshipReport(actor,input({topic:'timing',buyBoxId:null,value:['Next year'],statedAt:'2025-10-29T00:00:00Z'}));
  const fact=result.conflicts.find(f=>f.topic==='timing')!;
  expect(fact.reports).toHaveLength(2);expect(fact.reports[1].freshness).toBe('review_due');expect(result.reports.every(r=>r.status==='active')).toBe(true);
 });
 it('records explicit corrections with preserved originals and rejects branching or mismatched corrections',()=>{
  const first=recordRelationshipReport(actor,input({buyBoxId:null,topic:'contact',value:['Morning calls']})).reports[0];
  const corrected=recordRelationshipReport(actor,input({buyBoxId:null,topic:'contact',value:['Email only'],supersedesId:first.id,statement:'Correction: Mike requested email only, not morning calls.'}));
  expect(corrected.reports[0]).toMatchObject({status:'superseded',statement:first.statement,supersededById:corrected.reports[1].id});
  expect(corrected.facts.find(f=>f.topic==='contact')?.reports).toHaveLength(1);
  expect(()=>recordRelationshipReport(actor,input({buyBoxId:null,topic:'contact',supersedesId:first.id,value:['Text']}))).toThrow('already has a correction');
  expect(()=>recordRelationshipReport(actor,input({topic:'timing',buyBoxId:null,value:['Tomorrow'],supersedesId:corrected.reports[1].id}))).toThrow('same field');
 });
 it('uses active corrections only when comparing with recorded criteria',()=>{
  const first=recordRelationshipReport(actor,input()).reports[0];
  const fixed=recordRelationshipReport(actor,input({value:{min:150000,max:320000},supersedesId:first.id,statement:'Correction: the original recorded budget remains accurate.'}));
  expect(fixed.conflicts).toEqual([]);expect(fixed.reports).toHaveLength(2);
 });
 it('keeps multiple strategies in separate buy boxes and rejects a different investor’s box',()=>{
  const box=getInvestorIntelligence(actor,'investor-mike').buyBoxes[0],second={...box,id:'second-box',label:'Rental strategy',priceMin:450000,priceMax:600000};
  getDb().prepare('INSERT INTO buy_boxes VALUES(?,?,?,?,?)').run(second.id,actor.organizationId,actor.officeId,'investor-mike',JSON.stringify(second));
  const result=recordRelationshipReport(actor,input());
  expect(result.conflicts).toHaveLength(1);expect(result.conflicts[0].buyBoxId).toBe(box.id);
  expect(result.facts.find(f=>f.buyBoxId===second.id&&f.topic==='budget')?.recorded?.value).toEqual({min:450000,max:600000});
  expect(()=>recordRelationshipReport(actor,input({buyBoxId:getInvestorIntelligence(actor,'investor-sarah').buyBoxes[0].id}))).toThrow('belonging to this investor');
 });
 it('normalizes set ordering and case without pretending different wording is semantically equivalent',()=>{
  const box=getInvestorIntelligence(actor,'investor-mike').buyBoxes[0];
  const same=recordRelationshipReport(actor,input({topic:'strategy',value:box.strategies.map(v=>v.toUpperCase())}));
  expect(same.conflicts).toEqual([]);
  const different=recordRelationshipReport(actor,input({topic:'strategy',value:['A new strategy']}));
  expect(different.conflicts[0].question).toContain('Review the differing sources');
 });
 it('keeps unknown statement dates unknown, and labels age without deleting or disproving the report',()=>{
  let record=recordRelationshipReport(actor,input({statedAt:null}));
  expect(record.facts.find(f=>f.topic==='budget')?.reports[0]).toMatchObject({freshness:'undated',statedAt:null});
  record=recordRelationshipReport(actor,input({topic:'financing',value:['Cash'],statedAt:'2026-01-01T00:00:00Z'}));
  expect(record.reviewDue.some(f=>f.topic==='financing')).toBe(true);expect(record.reports.every(r=>r.status==='active')).toBe(true);
  expect(record.policy.provisional).toBe(true);
 });
 it('rejects fabricated verification, future statement dates, invalid budgets and unscoped criteria',()=>{
  expect(()=>recordRelationshipReport(actor,{...input(),verification:'verified'} as RelationshipReportInput)).toThrow();
  expect(()=>recordRelationshipReport(actor,input({statedAt:'2027-01-01T00:00:00Z'}))).toThrow('future');
  expect(()=>recordRelationshipReport(actor,input({value:{min:500000,max:100000}}))).toThrow('valid budget');
  expect(()=>recordRelationshipReport(actor,input({value:['$200k']}))).toThrow('Budget requires');
  expect(()=>recordRelationshipReport(actor,input({buyBoxId:null}))).toThrow('Choose a buy box');
 });
 it('deduplicates exact retries without resurrecting a superseded value and rejects changed retry payloads',()=>{
  const original=input(),first=recordRelationshipReport(actor,original).reports[0];
  recordRelationshipReport(actor,input({value:{min:150000,max:320000},supersedesId:first.id}));
  const replay=recordRelationshipReport(actor,original);
  expect(replay.reports).toHaveLength(2);expect(replay.reports[0].status).toBe('superseded');
  expect(()=>recordRelationshipReport(actor,{...original,statement:'Different source statement for the same event.'})).toThrow('different details');
 });
 it('rejects stale reviews when reports or canonical criteria change',()=>{
  const old=input();recordRelationshipReport(actor,input());expect(()=>recordRelationshipReport(actor,old)).toThrow('record changed');
  const current=input(),box=getInvestorIntelligence(actor,'investor-mike').buyBoxes[0];
  getDb().prepare('UPDATE buy_boxes SET data=? WHERE id=?').run(JSON.stringify({...box,version:box.version+1,priceMax:380000}),box.id);
  expect(()=>recordRelationshipReport(actor,current)).toThrow('record changed');
 });
 it('enforces investor sharing and current role/tenant permissions before read, write and replay',()=>{
  const original=input();recordRelationshipReport(actor,original);
  expect(()=>getRelationshipRecord(demoActor('acquisitions'),'investor-mike')).toThrow('not found');
  const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
  expect(()=>getRelationshipRecord(other,'investor-mike')).toThrow();
  setInvestorSharing(manager,'investor-mike',{visibility:'office',sharedWith:[]});
  expect(getRelationshipRecord(demoActor('acquisitions'),'investor-mike').canEdit).toBe(false);
  expect(()=>recordRelationshipReport(demoActor('acquisitions'),original)).toThrow('Your role');
  expect(getRelationshipRecord(manager,'investor-mike').reports).toHaveLength(1);
  expect(()=>getRelationshipRecord({...actor,role:'manager'},'investor-mike')).toThrow('identity');
 });
 it('rechecks subscription access on exact retries',()=>{
  const original=input();recordRelationshipReport(actor,original);
  simulateLifecycle(actor,{action:'cancel_now',expectedVersion:subscription(actor).version,eventKey:'cancel-workforce'});
  expect(()=>recordRelationshipReport(actor,original)).toThrow();
 });
 it('keeps personal writing preferences separate from investor contact preferences',()=>{
  saveEmployeeMemory(actor,{tone:'direct',length:'concise'});
  const result=recordRelationshipReport(actor,input({buyBoxId:null,topic:'contact',value:['Email before calling']}));
  expect(result.facts.find(f=>f.topic==='contact')?.reports[0].displayValue).toBe('Email before calling');
  expect(JSON.stringify(result)).not.toContain('concise');
  expect(recommendInvestorNextStep(actor,'investor-mike').preferencesUsed).toMatchObject({tone:'direct',length:'concise'});
 });
 it('uses differing criteria in recommendations while preserving the recorded pause',()=>{
  recordRelationshipReport(actor,input());
  expect(recommendInvestorNextStep(actor,'investor-mike')).toMatchObject({action:{kind:'clarify_qualification'},deliveryStatus:'not_sent'});
  expect(recommendInvestorNextStep(actor,'investor-mike').draft).toContain('purchase budget');
  recordCallOutcome(actor,'investor-mike',{outcome:'paused',notes:'Investor requests a pause.'});
  const paused=recommendInvestorNextStep(actor,'investor-mike');
  expect(paused.action.kind).toBe('confirm_timing');expect(paused.draft).not.toContain('purchase budget');
 });
 it('exposes the same record through typed Copilot without adding a model write tool',async()=>{
  const report=recordRelationshipReport(actor,input()).reports[0];
  const result=await chat(actor,'Show Mike investor journey',undefined,'record-read');
  expect(result.result.artifacts.some(item=>item.type==='briefing'&&item.id==='investor-mike'),JSON.stringify(result.result)).toBe(true);
  expect(result.result.message).toContain('purchase budget');
  expect(toolDefinitions().some(tool=>/record_relationship|relationship_report/.test(tool.name))).toBe(false);
  const direct=await dispatchTool(actor,'investor_journey',{investorId:'investor-mike'});
  expect(JSON.stringify(direct.data)).toContain(report.statement);
 });
 it('rechecks the new record in inbox review hashes without timestamp-only false staleness',()=>{
  const state=getInboxState(actor),thread=state.threads.find(t=>t.accountId===state.preferredAccountId)!;
  let detail=getInboxThread(actor,thread.id);
  detail=prepareInboxReply(actor,thread.id,{eventKey:'draft',expectedVersion:detail.thread.version});
  const review=reviewInboxSend(actor,thread.id,{eventKey:'review',expectedVersion:detail.thread.version});
  vi.setSystemTime(new Date('2026-10-30T16:01:00Z'));
  expect(reviewInboxSend(actor,thread.id,{eventKey:'review',expectedVersion:detail.thread.version}).id).toBe(review.id);
  recordRelationshipReport(actor,input());
  expect(getInboxAssistance(actor,thread.id).suggestedReply.body).toContain('purchase budget');
  expect(()=>simulateInboxSend(actor,thread.id,{reviewId:review.id,eventKey:'stale-send'})).toThrow('changed');
 });
 it('invalidates opaque model memory after a report on an authorized investor from another office',async()=>{
  const reader:Actor={id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'};
  updateOwnershipPolicy(manager,{organizationVisibility:true,crossOfficeSharing:true,managerAssignment:true});
  setInvestorSharing(manager,'investor-mike',{visibility:'organization',sharedWith:[]});
  expect(getRelationshipRecord(reader,'investor-mike').canEdit).toBe(false);
  vi.stubEnv('OPENAI_API_KEY','mock-key');
  const message=(text:string)=>({type:'message',content:[{type:'output_text',text}]});
  const answer=(output:unknown[])=>new Response(JSON.stringify({status:'completed',output,usage:{input_tokens:50,output_tokens:20}}));
  const mock=vi.fn().mockResolvedValueOnce(answer([{type:'reasoning',id:'report-reasoning',summary:[],encrypted_content:'old-report-opaque'},message('Current investor context.')])).mockResolvedValueOnce(answer([message('The updated report needs review.')]));vi.stubGlobal('fetch',mock);
  const first=await chat(reader,'Show Mike investor journey',undefined,'shared-report-one');
  recordRelationshipReport(actor,input());
  await chat(reader,'Show Mike investor journey',first.conversation.id,'shared-report-two');
  expect(mock).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(JSON.parse(mock.mock.calls[1][1].body as string).input)).not.toContain('old-report-opaque');
 });
 it('rejects an in-flight model answer when the underlying relationship report changes',async()=>{
  vi.stubEnv('OPENAI_API_KEY','mock-key');vi.spyOn(console,'error').mockImplementation(()=>{});
  let finish!:(result:Response)=>void;
  vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;})));
  const pending=chat(actor,'Show Mike investor journey',undefined,'report-inflight');
  recordRelationshipReport(actor,input());
  finish(new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Obsolete budget conclusion.'}]}],usage:{input_tokens:50,output_tokens:20}})));
  const response=await pending;
  expect(response.result.message).toContain('changed');expect(JSON.stringify(response)).not.toContain('Obsolete budget conclusion.');
 });
 it('keeps reports append-only and avoids provider or wallet work',()=>{
  const report=recordRelationshipReport(actor,input()).reports[0];
  expect(()=>getDb().prepare('DELETE FROM relationship_reports WHERE id=?').run(report.id)).toThrow('immutable');
  expect(()=>getDb().prepare('UPDATE relationship_reports SET data=data WHERE id=?').run(report.id)).toThrow('immutable');
  expect(fetch).not.toHaveBeenCalled();
 });
});
