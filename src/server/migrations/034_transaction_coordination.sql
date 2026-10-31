CREATE TABLE transaction_coordination (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX transaction_coordination_owner ON transaction_coordination(organization_id,office_id,owner_id);
CREATE TABLE transaction_revisions (
 transaction_id TEXT NOT NULL REFERENCES transaction_coordination(id), version INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(transaction_id,version)
);
CREATE TABLE transaction_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, transaction_id TEXT NOT NULL REFERENCES transaction_coordination(id),
 version INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(organization_id,office_id,owner_id,event_key)
);
CREATE TRIGGER transaction_revisions_no_update BEFORE UPDATE ON transaction_revisions BEGIN SELECT RAISE(ABORT,'Transaction revisions are immutable'); END;
CREATE TRIGGER transaction_revisions_no_delete BEFORE DELETE ON transaction_revisions BEGIN SELECT RAISE(ABORT,'Transaction revisions are immutable'); END;
CREATE TRIGGER transaction_events_no_update BEFORE UPDATE ON transaction_events BEGIN SELECT RAISE(ABORT,'Transaction events are append-only'); END;
CREATE TRIGGER transaction_events_no_delete BEFORE DELETE ON transaction_events BEGIN SELECT RAISE(ABORT,'Transaction events are append-only'); END;
