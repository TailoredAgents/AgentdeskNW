CREATE TABLE auto_topup_settings (
 organization_id TEXT NOT NULL, user_id TEXT NOT NULL, office_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(organization_id,user_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE auto_topup_purchases (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,user_id TEXT NOT NULL,office_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','unknown','succeeded','failed')),
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE UNIQUE INDEX auto_topup_one_pending ON auto_topup_purchases(organization_id,user_id) WHERE status IN ('pending','unknown');
CREATE INDEX auto_topup_owner ON auto_topup_purchases(organization_id,user_id);
CREATE TABLE auto_topup_events (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,user_id TEXT NOT NULL,office_id TEXT NOT NULL,
 event_key TEXT NOT NULL,payload_hash TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),created_at TEXT NOT NULL,
 UNIQUE(organization_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER auto_topup_events_no_update BEFORE UPDATE ON auto_topup_events BEGIN SELECT RAISE(ABORT,'Automatic purchase events are append-only'); END;
CREATE TRIGGER auto_topup_events_no_delete BEFORE DELETE ON auto_topup_events BEGIN SELECT RAISE(ABORT,'Automatic purchase events are append-only'); END;
