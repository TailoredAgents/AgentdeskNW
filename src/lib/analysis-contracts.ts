export type AnalysisLens='investment'|'diligence';
export type AnalysisStrategy='flip'|'rental';
export type AnalysisSourceKind='property'|'opportunity';
export type AssumptionGroup='purchase'|'repairs'|'exit'|'rental'|'finance';
export interface AssumptionEvidence {reference:string;asOf:string|null}
export const analysisFields=[
 {key:'purchasePrice',label:'Purchase price',group:'purchase',unit:'USD',hint:'Proposed purchase price; not automatically the inventory asking price'},
 {key:'purchaseCosts',label:'Purchase costs and fees',group:'purchase',unit:'USD',hint:'Acquisition fees, closing costs and initial costs not listed elsewhere'},
 {key:'repairLow',label:'Repair range — low',group:'repairs',unit:'USD',hint:'Supported scope estimate before contingency'},
 {key:'repairHigh',label:'Repair range — high',group:'repairs',unit:'USD',hint:'Supported scope estimate before contingency'},
 {key:'contingencyPercent',label:'Repair contingency',group:'repairs',unit:'%',hint:'Explicit allowance applied to the repair range; zero must be deliberate'},
 {key:'salePriceLow',label:'Resale assumption — low',group:'exit',unit:'USD',hint:'A supplied scenario assumption, not an appraised value'},
 {key:'salePriceHigh',label:'Resale assumption — high',group:'exit',unit:'USD',hint:'A supplied scenario assumption, not an appraised value'},
 {key:'sellingCostPercent',label:'Selling costs',group:'exit',unit:'%',hint:'Total selling costs as a percentage of the assumed sale price'},
 {key:'holdingMonths',label:'Holding period',group:'exit',unit:'months',hint:'Whole months from purchase through sale'},
 {key:'monthlyHoldingCosts',label:'Monthly holding costs',group:'exit',unit:'USD/month',hint:'Taxes, insurance, utilities and other carrying costs; exclude debt payments'},
 {key:'monthlyRent',label:'Monthly scheduled rent',group:'rental',unit:'USD/month',hint:'Supported stabilized rent before vacancy'},
 {key:'vacancyPercent',label:'Vacancy and credit loss',group:'rental',unit:'%',hint:'Reduction from scheduled rent'},
 {key:'monthlyOperatingCosts',label:'Monthly operating expenses',group:'rental',unit:'USD/month',hint:'Taxes, insurance, management, maintenance and other operations; exclude debt and capital reserves'},
 {key:'monthlyCapitalReserve',label:'Monthly capital reserve',group:'rental',unit:'USD/month',hint:'Capital replacement allowance, separate from operating expenses'},
 {key:'loanAmount',label:'Initial loan principal',group:'finance',unit:'USD',hint:'Assumes full principal advanced at purchase; no rehab draws or refinance'},
 {key:'annualInterestPercent',label:'Annual interest rate',group:'finance',unit:'%',hint:'Fixed nominal annual rate, calculated monthly'},
 {key:'loanPointsPercent',label:'Origination points',group:'finance',unit:'%',hint:'Upfront charge as a percentage of initial principal'},
 {key:'amortizationYears',label:'Amortization period',group:'finance',unit:'years',hint:'Whole years for a fully amortizing loan'},
] as const;
export type AnalysisField=typeof analysisFields[number]['key'];
export interface ComparableInput {
 address:string;status:'sold'|'pending'|'active';soldOn:string|null;price:number|null;sqft:number|null;propertyType:string;distanceMiles:number|null;
 adjustment:number;adjustmentReason:string;sourceReference:string;include:boolean;exclusionReason:string;
}
export interface AnalysisInput {
 label:string;lens:AnalysisLens;strategy:AnalysisStrategy;sourceKind:AnalysisSourceKind;sourceId:string;investorId:string|null;
 financing:'unspecified'|'cash'|'interest_only'|'amortizing';values:Record<AnalysisField,number|null>;
 sources:Record<AssumptionGroup,AssumptionEvidence>;comparables:ComparableInput[];notes:string;
}
export interface AnalysisSubject {id:string;kind:AnalysisSourceKind;address:string;propertyType:string;sqft:number|null;askingPrice:number|null;sourceReference:string;status:string;sourceFingerprint:string}
export interface AnalysisMetric {label:string;value:number|null;unit:'USD'|'%'|'ratio';formula:string}
export interface AnalysisCase {label:string;assumptions:string;metrics:AnalysisMetric[]}
export interface AnalysisResult {
 method:string;asOf:string;summary:string;missing:string[];warnings:string[];questions:string[];
 metrics:AnalysisMetric[];cases:AnalysisCase[];comparables:{input:ComparableInput;included:boolean;reasons:string[];adjustedPrice:number|null;pricePerSqft:number|null}[];
 comparableRange:{low:number;high:number;count:number}|null;notice:string;
}
export interface SavedAnalysis {id:string;ownerId:string;version:number;createdAt:string;updatedAt:string;input:AnalysisInput;subject:AnalysisSubject;result:AnalysisResult;synthetic:true}
export interface AnalysisDetail {record:Omit<SavedAnalysis,'result'>;result:AnalysisResult|null;sourceChanged:boolean;canEdit:boolean;analysisAccessReference:string;history:{version:number;recordedAt:string;label:string;input:AnalysisInput}[]}
export interface AnalysisBoard {items:{id:string;label:string;version:number;strategy:AnalysisStrategy;lens:AnalysisLens;address:string}[];subjects:AnalysisSubject[];lenses:AnalysisLens[];canCreate:boolean;analysisAccessReference:string}
export interface AnalysisPreview {id:string|null;expectedVersion:number;input:AnalysisInput;subject:AnalysisSubject;result:AnalysisResult;reviewReference:string}
export interface AnalysisSave {id:string|null;expectedVersion:number;input:AnalysisInput;eventKey:string;reviewReference:string}
export const emptyComparable:ComparableInput={address:'',status:'sold',soldOn:null,price:null,sqft:null,propertyType:'',distanceMiles:null,adjustment:0,adjustmentReason:'',sourceReference:'',include:true,exclusionReason:''};
export function emptyAnalysis(lens:AnalysisLens='investment'):AnalysisInput {return {label:'',lens,strategy:'flip',sourceKind:'property',sourceId:'',investorId:null,financing:'unspecified',values:Object.fromEntries(analysisFields.map(f=>[f.key,null])) as AnalysisInput['values'],sources:Object.fromEntries(['purchase','repairs','exit','rental','finance'].map(key=>[key,{reference:'',asOf:null}])) as AnalysisInput['sources'],comparables:[],notes:''};}
export type AnalysisForm=Omit<AnalysisInput,'values'|'sources'|'comparables'>&{values:Record<AnalysisField,string>;sources:Record<AssumptionGroup,{reference:string;asOf:string}>;comparables:(Omit<ComparableInput,'soldOn'|'price'|'sqft'|'distanceMiles'|'adjustment'>&{soldOn:string;price:string;sqft:string;distanceMiles:string;adjustment:string})[]};
export function analysisForm(input=emptyAnalysis()):AnalysisForm{return {...input,values:Object.fromEntries(analysisFields.map(f=>[f.key,String(input.values[f.key]??'')])) as AnalysisForm['values'],sources:Object.fromEntries(Object.entries(input.sources).map(([key,value])=>[key,{reference:value.reference,asOf:value.asOf??''}])) as AnalysisForm['sources'],comparables:input.comparables.map(item=>({...item,soldOn:item.soldOn??'',price:String(item.price??''),sqft:String(item.sqft??''),distanceMiles:String(item.distanceMiles??''),adjustment:String(item.adjustment)}))};}
export function parseAnalysisForm(form:AnalysisForm):AnalysisInput {
 const numeric=(value:string,signed=false)=>{if(!value.trim())return null;if(!(signed?/^-?\d+(\.\d{1,4})?$/:/^\d+(\.\d{1,4})?$/).test(value.trim()))throw new Error('Use numbers without commas or currency symbols. Only comparable adjustments may be negative.');const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e9)throw new Error('An amount is outside the supported range.');return n;};
 return {...form,values:Object.fromEntries(analysisFields.map(f=>[f.key,numeric(form.values[f.key])])) as AnalysisInput['values'],sources:Object.fromEntries(Object.entries(form.sources).map(([key,value])=>[key,{reference:value.reference.trim(),asOf:value.asOf.trim()||null}])) as AnalysisInput['sources'],comparables:form.comparables.map(item=>({...item,soldOn:item.soldOn.trim()||null,price:numeric(item.price),sqft:numeric(item.sqft),distanceMiles:numeric(item.distanceMiles),adjustment:numeric(item.adjustment,true)??0}))};
}
export function analysisGroups(input:Pick<AnalysisInput,'strategy'|'financing'>):AssumptionGroup[]{return ['purchase','repairs',input.strategy==='flip'?'exit':'rental',...(input.financing!=='cash'?['finance' as const]:[])];}
export function visibleAnalysisFields(input:Pick<AnalysisInput,'strategy'|'financing'>){const groups=analysisGroups(input);return analysisFields.filter(field=>groups.includes(field.group)&&!(field.key==='amortizationYears'&&input.financing!=='amortizing'));}
export function formatAnalysisMetric(metric:AnalysisMetric):string {if(metric.value===null)return 'Not calculable';return metric.unit==='USD'?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(metric.value):`${metric.value.toLocaleString('en-US',{maximumFractionDigits:2})}${metric.unit==='%'?'%':'×'}`;}
