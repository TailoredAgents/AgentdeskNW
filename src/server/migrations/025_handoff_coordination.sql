CREATE TABLE handoff_coordination (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, release_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,release_id), UNIQUE(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,release_id) REFERENCES property_releases(organization_id,office_id,id)
);
CREATE TABLE handoff_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, handoff_id TEXT NOT NULL, action TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,actor_id,event_key),
 FOREIGN KEY(organization_id,office_id,actor_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,handoff_id) REFERENCES handoff_coordination(organization_id,office_id,id)
);
CREATE INDEX handoff_event_history ON handoff_events(organization_id,office_id,handoff_id,created_at);
