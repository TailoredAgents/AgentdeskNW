import {transcriptStatements} from './notes';
import {createHash} from 'node:crypto';
import type {Actor,Investor,Property} from '../lib/contracts';
import type {BuyerMatch} from '../lib/intelligence-contracts';
import {AppError,requireRole} from './db';
import {requireFeature} from './billing';
import {readInvestor,readProperty} from './access';
import {compareProperty,getInvestorIntelligence} from './intelligence';
import {getInvestorJourney} from './journey';
import {listReleases} from './workflows';
import {buyerGeographyMethod,reviewBuyerGeography} from './buyer-geography';

export interface BuyerShortlistEntry extends BuyerMatch {
 investor:Investor;
 readiness:'review_candidate'|'follow_through'|'clarify'|'sharing_required'|'not_fit'|'paused';
 nextAction:{title:string;question:string;sourceIds:string[]};
 cautions:string[];
 funding:string[];
 timing:string[];
 evidence:Array<{id:string;label:string;text:string;verification:string;propertyId?:string|null}>;
}
export interface BuyerShortlist {
 property:Property;
 releaseId:string|null;
 releaseVersion:number|null;
 releaseStatus:string;
 matches:BuyerShortlistEntry[];
 buyerShortlistReference:string;
 notice:string;
}
const rank:Record<BuyerShortlistEntry['readiness'],number>={review_candidate:0,follow_through:1,clarify:2,sharing_required:3,not_fit:4,paused:5};
const notice='Existing permitted CRM buyers only. Fit scores describe recorded criteria, not interest or purchase probability. Employee reports and recorded funding are not verified funds. No outreach or fresh research has started.';

/** Relationship context is part of matching, not a second specialist purchase or sending permission. */
function evaluate(actor:Actor,propertyId:string):Omit<BuyerShortlist,'buyerShortlistReference'> {
 requireRole(actor,['dispositions','manager']);requireFeature(actor,'buyer-matchmaker');
 const inventory=readProperty(actor,propertyId),release=listReleases(actor).find(r=>r.propertyId===propertyId);
 const property=inventory;
 const matches=compareProperty(actor,propertyId).map((match):BuyerShortlistEntry=>{
  const investor=readInvestor(actor,match.investorId),journey=getInvestorJourney(actor,investor.id);
  const selectedBox=journey.buyBoxes.find(box=>box.id===match.buyBoxId);
  const geography=selectedBox?reviewBuyerGeography(selectedBox,property):null;
  const facts=journey.record.facts.filter(f=>f.buyBoxId===null||f.buyBoxId===match.buyBoxId);
  const conflicts=facts.filter(f=>f.status==='needs_clarification');
  const concern=journey.openIssues.find(o=>o.kind==='property_pass'&&o.propertyId===propertyId)
   ??journey.openIssues.find(o=>o.kind==='objection');
  const task=journey.commitments[0];
  const conditional=facts.filter(f=>['financing','timing','budget'].includes(f.topic)).flatMap(f=>[...(f.recorded?[f.recorded]:[]),...f.reports].map(source=>({fact:f,source}))).find(({source})=>transcriptStatements(source.statement+' '+source.displayValue).some(s=>['conditional','uncertain'].includes(s.meaning)));
  const cautions=[...match.conflicts,...match.missing.map(value=>'Missing: '+value)];
  const evidence:BuyerShortlistEntry['evidence']=[];
  if(selectedBox?.excludedAreas.length)evidence.push({id:selectedBox.id,label:selectedBox.label+' · Recorded geography exclusions',text:'Excluded areas: '+selectedBox.excludedAreas.join('; '),verification:(selectedBox.fieldProvenance?.excludedAreas??selectedBox.provenance).verification});
  if(selectedBox?.geographicFlexibility)evidence.push({id:selectedBox.id,label:selectedBox.label+' · Recorded geography flexibility',text:'Geographic flexibility is recorded; individual location acceptance is unconfirmed.',verification:(selectedBox.fieldProvenance?.geographicFlexibility??selectedBox.provenance).verification});
  for(const fact of facts)for(const source of [...(fact.recorded?[fact.recorded]:[]),...fact.reports]){
   evidence.push({id:source.id,label:fact.scopeLabel+' · '+fact.label,text:source.displayValue,verification:source.verification});
   if(source.freshness==='review_due')cautions.push(fact.label+' needs reconfirmation under the provisional freshness policy.');
  }
  if(journey.activity==='paused')cautions.push('A buying pause is recorded; do not restart property marketing based on this match.');
  if(concern){evidence.push({id:concern.id,label:'Unresolved employee-reported '+concern.kind.replaceAll('_',' '),text:concern.text,verification:concern.verification,propertyId:concern.propertyId});cautions.push('An unresolved reported concern needs review; a matching buy box does not resolve it.');}
  if(task)evidence.push({id:task.id,label:'Your open follow-up',text:task.title,verification:'reviewed_record'});
  if(!match.disclosureReady)cautions.push('Current disclosure requirements are not satisfied.');
  if(release?.status!=='released')cautions.push('No current authorized release is available for property distribution.');
  const fundingFact=facts.find(f=>f.topic==='financing'),timingFact=facts.find(f=>f.topic==='timing');
  const funding=fundingFact?[...(fundingFact.recorded?[fundingFact.recorded.displayValue]:[]),...fundingFact.reports.map(s=>s.displayValue)]:[];
  const timing=timingFact?[...(timingFact.recorded?[timingFact.recorded.displayValue]:[]),...timingFact.reports.map(s=>s.displayValue)]:[];
  let readiness:BuyerShortlistEntry['readiness']='review_candidate';
  let nextAction:BuyerShortlistEntry['nextAction']={title:'Review this candidate',question:'Confirm current interest, available funding and timing before preparing a reviewed property package.',sourceIds:match.buyBoxId?[match.buyBoxId]:[]};
  if(journey.activity==='paused'){
   readiness='paused';nextAction={title:'Honor the buying pause',question:'Review the recorded pause and any agreed check-in before contacting this investor about more properties.',sourceIds:['crm:'+investor.id]};
  }else if(!match.buyBoxId||match.conflicts.length){
   readiness='not_fit';nextAction={title:'Do not pitch this as a criteria match',question:match.conflicts.join(' ')||'Confirm an active, reviewed buy box before selecting this property.',sourceIds:match.buyBoxId?[match.buyBoxId]:[]};
  }else if(conflicts.length){
   const fact=conflicts[0];readiness='clarify';nextAction={title:'Clarify '+fact.label.toLowerCase(),question:fact.question!,sourceIds:[...(fact.recorded?[fact.recorded.id]:[]),...fact.reports.map(s=>s.id)]};
  }else if(conditional){
   readiness='clarify';nextAction={title:'Clarify conditional '+conditional.fact.label.toLowerCase(),question:`What condition still applies to this ${conditional.fact.label.toLowerCase()}, and has it actually been satisfied? Source statement: ${conditional.source.statement}`,sourceIds:[conditional.source.id]};
   cautions.push('Conditional funding, timing or budget testimony does not establish readiness.');
  }else if(concern){
   const repair=/repair|rehab|renovat|contractor/i.test(concern.text);
   readiness='clarify';nextAction={title:concern.kind==='property_pass'?'Review the pass on this property':repair?'Resolve the repair concern first':'Address the recorded concern first',question:repair?'Which repair assumptions remain unresolved? Obtain a sourced scope and cost breakdown before another pitch; walkthrough availability is not established.':'What evidence would resolve the recorded concern before this property would be useful?',sourceIds:[concern.id]};
  }else if(geography?.question){
   readiness='clarify';nextAction={title:'Clarify this property’s geography',question:geography.question,sourceIds:match.buyBoxId?[match.buyBoxId]:[]};
  }else if(task){
   readiness='follow_through';nextAction={title:'Handle your existing follow-up',question:'Review “'+task.title+'” before creating another commitment. Completing a task does not prove an investor response.',sourceIds:[task.id]};
  }else if(!match.disclosureReady||release?.status!=='released'){
   readiness='sharing_required';nextAction={title:'Resolve sharing requirements',question:'Review the current release and disclosure requirements before preparing restricted property details.',sourceIds:['disclosure:'+investor.id]};
  }else if(match.missing.length||!funding.length||!timing.length||journey.activity==='unknown'||facts.some(f=>journey.record.reviewDue.some(r=>r.key===f.key))){
   readiness='clarify';nextAction={title:'Confirm the remaining fit details',question:!timing.length?'What is the current purchase timeline?':!funding.length?'What funding method is planned, and what remains to be confirmed?':journey.activity==='unknown'?'Is the investor currently considering purchases?':'Reconfirm the missing or older criteria: '+[...match.missing,...facts.filter(f=>journey.record.reviewDue.some(r=>r.key===f.key)).map(f=>f.label)].join('; ')+'.',sourceIds:match.buyBoxId?[match.buyBoxId]:[]};
  }
  return {...match,investor,readiness,nextAction,cautions:[...new Set(cautions)],funding,timing,evidence};
 }).sort((a,b)=>rank[a.readiness]-rank[b.readiness]||b.score-a.score||a.investorId.localeCompare(b.investorId));
 return {property,releaseId:release?.id??null,releaseVersion:release?.version??null,releaseStatus:release?.status??'unreleased',matches,notice};
}
function reference(actor:Actor,value:Omit<BuyerShortlist,'buyerShortlistReference'>){
 // A reviewed source correction can retain the same criterion value. Bind the
 // authorized selected box, including its version/provenance, without expanding UI output.
 const criteria=value.matches.map(match=>match.buyBoxId?getInvestorIntelligence(actor,match.investorId).buyBoxes.find(box=>box.id===match.buyBoxId)??null:null);
 return value.property.id+'@'+createHash('sha256').update(JSON.stringify({scope:[actor.organizationId,actor.officeId,actor.id,actor.role],value,criteria,method:'buyer-shortlist-v3',geography:buyerGeographyMethod})).digest('hex');
}
export function buildBuyerShortlist(actor:Actor,propertyId:string):BuyerShortlist {
 const value=evaluate(actor,propertyId);return {...value,buyerShortlistReference:reference(actor,value)};
}
export function buyerShortlistReferenceCurrent(actor:Actor,value:string):boolean {
 const [propertyId,digest,...extra]=value.split('@');if(extra.length||!propertyId||!/^[a-f0-9]{64}$/.test(digest??''))return false;
 try{return reference(actor,evaluate(actor,propertyId))===value;}catch(error){if(error instanceof AppError&&[403,404,409].includes(error.status))return false;throw error;}
}
export function buyerShortlistMessage(value:BuyerShortlist):string {
 return `Existing buyer shortlist for ${value.property.address}:\n${value.matches.slice(0,12).map(m=>`${m.investorName} · ${m.score}/100 recorded fit · ${m.buyBoxLabel}\nNext: ${m.nextAction.title}. ${m.nextAction.question}${m.cautions.length?'\nReview: '+m.cautions.join('; '):''}`).join('\n\n')||'No permitted buyers are recorded.'}${value.matches.length>12?`\nShowing 12 of ${value.matches.length} permitted buyers.`:''}\n\n${value.notice}`;
}
