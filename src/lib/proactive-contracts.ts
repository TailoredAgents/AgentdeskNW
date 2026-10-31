import type {Artifact} from './contracts';
export const proactiveTopics=['replies','tasks','jobs','handoffs'] as const;
export type ProactiveTopic=typeof proactiveTopics[number];
export const proactiveTopicLabels:Record<ProactiveTopic,string>={replies:'Investor replies',tasks:'Follow-ups and deadlines',jobs:'Saved work and decisions',handoffs:'Deal handoffs'};
export interface ProactivePreferences {version:number;enabled:boolean;timeZone:string;times:string[];weekdays:number[];topics:ProactiveTopic[];watchChanges:boolean;preferredChannel:'app'|'sms'|'slack';updatedAt:string|null}
export interface ProactiveItem {key:string;topic:ProactiveTopic;title:string;detail:string;reference:string;artifact:Artifact;watchEligible:boolean}
export interface ProactiveUpdate {id:string;kind:'briefing'|'changes';createdAt:string;read:boolean;title:string;items:ProactiveItem[];withheldCount:number;channel:ProactivePreferences['preferredChannel'];delivery:'in_app'|'connection_required';summary:string}
export interface ProactiveState {preferences:ProactivePreferences;updates:ProactiveUpdate[];current:ProactiveItem[];notice:string}
export interface SaveProactivePreferences extends Omit<ProactivePreferences,'version'|'updatedAt'> {expectedVersion:number;eventKey:string}

export const proactiveTimeZones=[{id:'America/New_York',label:'Eastern'},{id:'America/Chicago',label:'Central'},{id:'America/Denver',label:'Mountain'},{id:'America/Phoenix',label:'Arizona'},{id:'America/Los_Angeles',label:'Pacific'},{id:'Pacific/Honolulu',label:'Hawaii'},{id:'UTC',label:'UTC'}];
