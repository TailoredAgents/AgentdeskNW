import type {RecordDetail} from './record-contracts';
import type {WorkspaceDestination} from './workspace-links';
export interface RecordSection {title:string;lines:string[];links?:{title:string;target:WorkspaceDestination}[]}
const money=(value:number)=>value>0?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value):'Not recorded';
export function recordTitle(detail:RecordDetail){return detail.kind==='investor'?detail.record.name:detail.record.address;}
export function recordSections(detail:RecordDetail):RecordSection[]{
 if(detail.kind==='property'){
  const p=detail.record;
  return [{title:'Property at a glance',lines:[`${p.city} · ${p.county}`,`Asking price: ${money(p.price)}`,`${p.beds} beds · ${p.baths} baths · ${p.sqft.toLocaleString()} sq ft`,`Strategy: ${p.strategy||'Not recorded'}`,`Renovation: ${p.rehab||'Not recorded'}`,`Saved status: ${p.status}`]}];
 }
 const i=detail.record,j=detail.journey;
 const sections:RecordSection[]=[{title:'Saved buying criteria',lines:[i.company||'No company recorded',`Areas: ${i.counties.join(', ')||'Not recorded'}`,`Budget: ${money(i.budgetMin)} – ${money(i.budgetMax)}`,`Strategy: ${i.strategy||'Not recorded'}`,`Financing: ${i.financing||'Not recorded'}`,`Renovation: ${i.rehab||'Not recorded'}`,`Timing: ${i.timeframe||'Not recorded'}`]},{title:'Contact details',lines:[`Email: ${i.email||'Not recorded'}`,`Phone: ${i.phone||'Not recorded'}`,`Last contact: ${i.lastContactAt?new Date(i.lastContactAt).toLocaleDateString('en-US'):'Not recorded'}`]}];
 if(i.notes)sections.push({title:'Saved notes',lines:[i.notes]});
 if(!j)return sections;
 sections.push({title:'Relationship context',lines:[j.summary,`Last outcome: ${j.lastOutcome||'Not recorded'}`]});
 sections.push({title:'Unresolved concerns',lines:j.openIssues.length?j.openIssues.map(item=>`${item.text}\nEmployee reported · ${new Date(item.recordedAt).toLocaleDateString('en-US')}`):['No unresolved concerns are recorded.']});
 const questions=[...j.record.conflicts,...j.record.reviewDue,...j.record.undated];
 sections.push({title:'Clarify before acting',lines:[...new Set([...questions.map(f=>f.question||`${f.label}: reconfirm the current information.`),...j.unknowns])].filter(Boolean)});
 sections.push({title:'Saved follow-ups',lines:['These tasks describe employee work; completing one does not confirm an investor response.'],links:j.commitments.map(task=>({title:task.title,target:{kind:'task',id:task.id}}))});
 sections.push({title:'Properties considered',lines:j.consideredProperties.length?[]:['No considered properties are recorded.'],links:j.consideredProperties.map(p=>({title:`${p.address} · ${p.status==='pass_reported'?'Pass reported':'Mentioned'}`,target:{kind:'property',id:p.propertyId}}))});
 sections.push({title:'Evidence and source labels',lines:j.evidence.slice(0,20).map(item=>`${item.label}\n${item.text}\n${item.source} · ${item.verification.replaceAll('_',' ')}`)});
 return sections.filter(section=>section.lines.length||section.links?.length);
}
export function recordQuestion(detail:RecordDetail):string{return detail.kind==='investor'?`Review the current relationship with ${detail.record.name} (investor ${detail.record.id}) and recommend the next useful action. Explain any missing information before preparing work.`:`Review ${detail.record.address} (property ${detail.record.id}) and help me plan the next useful action using the current saved facts.`;}
