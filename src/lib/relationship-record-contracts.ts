export const relationshipTopics = {
 budget:'Purchase budget', geography:'Target locations', strategy:'Investment strategy',
 financing:'Financing', rehab:'Renovation tolerance', timing:'Purchase timing', contact:'Contact preference',
} as const;
export type RelationshipTopic=keyof typeof relationshipTopics;
export type RelationshipValue={min:number|null;max:number|null}|string[];
export interface RelationshipReportInput {
 investorId:string;buyBoxId:string|null;topic:RelationshipTopic;value:RelationshipValue;
 statement:string;statedAt:string|null;supersedesId:string|null;expectedVersion:number;expectedContext:string;eventKey:string;
}
export interface RelationshipReport extends Omit<RelationshipReportInput,'expectedVersion'|'expectedContext'|'eventKey'> {
 id:string;recordedAt:string;recordedBy:string;verification:'employee_reported';
 status:'active'|'superseded';supersededById:string|null;
}
export interface RelationshipFactSource {
 id:string;label:string;value:RelationshipValue;displayValue:string;statement:string;
 recordedAt:string|null;statedAt:string|null;verification:'seeded_demo'|'reviewed_record'|'employee_reported';
 freshness:'recent'|'review_due'|'undated';sourceKind:'recorded_criteria'|'employee_report';
}
export interface RelationshipFact {
 key:string;topic:RelationshipTopic;label:string;buyBoxId:string|null;scopeLabel:string;
 recorded:RelationshipFactSource|null;reports:RelationshipFactSource[];
 status:'recorded'|'reported'|'needs_clarification'|'unknown';
 question:string|null;reconfirmAfterDays:number;
}
export interface RelationshipRecord {
 investorId:string;version:number;contextVersion:string;generatedAt:string;facts:RelationshipFact[];reports:RelationshipReport[];
 conflicts:RelationshipFact[];reviewDue:RelationshipFact[];undated:RelationshipFact[];
 canEdit:boolean;notice:string;policy:{version:'relationship-record-v1';provisional:true};
}
