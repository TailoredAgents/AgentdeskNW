CREATE TABLE opportunity_handoff_coordination (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, release_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,release_id), UNIQUE(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,release_id) REFERENCES acquisition_opportunities(organization_id,office_id,id)
);
CREATE TABLE opportunity_handoff_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, handoff_id TEXT NOT NULL, action TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,actor_id,event_key),
 FOREIGN KEY(organization_id,office_id,actor_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,handoff_id) REFERENCES opportunity_handoff_coordination(organization_id,office_id,id)
);
CREATE INDEX opportunity_handoff_history ON opportunity_handoff_events(organization_id,office_id,handoff_id,created_at);
CREATE TRIGGER opportunity_handoff_events_no_update BEFORE UPDATE ON opportunity_handoff_events BEGIN SELECT RAISE(ABORT,'Handoff events are immutable'); END;
CREATE TRIGGER opportunity_handoff_events_no_delete BEFORE DELETE ON opportunity_handoff_events BEGIN SELECT RAISE(ABORT,'Handoff events are immutable'); END;
