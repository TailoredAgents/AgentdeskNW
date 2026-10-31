CREATE TABLE acquisition_opportunities (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX acquisition_opportunity_scope ON acquisition_opportunities(organization_id,office_id,owner_id);
CREATE TABLE acquisition_opportunity_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, opportunity_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,actor_id,event_key),
 FOREIGN KEY(organization_id,office_id,actor_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,opportunity_id) REFERENCES acquisition_opportunities(organization_id,office_id,id)
);
CREATE INDEX acquisition_opportunity_history ON acquisition_opportunity_events(organization_id,office_id,opportunity_id,created_at);
