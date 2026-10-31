CREATE TABLE metered_assignments (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 assignment_key TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,user_id,assignment_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE metered_assignment_events (
 id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL REFERENCES metered_assignments(id),
 organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 event_key TEXT NOT NULL,payload_hash TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),created_at TEXT NOT NULL,
 UNIQUE(assignment_id,event_key)
);
CREATE TABLE metered_response_claims (
 provider TEXT NOT NULL,response_id TEXT NOT NULL,assignment_id TEXT NOT NULL REFERENCES metered_assignments(id),attempt_id TEXT NOT NULL,
 PRIMARY KEY(provider,response_id)
);
CREATE TRIGGER metered_assignment_events_no_update BEFORE UPDATE ON metered_assignment_events BEGIN SELECT RAISE(ABORT,'Metered assignment events are append-only'); END;
CREATE TRIGGER metered_assignment_events_no_delete BEFORE DELETE ON metered_assignment_events BEGIN SELECT RAISE(ABORT,'Metered assignment events are append-only'); END;
