import type {Role} from './contracts';
import type {WorkspaceDestination} from './workspace-links';

export const managementMetricIds=['relationships','followups','overdue','opportunities','blocked','review','unassigned','changed','resolved','inventory'] as const;
export type ManagementMetricId=typeof managementMetricIds[number];
export interface ManagementQuery {role?:Role|null;employeeId?:string|null;metric?:ManagementMetricId|null;offset?:number|null}
export interface ManagementMetric {id:ManagementMetricId;label:string;value:number|null;definition:string;denominator:number|null}
export interface ManagementEvidence {
 key:string;kind:'relationship'|'followup'|'opportunity'|'handoff'|'inventory';title:string;
 ownerId:string|null;ownerName:string;role:Role|null;status:string;dueAt:string|null;
 reason:string;nextStep:string;metrics:ManagementMetricId[];destination:WorkspaceDestination;
}
export interface ManagementReport {
 version:1;synthetic:true;checkedAt:string;office:string;scope:string;summary:string;
 managementAccessReference:string;query:ManagementQuery;
 metrics:ManagementMetric[];
 employees:Array<{id:string;name:string;role:Role;counts:Record<ManagementMetricId,number|null>}>;
 records:ManagementEvidence[];page:{offset:number;size:number;total:number;hasMore:boolean};
 handoffs:{handoffAccessReference:string;summary:string};
 coverage:{basis:string;opportunities:'available'|'restricted';excluded:string[];unavailable:string[];usage:string};
}
