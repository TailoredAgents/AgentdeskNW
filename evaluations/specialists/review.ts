import {z} from 'zod';
import {qualityDimensions,specialistQualityCases} from './cases';
const grade=z.number().int().min(0).max(2),hash=z.string().regex(/^[a-f0-9]{64}$/);
const comparisonSchema=z.object({runId:z.string().trim().min(1),contextHash:hash,toolAccessHash:hash,modelConfigHash:hash,budgetHash:hash}).strict();
// Blinding is a procedural declaration, not independent proof. Human does not
// imply employee/domain expertise, and a model identifier may explicitly disclose uncertainty.
const reviewerProvenanceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('human'),blinded:z.boolean()}).strict(),
 z.object({kind:z.literal('model'),model:z.string().trim().min(1),blinded:z.boolean()}).strict(),
]);
export const qualityReviewSchema=z.array(z.object({caseId:z.string(),arm:z.enum(['specialist','generic']),sample:z.number().int().min(1),transport:z.enum(['model','fixture']),model:z.string().trim().min(1),harnessRevision:z.string().trim().min(1),response:z.string().trim().min(1),reviewer:z.string().trim().min(1),reviewerProvenance:reviewerProvenanceSchema.optional(),reviewedAt:z.iso.datetime(),scores:z.object({evidence:grade,judgment:grade,action:grade,clarity:grade,correction:grade}).strict(),criticalErrors:z.array(z.string().trim().min(1)),notes:z.string().trim().min(1),comparison:comparisonSchema.optional()}).strict()).superRefine((rows,ctx)=>{const seen=new Set<string>();for(const [index,row] of rows.entries()){const key=`${row.caseId}:${row.arm}:${row.sample}`;if(!specialistQualityCases.some(c=>c.id===row.caseId))ctx.addIssue({code:'custom',path:[index,'caseId'],message:'Unknown quality case.'});if(seen.has(key))ctx.addIssue({code:'custom',path:[index],message:'Duplicate case/arm/sample review.'});seen.add(key);}});
type Review=z.infer<typeof qualityReviewSchema>[number];
type Pair={specialist:Review;generic:Review};
type ReviewerProvenance=NonNullable<Review['reviewerProvenance']>|{kind:'unspecified'};
const provenance=(row:Review):ReviewerProvenance=>row.reviewerProvenance??{kind:'unspecified'};
const provenanceKey=(row:Review)=>JSON.stringify(provenance(row));
function mismatches({specialist,generic}:Pair):string[]{
 const reasons:string[]=[];
 if(specialist.model!==generic.model)reasons.push('model_mismatch');
 if(specialist.harnessRevision!==generic.harnessRevision)reasons.push('harness_revision_mismatch');
 if(!specialist.comparison||!generic.comparison)reasons.push('missing_comparison_metadata');
 else for(const key of ['runId','contextHash','toolAccessHash','modelConfigHash','budgetHash'] as const)if(specialist.comparison[key]!==generic.comparison[key])reasons.push(`${key}_mismatch`);
 if(provenanceKey(specialist)!==provenanceKey(generic))reasons.push('reviewer_provenance_mismatch');
 return reasons;
}
const score=(row:Review)=>row.criticalErrors.length?0:qualityDimensions.reduce((sum,key)=>sum+row.scores[key],0);
function coverage(cases:typeof specialistQualityCases,pairs:Pair[]){
 const ids=new Set(cases.map(item=>item.id)),matched=pairs.filter(pair=>ids.has(pair.specialist.caseId));
 const counts=new Map<string,number>();for(const pair of matched)counts.set(pair.specialist.caseId,(counts.get(pair.specialist.caseId)??0)+1);
 const groups=new Map(matched.map(pair=>[provenanceKey(pair.specialist),provenance(pair.specialist)]));
 const comparableMeans=matched.length>0&&groups.size===1;
 return {cases:cases.length,pairedCases:counts.size,pairedSamples:matched.length,repeatedCases:[...counts.values()].filter(count=>count>1).length,pendingCases:cases.filter(item=>!counts.has(item.id)).map(item=>item.id),meansReviewerProvenance:groups.size===1?[...groups.values()][0]:null,meansWithheldForMixedReviewers:groups.size>1,specialistMean:comparableMeans?matched.reduce((sum,pair)=>sum+score(pair.specialist),0)/matched.length:null,genericMean:comparableMeans?matched.reduce((sum,pair)=>sum+score(pair.generic),0)/matched.length:null};
}
function breakdown(pairs:Pair[]){
 return {...coverage(specialistQualityCases,pairs),
  roles:(['dispositions','acquisitions','manager'] as const).map(role=>({role,...coverage(specialistQualityCases.filter(item=>item.role===role),pairs)})),
  specialists:[...new Set(specialistQualityCases.map(item=>item.specialistId))].map(specialistId=>({specialistId,...coverage(specialistQualityCases.filter(item=>item.specialistId===specialistId),pairs)}))};
}
/** Supplied reviews only; reviewer declarations and comparison metadata are not independently verified. */
export function summarizeQualityReview(input:unknown){
 const source=!Array.isArray(input)&&input!==null&&typeof input==='object'&&'reviews' in input?(input as {reviews:unknown}).reviews:input;
 const rows=qualityReviewSchema.parse(source),eligible=rows.filter(row=>row.transport==='model');
 const supplied=eligible.filter(row=>row.arm==='specialist').flatMap(specialist=>{const generic=eligible.find(row=>row.caseId===specialist.caseId&&row.sample===specialist.sample&&row.arm==='generic');return generic?[{specialist,generic}]:[];});
 const pairs:Pair[]=[],excludedPairs:{caseId:string;sample:number;reasons:string[]}[]=[];
 for(const pair of supplied){const reasons=mismatches(pair);if(reasons.length)excludedPairs.push({caseId:pair.specialist.caseId,sample:pair.specialist.sample,reasons});else pairs.push(pair);}
 const suppliedKeys=new Set(supplied.map(pair=>`${pair.specialist.caseId}:${pair.specialist.sample}`));
 const reviewerGroups=[...new Map(eligible.map(row=>[provenanceKey(row),provenance(row)])).entries()].map(([key,reviewerProvenance])=>({reviewerProvenance,submittedReviews:eligible.filter(row=>provenanceKey(row)===key).length,...breakdown(pairs.filter(pair=>provenanceKey(pair.specialist)===key))}));
 return {...breakdown(pairs),suppliedPairs:supplied.length,fixtureReviewsExcluded:rows.length-eligible.length,excludedPairs,
  unpairedReviews:eligible.filter(row=>!suppliedKeys.has(`${row.caseId}:${row.sample}`)).map(row=>({caseId:row.caseId,arm:row.arm,sample:row.sample})),
  reviewerGroups,humanReviewed:breakdown(pairs.filter(pair=>provenance(pair.specialist).kind==='human')),
  criticalFailures:eligible.filter(row=>row.criticalErrors.length).map(row=>({caseId:row.caseId,arm:row.arm,sample:row.sample,reviewerProvenance:provenance(row),errors:row.criticalErrors})),
  status:pairs.length?'reviewed_samples_only':eligible.length?'awaiting_comparable_pairs':'not_run',
  notice:'Supplied rubric scores on model responses only, separated by declared reviewer kind, grading model and blinding. Omitted legacy provenance is unspecified, never human. Mixed reviewer groups have no combined means; model grading does not count as human review or practitioner acceptance. Comparable pairs require declared identical model, application revision, run, facts/request, tool access, model configuration, budget and reviewer provenance. These declarations are not independently verified reviewer or provider evidence. Fixtures and unmatched pairs do not enter means; missing cases remain pending. Repeated runs, independent human review, actual tool execution and practitioner acceptance remain separate. No expertise or superiority is certified.'};
}
