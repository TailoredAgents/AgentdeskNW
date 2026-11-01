import {createHash,randomInt,randomUUID} from 'node:crypto';
import {specialistMethods,specialistMethodRevision} from '../../src/server/specialist-methods';
import type {Role} from '../../src/lib/contracts';
import {qualityDimensions,specialistQualityCases,type SpecialistQualityTurn} from './cases';

/** Small authored comparison across the three roles, reserved from runtime examples. */
export const firstPassQualityCaseIds=['specialist-33','specialist-34','specialist-35'] as const;
export const comparisonRecordingInstructions=[
 'These packets prepare an advisory response comparison only. They do not run a model, execute app tools or establish a completed workflow.',
 'Run both labels with the same model/application revision, model configuration, facts/request, tool access and whole-task budget. Only the method instructions differ. No tools are exposed in these advisory packets.',
 'Feed each payload turn separately in order. Save the initial raw response before revealing the follow-up; continue the same conversation for that label. Never reveal the correction early or share an answer between labels. Record both responses as the verbatim two-turn transcript.',
 'Retain exact raw request/response and provider usage evidence separately. Hash the exact shared configuration and whole-two-turn budget actually used; do not treat planned packet metadata as execution evidence.',
 'Use the randomized labels in model-packets.json. Give reviewers only the corresponding raw transcript and blinded-review.json; keep arm-key.json and model instructions out of the reviewer view until grading is complete.',
 'Fill the response transcript, five 0–2 scores, critical errors, reviewer, time and notes. Score the complete exchange, including whether the second reply uses the correction without losing still-valid constraints. Any critical error in either turn fails that response. Record usefulness and necessary missing facts rather than rewarding confident wording.',
 'After grading, join the arm key to create records accepted by --review: caseId, arm, sample, transport (model), model, harnessRevision, response, reviewer, reviewedAt (ISO timestamp), scores, criticalErrors, notes and comparison. Remove label and reviewer-only turns. comparison contains runId/contextHash/toolAccessHash/modelConfigHash/budgetHash; replace planned hashes if the actual inputs differed.',
 'Repeat with a new sample number (--prepare <new-directory> --sample 2); do not reuse case/arm/sample identities. Compare only matched runs. Do not infer all-specialist or tool-use quality from this three-role advisory sample.',
 'These internally authored challenge cases are reserved from runtime teaching examples, not independent practitioner or secret held-out evidence. Missing responses and reviews remain pending; never use expected answers or critical-error checks as model input.',
];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const commonInstructions='You are a capable assistant helping a real estate employee with the fictional situation below. Give a useful, proportionate answer to their request using the supplied facts. Distinguish what is known, reported or missing. You cannot call tools or perform actions in this advisory comparison; do not claim an action happened.';
type Label='A'|'B';
type Arm='specialist'|'generic';
type ModelTurn=Pick<SpecialistQualityTurn,'request'|'context'>;
type ReviewTurn=ModelTurn&{expected:string[];criticalErrorsToCheck:string[]};
export function prepareFirstPassQualityPackets(options:{sample?:number;runId?:string}={}){
 const sample=options.sample??1,runId=options.runId??randomUUID();
 if(!Number.isSafeInteger(sample)||sample<1||!runId.trim())throw new Error('Use a positive sample and a nonempty run identity.');
 const selected=firstPassQualityCaseIds.map(id=>specialistQualityCases.find(item=>item.id===id)!);
 const models:{caseId:string;sample:number;label:Label;payload:{instructions:string;role:Role;turns:ModelTurn[]};plannedComparison:{runId:string;contextHash:string;toolAccessHash:string}}[]=[];
 const key:{caseId:string;sample:number;label:Label;arm:Arm}[]=[];
 const reviews:{caseId:string;sample:number;label:Label;role:Role;turns:ReviewTurn[];response:null;scores:Record<(typeof qualityDimensions)[number],null>;criticalErrors:string[];reviewer:null;reviewedAt:null;notes:null}[]=[];
 for(const item of selected){
  const method=specialistMethods.find(value=>value.specialistId===item.specialistId);if(!method||!item.followUp)throw new Error('Missing declared specialist method or correction turn.');
  const turns=[item,item.followUp].map(({request,context})=>({request,context}));
  const reviewTurns=[item,item.followUp].map(({request,context,expected,criticalErrors})=>({request,context,expected:[...expected],criticalErrorsToCheck:[...criticalErrors]}));
  // Runtime examples and evaluator answers never enter either model payload.
  const standard={context:method.context,decisions:method.decisions,checks:method.checks};
  const arms:Arm[]=randomInt(2)?['generic','specialist']:['specialist','generic'];
  for(const [index,arm] of arms.entries()){
   const label:Label=index===0?'A':'B';
   models.push({caseId:item.id,sample,label,payload:{instructions:commonInstructions+(arm==='specialist'?`\nApply this provisional working method (${specialistMethodRevision}), which is guidance rather than case facts or action authority: ${JSON.stringify(standard)}`:''),role:item.role,turns:structuredClone(turns)},plannedComparison:{runId,contextHash:digest({role:item.role,turns}),toolAccessHash:digest({tools:[],scope:'advisory_only'})}});
   key.push({caseId:item.id,sample,label,arm});
   reviews.push({caseId:item.id,sample,label,role:item.role,turns:structuredClone(reviewTurns),response:null,scores:{evidence:null,judgment:null,action:null,clarity:null,correction:null},criticalErrors:[],reviewer:null,reviewedAt:null,notes:null});
  }
 }
 return {modelPackets:{version:2,fictional:true,status:'not_run',scope:'advisory_only',runId,methodRevision:specialistMethodRevision,execution:'Send only one turn at a time, saving its response before revealing the next turn; never send this full packet as a prompt.',packets:models},blindReview:{version:2,fictional:true,status:'not_run',runId,instructions:comparisonRecordingInstructions,reviews},armKey:{version:2,runId,assignments:key}};
}
