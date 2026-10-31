import type {Artifact} from './contracts';
export const proactiveTopics=['replies','tasks','jobs','handoffs','transactions'] as const;
export type ProactiveTopic=typeof proactiveTopics[number];
export const proactiveTopicLabels:Record<ProactiveTopic,string>={replies:'Investor replies',tasks:'Follow-ups and deadlines',jobs:'Saved work and decisions',handoffs:'Deal handoffs',transactions:'Shared transactions'};
export interface ProactivePreferences {version:number;enabled:boolean;timeZone:string;times:string[];weekdays:number[];topics:ProactiveTopic[];watchChanges:boolean;preferredChannel:'app'|'sms'|'slack';updatedAt:string|null}
export interface ProactiveItem {key:string;topic:ProactiveTopic;title:string;detail:string;reference:string;artifact:Artifact;watchEligible:boolean}
export type ProactiveDeliveryStatus='in_app'|'connection_required'|'queued'|'dispatching'|'accepted'|'service_received'|'delivered'|'unknown'|'failed'|'canceled'|'expired';
export const proactiveDeliveryLabels:Record<ProactiveDeliveryStatus,string>={in_app:'Saved in AgentDesk',connection_required:'Saved · channel setup needed',queued:'Queued for chosen channel',dispatching:'Delivery in progress',accepted:'Accepted by provider',service_received:'Received by push service',delivered:'Provider reports delivered',unknown:'Delivery unconfirmed · not resent',failed:'Delivery failed · saved here',canceled:'Delivery canceled · saved here',expired:'Delivery expired · saved here'};
export interface ProactiveUpdate {id:string;kind:'briefing'|'changes';createdAt:string;read:boolean;title:string;items:ProactiveItem[];withheldCount:number;channel:ProactivePreferences['preferredChannel'];delivery:ProactiveDeliveryStatus;summary:string}
export interface ProactiveState {preferences:ProactivePreferences;updates:ProactiveUpdate[];current:ProactiveItem[];notice:string}
export interface SaveProactivePreferences extends Omit<ProactivePreferences,'version'|'updatedAt'> {expectedVersion:number;eventKey:string}

export const proactiveTimeZones=[{id:'America/New_York',label:'Eastern'},{id:'America/Chicago',label:'Central'},{id:'America/Denver',label:'Mountain'},{id:'America/Phoenix',label:'Arizona'},{id:'America/Los_Angeles',label:'Pacific'},{id:'Pacific/Honolulu',label:'Hawaii'},{id:'UTC',label:'UTC'}];
