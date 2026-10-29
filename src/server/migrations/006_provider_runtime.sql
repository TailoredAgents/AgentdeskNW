CREATE TABLE provider_operations (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 operation_id TEXT NOT NULL, provider_response_id TEXT, data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(organization_id,office_id,user_id,operation_id)
);
CREATE UNIQUE INDEX provider_response_once ON provider_operations(organization_id,office_id,user_id,provider_response_id) WHERE provider_response_id IS NOT NULL;
CREATE TABLE assistant_turns (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 request_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(id),
 request_hash TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, result TEXT,
 PRIMARY KEY(organization_id,office_id,user_id,request_id)
);
CREATE UNIQUE INDEX assistant_active_conversation ON assistant_turns(conversation_id) WHERE status='running';
CREATE TABLE assistant_tool_receipts (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id), call_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)),
 PRIMARY KEY(organization_id,office_id,user_id,conversation_id,call_id)
);
CREATE TABLE assistant_context (
 conversation_id TEXT PRIMARY KEY REFERENCES conversations(id), scope_hash TEXT NOT NULL,
 items TEXT NOT NULL CHECK(json_valid(items)), updated_at TEXT NOT NULL
);
