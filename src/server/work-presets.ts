import {z} from 'zod';
import type {Actor} from '../lib/contracts';
import type {WorkStepInput} from '../lib/work-contracts';
import {AppError,assertActor} from './db';
import {readInvestor,readProperty} from './access';

const id=z.string().trim().min(1).max(150);
export const workPresetSchema=z.object({presetId:z.enum(['dispositions','acquisitions','management']),propertyId:id.optional(),investorId:id.optional(),includeResearch:z.boolean().optional()}).strict();
export type WorkPresetInput=z.input<typeof workPresetSchema>;
export function buildWorkPreset(actor:Actor,raw:WorkPresetInput):{title:string;instructions:string;steps:WorkStepInput[]}{
 assertActor(actor);const input=workPresetSchema.parse(raw),role=actor.role==='manager'?'management':actor.role;
 if(input.presetId!==role)throw new AppError(403,'Choose the starter job for your current role. Copilot can compose other capabilities permitted to your role.');
 if(role!=='dispositions'&&(input.includeResearch||input.investorId))throw new AppError(400,'This starter job does not include investor research or a selected investor.');
 const steps:WorkStepInput[]=[];
 if(role==='management'){
  if(input.propertyId)throw new AppError(400,'The office-priorities starter does not select one property.');
  steps.push({key:'priorities',capabilityId:'office_priorities',input:{},dependsOn:[]},{key:'followup',capabilityId:'create_followup',input:{title:'Review recorded office priorities and choose the next team action',investorId:null,dueAt:null},dependsOn:['priorities']});
  return {title:'Prepare office priorities',instructions:'Review my authorized office workload, explain recorded overdue work, and save one personal follow-up to review priorities. Do not reassign colleagues or contact anyone. Fictional analysis costs only.',steps};
 }
 if(!input.propertyId)throw new AppError(422,'Select a property for this job.');
 const property=readProperty(actor,input.propertyId);
 steps.push({key:'property',capabilityId:'inspect_property',input:{propertyId:property.id},dependsOn:[]});
 const propertyRef={$step:'property',path:'propertyId'};
 if(role==='acquisitions'){
  steps.push({key:'handoff',capabilityId:'review_handoff',input:{propertyId:propertyRef},dependsOn:['property']},{key:'followup',capabilityId:'create_followup',input:{title:`Review missing handoff facts for ${property.address}`.slice(0,240),investorId:null,dueAt:null},dependsOn:['handoff']});
  return {title:`Review handoff: ${property.address}`,instructions:'Read recorded property/release facts, identify missing acquisition handoff information, and save one personal follow-up. Do not value, publish, send or change CRM. Fictional analysis costs only.',steps};
 }
 steps.push({key:'buyers',capabilityId:'match_existing_buyers',input:{propertyId:propertyRef},dependsOn:['property']});
 let investorName:string|undefined;
 if(input.investorId){const investor=readInvestor(actor,input.investorId);investorName=investor.name;steps.push({key:'relationship',capabilityId:'relationship_next_step',input:{investorId:investor.id},dependsOn:['buyers']});}
 if(input.includeResearch){
  steps.push({key:'research',capabilityId:'start_synthetic_research',input:{propertyId:propertyRef,limit:12},dependsOn:['property','buyers']},{key:'research_results',capabilityId:'await_synthetic_research',input:{jobId:{$step:'research',path:'jobId'}},dependsOn:['research']});
 }
 const prerequisites=['buyers',...(input.investorId?['relationship']:[]),...(input.includeResearch?['research_results']:[])];
 steps.push({key:'followup',capabilityId:'create_followup',input:{title:`Review ${investorName?`${investorName}'s next step and `:''}buyers for ${property.address}`.slice(0,240),investorId:input.investorId?{$step:'relationship',path:'investorId'}:null,dueAt:null},dependsOn:prerequisites});
 return {title:`Prepare buyers: ${property.address}`,instructions:`Read this property, match permitted existing buyers first${investorName?`, then prepare ${investorName}'s relationship next step`:''}${input.includeResearch?', then run and collect fictional new-investor research':''}, and save one personal follow-up. Do not contact investors or change CRM. All analysis/research credit charges are fictional simulation.`,steps};
}
