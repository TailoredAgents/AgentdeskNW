import type {Role} from './contracts';
import type {WorkspaceDestination} from './workspace-links';

export const managementMetricIds=['relationships','followups','overdue','opportunities','blocked','review','unassigned','changed','resolved','inventory'] as const;
export type ManagementMetricId=typeof managementMetricIds[number];
export const managementActivityIds=['followup_created','followup_completed','opportunity_submitted','opportunity_revised','handoff_assigned','handoff_acknowledged','blocker_reported','completion_reported','handoff_resolved'] as const;
export type ManagementActivityId=typeof managementActivityIds[number];
export interface ManagementQuery {role?:Role|null;employeeId?:string|null;metric?:ManagementMetricId|null;offset?:number|null;period?:'7d'|'30d'|null;activity?:ManagementActivityId|null;activityWindow?:'current'|'previous'|'today'|null;activityOffset?:number|null}
export interface ManagementActivity {key:string;kind:ManagementActivityId;at:string;actorId:string;actorName:string;role:Role;title:string;sourceLabel:string;sourceVersion:number;destination:WorkspaceDestination}
export interface ManagementProgress {
 timeZone:string;days:number;start:string;endExclusive:string;previousStart:string;today:string;firstRecordedAt:string|null;summary:string;coverage:string;
 metrics:Array<{activity:ManagementActivityId;label:string;current:number|null;previous:number|null;today:number|null}>;
 daily:Array<{date:string;count:number}>;
 events:ManagementActivity[];page:{offset:number;size:number;total:number;hasMore:boolean};
 timings:Array<{kind:'acknowledgment'|'review';label:string;sampleCount:number;meanHours:number|null;eventKind:ManagementActivityId}>;
}
export interface ManagementProfile {id:string;name:string;role:Role;focus:string;nextSteps:ManagementEvidence[];undatedFollowups:number;waiting:Array<{label:string;since:string;days:number;destination:WorkspaceDestination}>;gaps:Array<{field:string;label:string;count:number;destinations:WorkspaceDestination[]}>}
export interface ManagementMetric {id:ManagementMetricId;label:string;value:number|null;definition:string;denominator:number|null}
export interface ManagementEvidence {
 key:string;kind:'relationship'|'followup'|'opportunity'|'handoff'|'inventory';title:string;
 ownerId:string|null;ownerName:string;role:Role|null;status:string;dueAt:string|null;
 reason:string;nextStep:string;metrics:ManagementMetricId[];destination:WorkspaceDestination;
}
export interface ManagementReport {
 version:1;synthetic:true;checkedAt:string;office:string;scope:string;summary:string;
 managementAccessReference:string;query:ManagementQuery;
 progress:ManagementProgress;profile:ManagementProfile|null;briefing:Array<{title:string;detail:string;destination:WorkspaceDestination}>;
 metrics:ManagementMetric[];
 employees:Array<{id:string;name:string;role:Role;counts:Record<ManagementMetricId,number|null>}>;
 records:ManagementEvidence[];page:{offset:number;size:number;total:number;hasMore:boolean};
 handoffs:{handoffAccessReference:string;summary:string};
 coverage:{basis:string;opportunities:'available'|'restricted';excluded:string[];unavailable:string[];usage:string};
}
