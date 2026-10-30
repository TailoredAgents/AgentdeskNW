CREATE TABLE task_action_receipts (
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 event_key TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES tasks(id),
 request_hash TEXT NOT NULL,
 result_version INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
