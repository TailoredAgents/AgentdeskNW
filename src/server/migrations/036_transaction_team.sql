CREATE TABLE transaction_teams (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, transaction_id TEXT NOT NULL REFERENCES transaction_coordination(id), data TEXT NOT NULL,
 UNIQUE(organization_id,office_id,owner_id,transaction_id)
);
CREATE TABLE transaction_team_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, event_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 team_id TEXT NOT NULL REFERENCES transaction_teams(id), data TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,actor_id,event_key)
);
CREATE TRIGGER transaction_team_events_no_update BEFORE UPDATE ON transaction_team_events BEGIN SELECT RAISE(ABORT,'Transaction team events are immutable'); END;
CREATE TRIGGER transaction_team_events_no_delete BEFORE DELETE ON transaction_team_events BEGIN SELECT RAISE(ABORT,'Transaction team events are immutable'); END;
