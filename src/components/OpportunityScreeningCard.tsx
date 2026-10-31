import type {OpportunityScreening} from '../lib/opportunity-contracts';
import {formatAnalysisMetric} from '../lib/analysis-contracts';

export function OpportunityScreeningCard({screening,onOpenAnalysis}:{screening:OpportunityScreening;onOpenAnalysis?:(id:string)=>void}){
 return <section aria-label="Opportunity screening" className="opportunity-screening">
  <p className="eyebrow">Acquisitions screening</p>
  <h3>{screening.title}</h3><p>{screening.nextAction}</p>
  {screening.scenarios.length===0&&<p className="subtle-note">No available linked diligence scenarios are shown. Create or review a scenario in Deal analysis using this opportunity as its source.</p>}
  {screening.scenarios.map(scenario=><details key={scenario.analysisId}>
   <summary>{scenario.label} · version {scenario.version} · {scenario.state==='current'?'Review assumptions':'Source changed'}</summary>
   {onOpenAnalysis&&<button className="button secondary" onClick={()=>onOpenAnalysis(scenario.analysisId)}>Open scenario and sources</button>}
   <p className="subtle-note">{scenario.asOf?`Calculated ${scenario.asOf}. Supplied assumptions, not verified value.`:'Earlier calculations are withheld until the changed source is reviewed.'}</p>
   <dl className="summary-grid">{scenario.metrics.map(metric=><div key={metric.label}><dt>{metric.label}</dt><dd>{formatAnalysisMetric(metric)}</dd></div>)}</dl>
   {scenario.differences.map(text=><p key={text}><strong>Reconcile:</strong> {text}</p>)}
   {scenario.risks.map(text=><p key={text}><strong>Modeled downside:</strong> {text}</p>)}
   {scenario.questions.length>0&&<><h4>Evidence and assumptions to review</h4><ul>{scenario.questions.map(text=><li key={text}>{text}</li>)}</ul></>}
  </details>)}
  <p className="subtle-note">{screening.notice}</p>
 </section>;
}
