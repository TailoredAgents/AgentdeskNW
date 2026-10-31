export type ConnectionCapability='crm.read'|'crm.write'|'email.activity.read'|'email.body.read'|'email.draft'|'email.send'|'sms.read'|'sms.send';
export interface ConnectionPreparation {
 id:string;provider:'salesforce'|'gmail'|'outlook'|'twilio';version:number;mode:'demo'|'live';
 state:'prepared'|'disconnected';capabilities:ConnectionCapability[];liveReady:false;
 stagedRecords:number;notice:string;
}
export interface WorkspaceReadiness {
 mode:'fictional-demonstration';companyDataReady:false;
 connections:ConnectionPreparation[];
 gates:{id:string;title:string;status:'prepared'|'required';detail:string}[];
 workers:{lane:string;state:'healthy'|'busy'|'stale'|'failed'|'not_seen';lastSuccessAt:string|null}[];
}
