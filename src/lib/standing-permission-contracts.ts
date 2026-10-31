export interface StandingPermission {
 id:string;version:number;state:'active'|'revoked'|'blocked'|'expired'|'exhausted';
 title:string;expiresAt:string;maxActions:number;usedActions:number;cooldownHours:number;dueHours:number;
 budgetCents:0;action:'personal_followup_on_reply';restricted:boolean;simulation:true;
}
export interface StandingPermissionState {
 permissions:StandingPermission[];
 preview:{scopeToken:string;title:string;expiresAt:string;maxActions:number;cooldownHours:number;dueHours:number}|null;
 notice:string;
}
export const standingPermissionNotice='For new incoming replies in this conversation only: save a personal follow-up, due in 24 hours, at most once every 6 hours. Up to 10 follow-ups over 7 days. No AI charge, customer messages, CRM changes or approval of paid work. You can revoke this permission at any time.';
