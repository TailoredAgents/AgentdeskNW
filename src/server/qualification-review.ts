import {createHash} from 'node:crypto';
import type {Actor,ToolResult} from '../lib/contracts';
import type {RelationshipFact,RelationshipFactSource} from '../lib/relationship-record-contracts';
import {AppError,requireRole} from './db';
import {requireFeature} from './billing';
import {getInvestorJourney} from './journey';

export const qualificationMethod={version:'qualification-review-v1',source:'AgentDesk provisional qualification method · 2026-10-31.1',notice:'Recorded criteria and employee reports are not verified funding or purchase intent. Keep strategies separate; a report never replaces approved criteria without review.'};
type Question={kind:'pause'|'conflict'|'conditional'|'missing'|'reconfirm';scope:string;question:string;reason:string;sourceIds:string[]};
const topicOrder=['budget','financing','geography','strategy','rehab','timing','contact'];
const sources=(fact:RelationshipFact)=>[...(fact.recorded?[fact.recorded]:[]),...fact.reports];
const placeholder=(source:RelationshipFactSource)=>Array.isArray(source.value)&&source.value.every(v=>/^(unknown|unspecified|not supplied|not confirmed|tbd|n\/a)$/i.test(v.trim()));
// These cues request clarification; they never extract a new fact or infer that a condition is satisfied.
const conditional=(source:RelationshipFactSource)=>/\b(if|unless|subject to|pending|contingent|provided that|only after|depends on|might|may be able)\b/i.test(source.statement+' '+source.displayValue);

export function reviewQualification(actor:Actor,investorId:string){
 requireRole(actor,['dispositions','manager']);requireFeature(actor,'investor-qualification');
 const journey=getInvestorJourney(actor,investorId),boxes=journey.buyBoxes.filter(b=>b.active&&b.provenance.reviewStatus==='approved');
 const activeIds=new Set(boxes.map(b=>b.id));
 const facts=journey.record.facts.filter(f=>f.buyBoxId===null||activeIds.has(f.buyBoxId));
 const questions:Question[]=[];
 if(journey.activity==='paused')questions.push({kind:'pause',scope:'Relationship',question:'Does the recorded pause still apply, and was a later check-in actually agreed?',reason:'Do not restart property marketing based on completed criteria or a new match.',sourceIds:journey.evidence.filter(e=>e.kind==='relationship'||e.kind==='crm').map(e=>e.sourceRecordId)});
 if(!boxes.length)questions.push({kind:'missing',scope:'Buying strategy',question:'Which buying strategy and criteria should be reviewed before selecting properties?',reason:'No active approved buy box is available. Unapproved or inactive criteria cannot establish a current match.',sourceIds:[]});
 const ordered=[...facts].sort((a,b)=>topicOrder.indexOf(a.topic)-topicOrder.indexOf(b.topic)||a.key.localeCompare(b.key));
 for(const kind of ['conflict','conditional','missing','reconfirm'] as const)for(const fact of ordered){
  const evidence=sources(fact),conditionalSources=evidence.filter(conditional);
  const conflicted=fact.status==='needs_clarification';
  const missing=fact.status==='unknown'||!evidence.length||evidence.every(placeholder)||evidence.some(s=>!Array.isArray(s.value)&&s.value.max===null);
  const aging=evidence.filter(s=>s.freshness!=='recent');
  let question:string|null=null,reason='';
  if(kind==='conflict'&&conflicted){question=fact.question??`Which ${fact.label.toLowerCase()} should apply to ${fact.scopeLabel}?`;reason='Current sources disagree. Keep both sources visible until the employee resolves them.';}
  if(kind==='conditional'&&!conflicted&&conditionalSources.length){question=`For ${fact.scopeLabel}, what conditions still apply to ${fact.label.toLowerCase()}, and what evidence would confirm they are met?`;reason='The source contains conditional language. Do not turn a possibility into confirmed capacity or a commitment.';}
  if(kind==='missing'&&missing){question=`For ${fact.scopeLabel}, what ${fact.label.toLowerCase()} should we use?`;reason='This criterion is absent, a placeholder or lacks a purchase-budget ceiling. Do not substitute an assumed value.';}
  if(kind==='reconfirm'&&!missing&&!conflicted&&!conditionalSources.length&&aging.length){question=`Is the recorded ${fact.label.toLowerCase()} for ${fact.scopeLabel} still current, and when was it confirmed?`;reason='At least one source is undated or due for review under the provisional freshness method. Capture time does not establish statement freshness.';}
  if(question)questions.push({kind,scope:fact.scopeLabel,question,reason,sourceIds:evidence.map(s=>s.id)});
 }
 if(journey.activity==='unknown')questions.push({kind:'missing',scope:'Relationship',question:'Is the investor currently considering purchases?',reason:'Complete criteria do not establish current buying intent.',sourceIds:[]});
 const evidence=facts.flatMap(f=>sources(f).map(s=>({id:s.id,scope:f.scopeLabel,topic:f.topic,statement:s.statement,value:s.displayValue,statedAt:s.statedAt,freshness:s.freshness,verification:s.verification})));
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
