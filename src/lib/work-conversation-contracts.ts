export type WorkConversationChannel='web'|'mobile'|'sms'|'slack';
export interface WorkConversationOptions {channel?:WorkConversationChannel;receivedAt?:string}
export interface WorkConversationCostReview {
 code:string;runId:string;runVersion:number;planVersion:number;quoteId:string;maximumCents:number;
 expiresAt:string;approveCommand:string;denyCommand:string;
}
