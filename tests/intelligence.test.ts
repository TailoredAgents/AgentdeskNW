import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor, ResearchInput } from '../src/lib/contracts';
import type { ReleaseInput } from '../src/lib/intelligence-contracts';
import { closeDb, demoActor, getDb } from '../src/server/db';
import { classifyAuthorizedDuplicate, getOwnershipPolicy, updateOwnershipPolicy } from '../src/server/access';
import { assignInvestor, getCallBriefing, getCallingQueue, getDisclosure, getInvestorIntelligence, listBuyBoxes, matchProperty, proposeBuyBox, recordCallOutcome, recordDemoDisclosure, isDisclosureReady, setCallPriority, setInvestorSharing } from '../src/server/intelligence';
import { decideAction, getBootstrap, getInvestor, listInvestors, matchBuyers, proposeInvestorUpdate } from '../src/server/services';
import { defaultScoreWeights, scoreProspect, syntheticResearchProvider } from '../src/server/research';
import { saveRelease } from '../src/server/workflows';
import { createDebrief, listDebriefs, proposeDebrief } from '../src/server/debrief';
import { readProperties, readProperty } from '../src/server/access';
let actor:Actor,manager:Actor,acquisitions:Actor;
const other:Actor={id:'user-other',name:'Casey Sample',organizationId:'org-isolation',officeId:'office-other',role:'dispositions'};
const savannah:Actor={id:'user-savannah',name:'Robin Sample',organizationId:'org-demo',officeId:'office-savannah',role:'dispositions'};
beforeEach(()=>{closeDb();process.env.AGENTDESK_DB_PATH=':memory:';vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T16:00:00.000Z'));actor=demoActor();manager=demoActor('manager');acquisitions=demoActor('acquisitions');});
afterEach(()=>{closeDb();vi.useRealTimers();});
function releaseInput(overrides:Partial<ReleaseInput>={}):ReleaseInput {return {propertyId:'property-maple',status:'released',source:'Synthetic release test',eventKey:'release-fixture-1',propertyType:'Single-family',description:'Fictional investment property.',notes:'Demo condition description.',mediaUrl:null,mediaAccess:'unverified',arv:350000,repairEstimate:40000,economicsSource:'Fictional demo estimate',showingInstructions:'Coordinate a demo showing',authorizedUserIds:[actor.id],upstreamParty:'Fictional wholesaler',upstreamStage:'Contract position reviewed',downstreamStage:'Finding end buyer',closingStructure:'same_day',closingAt:null,...overrides};}

describe('investor permissions and private duplicates',()=>{
 it('keeps agent-owned fixtures private across user, office and tenant boundaries',()=>{
  expect(listInvestors(actor)).toHaveLength(3);
  expect(()=>getInvestor(actor,'investor-jordan-private')).toThrow('not found');
  expect(()=>getInvestorIntelligence(savannah,'investor-mike')).toThrow('not found');
  expect(()=>getInvestorIntelligence(other,'investor-mike')).toThrow('not found');
  expect(getInvestor(manager,'investor-jordan-private').ownerId).toBe(acquisitions.id);
  expect(()=>getInvestorIntelligence({...actor,role:'manager'},'investor-mike')).toThrow('not authorized');
 });
 it('reveals only an opaque duplicate flag for protected same-organization records',()=>{
  const result=classifyAuthorizedDuplicate(actor,{company:'Cedar & Stone Investments',name:'Morgan Ellis'});
  expect(result).toEqual({duplicateStatus:'possible_duplicate',matchedInvestorId:null});
  expect(JSON.stringify(result)).not.toContain('investor-jordan-private');
  expect(classifyAuthorizedDuplicate(other,{company:'Cedar & Stone Investments',name:'Morgan Ellis'})).toEqual({duplicateStatus:'net_new',matchedInvestorId:null});
  expect(classifyAuthorizedDuplicate(actor,{company:'PEACHTREE RENEWAL L.L.C.',name:'Mike Bennett'}).matchedInvestorId).toBe('investor-mike');
 });
 it('requires a manager to grant explicit read-only sharing and supports revocation',()=>{
  expect(()=>setInvestorSharing(actor,'investor-mike',{visibility:'shared',sharedWith:[acquisitions.id]})).toThrow('Your role');
  setInvestorSharing(manager,'investor-mike',{visibility:'shared',sharedWith:[acquisitions.id]});
  expect(getInvestor(acquisitions,'investor-mike').id).toBe('investor-mike');
  expect(()=>proposeInvestorUpdate(acquisitions,'investor-mike',{budgetMax:400000})).toThrow('read-only');
  expect(()=>recordCallOutcome(acquisitions,'investor-mike',{outcome:'connected'})).toThrow('read-only');
  setInvestorSharing(manager,'investor-mike',{visibility:'owner',sharedWith:[]});
  expect(()=>getInvestor(acquisitions,'investor-mike')).toThrow('not found');
 });
 it('makes organization and cross-office visibility opt-in and remains tenant-isolated',()=>{
  expect(getOwnershipPolicy(actor).organizationVisibility).toBe(false);
  expect(()=>setInvestorSharing(manager,'investor-mike',{visibility:'organization',sharedWith:[]})).toThrow('disabled');
  expect(()=>setInvestorSharing(manager,'investor-mike',{visibility:'shared',sharedWith:[savannah.id]})).toThrow('outside');
  updateOwnershipPolicy(manager,{organizationVisibility:true,crossOfficeSharing:true,managerAssignment:true});
  setInvestorSharing(manager,'investor-mike',{visibility:'organization',sharedWith:[]});
  expect(getInvestorIntelligence(savannah,'investor-mike').investor.name).toBe('Mike Bennett');
  expect(()=>getInvestor(other,'investor-mike')).toThrow('not found');
  expect(()=>recordCallOutcome(savannah,'investor-mike',{outcome:'connected'})).toThrow('read-only');
  updateOwnershipPolicy(manager,{organizationVisibility:false,crossOfficeSharing:false,managerAssignment:true});
  expect(()=>getInvestor(savannah,'investor-mike')).toThrow('not found');
 });
 it('supports configurable manager reassignment within an office and revokes old ownership',()=>{
  expect(()=>assignInvestor(actor,'investor-mike',acquisitions.id)).toThrow('Your role');
  expect(()=>assignInvestor(manager,'investor-mike',savannah.id)).toThrow('this office');
  updateOwnershipPolicy(manager,{organizationVisibility:false,crossOfficeSharing:false,managerAssignment:false});
  expect(()=>assignInvestor(manager,'investor-mike',acquisitions.id)).toThrow('disabled');
  updateOwnershipPolicy(manager,{organizationVisibility:false,crossOfficeSharing:false,managerAssignment:true});
  assignInvestor(manager,'investor-mike',acquisitions.id);
  expect(getInvestor(acquisitions,'investor-mike').ownerId).toBe(acquisitions.id);
  expect(()=>getInvestor(actor,'investor-mike')).toThrow('not found');
  expect(getCallingQueue(actor).some(item=>item.investor.id==='investor-mike')).toBe(false);
 });
});

describe('reviewed multiple buy boxes and provenance',()=>{
 it('migrates existing CRM preferences without overwriting source records',()=>{
  const before=getInvestor(actor,'investor-mike');const boxes=listBuyBoxes(actor,before.id);
  expect(boxes).toHaveLength(1);expect(boxes[0].counties).toEqual(before.counties);
  expect(boxes[0].priceMax).toBe(before.budgetMax);expect(boxes[0].provenance.verification).toBe('seeded_demo');
  expect(getInvestor(actor,before.id)).toEqual(before);
 });
 it('requires approval before adding a distinct buy box and is idempotent',()=>{
  const proposal=proposeBuyBox(actor,'investor-mike',{label:'Rental purchases',counties:['Bartow'],priceMax:150000,strategies:['Buy & hold'],sourceStatement:'I also buy rentals under $150,000 in Bartow County.'});
  expect(listBuyBoxes(actor,'investor-mike')).toHaveLength(1);
  expect(()=>decideAction(other,proposal.id,'approve')).toThrow('not found');
  expect(decideAction(actor,proposal.id,'approve').status).toBe('executed');
  decideAction(actor,proposal.id,'approve');
  const boxes=listBuyBoxes(actor,'investor-mike');expect(boxes).toHaveLength(2);
  expect(boxes[1].provenance.statement).toContain('Bartow');expect(boxes[1].provenance.reviewStatus).toBe('approved');
  expect(boxes[0].strategies).toEqual(['Fix & flip']);
 });
 it('flags changed criteria, refuses stale proposals and retains old provenance',()=>{
  const box=listBuyBoxes(actor,'investor-mike')[0];
  const first=proposeBuyBox(actor,'investor-mike',{expectedVersion:box.version,priceMax:250000,sourceStatement:'My new maximum is $250,000.'},box.id);
  const stale=proposeBuyBox(actor,'investor-mike',{expectedVersion:box.version,priceMax:280000,sourceStatement:'My budget is $280,000.'},box.id);
  expect(first.payload.conflicts).toEqual(expect.arrayContaining([expect.stringContaining('priceMax')]));
  expect(decideAction(actor,first.id,'approve').status).toBe('executed');
  expect(decideAction(actor,stale.id,'approve').status).toBe('failed');
  const updated=listBuyBoxes(actor,'investor-mike')[0];expect(updated.priceMax).toBe(250000);expect(updated.version).toBe(2);
  expect(getInvestor(actor,'investor-mike').budgetMax).toBe(250000);
  const historical=getDb().prepare('SELECT data FROM buy_box_versions WHERE buy_box_id=? AND version=1').get(box.id) as {data:string};
  expect(JSON.parse(historical.data).priceMax).toBe(320000);expect(JSON.parse(historical.data).provenance).toEqual(box.provenance);
  expect(()=>proposeBuyBox(actor,'investor-mike',{expectedVersion:1,priceMax:500000,sourceStatement:'Stale edit'},box.id)).toThrow('changed');
 });
 it('synchronizes approved CRM changes through the primary-box mapping only',()=>{
  const original=listBuyBoxes(actor,'investor-mike')[0];
  const action=proposeInvestorUpdate(actor,'investor-mike',{budgetMax:280000,rehab:'Light'});
  expect(listBuyBoxes(actor,'investor-mike')[0].priceMax).toBe(320000);
  expect(decideAction(actor,action.id,'approve').status).toBe('executed');
  const updated=listBuyBoxes(actor,'investor-mike')[0];
  expect(updated.priceMax).toBe(280000);expect(updated.rehabLevels).toEqual(['Light']);expect(updated.version).toBe(original.version+1);
  expect(updated.provenance.verification).toBe('employee_confirmed');expect(updated.provenance.source).toContain(action.id);
  expect(updated.fieldProvenance?.priceMax.verification).toBe('employee_confirmed');expect(updated.fieldProvenance?.counties.verification).toBe('seeded_demo');expect(updated.fieldProvenance?.counties).toEqual(original.fieldProvenance?.counties);
 });
 it('rejects contradictory ranges and unauthorized buy-box edits',()=>{
  expect(()=>proposeBuyBox(actor,'investor-mike',{priceMin:500000,priceMax:100000,sourceStatement:'Contradictory'})).toThrow('minimum');
  expect(()=>proposeBuyBox(actor,'investor-jordan-private',{sourceStatement:'Access attempt'})).toThrow('not found');
  expect(()=>proposeBuyBox(actor,'investor-mike',{sourceStatement:'Wrong record'},'no-such-box')).toThrow('not in');
 });
});

describe('matching, calling priorities and truthful activity',()=>{
 it('matches geography, type, price, rehab and strategy with explainable conflicts',()=>{
  const matches=matchProperty(actor,'property-maple');const mike=matches.find(item=>item.investorId==='investor-mike')!;
  expect(mike.score).toBe(100);expect(mike.reasons).toHaveLength(5);expect(mike.conflicts).toHaveLength(0);
  const sarah=matches.find(item=>item.investorId==='investor-sarah')!;
  expect(sarah.conflicts).toEqual(expect.arrayContaining([expect.stringContaining('target counties'),expect.stringContaining('more rehab'),expect.stringContaining('strategy conflicts')]));
  expect(matches.some(item=>item.investorId==='investor-jordan-private')).toBe(false);
 });
 it('selects the best distinct buy box and separately reports engagement',()=>{
  const extra=proposeBuyBox(actor,'investor-mike',{label:'Atlanta rental',counties:['Fulton'],priceMin:250000,priceMax:400000,strategies:['Buy & hold'],propertyTypes:['Single-family'],rehabLevels:['Light'],sourceStatement:'I also buy Atlanta rentals.'});decideAction(actor,extra.id,'approve');
  const result=matchProperty(actor,'property-oak').find(item=>item.investorId==='investor-mike')!;
  expect(result.buyBoxLabel).toBe('Atlanta rental');expect(result.score).toBe(100);expect(result.engagementScore).toBeLessThan(100);
  recordCallOutcome(actor,'investor-mike',{outcome:'interested'});
  const fresh=matchProperty(actor,'property-oak').find(item=>item.investorId==='investor-mike')!;
  expect(fresh.score).toBe(result.score);expect(fresh.engagementScore).toBeGreaterThan(result.engagementScore);
  expect(getInvestorIntelligence(actor,'investor-mike').currentActivity).toBe('unknown');
 });
 it('uses latest release type and ARV without leaking restricted releases',()=>{
  const release=saveRelease(acquisitions,releaseInput({propertyType:'Land'}));
  expect(matchProperty(actor,'property-maple')[0].conflicts).toContain('Property type conflicts with the buy box.');
  saveRelease(acquisitions,releaseInput({propertyType:'Land',authorizedUserIds:[],eventKey:'revoke',expectedVersion:release.version}));
  expect(()=>matchProperty(actor,'property-maple')).toThrow('not found');
  expect(getCallingQueue(actor).every(item=>item.property===null)).toBe(true);
 });
 it('applies release assignments to bootstrap inventory and every direct property entry point',()=>{
  expect(readProperties(actor)).toHaveLength(3);
  const debrief=createDebrief(actor,{recap:'Mike asked for photos of the property after our conversation.',investorId:'investor-mike',propertyId:'property-maple'});
  saveRelease(acquisitions,releaseInput({authorizedUserIds:[]}));
  expect(getBootstrap(actor).properties.some(property=>property.id==='property-maple')).toBe(false);
  expect(()=>readProperty(actor,'property-maple')).toThrow('not found');
  expect(()=>matchBuyers(actor,'property-maple')).toThrow('not found');
  expect(()=>getCallBriefing(actor,'investor-mike','property-maple')).toThrow('not found');
  expect(()=>createDebrief(actor,{recap:'Mike asked for photos of the property after our conversation.',investorId:'investor-mike',propertyId:'property-maple'})).toThrow('not found');
  expect(listDebriefs(actor)).toHaveLength(0);
  expect(()=>proposeDebrief(actor,debrief.id,{})).toThrow('not found');
  expect(readProperty(acquisitions,'property-maple').id).toBe('property-maple');
  expect(readProperty(manager,'property-maple').id).toBe('property-maple');
  expect(readProperty(actor,'property-cedar').id).toBe('property-cedar');
 });
 it('surfaces existing CRM notes as legacy context without claiming a conversation date',()=>{
  const investor=getInvestor(actor,'investor-mike');
  const briefing=getCallBriefing(actor,investor.id);
  expect(briefing.lastConversation).toContain('Stored CRM notes (legacy; call date unverified)');
  expect(briefing.lastConversation).toContain(investor.notes);
  expect(getInvestor(actor,investor.id).lastContactAt).toBe(investor.lastContactAt);
 });
 it('requires valid disclosure evidence consistently for queue and matching readiness',()=>{
  const valid=getDisclosure(actor,'investor-mike');expect(isDisclosureReady(valid)).toBe(true);
  for(const invalid of [{...valid,signedAt:null},{...valid,signedAt:'2099-01-01T00:00:00.000Z'},{...valid,expiresAt:'invalid-date'},{...valid,documentRef:'self-attested'}])expect(isDisclosureReady(invalid)).toBe(false);
  const row=getDb().prepare('SELECT data FROM investor_intelligence WHERE investor_id=?').get('investor-mike') as {data:string};
  getDb().prepare('UPDATE investor_intelligence SET data=? WHERE investor_id=?').run(JSON.stringify({...JSON.parse(row.data),disclosure:{...valid,signedAt:null}}),'investor-mike');
  expect(matchProperty(actor,'property-maple').find(match=>match.investorId==='investor-mike')?.disclosureReady).toBe(false);
  expect(getCallingQueue(actor).find(item=>item.investor.id==='investor-mike')?.reasons.some(reason=>reason.includes('fixture is ready'))).toBe(false);
 });
 it('ranks actual owned records with release fit and overdue commitments and persists employee priorities',()=>{
  saveRelease(acquisitions,releaseInput());
  const queue=getCallingQueue(actor);expect(queue).toHaveLength(3);expect(queue[0].investor.id).toBe('investor-mike');
  expect(queue[0].reasons.some(reason=>reason.includes('overdue commitment'))).toBe(true);expect(queue[0].property?.id).toBe('property-maple');
  setCallPriority(actor,'investor-sarah',{manualPriority:100});expect(getCallingQueue(actor)[0].investor.id).toBe('investor-sarah');
  setCallPriority(actor,'investor-sarah',{dismissed:true});expect(getCallingQueue(actor)).toHaveLength(2);expect(getCallingQueue(actor,{includeDismissed:true})).toHaveLength(3);
  expect(()=>setCallPriority(actor,'investor-jordan-private',{dismissed:true})).toThrow('not found');
 });
 it('records true call attempts without fabricating conversations and persists commitments',()=>{
  const before=getInvestor(actor,'investor-mike').lastContactAt;
  recordCallOutcome(actor,'investor-mike',{outcome:'no_answer'});expect(getInvestor(actor,'investor-mike').lastContactAt).toBe(before);
  const result=recordCallOutcome(actor,'investor-mike',{outcome:'connected',notes:'Asked for the current property details.',followUpAt:'2026-10-30T12:00:00-04:00'});
  expect(result.task?.dueAt).toBe('2026-10-30T16:00:00.000Z');expect(getInvestor(actor,'investor-mike').lastContactAt).toBe('2026-10-29T16:00:00.000Z');
  const briefing=getCallBriefing(actor,'investor-mike');expect(briefing.lastConversation).toContain('Asked for');expect(briefing.lastOutcome).toBe('connected');expect(briefing.commitments.some(task=>task.id===result.task?.id)).toBe(true);
  expect(briefing.missing).toContain('Verified phone number');
 });
 it('keeps disclosure updates manager-only and distinctly synthetic',()=>{
  expect(getDisclosure(actor,'investor-mike').status).toBe('signed');expect(getDisclosure(actor,'investor-sarah').status).toBe('unknown');
  expect(()=>recordDemoDisclosure(actor,'investor-sarah',{status:'signed',version:'demo-disclosure-v1',documentRef:'demo:test'})).toThrow('Your role');
  expect(()=>recordDemoDisclosure(manager,'investor-sarah',{status:'signed',version:'demo-disclosure-v1',documentRef:'self-attested'})).toThrow('demo:');
  recordDemoDisclosure(manager,'investor-sarah',{status:'signed',version:'demo-disclosure-v1',documentRef:'demo:synthetic-fixture',expiresAt:'2026-10-28T16:00:00.000Z'});
  expect(getDisclosure(actor,'investor-sarah').status).toBe('expired');expect(matchProperty(actor,'property-oak').find(item=>item.investorId==='investor-sarah')?.disclosureReady).toBe(false);
 });
});

describe('external research fit remains separate from engagement',()=>{
 it('weights similar purchase type and price more heavily than geography and recognizes aliases',()=>{
  const input:ResearchInput={address:'123 Example Street',county:'Cobb',price:235000,strategy:'Fix & flip',propertyType:'SFR',limit:100};
  const sample=syntheticResearchProvider.discover(input)[0];
  expect(Object.values(defaultScoreWeights).reduce((sum,value)=>sum+value,0)).toBe(100);
  expect(defaultScoreWeights.propertyType+defaultScoreWeights.price).toBeGreaterThan(defaultScoreWeights.geography);
  expect(scoreProspect({...sample,propertyType:'Single family'},input).scoreBreakdown.propertyType).toBe(25);
  const sameTypeFar=scoreProspect({...sample,county:'Fulton',propertyType:'Single-family'},input);
  const wrongTypeNear=scoreProspect({...sample,county:'Cobb',propertyType:'Land'},input);
  expect(sameTypeFar.score).toBeGreaterThan(wrongTypeNear.score);
  expect(scoreProspect({...sample,propertyType:undefined},input).scoreBreakdown.propertyType).toBe(0);
  expect(sample.evidence.some(item=>item.propertyType)).toBe(true);
 });
});
