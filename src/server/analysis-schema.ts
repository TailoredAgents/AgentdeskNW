import {z} from 'zod';
import {analysisFields,type AnalysisField} from '../lib/analysis-contracts';
const amount=z.number().finite().nonnegative().max(1e9).nullable(),text=z.string().trim().max(2000),pastDate=z.iso.date().nullable().refine(value=>!value||value<=new Date().toISOString().slice(0,10),'Evidence dates cannot be in the future.');
const fieldSchema=Object.fromEntries(analysisFields.map(field=>[field.key,field.unit==='%'?z.number().finite().min(0).max(field.key==='annualInterestPercent'?60:100).nullable():field.key==='holdingMonths'?z.number().int().min(1).max(120).nullable():field.key==='amortizationYears'?z.number().int().min(1).max(40).nullable():amount])) as Record<AnalysisField,z.ZodNullable<z.ZodNumber>>;
const evidence=z.object({reference:z.string().trim().max(500),asOf:pastDate}).strict();
export const analysisInputSchema=z.object({
 label:z.string().trim().min(3).max(160),lens:z.enum(['investment','diligence']),strategy:z.enum(['flip','rental']),sourceKind:z.enum(['property','opportunity']),sourceId:z.string().min(1).max(150),investorId:z.string().min(1).max(150).nullable(),
 financing:z.enum(['unspecified','cash','interest_only','amortizing']),values:z.object(fieldSchema).strict(),
 sources:z.object({purchase:evidence,repairs:evidence,exit:evidence,rental:evidence,finance:evidence}).strict(),
 comparables:z.array(z.object({address:z.string().trim().min(3).max(240),status:z.enum(['sold','pending','active']),soldOn:pastDate,price:amount,sqft:amount,propertyType:z.string().trim().max(100),distanceMiles:z.number().finite().nonnegative().max(10000).nullable(),adjustment:z.number().finite().min(-1e9).max(1e9),adjustmentReason:text,sourceReference:z.string().trim().max(500),include:z.boolean(),exclusionReason:text}).strict()).max(12),notes:text,
}).strict().superRefine((input,ctx)=>{
 for(const [low,high] of [['repairLow','repairHigh'],['salePriceLow','salePriceHigh']] as const)if(input.values[low]!==null&&input.values[high]!==null&&input.values[low]>input.values[high])ctx.addIssue({code:'custom',path:['values',low],message:'The low end must not exceed the high end.'});
 if(input.values.purchasePrice===0)ctx.addIssue({code:'custom',path:['values','purchasePrice'],message:'Purchase price must be positive or unknown.'});
});
export const analysisPreviewSchema=z.object({id:z.string().min(1).max(150).nullable(),expectedVersion:z.number().int().nonnegative(),input:analysisInputSchema}).strict();
export const analysisSaveSchema=analysisPreviewSchema.extend({eventKey:z.string().min(1).max(100),reviewReference:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
