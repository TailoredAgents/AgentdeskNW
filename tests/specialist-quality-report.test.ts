import {describe,expect,it} from 'vitest';
import {qualityReviewSchema,summarizeQualityReview} from '../evaluations/specialists/review';
import {firstPassQualityCaseIds,prepareFirstPassQualityPackets} from '../evaluations/specialists/packets';
import {specialistQualityCases} from '../evaluations/specialists/cases';
import {specialistMethods} from '../src/server/specialist-methods';

const comparison={runId:'offline-report-test',contextHash:'a'.repeat(64),toolAccessHash:'b'.repeat(64),modelConfigHash:'c'.repeat(64),budgetHash:'d'.repeat(64)};
// Deliberately synthetic reviewer rows: these exercise accounting, not model quality.
const row={caseId:'specialist-33',sample:1,transport:'model' as const,model:'offline-fixture-model',harnessRevision:'test-only',response:'Synthetic response for report tests; no model call.',reviewer:'Test fixture',reviewedAt:'2026-11-01T12:00:00Z',scores:{evidence:2,judgment:2,action:2,clarity:2,correction:2},criticalErrors:[] as string[],notes:'Synthetic reviewer data, not an actual quality assessment.',comparison};
const specialist={...row,arm:'specialist' as const},generic={...row,arm:'generic' as const};

describe('comparable evidence accounting',()=>{
 it('accepts an exported pack without trusting its supplied case definitions',()=>{
  const report=summarizeQualityReview({version:2,cases:[{id:'invented'}],reviews:[]});
  expect(report).toMatchObject({cases:35,pairedCases:0,pairedSamples:0,specialistMean:null,genericMean:null,status:'not_run'});
  expect(report.roles.map(value=>[value.role,value.cases])).toEqual([['dispositions',19],['acquisitions',10],['manager',6]]);
  expect(report.specialists).toHaveLength(16);
 });
 it('retains legacy reviews but refuses to compare undeclared conditions',()=>{
  const report=summarizeQualityReview([{...specialist,comparison:undefined},{...generic,comparison:undefined}]);
  expect(report).toMatchObject({suppliedPairs:1,pairedCases:0,specialistMean:null,genericMean:null,status:'awaiting_comparable_pairs'});
  expect(report.excludedPairs).toEqual([{caseId:row.caseId,sample:1,reasons:['missing_comparison_metadata']}]);
 });
 it.each(['model','harnessRevision'] as const)('excludes a mismatched %s from means',field=>{
  const report=summarizeQualityReview([specialist,{...generic,[field]:'different'}]);
  expect(report).toMatchObject({pairedCases:0,specialistMean:null,genericMean:null});
  expect(report.excludedPairs[0].reasons).toContain(field==='model'?'model_mismatch':'harness_revision_mismatch');
 });
 it.each(['runId','contextHash','toolAccessHash','modelConfigHash','budgetHash'] as const)('excludes unequal %s declarations',field=>{
  const report=summarizeQualityReview([specialist,{...generic,comparison:{...comparison,[field]:field==='runId'?'another-run':'e'.repeat(64)}}]);
  expect(report).toMatchObject({pairedCases:0,specialistMean:null,genericMean:null});
  expect(report.excludedPairs[0].reasons).toContain(`${field}_mismatch`);
 });
 it('reports actual paired coverage separately from repeated samples and orphaned responses',()=>{
  const report=summarizeQualityReview([specialist,generic,{...specialist,sample:2,comparison:{...comparison,runId:'repeat'}},{...generic,sample:2,comparison:{...comparison,runId:'repeat'}},{...specialist,caseId:'specialist-34'}]);
  expect(report).toMatchObject({pairedCases:1,pairedSamples:2,repeatedCases:1,specialistMean:10,genericMean:10});
  expect(report.pendingCases).toHaveLength(34);
  expect(report.roles.find(value=>value.role==='dispositions')).toMatchObject({pairedCases:1,pairedSamples:2,repeatedCases:1});
  expect(report.roles.find(value=>value.role==='acquisitions')).toMatchObject({pairedCases:0,specialistMean:null});
  expect(report.specialists.find(value=>value.specialistId==='investor-relationship')).toMatchObject({cases:3,pairedCases:1});
  expect(report.unpairedReviews).toEqual([{caseId:'specialist-34',arm:'specialist',sample:1}]);
 });
 it('does not hide critical errors in excluded or unpaired model responses',()=>{
  const report=summarizeQualityReview([{...specialist,criticalErrors:['Invented delivery']},{...generic,model:'different'},{...specialist,caseId:'specialist-34',criticalErrors:['Invented income']}]);
  expect(report.criticalFailures).toHaveLength(2);
  expect(report).toMatchObject({pairedCases:0,specialistMean:null});
 });
 it('fails a critical response and excludes fixture rows even with matching metadata',()=>{
  const report=summarizeQualityReview([{...specialist,criticalErrors:['Invented delivery']},generic,{...specialist,caseId:'specialist-34',transport:'fixture'},{...generic,caseId:'specialist-34',transport:'fixture'}]);
  expect(report).toMatchObject({fixtureReviewsExcluded:2,pairedCases:1,pairedSamples:1,specialistMean:0,genericMean:10});
 });
 it('rejects unknown cases, duplicate identities and incomplete evidence rather than giving scores',()=>{
  expect(()=>summarizeQualityReview([{...specialist,caseId:'invented'}])).toThrow('Unknown');
  expect(()=>summarizeQualityReview([specialist,specialist])).toThrow('Duplicate');
  expect(qualityReviewSchema.safeParse([{...specialist,response:' '}]).success).toBe(false);
  expect(qualityReviewSchema.safeParse([{...specialist,comparison:{...comparison,budgetHash:'not-a-hash'}}]).success).toBe(false);
  expect(()=>summarizeQualityReview({reviews:null})).toThrow();
 });
});

describe('reviewer provenance',()=>{
 const modelReviewer={kind:'model' as const,model:'Codex reviewer (session model not independently recorded)',blinded:true};
 const humanReviewer={kind:'human' as const,blinded:true};
 it('retains legacy reviews as unspecified rather than inferring a human from the reviewer name',()=>{
  const report=summarizeQualityReview([specialist,generic]);
  expect(report).toMatchObject({pairedCases:1,meansReviewerProvenance:{kind:'unspecified'},specialistMean:10});
  expect(report.reviewerGroups).toHaveLength(1);
  expect(report.reviewerGroups[0]).toMatchObject({reviewerProvenance:{kind:'unspecified'},submittedReviews:2,pairedCases:1});
  expect(report.humanReviewed).toMatchObject({pairedCases:0,pairedSamples:0,specialistMean:null,genericMean:null});
  expect(report.humanReviewed.pendingCases).toHaveLength(35);
 });
 it('keeps model-graded actual outputs separate from human coverage and declared expertise',()=>{
  const report=summarizeQualityReview([{...specialist,reviewerProvenance:modelReviewer},{...generic,reviewerProvenance:modelReviewer}]);
  expect(report).toMatchObject({pairedCases:1,meansReviewerProvenance:modelReviewer,specialistMean:10});
  expect(report.reviewerGroups[0]).toMatchObject({reviewerProvenance:modelReviewer,pairedCases:1,pairedSamples:1,specialistMean:10});
  expect(report.reviewerGroups[0].roles.find(value=>value.role==='dispositions')).toMatchObject({pairedCases:1});
  expect(report.reviewerGroups[0].specialists.find(value=>value.specialistId==='investor-relationship')).toMatchObject({pairedCases:1});
  expect(report.humanReviewed).toMatchObject({pairedCases:0,specialistMean:null});
  expect(report.notice).toContain('not independently verified');
  expect(report.notice).toContain('model grading does not count as human review or practitioner acceptance');
 });
 it('withholds combined means across human, model and unspecified grading without losing their coverage',()=>{
  const report=summarizeQualityReview([
   {...specialist,reviewerProvenance:modelReviewer},{...generic,reviewerProvenance:modelReviewer},
   {...specialist,caseId:'specialist-34',reviewerProvenance:humanReviewer},{...generic,caseId:'specialist-34',reviewerProvenance:humanReviewer},
   {...specialist,caseId:'specialist-35'},{...generic,caseId:'specialist-35'},
  ]);
  expect(report).toMatchObject({pairedCases:3,pairedSamples:3,specialistMean:null,genericMean:null,meansReviewerProvenance:null,meansWithheldForMixedReviewers:true});
  expect(report.reviewerGroups.map(value=>[value.reviewerProvenance.kind,value.pairedCases,value.specialistMean])).toEqual([['model',1,10],['human',1,10],['unspecified',1,10]]);
  expect(report.humanReviewed).toMatchObject({pairedCases:1,pairedSamples:1,specialistMean:10,genericMean:10,meansReviewerProvenance:humanReviewer});
  expect(report.humanReviewed.roles.find(value=>value.role==='acquisitions')).toMatchObject({pairedCases:1});
  expect(report.humanReviewed.roles.find(value=>value.role==='dispositions')).toMatchObject({pairedCases:0});
  expect(report).not.toHaveProperty('practitionerAccepted');
 });
 it.each([
  {kind:'human',blinded:true},
  {kind:'model',model:'Another grading model',blinded:true},
  {kind:'model',model:modelReviewer.model,blinded:false},
  undefined,
 ])('excludes unequal reviewer provenance within a paired comparison: %j',other=>{
  const report=summarizeQualityReview([{...specialist,reviewerProvenance:modelReviewer},{...generic,reviewerProvenance:other}]);
  expect(report).toMatchObject({pairedCases:0,specialistMean:null,genericMean:null});
  expect(report.excludedPairs[0].reasons).toContain('reviewer_provenance_mismatch');
  expect(report.humanReviewed.pairedCases).toBe(0);
 });
 it('does not merge different grading models or blinding declarations into aggregate means',()=>{
  const otherReviewer={...modelReviewer,model:'Another grading model'};
  const report=summarizeQualityReview([
   {...specialist,reviewerProvenance:modelReviewer},{...generic,reviewerProvenance:modelReviewer},
   {...specialist,sample:2,reviewerProvenance:otherReviewer},{...generic,sample:2,reviewerProvenance:otherReviewer},
  ]);
  expect(report).toMatchObject({pairedCases:1,pairedSamples:2,repeatedCases:1,specialistMean:null,meansWithheldForMixedReviewers:true});
  expect(report.reviewerGroups).toHaveLength(2);
  expect(report.roles.find(value=>value.role==='dispositions')).toMatchObject({specialistMean:null,meansWithheldForMixedReviewers:true});
  expect(report.specialists.find(value=>value.specialistId==='investor-relationship')).toMatchObject({specialistMean:null,meansWithheldForMixedReviewers:true});
 });
 it('never promotes synthetic response fixtures to human evidence',()=>{
  const report=summarizeQualityReview([{...specialist,transport:'fixture',reviewerProvenance:humanReviewer},{...generic,transport:'fixture',reviewerProvenance:humanReviewer}]);
  expect(report).toMatchObject({fixtureReviewsExcluded:2,pairedCases:0,status:'not_run'});
  expect(report.reviewerGroups).toEqual([]);
  expect(report.humanReviewed).toMatchObject({pairedCases:0,specialistMean:null});
 });
 it.each([
  {kind:'model',blinded:true},
  {kind:'model',model:' ',blinded:true},
  {kind:'model',model:'grader'},
  {kind:'human',blinded:true,model:'grader'},
  {kind:'human',blinded:true,practitioner:true},
  {kind:'employee_expert',blinded:true},
 ])('requires explicit valid provenance without unsupported authority fields: %j',reviewerProvenance=>{
  expect(qualityReviewSchema.safeParse([{...specialist,reviewerProvenance}]).success).toBe(false);
 });
});

describe('unrun three-role correction packets',()=>{
 it('reserves three new authored two-turn cases from runtime examples, preserving the original 32',()=>{
  expect(specialistQualityCases).toHaveLength(35);
  expect(new Set(specialistQualityCases.map(value=>value.id)).size).toBe(35);
  expect(specialistQualityCases.slice(0,32).every(value=>!value.followUp)).toBe(true);
  expect(firstPassQualityCaseIds).toEqual(['specialist-33','specialist-34','specialist-35']);
  const selected=specialistQualityCases.filter(value=>firstPassQualityCaseIds.some(id=>id===value.id));
  expect(selected.map(value=>value.role)).toEqual(['dispositions','acquisitions','manager']);
  for(const item of selected){
   expect(item.followUp?.expected.length).toBeGreaterThanOrEqual(2);
   expect(item.followUp?.criticalErrors.length).toBeGreaterThan(0);
   expect(specialistMethods.some(method=>method.example.situation===item.context||method.example.situation===item.followUp?.context)).toBe(false);
  }
 });
 it('keeps reviewer answers, errors and runtime examples out of all model payloads',()=>{
  const prepared=prepareFirstPassQualityPackets({runId:'offline-packet-test'});
  const serialized=JSON.stringify(prepared.modelPackets);
  expect(prepared.modelPackets).toMatchObject({status:'not_run',scope:'advisory_only'});
  expect(prepared.modelPackets.packets).toHaveLength(6);
  expect(prepared.modelPackets.execution).toContain('one turn at a time');
  for(const item of specialistQualityCases.filter(value=>firstPassQualityCaseIds.some(id=>id===value.id))){
   const method=specialistMethods.find(value=>value.specialistId===item.specialistId)!;
   expect(serialized).not.toContain(method.example.situation);
   expect(serialized).not.toContain(method.example.response);
   for(const turn of [item,item.followUp!])for(const answer of [...turn.expected,...turn.criticalErrors])expect(serialized).not.toContain(answer);
  }
  for(const packet of prepared.modelPackets.packets){
   expect(Object.keys(packet.payload).sort()).toEqual(['instructions','role','turns']);
   expect(packet.payload.turns).toHaveLength(2);
   for(const turn of packet.payload.turns)expect(Object.keys(turn).sort()).toEqual(['context','request']);
   expect(packet).not.toHaveProperty('arm');
  }
 });
 it('changes only method instructions between labels and keeps the arm key separate from blind grading',()=>{
  const prepared=prepareFirstPassQualityPackets({sample:2,runId:'offline-packet-test'});
  expect(prepared.blindReview.status).toBe('not_run');
  expect(prepared.blindReview.reviews).toHaveLength(6);
  for(const caseId of firstPassQualityCaseIds){
   const packets=prepared.modelPackets.packets.filter(value=>value.caseId===caseId),key=prepared.armKey.assignments.filter(value=>value.caseId===caseId);
   expect(packets.map(value=>value.label)).toEqual(['A','B']);
   expect(new Set(key.map(value=>value.arm))).toEqual(new Set(['generic','specialist']));
   expect(packets[0].payload.turns).toEqual(packets[1].payload.turns);
   expect(packets[0].payload.role).toBe(packets[1].payload.role);
   expect(packets[0].plannedComparison).toEqual(packets[1].plannedComparison);
   expect(packets[0].payload.instructions).not.toBe(packets[1].payload.instructions);
   const genericPacket=packets.find(value=>key.find(assignment=>assignment.label===value.label)?.arm==='generic')!;
   expect(genericPacket.payload.instructions).not.toContain('working method');
   for(const review of prepared.blindReview.reviews.filter(value=>value.caseId===caseId)){
    expect(review).not.toHaveProperty('arm');expect(review).not.toHaveProperty('instructions');
    expect(review).toMatchObject({sample:2,response:null,reviewer:null,reviewedAt:null});
    expect(review.turns).toHaveLength(2);expect(Object.values(review.scores)).toEqual([null,null,null,null,null]);
   }
  }
  // A blank reviewer template is never silently counted as model evidence.
  expect(()=>summarizeQualityReview(prepared.blindReview)).toThrow();
 });
 it.each([{sample:0},{sample:1.5},{sample:Number.MAX_SAFE_INTEGER+1},{runId:' '}])('rejects unusable packet identities: %j',options=>{
  expect(()=>prepareFirstPassQualityPackets(options)).toThrow('positive sample');
 });
});
