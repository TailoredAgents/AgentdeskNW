import {emptySubmission,parseSubmissionForm,submissionForm,submissionFields,type AcquisitionSubmission,type SubmissionForm} from './acquisition-contracts';
import type {AnalysisMetric} from './analysis-contracts';

export interface OpportunityScreening {
 title:string;nextAction:string;notice:string;
 analysisAccessReference?:string;
 scenarios:Array<{analysisId:string;label:string;version:number;state:'current'|'source_changed';analysisAccessReference?:string;
  asOf:string|null;metrics:AnalysisMetric[];differences:string[];risks:string[];questions:string[]}>;
}

export interface OpportunityInput {
 address:string;city:string;county:string;state:string;postalCode:string;propertyType:string;
 submission:AcquisitionSubmission;closingTarget:string|null;accessNotes:string;
 status:'reviewing'|'not_pursuing';reviewNote:string;
}
export interface Opportunity extends OpportunityInput {
 id:string;ownerId:string;version:number;createdAt:string;updatedAt:string;synthetic:true;
}
export interface OpportunityAssessment {
 questions:{field:string;question:string;reason:string}[];
 duplicates:{id:string;kind:'opportunity'|'inventory';address:string;reason:string}[];
 summary:string;followupDraft:string;method:string;notice:string;
}
export interface OpportunityDetail extends OpportunityAssessment {
 screening?:OpportunityScreening;
 opportunity:Opportunity;opportunityAccessReference:string;
 history:{version:number;recordedAt:string;input:OpportunityInput}[];
 changes:{field:string;before:string;after:string}[];
}
export interface OpportunityBoard {items:Opportunity[];canEdit:boolean;opportunityAccessReference:string}
export interface OpportunityPreview extends OpportunityAssessment {
 input:OpportunityInput;id:string|null;expectedVersion:number;reviewReference:string;
}
export interface OpportunitySave {id:string|null;expectedVersion:number;eventKey:string;input:OpportunityInput;reviewReference:string}
export const opportunityFields=[
 {key:'address',label:'Street address',hint:'Include a unit number when applicable'},
 {key:'city',label:'City',hint:'As supplied by the source'},
 {key:'county',label:'County',hint:'Leave blank if unknown'},
 {key:'state',label:'State',hint:'Two-letter US state abbreviation'},
 {key:'postalCode',label:'ZIP code',hint:'Leave blank if unknown'},
 {key:'propertyType',label:'Property type',hint:'Leave blank if unknown'},
 {key:'closingTarget',label:'Supplied closing target (YYYY-MM-DD)',hint:'An unconfirmed target, not an agreed contract date'},
 {key:'accessNotes',label:'Access information',hint:'What was supplied about inspections or access?'},
 {key:'reviewNote',label:'Internal review note',hint:'Record why more information is needed or why you are not pursuing it'},
] as const;
export type OpportunityForm=Record<typeof opportunityFields[number]['key'],string>&{submission:SubmissionForm;status:OpportunityInput['status']};
export const emptyOpportunity:OpportunityInput={address:'',city:'',county:'',state:'',postalCode:'',propertyType:'',submission:emptySubmission,closingTarget:null,accessNotes:'',status:'reviewing',reviewNote:''};
export function opportunityForm(value:OpportunityInput=emptyOpportunity):OpportunityForm {return {...Object.fromEntries(opportunityFields.map(field=>[field.key,String(value[field.key]??'')])),status:value.status,submission:submissionForm(value.submission)} as OpportunityForm;}
export function parseOpportunityForm(form:OpportunityForm):OpportunityInput {return {...form,address:form.address.trim(),city:form.city.trim(),state:form.state.trim().toUpperCase(),closingTarget:form.closingTarget.trim()||null,submission:parseSubmissionForm(form.submission)};}

export function opportunityFieldLabel(key:string):string {return [...opportunityFields,...submissionFields].find(field=>field.key===key)?.label??(key==='status'?'Internal review state':key==='occupancy'?'Reported occupancy':key);}
