import type {Actor,Role} from './contracts';
export interface MobileSession {
 id:string;organizationId:string;officeId:string;userId:string;role:Role;deviceName:string;
 createdAt:string;expiresAt:string;revokedAt:string|null;
}
export interface MobileConnection {
 actor:Actor;conversationId:string;expiresAt:string;sessionId:string;
}
export interface MobilePairResult extends MobileConnection {token:string}
export interface MobilePairing {code:string;expiresAt:string}
export interface MobileDevices {devices:Pick<MobileSession,'id'|'deviceName'|'createdAt'|'expiresAt'|'revokedAt'>[];mode:'demonstration'}
