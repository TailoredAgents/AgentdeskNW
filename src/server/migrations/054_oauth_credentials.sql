CREATE TABLE oauth_grants (
 connection_id TEXT PRIMARY KEY REFERENCES capability_connections(id),connection_version INTEGER NOT NULL,
 profile_hash TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','refreshing','unknown','revoked')),
 secret TEXT NOT NULL,expires_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE oauth_transactions (
 state_hash TEXT PRIMARY KEY,connection_id TEXT NOT NULL REFERENCES capability_connections(id),connection_version INTEGER NOT NULL,
 profile_hash TEXT NOT NULL,browser_hash TEXT NOT NULL,secret TEXT NOT NULL,expires_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','claimed','completed','failed'))
);
