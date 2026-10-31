import {createHash} from 'node:crypto';
import type {Role} from '../lib/contracts';
import type {InvestorJourney,InvestorNextStepKind} from '../lib/journey-contracts';
import type {RelationshipGuidance,RelationshipMethod,RelationshipMethodId} from '../lib/relationship-method-contracts';

const source={title:'AgentDesk relationship working methods',document:'docs/RELATIONSHIP_METHODS.md',revision:'2026-10-31.2',owner:'Tailored Agents demonstration design'};
const common={version:2,status:'active' as const,effectiveAt:'2026-10-30T00:00:00Z',roles:['dispositions','manager'] as Role[],authority:'provisional' as const,source};
/** Versioned application guidance, not imported company policy or executable instructions. */
export const relationshipMethods:ReadonlyArray<RelationshipMethod>=[
 {...common,id:'qualification',title:'Clarify the buying criteria',objective:'Resolve the decision-changing gap without silently widening the investor’s criteria.',
  steps:['Identify the relevant active buy box and distinguish reviewed criteria from employee reports.','Resolve differing or undated reports before relying on a new criterion.','Ask one focused question, then propose a reviewed update only after the employee confirms the answer.'],
  requiredFacts:['Which buy box applies','Current source and date for the disputed or missing criterion','Buying timeline and funding status'],
  limits:['A fit score is not investor interest.','A new report cannot automatically replace reviewed CRM criteria.']},
 {...common,id:'objections',title:'Resolve the concern before another pitch',objective:'Find what evidence would resolve the stated concern and verify its availability.',
  steps:['Quote the relevant concern and retain its source/date; distinguish the current message from older reports.','Distinguish a current objection from a reported resolution, contact stop or conditional statement; do not repeat a resolved concern as a new objection.','Identify the evidence that would answer it and the person who can supply that evidence.','Confirm availability before promising a breakdown or walkthrough; record an explicit resolution only after review.'],
  requiredFacts:['What remains unresolved','What supporting material is actually available','Who owns the next step and when to check back'],
  limits:['Do not invent repair figures, contractor work or access.','A generic reply or completed task does not resolve an objection.']},
 {...common,id:'reactivation',title:'Respect timing and permission',objective:'Agree a useful check-in while honoring the recorded pause.',
  steps:['Read the pause and any requested contact timing before considering inventory.','Clarify whether the investor wants the present question addressed or prefers a later check-in.','Keep the pause until a reviewed update changes it; record only the agreed follow-up.'],
  requiredFacts:['Current contact preference','Whether the pause still applies','An agreed check-in time, if any'],
  limits:['A new message or property match is not permission to restart marketing.','Do not assume a deadline or buying readiness.']},
 {...common,id:'follow-through',title:'Close the existing follow-up loop',objective:'Resolve existing work before adding duplicate reminders or making a new promise.',
  steps:['Inspect open commitments and their due dates before creating another task.','Separate the employee’s completed action from the investor’s response.','Record the actual outcome, missing evidence and explicitly agreed next owner/time.'],
  requiredFacts:['Existing task and owner','Whether the work was done','The investor’s actual response and next agreed step'],
  limits:['Task completion does not establish investor agreement.','Do not create a duplicate task or infer a promise from correspondence.']},
];
const methodsByKind:Record<InvestorNextStepKind,RelationshipMethodId|null>={confirm_timing:'reactivation',resolve_objection:'objections',review_pass:'objections',fulfill_commitment:'follow-through',review_observation:'objections',resolve_eligibility:null,clarify_fit:'qualification',clarify_qualification:'qualification',review_property:'qualification',relationship_check_in:'qualification'};
export function selectRelationshipMethod(kind:InvestorNextStepKind,role:Role,catalog:ReadonlyArray<RelationshipMethod>=relationshipMethods,at=Date.now()):RelationshipMethod|null {
 const id=methodsByKind[kind];if(!id)return null;
 // Select the latest effective version before checking withdrawal/role. Never resurrect an older revision.
 const latest=catalog.filter(method=>method.id===id&&Date.parse(method.effectiveAt)<=at).sort((a,b)=>b.version-a.version)[0];
 return latest?.status==='active'&&latest.roles.includes(role)?structuredClone(latest):null;
}
export const relationshipMethodFingerprint=()=>createHash('sha256').update(JSON.stringify(relationshipMethods)).digest('hex');
export function relationshipGuidance(journey:InvestorJourney,kind:InvestorNextStepKind,role:Role,topic:'repair'|'operating'|'timing'|'general'='general'):RelationshipGuidance|null {
 const method=selectRelationshipMethod(kind,role);if(!method)return null;
 const conflict=journey.record.conflicts[0],issue=journey.openIssues.find(item=>item.kind==='objection')??journey.openIssues[0],task=journey.commitments[0];
 let question:string;
 if(method.id==='reactivation')question='Would you like this question addressed now, or should we agree a later check-in while your buying plans are paused?';
 else if(method.id==='objections')question=topic==='repair'?'Which repair items or cost assumptions need a sourced breakdown before the next opportunity would be useful?':topic==='operating'?'Which operating-cost figures need supporting records before you can evaluate the opportunity?':'What specific concern remains unresolved, and what information would help answer it?';
 else if(method.id==='follow-through')question=task?`What is the outcome of “${task.title}”, and what response or next step was actually agreed?`:'What follow-up was agreed, and what outcome has actually been recorded?';
 else question=conflict?.question??(topic==='timing'?'What purchase timing should we use, and which recorded buying criteria have changed?':'Which buying criterion or timing detail should we confirm before selecting the next opportunity?');
 const sourceIds=[...(conflict?.reports.map(report=>report.id)??[]),conflict?.buyBoxId,issue?.id,task?.id].filter((id):id is string=>!!id);
 const evidenceIds=journey.evidence.filter(item=>sourceIds.includes(item.sourceRecordId)||item.kind==='buy_box'||item.kind==='crm').map(item=>item.id).slice(0,8);
 return {method,question,checks:[...method.steps],evidenceIds,missingFacts:[...new Set([...journey.unknowns,...(method.id==='objections'?['Availability of supporting material and an agreed next owner/time have not been established.']:[])])],notice:'Provisional AgentDesk guidance, not an approved New Western procedure. Source/version explains the method; current records and employee authority still control every action.'};
}
