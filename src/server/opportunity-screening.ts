import type {Actor} from '../lib/contracts';
import type {OpportunityDetail,OpportunityScreening} from '../lib/opportunity-contracts';
import {formatAnalysisMetric} from '../lib/analysis-contracts';
import {featureAccess} from './billing';
import {getOpportunity} from './opportunities';
import {getAnalysisBoard,getAnalysis} from './deal-analysis';

const dollars=(value:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
const notice='Decision preparation from supplied intake and your private reviewed scenarios. No valuation, offer, verified funding, title clearance, inventory promotion or handoff is established. Positive modeled results do not mean the company should accept the deal.';

/** Presentation layer only: base opportunity fingerprints never depend on their derived analyses. */
export function reviewOpportunityScreening(actor:Actor,id:string):OpportunityDetail {
 const detail=getOpportunity(actor,id),item=detail.opportunity;
 const screening:OpportunityScreening={title:'Prepare a supported scenario',nextAction:'Open Deal analysis and select this opportunity. Record explicit purchase, repair, exit/rent and financing assumptions with their sources before screening economics.',notice,scenarios:[]};
 if(featureAccess(actor,'core').allowed&&featureAccess(actor,'valuation-diligence').allowed){
  const board=getAnalysisBoard(actor);
  // The private board reference also invalidates an earlier “no scenarios” result after a scenario is added.
  screening.analysisAccessReference=board.analysisAccessReference;
  for(const entry of board.items.filter(value=>value.lens==='diligence')){
   const analysis=getAnalysis(actor,entry.id);
   if(analysis.record.input.sourceKind!=='opportunity'||analysis.record.input.sourceId!==id)continue;
   const {input}=analysis.record,result=analysis.result;
   if(!result){screening.scenarios.push({analysisId:entry.id,label:entry.label,version:entry.version,state:'source_changed',asOf:null,metrics:[],differences:[],risks:[],questions:['The opportunity or calculation method changed. Review and save a current scenario before using its results.']});continue;}
   const differences:string[]=[],risks:string[]=[];
   if(item.submission.askingPrice!==null&&input.values.purchasePrice!==null&&item.submission.askingPrice!==input.values.purchasePrice)
    differences.push(`The submission asks ${dollars(item.submission.askingPrice)}; this scenario assumes ${dollars(input.values.purchasePrice)}. Confirm the intended purchase assumption; a lower modeled price is not an agreed price.`);
   const repairs=item.submission.repairEstimate;
   if(repairs!==null&&(input.values.repairLow!==null&&repairs<input.values.repairLow||input.values.repairHigh!==null&&repairs>input.values.repairHigh))
    differences.push(`The supplied repair estimate (${dollars(repairs)}) is outside this scenario's repair range. Reconcile the scope and source before relying on the modeled outcome.`);
   for(const scenario of result.cases){
    const outcome=scenario.metrics.find(metric=>metric.label===(input.strategy==='flip'?'Pre-tax project profit':'Annual pre-tax cash flow'));
    if(outcome?.value!==null&&outcome?.value!==undefined&&outcome.value<=0)risks.push(`${scenario.label}: ${outcome.label} ${formatAnalysisMetric(outcome)}. ${scenario.assumptions}`);
   }
   screening.scenarios.push({analysisId:entry.id,label:entry.label,version:entry.version,state:'current',analysisAccessReference:analysis.analysisAccessReference,asOf:result.asOf,
    metrics:result.metrics,differences,risks,questions:[...new Set([...result.missing,...result.questions,...result.warnings])]});
  }
 }else{
  screening.title='Scenario review is unavailable';screening.nextAction='Intake remains visible. Current access to Valuation & Due Diligence is needed to combine it with your private scenarios.';
 }
 const current=screening.scenarios.filter(s=>s.state==='current'),stale=screening.scenarios.some(s=>s.state==='source_changed');
 if(item.status==='not_pursuing'){
  screening.title='Recorded as not pursuing';screening.nextAction='Respect the employee review decision. Reopening requires an explicit opportunity revision; a scenario does not change that decision.';
 }else if(current.some(s=>s.risks.length)){
  screening.title='Review the modeled downside';screening.nextAction='At least one supplied scenario reaches zero or a loss. Review the adverse assumptions and evidence before recommending further acquisition work. No acceptance threshold has been supplied by the company.';
 }else if(current.some(s=>s.differences.length)){
  screening.title='Reconcile intake and scenario assumptions';screening.nextAction=current.flatMap(s=>s.differences)[0];
 }else if(stale){
  screening.title='Refresh changed scenarios';screening.nextAction='Review changed opportunity facts in Deal analysis and save a fresh scenario. Earlier computed results are withheld; other scenarios are not silently selected as replacements.';
 }else if(screening.analysisAccessReference&&detail.questions.length){
  screening.title='Resolve the decision-changing gaps';screening.nextAction=detail.questions[0].question+' '+detail.questions[0].reason;
 }else if(current.length){
  screening.title='Review the evidence and assumptions';screening.nextAction=current.some(s=>s.questions.length)?'The saved arithmetic is available, but supporting evidence or assumptions still need review. Work through each scenario’s questions before preparing a handoff.':'Review these explicit scenarios with the acquisition team. Recorded inputs and positive results do not independently establish value or approval.';
 }
 return {...detail,screening};
}

export function opportunityScreeningMessage(detail:OpportunityDetail):string {
 const screening=detail.screening;
 return [`${detail.opportunity.address} · version ${detail.opportunity.version}`,detail.summary,
  ...(screening?[screening.title,screening.nextAction,...screening.scenarios.map(s=>`${s.label} · version ${s.version} · ${s.asOf??'Needs fresh review'}\n${s.metrics.map(m=>m.label+': '+formatAnalysisMetric(m)).join('\n')}\n${[...s.differences,...s.risks,...s.questions].join('\n')}`),screening.notice]:[]),detail.followupDraft,detail.notice].join('\n\n');
}
