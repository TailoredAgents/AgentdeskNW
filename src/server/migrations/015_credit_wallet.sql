CREATE TABLE wallet_accounts (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,user_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE wallet_quotes (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE wallet_operations (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 quote_id TEXT NOT NULL UNIQUE REFERENCES wallet_quotes(id),
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE wallet_ledger (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 event_key TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE wallet_events (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 event_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 result TEXT NOT NULL CHECK(json_valid(result)),
 created_at TEXT NOT NULL,
 UNIQUE(organization_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER wallet_ledger_no_update BEFORE UPDATE ON wallet_ledger BEGIN SELECT RAISE(ABORT,'Wallet ledger is append-only'); END;
CREATE TRIGGER wallet_ledger_no_delete BEFORE DELETE ON wallet_ledger BEGIN SELECT RAISE(ABORT,'Wallet ledger is append-only'); END;
CREATE TRIGGER wallet_events_no_update BEFORE UPDATE ON wallet_events BEGIN SELECT RAISE(ABORT,'Wallet events are append-only'); END;
CREATE TRIGGER wallet_events_no_delete BEFORE DELETE ON wallet_events BEGIN SELECT RAISE(ABORT,'Wallet events are append-only'); END;
CREATE INDEX wallet_ledger_owner ON wallet_ledger(organization_id,user_id);
CREATE INDEX wallet_operations_owner ON wallet_operations(organization_id,user_id);
