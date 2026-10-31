import type {WorkBudget} from './wallet-contracts';
export type UsageUnits=Record<string,number>;
export interface MeteredPart {key:string;parentKey?:string;feature:string;rateId:string;maximumCalls:number;maximumUnits:UsageUnits;estimatedUnits:UsageUnits}
export interface MeteredRate {id:string;provider:string;model:string;basis:'test_fixture';customerMicrosPerUnit:UsageUnits;source:string}
export interface MeteredAttempt {
 id:string;partKey:string;requestHash:string;bounds:UsageUnits;rate:MeteredRate;
 status:'dispatched'|'unknown'|'succeeded'|'failed'|'canceled';usage:UsageUnits|null;
 responseId:string|null;customerMicros:number|null;providerCostMicros:number|null;
 receiptHash:string|null;discrepancy:string|null;createdAt:string;updatedAt:string;
}
export interface MeteredAssignment {
 id:string;assignmentKey:string;title:string;scopeHash:string;revision:number;parts:MeteredPart[];
 rates:MeteredRate[];attempts:MeteredAttempt[];status:'quoted'|'active'|'reconciling'|'paused'|'completed'|'canceled';
 stopRequested?:'completed'|'canceled';budget:WorkBudget;customerMicros:number;providerCostMicros:number|null;unbilledMicros:number;
 createdAt:string;updatedAt:string;simulation:true;
}
