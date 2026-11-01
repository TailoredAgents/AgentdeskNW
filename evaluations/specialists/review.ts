import {z} from 'zod';
import {qualityDimensions,specialistQualityCases} from './cases';
const grade=z.number().int().min(0).max(2),hash=z.string().regex(/^[a-f0-9]{64}$/);
const comparisonSchema=z.object({runId:z.string().trim().min(1),contextHash:hash,toolAccessHash:hash,modelConfigHash:hash,budgetHash:hash}).strict();
export const qualityReviewSchema=z.array(z.object({caseId:z.string(),arm:z.enum(['specialist','generic']),sample:z.number().int().min(1),transport:z.enum(['model','fixture']),model:z.string().trim().min(1),harnessRevision:z.string().trim().min(1),response:z.string().trim().min(1),reviewer:z.string().trim().min(1),reviewedAt:z.iso.datetime(),scores:z.object({evidence:grade,judgment:grade,action:grade,clarity:grade,correction:grade}).strict(),criticalErrors:z.array(z.string().trim().min(1)),notes:z.string().trim().min(1),comparison:comparisonSchema.optional()}).strict()).superRefine((rows,ctx)=>{const seen=new Set<string>();for(const [index,row] of rows.entries()){const key=`${row.caseId}:${row.arm}:${row.sample}`;if(!specialistQualityCases.some(c=>c.id===row.caseId))ctx.addIssue({code:'custom',path:[index,'caseId'],message:'Unknown quality case.'});if(seen.has(key))ctx.addIssue({code:'custom',path:[index],message:'Duplicate case/arm/sample review.'});seen.add(key);}});
type Review=z.infer<typeof qualityReviewSchema>[number];
type Pair={specialist:Review;generic:Review};
function mismatches({specialist,generic}:Pair):string[]{
 const reasons:string[]=[];
 if(specialist.model!==generic.model)reasons.push('model_mismatch');
 if(specialist.harnessRevision!==generic.harnessRevision)reasons.push('harness_revision_mismatch');
 if(!specialist.comparison||!generic.comparison)reasons.push('missing_comparison_metadata');
 else for(const key of ['runId','contextHash','toolAccessHash','modelConfigHash','budgetHash'] as const)if(specialist.comparison[key]!==generic.comparison[key])reasons.push(`${key}_mismatch`);
 return reasons;
}
const score=(row:Review)=>row.criticalErrors.length?0:qualityDimensions.reduce((sum,key)=>sum+row.scores[key],0);
function coverage(cases:typeof specialistQualityCases,pairs:Pair[]){
 const ids=new Set(cases.map(item=>item.id)),matched=pairs.filter(pair=>ids.has(pair.specialist.caseId));
 const counts=new Map<string,number>();for(const pair of matched)counts.set(pair.specialist.caseId,(counts.get(pair.specialist.caseId)??0)+1);
 return {cases:cases.length,pairedCases:counts.size,pairedSamples:matched.length,repeatedCases:[...counts.values()].filter(count=>count>1).length,pendingCases:cases.filter(item=>!counts.has(item.id)).map(item=>item.id),specialistMean:matched.length?matched.reduce((sum,pair)=>sum+score(pair.specialist),0)/matched.length:null,genericMean:matched.length?matched.reduce((sum,pair)=>sum+score(pair.generic),0)/matched.length:null};
}
/** Human-supplied evidence only; matching declarations are not provider receipts. */
export function summarizeQualityReview(input:unknown){
 const source=!Array.isArray(input)&&input!==null&&typeof input==='object'&&'reviews' in input?(input as {reviews:unknown}).reviews:input;
 const rows=qualityReviewSchema.parse(source),eligible=rows.filter(row=>row.transport==='model');
 const supplied=eligible.filter(row=>row.arm==='specialist').flatMap(specialist=>{const generic=eligible.find(row=>row.caseId===specialist.caseId&&row.sample===specialist.sample&&row.arm==='generic');return generic?[{specialist,generic}]:[];});
 const pairs:Pair[]=[],excludedPairs:{caseId:string;sample:number;reasons:string[]}[]=[];
 for(const pair of supplied){const reasons=mismatches(pair);if(reasons.length)excludedPairs.push({caseId:pair.specialist.caseId,sample:pair.specialist.sample,reasons});else pairs.push(pair);}
 const suppliedKeys=new Set(supplied.map(pair=>`${pair.specialist.caseId}:${pair.specialist.sample}`));
 return {...coverage(specialistQualityCases,pairs),suppliedPairs:supplied.length,fixtureReviewsExcluded:rows.length-eligible.length,excludedPairs,
  unpairedReviews:eligible.filter(row=>!suppliedKeys.has(`${row.caseId}:${row.sample}`)).map(row=>({caseId:row.caseId,arm:row.arm,sample:row.sample})),
  roles:(['dispositions','acquisitions','manager'] as const).map(role=>({role,...coverage(specialistQualityCases.filter(item=>item.role===role),pairs)})),
  specialists:[...new Set(specialistQualityCases.map(item=>item.specialistId))].map(specialistId=>({specialistId,...coverage(specialistQualityCases.filter(item=>item.specialistId===specialistId),pairs)})),
  criticalFailures:eligible.filter(row=>row.criticalErrors.length).map(row=>({caseId:row.caseId,arm:row.arm,sample:row.sample,errors:row.criticalErrors})),
  status:pairs.length?'reviewed_samples_only':eligible.length?'awaiting_comparable_pairs':'not_run',
  notice:'Human rubric scores on supplied model responses only. Comparable pairs require declared identical model, application revision, run, facts/request, tool access, model configuration and budget. This metadata is not independently verified provider evidence. Fixtures and unmatched pairs do not enter means; missing cases remain pending. Repeated runs, blinded independent reviewers, actual tool execution and practitioner acceptance remain separate. No expertise or superiority is certified.'};
}
