import {analysisGroups,formatAnalysisMetric,visibleAnalysisFields,type AnalysisInput,type AnalysisResult,type AssumptionGroup} from '../lib/analysis-contracts';

// Separate presentation guidance from the saved calculator and base opportunity identity.
export const opportunityScreeningMethod='AgentDesk provisional screening questions · v1 · 2026-11-01.1';

const purposes:Record<AssumptionGroup,string>={
 purchase:'the acquisition cost cannot be interpreted without it',
 repairs:'the repair allowance must stay separate from an unsupported estimate',
 exit:'the flip outcome depends on the resale, sale costs and time assumptions',
 rental:'the rental outcome depends on rent, vacancy, operating expenses and reserves',
 finance:'the financing costs depend on the selected loan structure',
};
const sourceNames:Record<AssumptionGroup,string>={purchase:'purchase and acquisition costs',repairs:'repair scope and contingency',exit:'resale, sale costs and holding period',rental:'rent and operating costs',finance:'financing terms'};

/** Internal, employee-private questions. They never populate a wholesaler message. */
export function opportunityScenarioQuestions(input:AnalysisInput,result:AnalysisResult){
 const missing:string[]=[],evidence:string[]=[],downside:string[]=[];
 if(input.financing==='unspecified')missing.push('Is this scenario cash, interest-only debt or amortizing debt, and what source supports that choice? Financing is unknown; do not assume available cash or approved financing.');
 for(const field of visibleAnalysisFields(input).filter(field=>input.values[field.key]===null)){
  const counterpart=field.key==='repairLow'?'repairHigh':field.key==='repairHigh'?'repairLow':field.key==='salePriceLow'?'salePriceHigh':field.key==='salePriceHigh'?'salePriceLow':null;
  const recorded=counterpart&&input.values[counterpart]!==null?` The other end of this range is recorded as ${formatAnalysisMetric({label:'',value:input.values[counterpart],unit:'USD',formula:''})}; it does not fill this missing value.`:'';
  missing.push(`What ${field.label.toLowerCase()} (${field.unit}) should this scenario use, and what source/date supports it? This input is unknown; ${purposes[field.group]}.${recorded}`);
 }
 const olderThan=new Date(Date.parse(result.asOf)-90*86400000).toISOString().slice(0,10);
 for(const group of analysisGroups(input)){
  const source=input.sources[group];
  if(!source.reference||!source.asOf)evidence.push(`What original source${!source.reference?' reference':''}${!source.reference&&!source.asOf?' and':''}${!source.asOf?' date':''} supports the recorded ${sourceNames[group]} assumptions? Keep the amounts as supplied assumptions; a missing source is not a missing amount.`);
  else if(source.asOf<olderThan)evidence.push(`Are the ${sourceNames[group]} assumptions from “${source.reference}” (${source.asOf}) still current? Reconfirm the original evidence before relying on them; the 90-day review window is provisional guidance.`);
 }
 for(const comp of result.comparables.filter(comp=>comp.input.include&&!comp.included))evidence.push(`For “${comp.input.address}”, which original evidence resolves the exclusion, or should it remain excluded? ${comp.reasons.join(' ')} Do not use its price as a completed comparable without resolving the evidence.`);
 if(input.strategy==='rental'){
  const source=input.sources.rental;
  evidence.push(source.reference&&source.asOf?`Does the recorded dated rental evidence “${source.reference}” (${source.asOf}) support this scenario's scheduled rent, vacancy and operating costs? A recorded reference is unverified; candidate sold-property prices alone do not support rental income.`:'Which dated rental evidence supports the scheduled rent, vacancy and operating costs? Candidate sold-property prices alone do not support rental income.');
 }
 else if((result.comparableRange?.count??0)<3)evidence.push('Which additional dated, relevant completed sales support this resale assumption? Candidate prices and a passing data screen do not establish a subject valuation.');
 const outcomeLabel=input.strategy==='flip'?'Pre-tax project profit':'Annual pre-tax cash flow';
 const worst=result.cases.flatMap(item=>{
  const metric=item.metrics.find(value=>value.label===outcomeLabel);
  return metric?.value!==null&&metric?.value!==undefined&&metric.value<=0?[{item,metric}]:[];
 }).sort((a,b)=>a.metric.value!-b.metric.value!)[0];
 if(worst)downside.push(`“${worst.item.label}” models ${outcomeLabel.toLowerCase()} of ${formatAnalysisMetric(worst.metric)}. Which current evidence supports or challenges these assumptions: ${worst.item.assumptions} Review the supplied assumptions rather than raising the exit value or lowering costs to force a favorable result.`);
 return {missing,evidence,downside};
}
