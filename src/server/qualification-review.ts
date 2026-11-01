import {createHash} from 'node:crypto';
import type {Actor,ToolResult} from '../lib/contracts';
import type {RelationshipFact,RelationshipFactSource,RelationshipTopic} from '../lib/relationship-record-contracts';
import {AppError,requireRole} from './db';
import {requireFeature} from './billing';
import {getInvestorJourney} from './journey';

export const qualificationMethod={version:'qualification-review-v2',source:'AgentDesk provisional qualification method · 2026-11-01.2',notice:'Recorded criteria and employee reports are not verified funding or purchase intent. Keep strategies separate; a report never replaces approved criteria without review.'};
type Question={kind:'pause'|'conflict'|'wording'|'conditional'|'missing'|'reconfirm';factKey:string|null;buyBoxId:string|null;topic:RelationshipTopic|null;scope:string;question:string;reason:string;sourceIds:string[]};
const topicOrder:RelationshipTopic[]=['budget','financing','geography','strategy','rehab','timing','contact'];
const sources=(fact:RelationshipFact)=>[...(fact.recorded?[fact.recorded]:[]),...fact.reports];
const placeholder=(source:RelationshipFactSource)=>Array.isArray(source.value)&&source.value.some(v=>/^(unknown|unspecified|not supplied|not confirmed|tbd|n\/a)$/i.test(v.trim()));
const short=(text:string,limit=150)=>text.length>limit?text.slice(0,limit-1)+'…':text;
const excerpt=(text:string,index:number)=>{const start=Math.max(0,index-45),end=Math.min(text.length,start+180);return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');};
// These bounded cues only select a clarification question. Neither removing a cue nor
// supplying a value establishes available funds, purchase intent or satisfied conditions.
function conditionExcerpt(source:RelationshipFactSource):string|null {
 for(const text of [source.statement,source.displayValue]){
  for(const match of text.matchAll(/\b(if|unless|subject to|pending|contingent|provided that|only after|only once|depends? on|depending on|might|may be able|possibly|unsure|undecided|not sure|haven['’]t decided)\b/gi)){
   const cue=match[0].toLowerCase(),prefix=text.slice(0,match.index);
   if(/^(subject to|pending|contingent|depending on)$/.test(cue)&&/\b(?:not|no longer|never)\s+$/i.test(prefix))continue;
   return excerpt(text,match.index);
  }
 }
 return null;
}
function financingDenial(source:RelationshipFactSource):string|null {
 // Do not reinterpret ordinary price ceilings, excluded locations or a removed condition.
 // An explicit inability to obtain/use funding needs wording review even when the list says "Cash".
 const match=source.statement.match(/\b(?:(?:cannot|can['’]t|unable to|not able to|will not|won['’]t)\s+(?:use|obtain|secure|access|arrange|provide)|(?:do not|don['’]t)\s+have)\b[^.!?\n]{0,80}\b(?:cash|funds|funding|financing|loan|credit|hard money)\b/i);
 return match?excerpt(source.statement,match.index??0):null;
}
function missingQuestion(fact:RelationshipFact,evidence:RelationshipFactSource[]):string {
 const scope=`For ${fact.scopeLabel}`;
 switch(fact.topic){
  case 'budget':return evidence.some(s=>!Array.isArray(s.value)&&s.value.max===null)?`${scope}, what maximum purchase price applies? The supplied lower bound is not a spending ceiling.`:`${scope}, what purchase-price range should be reviewed, separate from repairs and other costs?`;
  case 'financing':return `${scope}, which financing method is planned, and what availability, approval or conditions still need confirmation?`;
  case 'geography':return `${scope}, which states, counties, cities or ZIP codes are included, and which locations are excluded?`;
  case 'strategy':return `${scope}, which investment strategy should this buy box represent? Keep other strategies in their own buy boxes.`;
  case 'rehab':return `${scope}, what renovation scope is acceptable, and which conditions or repair types are excluded?`;
  case 'timing':return 'What purchase timeline is currently reported, and does it depend on another event? A target date is not a commitment.';
  case 'contact':return 'What contact method and timing has the investor actually agreed to? A recorded preference does not establish permission for every message.';
 }
}
function factQuestion(fact:RelationshipFact):Question|null {
 const evidence=sources(fact),identity={factKey:fact.key,buyBoxId:fact.buyBoxId,topic:fact.topic,scope:fact.scopeLabel,sourceIds:evidence.map(s=>s.id)};
 if(fact.status==='needs_clarification'){
  const values=[...new Set(evidence.map(s=>`${s.sourceKind==='recorded_criteria'?'Recorded':'Reported'}: “${short(s.displayValue)}”`))];
  return {...identity,kind:'conflict',question:`For ${fact.scopeLabel}, which ${fact.label.toLowerCase()} should apply? ${values.slice(0,3).join('; ')}${values.length>3?`; ${values.length-3} additional value(s) in the source evidence`:''}.`,reason:'Current values disagree. Review the original statements and any conditions before selecting a value; the newest report does not automatically win.'};
 }
 const denied=fact.topic==='financing'?evidence.map(source=>({source,excerpt:financingDenial(source)})).find(item=>item.excerpt):undefined;
 if(denied)return {...identity,kind:'wording',question:`For ${fact.scopeLabel}, the financing value says “${short(denied.source.displayValue)}”, while its source says “${denied.excerpt}”. What financing description and remaining limitations should be reviewed?`,reason:'The explicit funding limitation must be clarified before relying on the structured value. This wording check neither confirms nor rejects funding.'};
 const conditional=evidence.map(source=>({source,excerpt:conditionExcerpt(source)})).find(item=>item.excerpt);
 if(conditional)return {...identity,kind:'conditional',question:`For ${fact.scopeLabel}, the ${fact.label.toLowerCase()} source says “${conditional.excerpt}”. What conditions remain, and what evidence would establish whether they are met?`,reason:'The source contains conditional or uncertain language. Do not turn a possibility into confirmed capacity or a commitment.'};
 const missing=fact.status==='unknown'||!evidence.length||evidence.some(placeholder)||evidence.some(s=>!Array.isArray(s.value)&&s.value.max===null);
 if(missing)return {...identity,kind:'missing',question:missingQuestion(fact,evidence),reason:'This criterion is absent, includes an unresolved placeholder or lacks a purchase-budget ceiling. Do not substitute an assumed value.'};
 const aging=evidence.filter(s=>s.freshness!=='recent');
 if(aging.length)return {...identity,kind:'reconfirm',question:`Is the recorded ${fact.label.toLowerCase()} for ${fact.scopeLabel} still current, and when was it confirmed?`,reason:'At least one source is undated or due for review under the provisional freshness method. Capture time does not establish statement freshness.'};
 return null;
}

export function reviewQualification(actor:Actor,investorId:string){
 requireRole(actor,['dispositions','manager']);requireFeature(actor,'investor-qualification');
 const journey=getInvestorJourney(actor,investorId),boxes=journey.buyBoxes.filter(b=>b.active&&b.provenance.reviewStatus==='approved');
 const activeIds=new Set(boxes.map(b=>b.id));
 const facts=journey.record.facts.filter(f=>f.buyBoxId===null||activeIds.has(f.buyBoxId));
 const questions:Question[]=[];
 if(journey.activity==='paused')questions.push({kind:'pause',factKey:null,buyBoxId:null,topic:null,scope:'Relationship',question:'Does the recorded pause still apply, and was a later check-in actually agreed?',reason:'Do not restart property marketing based on completed criteria or a new match.',sourceIds:journey.evidence.filter(e=>e.kind==='relationship'||e.kind==='crm').map(e=>e.sourceRecordId)});
 if(!boxes.length)questions.push({kind:'missing',factKey:null,buyBoxId:null,topic:'strategy',scope:'Buying strategy',question:'Which buying strategy and criteria should be reviewed before selecting properties?',reason:'No active approved buy box is available. Unapproved or inactive criteria cannot establish a current match.',sourceIds:[]});
 const ordered=[...facts].sort((a,b)=>topicOrder.indexOf(a.topic)-topicOrder.indexOf(b.topic)||a.key.localeCompare(b.key));
 const perFact=ordered.map(factQuestion).filter((question):question is Question=>question!==null);
 for(const kind of ['conflict','wording','conditional','missing','reconfirm'] as const)questions.push(...perFact.filter(question=>question.kind===kind));
 if(journey.activity==='unknown')questions.push({kind:'missing',factKey:null,buyBoxId:null,topic:null,scope:'Relationship',question:'Is the investor currently considering purchases?',reason:'Complete criteria do not establish current buying intent.',sourceIds:[]});
 const evidence=facts.flatMap(f=>sources(f).map(s=>({id:s.id,factKey:f.key,buyBoxId:f.buyBoxId,scope:f.scopeLabel,topic:f.topic,statement:s.statement,value:s.displayValue,statedAt:s.statedAt,freshness:s.freshness,verification:s.verification})));
 const value={investorId,investorName:journey.investorName,activity:journey.activity,method:qualificationMethod,buyBoxes:boxes.map(b=>({id:b.id,label:b.label})),questions,evidence,
  nextQuestion:questions[0]??null,readiness:journey.activity==='paused'?'paused':questions.length?'clarification_needed':'recorded_criteria_available',
  nextAction:questions[0]?.question??'Review a current property against the separate recorded criteria, then confirm interest and funding. Complete fields do not prove readiness to purchase.'};
 return {...value,qualificationReference:investorId+'@'+createHash('sha256').update(JSON.stringify({actor:[actor.organizationId,actor.officeId,actor.id,actor.role],value})).digest('hex')};
}
export function qualificationReferenceCurrent(actor:Actor,reference:string){
 const [id,digest,...extra]=reference.split('@');if(extra.length||!id||!/^[a-f0-9]{64}$/.test(digest??''))return false;
 try{return reviewQualification(actor,id).qualificationReference===reference;}catch(error){if(error instanceof AppError&&[402,403,404].includes(error.status))return false;throw error;}
}
export function qualificationResult(actor:Actor,investorId:string):ToolResult {
 const review=reviewQualification(actor,investorId),next=review.nextQuestion;
 const evidence=next?review.evidence.filter(e=>next.sourceIds.includes(e.id)):[];
 return {specialistIds:['investor-qualification'],data:review,message:[`Qualification review · ${review.investorName}`,review.nextAction,next?.reason,...evidence.map(e=>`${e.scope} · ${e.topic}: ${e.value}\nSource: ${e.statement} (${e.verification}; stated ${e.statedAt??'date unknown'}).`),`${review.questions.length} clarification items across ${review.buyBoxes.length} active approved buying strategies. Ask the next useful question, not the entire checklist.`,qualificationMethod.notice].filter(Boolean).join('\n\n'),artifacts:[{type:'investors',title:'Review qualification and source evidence',data:{investorId,qualificationReference:review.qualificationReference}}]};
}
