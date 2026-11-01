/** Fail closed on an attempted production/multi-host configuration; SQLite is a single-host demo. */
export function assertSupportedStorageConfiguration(env:Record<string,string|undefined>=process.env){
 if(env.AGENTDESK_AUTH_MODE&&!['demo','company_oidc'].includes(env.AGENTDESK_AUTH_MODE))throw new Error('The selected identity adapter is not implemented.');
 if(env.AGENTDESK_DATA_MODE&&env.AGENTDESK_DATA_MODE!=='demo')throw new Error('Company data mode requires managed identity, approved connectors and production persistence. This build supports demo data only.');
 if(env.AGENTDESK_STORAGE&&env.AGENTDESK_STORAGE!=='sqlite')throw new Error('The selected storage adapter is not implemented. PostgreSQL migration must be verified before company rollout.');
 if(env.AGENTDESK_INSTANCE_COUNT&&env.AGENTDESK_INSTANCE_COUNT!=='1')throw new Error('SQLite demonstration storage supports one application host only.');
}
