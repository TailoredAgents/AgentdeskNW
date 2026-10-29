export interface MessagingState {
 enabled:boolean; sendingEnabled:boolean; conversationId:string|null;
 providers:{id:'slack'|'sms';configured:boolean;accountLabel:string;transport:string;entitled:boolean}[];
 links:{id:string;provider:'slack'|'sms';destination:string;active:boolean;optedOut:boolean;reminders:boolean;createdAt:string}[];
 activity:{id:string;provider:'slack'|'sms';kind:string;status:string;providerStatus:string|null;createdAt:string;errorCode:string|null}[];
}
