import {workConversationReference} from './work-conversation';
import {z} from 'zod';
import type {Actor,ToolResult} from '../lib/contracts';
import type {WorkRun,WorkStepInput} from '../lib/work-contracts';
import {AppError} from './db';
import {fingerprint} from './provider-runtime';
import {createWorkRun,getWorkRun,listWorkRuns} from './work-runs';
import {listWorkCapabilities} from './work-capabilities';
import {buildWorkPreset} from './work-presets';
import {deriveWorkSourceReferences} from './work-provenance';
import {listInvestors,listProperties} from './services';

const id=z.string().min(1).max(150);
export const workToolSchemas={
 work_capabilities:z.object({}).strict(),
 start_work:z.object({title:z.string().trim().min(3).max(160),steps:z.array(z.object({key:z.string().min(1).max(60),capabilityId:id,inputJson:z.string().min(2).max(6000),dependsOn:z.array(z.string().min(1).max(60)).max(12)}).strict()).min(1).max(12)}).strict(),
 work_status:z.object({runId:id.nullable()}).strict(),
};
export const workToolDescriptions={
 work_capabilities:'Discover implemented durable-work capabilities and their typed input schemas, dependencies, role availability, outputs and fictional analysis prices. Direct services still handle quick questions. No execution, payment or approval.',
 start_work:'Compose ONE durable job for the current employee assignment using discovered capabilities. inputJson is a JSON object validated against that capability schema. Reference a completed dependency result using {"$step":"step_key","path":"data_field"}; the path starts inside ToolResult.data, not at data itself. All steps share one server-priced simulated budget; above $1 waits for employee approval in Work queue. Include all delegated research/retries, do not split to avoid approval. Task creation and new research must be explicitly requested. No arbitrary code, real provider research, CRM mutation, email/SMS send or automatic credit purchase. Worker executes local services only; queued is not completed.',
 work_status:'Read the current employee’s saved Copilot job and actual step results, or recent job summaries with null runId. A blocked or waiting job is not completed; report the required decision and link to it. Old source access is rechecked. This cannot approve, resume, revise or cancel work.',
};
interface Command {conversationId:string;requestId:string;message:string}
const requestsResearch=(text:string)=>/\bresearch\b|\bhunter\b|\bnew (?:investors|buyers)\b/i.test(text)&&!/\b(?:do not|don't|never|without|no)\b[\s\S]{0,60}\b(?:research|hunter|new (?:investors|buyers))\b/i.test(text);
export function workResult(run:WorkRun):ToolResult {
 const maximum=(run.budget.maximumCents/100).toFixed(2),spent=(run.budget.spentCents/100).toFixed(2);
 return {specialistIds:[],message:`${workConversationReference(run.id)} — ${run.title}: ${run.status.replaceAll('_',' ')}.\n${run.status==='waiting_cost_approval'?`Review the exact scope and approve or deny its $${maximum} simulated maximum in Work queue before it starts.\n`:''}Simulated credits used: $${spent}; quoted maximum: $${maximum}. These are fictional cost assumptions, not live AI charges.\n${run.steps.filter(step=>step.status==='completed'&&step.result).map(step=>step.result!.message).join('\n\n')}${run.lastError?`\nNeeds attention: ${run.lastError}`:''}`,data:run,artifacts:[{type:'work_run',id:run.id,title:run.title,data:{workRunId:run.id,workPlanVersion:run.planVersion}}]};
}
export function dispatchWorkTool(actor:Actor,name:string,raw:unknown,command?:Command):ToolResult {
 if(name==='work_capabilities')return {specialistIds:[],message:'These are the currently implemented local work capabilities. Their analysis prices are explicitly fictional; no live billing integration is implied.',data:{capabilities:listWorkCapabilities(actor)},artifacts:[]};
 if(name==='work_status'){
  const {runId}=workToolSchemas.work_status.parse(raw);if(runId)return workResult(getWorkRun(actor,runId));
  const runs=listWorkRuns(actor).slice(0,8);return {specialistIds:[],message:runs.length?runs.map(run=>`${workConversationReference(run.id)} — ${run.title}: ${run.status.replaceAll('_',' ')}`).join('\n'):'You have no saved Copilot jobs yet.',data:{runs:runs.map(run=>({id:run.id,title:run.title,status:run.status,contentRestricted:run.contentRestricted}))},artifacts:runs.map(run=>({type:'work_run',id:run.id,title:run.title,data:{workRunId:run.id,workPlanVersion:run.planVersion}}))};
 }
 if(name!=='start_work'||!command)throw new AppError(400,'A new job must be attached to the employee’s current conversation request.');
 const input=workToolSchemas.start_work.parse(raw);
 const steps:WorkStepInput[]=input.steps.map(step=>{let value:unknown;try{value=JSON.parse(step.inputJson);}catch{throw new AppError(400,'A job step has invalid input JSON.');}if(!value||Array.isArray(value)||typeof value!=='object')throw new AppError(400,'Each step input must be an object.');return {key:step.key,capabilityId:step.capabilityId,input:value as Record<string,unknown>,dependsOn:step.dependsOn};});
 const text=command.message;
 if(steps.some(step=>step.capabilityId==='create_followup')&&(!/\b(?:create|add|save|set|schedule|make)\b[\s\S]{0,120}\b(?:task|reminder|follow.up)\b|\bremind me\b/i.test(text)||/\b(?:do not|don't|never|without)\b[\s\S]{0,60}\b(?:task|reminder|follow.up)\b/i.test(text)))throw new AppError(422,'The employee has not explicitly requested a saved personal follow-up. Prepare the other steps or ask whether to add one.');
 if(steps.some(step=>step.capabilityId==='start_synthetic_research')&&!requestsResearch(text))throw new AppError(422,'New-investor research needs the employee’s deliberate request. Search existing buyers first.');
 const requestId=`turn-work:${fingerprint({requestId:command.requestId,conversationId:command.conversationId})}`;
 return workResult(createWorkRun(actor,{requestId,conversationId:command.conversationId,title:input.title,instructions:command.message.slice(0,4000),steps,sourceReferences:deriveWorkSourceReferences(actor,command.conversationId,requestId)}));
}

/** Narrow, explicitly local starter route; the configured model can compose arbitrary supported steps. */
export function localWorkReply(actor:Actor,message:string,command:Command):ToolResult|null {
 if(/\b(?:show|list|status|check)\b.*\b(?:copilot jobs|saved jobs|work jobs)\b/i.test(message))return dispatchWorkTool(actor,'work_status',{runId:null},command);
 if(!/\b(?:start|prepare|run)\b[\s\S]*\b(?:job|workflow)\b/i.test(message))return null;
 if(/\b(?:do not|don't|never)\b/i.test(message))return {specialistIds:[],message:'No job was started. Use the Work queue to review the exact starter scope, or describe the work you want Copilot to perform.',artifacts:[{type:'work_run',title:'Open Copilot jobs'}]};
 if(!/\b(?:create|add|save|set|schedule|make)\b[\s\S]{0,120}\b(?:task|reminder|follow.up)\b/i.test(message))return {specialistIds:[],message:'The local starter jobs prepare a review and save one personal follow-up. Open Copilot jobs to select and review that scope. A configured model can compose other supported plans.',artifacts:[{type:'work_run',title:'Choose a starter job'}]};
 const properties=listProperties(actor).filter(property=>message.toLowerCase().includes(property.address.toLowerCase()));
 const investors=listInvestors(actor).filter(investor=>message.toLowerCase().includes(investor.name.toLowerCase()));
 if(actor.role!=='manager'&&properties.length!==1||investors.length>1)return {specialistIds:[],message:'Select one property and, for dispositions, an optional investor in Copilot jobs so the local starter uses the right records.',artifacts:[{type:'work_run',title:'Select job details'}]};
 const preset=buildWorkPreset(actor,{presetId:actor.role==='manager'?'management':actor.role,...(actor.role==='manager'?{}:{propertyId:properties[0].id}),...(actor.role==='dispositions'&&investors[0]?{investorId:investors[0].id}:{}),includeResearch:actor.role==='dispositions'&&requestsResearch(message)});
 return workResult(createWorkRun(actor,{requestId:`turn-work:${fingerprint({requestId:command.requestId,conversationId:command.conversationId})}`,conversationId:command.conversationId,...preset}));
}
