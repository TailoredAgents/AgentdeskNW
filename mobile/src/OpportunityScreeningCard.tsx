import {useState} from 'react';
import {Text,View} from 'react-native';
import type {OpportunityScreening} from '../../src/lib/opportunity-contracts';
import {formatAnalysisMetric} from '../../src/lib/analysis-contracts';
import {Button} from './Button';
import {styles as s} from './styles';

export function OpportunityScreeningCard({screening,onOpenAnalysis}:{screening:OpportunityScreening;onOpenAnalysis?:(id:string)=>void}){
 const [expanded,setExpanded]=useState<string|null>(null);
 return <View style={s.card}><Text style={s.status}>Acquisitions screening</Text><Text style={s.cardTitle}>{screening.title}</Text><Text style={s.copy}>{screening.nextAction}</Text>
  {screening.scenarios.length===0&&<Text style={s.help}>No available linked diligence scenarios are shown. Open Deal analysis and select this opportunity as the source.</Text>}
  {screening.scenarios.map(scenario=><View key={scenario.analysisId} style={s.result}>
   <Button secondary label={`${scenario.label} · v${scenario.version} · ${scenario.state==='current'?'Review assumptions':'Source changed'}`} onPress={()=>setExpanded(expanded===scenario.analysisId?null:scenario.analysisId)}/>
   {expanded===scenario.analysisId&&<>{onOpenAnalysis&&<Button secondary label="Open scenario and sources" onPress={()=>onOpenAnalysis(scenario.analysisId)}/>}<Text style={s.help}>{scenario.asOf?`Calculated ${scenario.asOf}. Supplied assumptions, not verified value.`:'Earlier calculations are withheld until the changed source is reviewed.'}</Text>
    {scenario.metrics.map(metric=><Text key={metric.label} style={s.copy}>{metric.label}: {formatAnalysisMetric(metric)}</Text>)}
    {scenario.differences.map(text=><Text key={text} style={s.copy}>Reconcile: {text}</Text>)}
    {scenario.risks.map(text=><Text key={text} style={s.copy}>Modeled downside: {text}</Text>)}
    {scenario.questions.length>0&&<Text style={s.cardTitle}>Evidence and assumptions to review</Text>}
    {scenario.questions.map(text=><Text key={text} style={s.help}>• {text}</Text>)}
   </>}
  </View>)}<Text style={s.help}>{screening.notice}</Text>
 </View>;
}
