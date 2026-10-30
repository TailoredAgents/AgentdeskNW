CREATE TABLE work_budgets (
 run_id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE work_budget_events (
 id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL REFERENCES work_budgets(run_id),
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 UNIQUE(run_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX work_budgets_owner ON work_budgets(organization_id,office_id,user_id);
CREATE TRIGGER work_budget_events_no_update BEFORE UPDATE ON work_budget_events BEGIN SELECT RAISE(ABORT,'Job budget events are immutable'); END;
CREATE TRIGGER work_budget_events_no_delete BEFORE DELETE ON work_budget_events BEGIN SELECT RAISE(ABORT,'Job budget events are immutable'); END;
