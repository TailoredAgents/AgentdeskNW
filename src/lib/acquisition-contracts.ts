import type {Property} from './contracts';
export interface AcquisitionSubmission {
 wholesaler:string;sourceReference:string;reportedOn:string|null;askingPrice:number|null;
 repairEstimate:number|null;repairScope:string;repairSource:string;occupancy:'unknown'|'vacant'|'occupied';comparableSources:string;
}
export interface AcquisitionReview {
 property:Property;releaseId:string|null;version:number;status:'none'|'draft'|'released'|'withdrawn';submission:AcquisitionSubmission|null;
 recordedAt:string|null;facts:{label:string;value:string;source:string}[];
 questions:{field:string;question:string;reason:string}[];changes:{field:string;before:string;after:string}[];
 history:{version:number;status:string;recordedAt:string;submission:AcquisitionSubmission|null}[];
 method:{id:'acquisition-intake';version:1;source:string;authority:'provisional';steps:string[]};
 summary:string;handoffDraft:string;canEdit:boolean;notice:string;
}
export const emptySubmission:AcquisitionSubmission={wholesaler:'',sourceReference:'',reportedOn:null,askingPrice:null,repairEstimate:null,repairScope:'',repairSource:'',occupancy:'unknown',comparableSources:''};
export const submissionFields=[
 {key:'wholesaler',label:'Wholesaler / source contact',hint:'Name or company supplied with this opportunity'},
 {key:'sourceReference',label:'Source reference',hint:'For example: fictional wholesaler email, October 30'},
 {key:'reportedOn',label:'Source date (YYYY-MM-DD)',hint:'Leave blank if the original date is unknown'},
 {key:'askingPrice',label:'Supplied asking price',hint:'Number only; leave blank if unknown'},
 {key:'repairEstimate',label:'Supplied repair estimate',hint:'An unverified assumption, not a valuation'},
 {key:'repairScope',label:'Repair scope',hint:'What work does the estimate cover?'},
 {key:'repairSource',label:'Repair evidence / date',hint:'Who provided it, when, and what can be reviewed?'},
 {key:'comparableSources',label:'Comparable sources',hint:'References supplied for review; links are not fetched'},
] as const;
export type SubmissionForm=Record<typeof submissionFields[number]['key'],string>&{occupancy:AcquisitionSubmission['occupancy']};
export function submissionForm(value:AcquisitionSubmission|null):SubmissionForm {const source=value??emptySubmission;return Object.fromEntries([...submissionFields.map(field=>[field.key,String(source[field.key]??'')]),['occupancy',source.occupancy]]) as SubmissionForm;}
export function parseSubmissionForm(form:SubmissionForm):AcquisitionSubmission {
 const number=(text:string)=>{if(!text.trim())return null;if(!/^\d+(\.\d{1,2})?$/.test(text.trim()))throw new Error('Use positive numbers without commas or currency symbols.');const value=Number(text);if(!Number.isFinite(value)||value>1e9)throw new Error('The supplied amount is outside the supported range.');return value;};
 return {...form,wholesaler:form.wholesaler.trim(),sourceReference:form.sourceReference.trim(),reportedOn:form.reportedOn.trim()||null,askingPrice:number(form.askingPrice),repairEstimate:number(form.repairEstimate)};
}
