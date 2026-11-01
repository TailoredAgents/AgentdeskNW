import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Actor} from '../src/lib/contracts';
import {emptyOpportunity,type OpportunityInput} from '../src/lib/opportunity-contracts';
import {emptyAnalysis,type AnalysisInput} from '../src/lib/analysis-contracts';
import {closeDb,demoActor,getDb} from '../src/server/db';
import {getOpportunity,previewOpportunity,saveOpportunity} from '../src/server/opportunities';
import {getAnalysis,getAnalysisBoard,previewAnalysis,saveAnalysis} from '../src/server/deal-analysis';
import {reviewOpportunityScreening,opportunityScreeningMessage} from '../src/server/opportunity-screening';
import {dispatchTool} from '../src/server/orchestrator';
import {collectHistoryReferences,historyReferencesVisible} from '../src/server/history';
import {billingPolicy,saveBillingPolicy} from '../src/server/billing';
import {createWorkRun,getWorkRun,processWorkRuns} from '../src/server/work-runs';

const methodState=vi.hoisted(()=>({revision:null as string|null}));
vi.mock('../src/server/opportunity-screening-questions',async importOriginal=>{
 const actual=await importOriginal<typeof import('../src/server/opportunity-screening-questions')>();
 return {...actual,get opportunityScreeningMethod(){return methodState.revision??actual.opportunityScreeningMethod;}};
});

let actor:Actor,sequence:number,id:string,source:OpportunityInput;
const next=()=>`screen-${++sequence}`;
function saveSource(input:OpportunityInput=source,recordId:string|null=null,version=0){const preview=previewOpportunity(actor,{input,id:recordId,expectedVersion:version});return saveOpportunity(actor,{input,id:recordId,expectedVersion:version,reviewReference:preview.reviewReference,eventKey:next()});}
function input():AnalysisInput {const value=emptyAnalysis('diligence');return {...value,label:'Fictional purchase scenario',sourceKind:'opportunity',sourceId:id,financing:'cash',values:{...value.values,purchasePrice:200000,purchaseCosts:5000,repairLow:30000,repairHigh:40000,contingencyPercent:10,salePriceLow:300000,salePriceHigh:320000,sellingCostPercent:6,holdingMonths:6,monthlyHoldingCosts:1000},sources:Object.fromEntries(Object.keys(value.sources).map(key=>[key,{reference:'Explicit fictional assumption, not verified',asOf:'2026-10-30'}])) as AnalysisInput['sources']};}
function saveScenario(value=input(),recordId:string|null=null,version=0,owner=actor){const review=previewAnalysis(owner,{input:value,id:recordId,expectedVersion:version});return saveAnalysis(owner,{input:value,id:recordId,expectedVersion:version,reviewReference:review.reviewReference,eventKey:next()});}
beforeEach(()=>{methodState.revision=null;closeDb();vi.stubEnv('AGENTDESK_DB_PATH',':memory:');vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AGENTDESK_DEMO','true');vi.stubEnv('AGENTDESK_ALLOW_PRODUCTION_DEMO','true');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected provider call');}));vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-31T16:00:00Z'));actor=demoActor('acquisitions');sequence=0;source={...emptyOpportunity,address:'640 Fictional Lane',city:'Marietta',county:'Cobb',state:'GA',propertyType:'Single family',closingTarget:'2026-11-15',accessNotes:'Source reports access by appointment, unconfirmed.',submission:{...emptyOpportunity.submission,wholesaler:'Fictional wholesaler',sourceReference:'Employee-supplied fictional intake',reportedOn:'2026-10-30',askingPrice:200000,repairEstimate:40000,repairScope:'Supplied cosmetic scope',repairSource:'Fictional source estimate',comparableSources:'Unverified supplied sale references',occupancy:'vacant'}};id=saveSource().opportunity.id;});
afterEach(()=>{closeDb();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe('pre-inventory supported screening',()=>{
 it('asks for explicit assumptions when no private scenario exists without creating or valuing anything',()=>{const before=getDb().prepare('SELECT count(*) n FROM deal_analyses').get();const review=reviewOpportunityScreening(actor,id);expect(review.screening?.title).toBe('Prepare a supported scenario');expect(review.screening?.scenarios).toEqual([]);expect(getDb().prepare('SELECT count(*) n FROM deal_analyses').get()).toEqual(before);expect(fetch).not.toHaveBeenCalled();});
 it('shows saved arithmetic with its date, sources and remaining evidence questions',()=>{const saved=saveScenario(),review=reviewOpportunityScreening(actor,id),scenario=review.screening!.scenarios[0];expect(scenario).toMatchObject({analysisId:saved.record.id,state:'current',asOf:'2026-10-31'});expect(scenario.metrics[0].value).toBe(27000);expect(review.screening?.title).toBe('Review the evidence and assumptions');expect(review.screening?.decisionBasis?.join(' ')).not.toContain('core economic outcome is unknown');expect(scenario.questions.length).toBeGreaterThan(0);expect(review.screening?.notice).toContain('do not mean the company should accept');expect(opportunityScreeningMessage(review)).toContain('$27,000.00');});
 it('identifies a purchase-price discrepancy without inventing an agreed discount',()=>{const value=input();value.values.purchasePrice=180000;saveScenario(value);const screening=reviewOpportunityScreening(actor,id).screening!;expect(screening.title).toBe('Reconcile intake and scenario assumptions');expect(screening.scenarios[0].differences[0]).toContain('not an agreed price');expect(screening.nextAction).toContain('$200,000.00');});
 it('identifies supplied repairs outside the modeled range',()=>{const value=input();value.values.repairLow=10000;value.values.repairHigh=20000;saveScenario(value);expect(reviewOpportunityScreening(actor,id).screening?.scenarios[0].differences[0]).toContain('repair estimate ($40,000.00)');});
 it('keeps an adverse scenario visible beside favorable scenarios rather than cherry-picking',()=>{saveScenario();const value=input();value.label='Fictional adverse resale';value.values.salePriceLow=230000;value.values.salePriceHigh=240000;saveScenario(value);const screening=reviewOpportunityScreening(actor,id).screening!;expect(screening.scenarios).toHaveLength(2);expect(screening.title).toBe('Review the modeled downside');expect(screening.scenarios.some(s=>s.risks.length>0)).toBe(true);expect(screening.nextAction).toContain('No acceptance threshold');});
 it('uses rental cash-flow cases without applying flip labels or treating unknowns as zero',()=>{const value=input();value.strategy='rental';value.values.monthlyRent=1000;value.values.vacancyPercent=5;value.values.monthlyOperatingCosts=1000;value.values.monthlyCapitalReserve=100;saveScenario(value);const screening=reviewOpportunityScreening(actor,id).screening!;expect(screening.title).toBe('Review the modeled downside');expect(screening.scenarios[0].risks.join(' ')).toContain('Annual pre-tax cash flow');const unknown=input();unknown.values.salePriceLow=null;saveScenario(unknown);const current=reviewOpportunityScreening(actor,id).screening!.scenarios.find(s=>s.label===unknown.label)!;expect(current.risks).toEqual([]);expect(current.questions.join(' ')).toContain('Resale');});
 it('withholds stale numbers after intake revision and restores only a freshly reviewed scenario',()=>{const saved=saveScenario();saveSource({...source,submission:{...source.submission,askingPrice:220000}},id,1);let review=reviewOpportunityScreening(actor,id);expect(review.screening?.title).toBe('Refresh changed scenarios');expect(review.screening?.scenarios[0]).toMatchObject({state:'source_changed',metrics:[],asOf:null});expect(review.screening?.scenarios[0].analysisAccessReference).toBeUndefined();saveScenario(input(),saved.record.id,1);review=reviewOpportunityScreening(actor,id);expect(review.screening?.title).toBe('Reconcile intake and scenario assumptions');});
 it('preserves an explicit not-pursuing decision even when a scenario is favorable',()=>{saveScenario();saveSource({...source,status:'not_pursuing',reviewNote:'Employee decision: source cannot support access.'},id,1);const review=reviewOpportunityScreening(actor,id);expect(review.screening?.title).toBe('Recorded as not pursuing');expect(review.opportunity.status).toBe('not_pursuing');expect(review.screening?.nextAction).toContain('explicit opportunity revision');});
 it('keeps scenarios employee-private even when a manager may inspect the underlying intake',()=>{const saved=saveScenario();expect(reviewOpportunityScreening(demoActor('manager'),id).screening?.scenarios).toEqual([]);expect(JSON.stringify(reviewOpportunityScreening(demoActor('manager'),id))).not.toContain(saved.record.id);saveScenario({...input(),label:'Manager private scenario'},null,0,demoActor('manager'));expect(reviewOpportunityScreening(actor,id).screening?.scenarios).toHaveLength(1);});
 it('excludes other opportunities and denies unauthorized roles and forged identities',()=>{const other=saveSource({...source,address:'642 Fictional Lane'}).opportunity.id;saveScenario({...input(),sourceId:other});expect(reviewOpportunityScreening(actor,id).screening?.scenarios).toEqual([]);expect(()=>reviewOpportunityScreening(demoActor(),id)).toThrow();expect(()=>reviewOpportunityScreening({...actor,id:'forged'},id)).toThrow();});
 it('keeps intake available under a valuation restriction without leaking private scenario details',()=>{saveScenario();const admin=demoActor('manager');saveBillingPolicy(admin,{...billingPolicy(admin),restricted:['valuation-diligence']});const review=reviewOpportunityScreening(actor,id);expect(review.screening?.title).toBe('Scenario review is unavailable');expect(review.screening?.scenarios).toEqual([]);expect(review.screening?.analysisAccessReference).toBeUndefined();});
 it('invalidates earlier no-scenario and saved-scenario conclusions when the analysis collection changes',async()=>{let tool=await dispatchTool(actor,'opportunity_review',{opportunityId:id});const emptyRefs=collectHistoryReferences(actor,tool.artifacts);expect(historyReferencesVisible(actor,emptyRefs)).toBe(true);const saved=saveScenario();expect(historyReferencesVisible(actor,emptyRefs)).toBe(false);tool=await dispatchTool(actor,'opportunity_review',{opportunityId:id});const refs=collectHistoryReferences(actor,tool.artifacts);expect(historyReferencesVisible(actor,refs)).toBe(true);saveScenario({...input(),label:'Changed scenario'},saved.record.id,1);expect(historyReferencesVisible(actor,refs)).toBe(false);});
 it('shares supported screening through Copilot and durable work and withholds obsolete work',async()=>{const saved=saveScenario();const tool=await dispatchTool(actor,'opportunity_review',{opportunityId:id});expect(tool.message).toContain('$27,000.00');const run=createWorkRun(actor,{requestId:next(),title:'Screen wholesaler submission',instructions:'Review the supplied opportunity and my saved scenarios.',steps:[{key:'review',capabilityId:'review_opportunity',input:{opportunityId:id},dependsOn:[]}]});expect(processWorkRuns(actor,5)).toBe(1);expect(getWorkRun(actor,run.id).steps[0].result?.message).toContain('$27,000.00');saveScenario({...input(),label:'Updated sources'},saved.record.id,1);expect(getWorkRun(actor,run.id).contentRestricted).toBe(true);});
 it('prioritizes a possible duplicate over favorable modeled economics',()=>{saveScenario();saveSource({...source,submission:{...source.submission,sourceReference:'Another supplied version'}});const detail=reviewOpportunityScreening(actor,id);expect(detail.questions[0].field).toBe('duplicate');expect(detail.screening?.title).toBe('Clarify the submission identity');expect(detail.screening?.decisionBasis?.join(' ')).toContain('Possible duplicate');});
 it('does not let a favorable complete scenario fill the unknown outcome of another',()=>{saveScenario();const incomplete=input();incomplete.label='Incomplete alternative';incomplete.values.salePriceLow=null;saveScenario(incomplete);const detail=reviewOpportunityScreening(actor,id);expect(detail.screening?.title).toBe('Complete the missing scenario assumptions');expect(detail.screening?.decisionBasis?.join(' ')).toContain('Incomplete alternative: the core economic outcome is unknown');});
 it('retains multiple decision-changing issues instead of hiding them behind one headline',()=>{const adverse=input();adverse.values.salePriceLow=220000;adverse.values.salePriceHigh=230000;adverse.values.purchasePrice=210000;saveScenario(adverse);const incomplete=input();incomplete.values.salePriceLow=null;saveScenario(incomplete);const detail=reviewOpportunityScreening(actor,id),basis=detail.screening!.decisionBasis!.join(' ');expect(detail.screening?.title).toBe('Review the modeled downside');expect(basis).toContain('not an agreed price');expect(basis).toContain('core economic outcome is unknown');expect(basis).toContain('Pre-tax project profit');});
 it('withholds a changed scenario even when a refreshed alternative is favorable',()=>{const first=saveScenario();saveScenario({...input(),label:'Old alternate'});saveSource({...source,reviewNote:'Updated submitted evidence'},id,1);saveScenario(input(),first.record.id,1);const detail=reviewOpportunityScreening(actor,id);expect(detail.screening?.title).toBe('Refresh changed scenarios');expect(detail.screening?.scenarios.find(s=>s.label==='Old alternate')?.metrics).toEqual([]);expect(detail.screening?.decisionBasis?.join(' ')).toContain('prior calculations are withheld');});
 it('keeps a not-pursuing record from generating outward requests and limits active follow-up to the first three gaps',()=>{const sparse={...source,county:'',propertyType:'',accessNotes:'',closingTarget:null,submission:{...source.submission,reportedOn:null,askingPrice:null,repairEstimate:null,repairScope:'',repairSource:'',comparableSources:''}};const detail=saveSource(sparse,id,1);expect(detail.questions.length).toBeGreaterThan(3);expect(detail.followupDraft.match(/•/g)).toHaveLength(3);expect(detail.followupDraft).toContain('Additional review questions');const withdrawn=saveSource({...sparse,status:'not_pursuing',reviewNote:'Employee chose not to proceed'},id,2);expect(withdrawn.followupDraft).not.toContain('•');expect(withdrawn.followupDraft).not.toContain('Please help confirm');});
 it('changes the next evidence request when an outdated submission is reconfirmed',()=>{saveSource({...source,submission:{...source.submission,reportedOn:'2025-01-01',repairScope:''}},id,1);let detail=reviewOpportunityScreening(actor,id);expect(detail.questions[0].field).toBe('sourceFreshness');saveSource({...source,submission:{...source.submission,repairScope:''}},id,2);detail=reviewOpportunityScreening(actor,id);expect(detail.questions[0].field).toBe('repairs');});

});

it('recognizes complete rental cash-flow cases instead of depending on presentation metric names',()=>{const rental=input();rental.strategy='rental';Object.assign(rental.values,{monthlyRent:3500,vacancyPercent:5,monthlyOperatingCosts:600,monthlyCapitalReserve:150});saveScenario(rental);const screening=reviewOpportunityScreening(actor,id).screening!;expect(screening.title).toBe('Review the evidence and assumptions');expect(screening.decisionBasis?.join(' ')).not.toContain('core economic outcome is unknown');});

describe('scenario-specific acquisition questions',()=>{
 it('moves from the exact missing cost to the missing range endpoint, then evidence after reviewed corrections',()=>{
  const value=input();value.label='Private rehab assumptions';value.values.purchaseCosts=null;value.values.salePriceLow=null;
  const saved=saveScenario(value);
  let review=reviewOpportunityScreening(actor,id);
  expect(review.screening!.nextAction).toContain('Private rehab assumptions: What purchase costs and fees');
  expect(review.screening!.nextAction).not.toContain('loan principal');
  value.values.purchaseCosts=0;saveScenario(value,saved.record.id,1);
  review=reviewOpportunityScreening(actor,id);
  expect(review.screening!.nextAction).toContain('resale assumption — low');
  expect(review.screening!.nextAction).toContain('$320,000.00');
  expect(review.screening!.nextAction).not.toContain('purchase costs and fees');
  value.values.salePriceLow=300000;value.sources.exit={reference:'',asOf:null};saveScenario(value,saved.record.id,2);
  review=reviewOpportunityScreening(actor,id);
  expect(review.screening!.title).toBe('Review the evidence and assumptions');
  expect(review.screening!.nextAction).toContain('original source reference and date');
  expect(review.screening!.nextAction).toContain('a missing source is not a missing amount');
  expect(review.screening!.nextAction).not.toContain('input is unknown');
  expect(review.followupDraft).not.toContain('Private rehab assumptions');
  expect(review.opportunity.submission.askingPrice).toBe(200000);
  expect(fetch).not.toHaveBeenCalled();
 });
 it('asks for the financing choice first without treating cash or interest-only debt as amortizing debt',()=>{
  const value=input();value.financing='unspecified';const saved=saveScenario(value);
  expect(reviewOpportunityScreening(actor,id).screening!.nextAction).toContain('cash, interest-only debt or amortizing debt');
  value.financing='interest_only';Object.assign(value.values,{loanAmount:150000,annualInterestPercent:8,loanPointsPercent:2});
  saveScenario(value,saved.record.id,1);
  const review=reviewOpportunityScreening(actor,id);
  expect(review.screening!.title).toBe('Review the evidence and assumptions');
  expect(review.screening!.scenarios[0].questions.join(' ')).not.toContain('What amortization period');
  expect(review.screening!.scenarios[0].questions.join(' ')).not.toContain('What initial loan principal');
 });
 it('names the affected scenario when reconciling a purchase or repair assumption',()=>{
  const value=input();value.label='Discount is hypothetical';value.values.purchasePrice=180000;
  const saved=saveScenario(value);
  expect(reviewOpportunityScreening(actor,id).screening!.nextAction).toContain('Discount is hypothetical: The submission asks $200,000.00');
  value.values.purchasePrice=200000;value.values.repairHigh=35000;
  saveScenario(value,saved.record.id,1);
  const current=reviewOpportunityScreening(actor,id).screening!;
  expect(current.nextAction).toContain('Discount is hypothetical: The supplied repair estimate');
  expect(current.nextAction).not.toContain('not an agreed price');
 });
 it('explains the adverse case using its saved numbers without turning the stress case into a forecast',()=>{
  const value=input();value.label='Conservative exit scenario';value.values.salePriceLow=230000;value.values.salePriceHigh=240000;
  const saved=saveScenario(value),before=getAnalysis(actor,saved.record.id),review=reviewOpportunityScreening(actor,id);
  expect(review.screening!.nextAction).toContain('Conservative exit scenario:');
  expect(review.screening!.nextAction).toContain('Illustrative delay: three extra months');
  expect(review.screening!.nextAction).toContain('models pre-tax project profit');
  expect(review.screening!.nextAction).toContain('rather than raising the exit value');
  expect(review.screening!.nextAction).toContain('No acceptance threshold');
  expect(getAnalysis(actor,saved.record.id)).toEqual(before);
 });
 it('makes excluded comparable evidence actionable and removes the obsolete question after reviewed correction',()=>{
  const value=input();value.comparables=[{address:'650 Fictional Lane',status:'pending',soldOn:'2026-10-20',price:310000,sqft:1400,propertyType:'Single family',distanceMiles:1,adjustment:0,adjustmentReason:'',sourceReference:'Fictional pending record',include:true,exclusionReason:''}];
  const saved=saveScenario(value);let review=reviewOpportunityScreening(actor,id);
  expect(review.screening!.nextAction).toContain('650 Fictional Lane');
  expect(review.screening!.nextAction).toContain('pending price is not a completed sale');
  value.comparables[0].status='sold';value.comparables[0].sourceReference='Employee-recorded fictional closed sale';saveScenario(value,saved.record.id,1);
  review=reviewOpportunityScreening(actor,id);
  expect(review.screening!.nextAction).not.toContain('pending price');
  expect(review.screening!.nextAction).toContain('additional dated, relevant completed sales');
  expect(review.screening!.scenarios[0].questions.join(' ')).not.toContain('For “650 Fictional Lane”');
 });
 it('asks rental evidence questions and reconfirms dated assumptions without asking for inactive flip fields',()=>{
  const value=input();value.strategy='rental';Object.assign(value.values,{monthlyRent:3500,vacancyPercent:5,monthlyOperatingCosts:600,monthlyCapitalReserve:150});value.sources.rental={reference:'Fictional spring rent sheet',asOf:'2026-01-01'};
  const saved=saveScenario(value);let screening=reviewOpportunityScreening(actor,id).screening!;
  expect(screening.nextAction).toContain('Fictional spring rent sheet');
  expect(screening.nextAction).toContain('90-day review window is provisional');
  value.sources.rental.asOf='2026-10-30';saveScenario(value,saved.record.id,1);
  screening=reviewOpportunityScreening(actor,id).screening!;
  expect(screening.nextAction).toContain('dated rental evidence');
  expect(screening.nextAction).not.toContain('additional dated, relevant completed sales');
  expect(screening.scenarios[0].questions.join(' ')).not.toContain('What resale assumption');
 });
 it('retires method-dependent history including no-scenario advice while preserving base source and saved calculations',async()=>{
  const emptyTool=await dispatchTool(actor,'opportunity_review',{opportunityId:id}),emptyRefs=collectHistoryReferences(actor,emptyTool.artifacts);
  const emptyBoard=getAnalysisBoard(actor).analysisAccessReference,sourceReference=getOpportunity(actor,id).opportunityAccessReference;
  methodState.revision='Provisional screening-question test revision';
  expect(historyReferencesVisible(actor,emptyRefs)).toBe(false);
  expect(getAnalysisBoard(actor).analysisAccessReference).not.toBe(emptyBoard);
  expect(getOpportunity(actor,id).opportunityAccessReference).toBe(sourceReference);
  const saved=saveScenario(),tool=await dispatchTool(actor,'opportunity_review',{opportunityId:id}),refs=collectHistoryReferences(actor,tool.artifacts);
  const run=createWorkRun(actor,{requestId:next(),title:'Review current screening questions',instructions:'Review my saved assumptions and the next evidence question.',steps:[{key:'review',capabilityId:'review_opportunity',input:{opportunityId:id},dependsOn:[]}]});
  expect(processWorkRuns(actor,5)).toBe(1);
  expect(getWorkRun(actor,run.id).contentRestricted).not.toBe(true);
  const before=getAnalysis(actor,saved.record.id);
  methodState.revision='Another provisional screening-question test revision';
  const after=getAnalysis(actor,saved.record.id);
  expect(historyReferencesVisible(actor,refs)).toBe(false);
  expect(getWorkRun(actor,run.id).contentRestricted).toBe(true);
  expect(after.analysisAccessReference).not.toBe(before.analysisAccessReference);
  expect(after.sourceChanged).toBe(false);
  expect(after.result).toEqual(before.result);
  expect(after.record).toEqual(before.record);
  expect(getOpportunity(actor,id).opportunityAccessReference).toBe(sourceReference);
 });
 it('does not restore private questions or old amounts after source change, lost access or a not-pursuing decision',()=>{
  const value=input();value.label='Private source question';value.values.salePriceLow=null;saveScenario(value);
  const sourceReference=getOpportunity(actor,id).opportunityAccessReference;
  expect(reviewOpportunityScreening(demoActor('manager'),id).screening!.scenarios).toEqual([]);
  expect(getOpportunity(actor,id).opportunityAccessReference).toBe(sourceReference);
  saveSource({...source,submission:{...source.submission,repairEstimate:null,repairSource:''}},id,1);
  let screening=reviewOpportunityScreening(actor,id).screening!;
  expect(screening.title).toBe('Refresh changed scenarios');
  expect(JSON.stringify(screening)).not.toContain('$320,000.00');
  expect(screening.scenarios[0].questions).toEqual(['The opportunity or calculation method changed. Review and save a current scenario before using its results.']);
  saveSource({...source,status:'not_pursuing',reviewNote:'Employee stopped pursuing this submission'},id,2);
  screening=reviewOpportunityScreening(actor,id).screening!;
  expect(screening.title).toBe('Recorded as not pursuing');
  expect(screening.nextAction).not.toContain('What resale');
  const admin=demoActor('manager');saveBillingPolicy(admin,{...billingPolicy(admin),restricted:['valuation-diligence']});
  expect(JSON.stringify(reviewOpportunityScreening(actor,id))).not.toContain('Private source question');
 });
});
