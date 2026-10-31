CREATE TABLE proactive_preferences (
 organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),cursor TEXT NOT NULL CHECK(json_valid(cursor)),
 PRIMARY KEY(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE proactive_updates (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 dedupe_key TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,user_id,dedupe_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE proactive_events (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 event_key TEXT NOT NULL,payload_hash TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,user_id,event_key)
);
CREATE TRIGGER proactive_events_no_update BEFORE UPDATE ON proactive_events BEGIN SELECT RAISE(ABORT,'Proactive events are append-only'); END;
CREATE TRIGGER proactive_events_no_delete BEFORE DELETE ON proactive_events BEGIN SELECT RAISE(ABORT,'Proactive events are append-only'); END;
