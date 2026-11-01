/** Read-only fictional source inspection. These rows are not confirmed CRM facts. */
export interface SalesforceSourceRecord {
 externalId:string;revision:number;name:string;company:string|null;email:string|null;
 match:'possible_match'|'ambiguous'|'unmatched';
}
export interface SalesforceSourceView {
 state:'not_prepared'|'ready'|'disconnected';snapshot:string|null;
 stage:'empty'|'initial'|'changes';records:SalesforceSourceRecord[];
 withdrawn:number;lastSyncedAt:string|null;notice:string;
}
