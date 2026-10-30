export type MobileNoticeKind='cost_approval'|'completed'|'needs_attention';
export type MobileNoticeStatus='queued'|'dispatching'|'accepted'|'service_received'|'failed'|'unknown'|'canceled'|'expired';
export interface MobileNoticeSummary {id:string;workRunId:string;kind:MobileNoticeKind;status:MobileNoticeStatus;createdAt:string;updatedAt:string}
export interface MobileNotificationState {registered:boolean;enabled:boolean;platform:'ios'|'android'|null;sendingEnabled:boolean;notice:string;recent:MobileNoticeSummary[]}
export interface MobilePushRegistrationInput {enabled:boolean;expoPushToken?:string;platform?:'ios'|'android'}
