CREATE TABLE mobile_push_devices (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL UNIQUE REFERENCES mobile_sessions(id),
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 expo_push_token TEXT UNIQUE,
 platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL, enabled_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX mobile_push_owner ON mobile_push_devices(organization_id,office_id,user_id);
CREATE TABLE mobile_push_outbox (
 id TEXT PRIMARY KEY,
 device_id TEXT NOT NULL REFERENCES mobile_push_devices(id),
 work_run_id TEXT NOT NULL REFERENCES work_runs(id),
 plan_version INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('cost_approval','completed','needs_attention')),
 status TEXT NOT NULL CHECK(status IN ('queued','dispatching','accepted','service_received','failed','unknown','canceled','expired')),
 ticket_id TEXT UNIQUE, error_code TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reconcile_at TEXT,
 UNIQUE(device_id,work_run_id,plan_version,kind)
);
CREATE INDEX mobile_push_pending ON mobile_push_outbox(status,updated_at);
