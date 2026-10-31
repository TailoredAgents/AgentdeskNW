import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import type {WorkQuestion,WorkRun,WorkStep,WorkStepInput} from '../lib/work-contracts';
import {AppError,assertActor,getDb} from './db';
import {listInvestors,listProperties} from './services';
import {readInvestor,readProperty} from './access';
import {getRelease} from './workflows';

import {workQuestionSchema} from './work-question-schema';
export const nextReadyStep=(steps:WorkStep[])=>steps.find(step=>step.status==='pending'&&step.dependsOn.every(key=>steps.some(source=>source.key===key&&source.status==='completed')));
type QuestionRun=Pick<WorkRun,'id'|'planVersion'|'status'|'steps'|'updatedAt'>;
/** Rebuilt from current authorized records, so an answer cannot select a stale choice/context. */
export function getWorkQuestion(actor:Actor,run:QuestionRun):WorkQuestion|null {
 if(run.status!=='waiting_for_input')return null;
 const step=nextReadyStep(run.steps);if(step?.capabilityId!=='request_information')return null;
 return questionForStep(actor,run,step);
}
function questionForStep(actor:Actor,run:QuestionRun,step:WorkStep):WorkQuestion {
 const input=workQuestionSchema.parse(step.input);
 const records=input.answerType==='property'?listProperties(actor):input.answerType==='investor'?listInvestors(actor):[];
 const choices=records.map(record=>({value:record.id,label:'address'in record?record.address:record.name}));
 const evidence:unknown[]=[];
 const visit=(value:unknown):void=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(typeof item==='string'){if(key==='propertyId')evidence.push(readProperty(actor,item));if(key==='investorId')evidence.push(readInvestor(actor,item));if(key==='releaseId')evidence.push(getRelease(actor,item));}else visit(item);}};
 const ancestors=new Set<string>();const include=(key:string)=>{if(ancestors.has(key))return;ancestors.add(key);run.steps.find(item=>item.key===key)?.dependsOn.forEach(include);};step.dependsOn.forEach(include);
 for(const source of run.steps){visit(source.input);if(ancestors.has(source.key)&&source.status==='completed'){visit(source.resolvedInput);visit(source.result?.data);}}
 const reference='Q'+createHash('sha256').update(JSON.stringify({actor:[actor.organizationId,actor.officeId,actor.id,actor.role],run:run.id,plan:run.planVersion,step:step.key,input,records,evidence})).digest('hex').slice(0,16).toUpperCase();
 return {reference,stepKey:step.key,...input,choices,askedAt:run.updatedAt};
}
export function workQuestionText(question:WorkQuestion):string {
 const options=question.choices.slice(0,12).map(choice=>choice.label).join('; ');
 return `${question.prompt}${options?`\nAvailable: ${options}${question.choices.length>12?' (more in Work)':''}`:''}\nReply “Answer ${question.reference}: your answer”, or answer in Work. This supplies information; it does not approve spending.`;
}
export function parseWorkAnswer(question:WorkQuestion,raw:string):ToolResult {
 const text=z.string().trim().min(1).max(2000).parse(raw);let answer:string|number=text,label=text;
 if(question.answerType==='property'||question.answerType==='investor'){
  const matches=question.choices.filter(choice=>choice.value.toLowerCase()===text.toLowerCase()||choice.label.toLowerCase()===text.toLowerCase());
  if(matches.length!==1)throw new AppError(422,'Select one currently available record by its full name/address or record ID.');answer=matches[0].value;label=matches[0].label;
 }else if(question.answerType==='number'){
  if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)||!Number.isFinite(Number(text))||Math.abs(Number(text))>Number.MAX_SAFE_INTEGER)throw new AppError(422,'Provide one finite number without currency signs, commas or extra text.');answer=Number(text);
 }else if(question.answerType==='datetime'){
  if(!z.string().datetime({offset:true}).safeParse(text).success)throw new AppError(422,'Provide a complete date/time with timezone, such as 2026-11-03T09:00:00-05:00.');answer=new Date(text).toISOString();
 }
 return {specialistIds:[],message:`Employee supplied: ${label}. Saved as an answer to “${question.prompt}”; not an independently verified business fact.`,data:{answer,questionReference:question.reference,provenance:'employee_supplied',...(question.answerType==='property'?{propertyId:answer}:question.answerType==='investor'?{investorId:answer}:{})},artifacts:[]};
}

export function workQuestionReferenceCurrent(actor:Actor,reference:string):boolean {
 assertActor(actor);const [id,question]=reference.split('@');if(!/^Q[0-9A-F]{16}$/.test(question??''))return false;
 const row=getDb().prepare('SELECT data FROM work_runs WHERE id=? AND organization_id=? AND office_id=? AND owner_id=?').get(id,actor.organizationId,actor.officeId,actor.id) as {data:string}|undefined;
 if(!row)return false;const run=JSON.parse(row.data) as QuestionRun;
 if(getWorkQuestion(actor,run)?.reference===question)return true;
 const answered=run.steps.find(step=>step.capabilityId==='request_information'&&step.status==='completed'&&(step.result?.data as {questionReference?:string}|undefined)?.questionReference===question);
 if(!answered)return false;
 const plan=getDb().prepare('SELECT data FROM work_run_plans WHERE run_id=? AND plan_version=?').get(id,answered.planVersion) as {data:string}|undefined;if(!plan)return false;
 const inputs=(JSON.parse(plan.data) as {steps:WorkStepInput[]}).steps;
 const original={...run,planVersion:answered.planVersion,steps:inputs.map(input=>({...run.steps.find(step=>step.key===input.key)!,...input}))};
 return questionForStep(actor,original,answered).reference===question;
}
