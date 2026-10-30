CREATE TABLE work_runs (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 status TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), plan_version INTEGER NOT NULL CHECK(plan_version>0),
 lease_token TEXT, lease_expires_at TEXT, lease_step_key TEXT,
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,owner_id,request_id),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX work_runs_owner ON work_runs(organization_id,office_id,owner_id,created_at);
CREATE INDEX work_runs_pending ON work_runs(status,lease_expires_at,updated_at);
CREATE TABLE work_run_plans (
 run_id TEXT NOT NULL REFERENCES work_runs(id), plan_version INTEGER NOT NULL,
 plan_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 PRIMARY KEY(run_id,plan_version)
);
CREATE TABLE work_run_events (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES work_runs(id),
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL
);
CREATE INDEX work_run_events_run ON work_run_events(run_id,created_at);
CREATE TABLE work_run_commands (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 event_key TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES work_runs(id), payload_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,owner_id,event_key)
);
CREATE TABLE work_step_receipts (
 run_id TEXT NOT NULL REFERENCES work_runs(id), step_key TEXT NOT NULL,
 plan_version INTEGER NOT NULL, payload_hash TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 PRIMARY KEY(run_id,step_key)
);
CREATE TRIGGER work_plans_no_update BEFORE UPDATE ON work_run_plans BEGIN SELECT RAISE(ABORT,'Work plans are immutable'); END;
CREATE TRIGGER work_plans_no_delete BEFORE DELETE ON work_run_plans BEGIN SELECT RAISE(ABORT,'Work plans are immutable'); END;
CREATE TRIGGER work_events_no_update BEFORE UPDATE ON work_run_events BEGIN SELECT RAISE(ABORT,'Work events are immutable'); END;
CREATE TRIGGER work_events_no_delete BEFORE DELETE ON work_run_events BEGIN SELECT RAISE(ABORT,'Work events are immutable'); END;
CREATE TRIGGER work_receipts_no_update BEFORE UPDATE ON work_step_receipts BEGIN SELECT RAISE(ABORT,'Work receipts are immutable'); END;
CREATE TRIGGER work_receipts_no_delete BEFORE DELETE ON work_step_receipts BEGIN SELECT RAISE(ABORT,'Work receipts are immutable'); END;
