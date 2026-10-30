CREATE TABLE mobile_pairings (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 role TEXT NOT NULL, code_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT,
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX mobile_pairings_owner ON mobile_pairings(organization_id,office_id,user_id,expires_at);
CREATE TABLE mobile_sessions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 role TEXT NOT NULL, device_name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX mobile_sessions_owner ON mobile_sessions(organization_id,office_id,user_id,expires_at);
CREATE TABLE mobile_pair_rate_limits (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, attempts INTEGER NOT NULL);
