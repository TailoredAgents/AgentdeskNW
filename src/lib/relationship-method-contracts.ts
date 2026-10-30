import type {Role} from './contracts';
export type RelationshipMethodId='qualification'|'objections'|'reactivation'|'follow-through';
export interface RelationshipMethod {
 id:RelationshipMethodId;version:number;title:string;status:'active'|'withdrawn';effectiveAt:string;
 roles:Role[];authority:'provisional';source:{title:string;document:string;revision:string;owner:string};
 objective:string;steps:string[];requiredFacts:string[];limits:string[];
}
export interface RelationshipGuidance {
 method:RelationshipMethod;question:string;checks:string[];evidenceIds:string[];missingFacts:string[];
 notice:string;
}
