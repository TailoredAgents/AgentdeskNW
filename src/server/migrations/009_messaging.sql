CREATE TABLE messaging_threads (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id),
 PRIMARY KEY(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE messaging_pairings (
 token_hash TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('slack','sms')), account_id TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT,
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE messaging_links (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('slack','sms')), account_id TEXT NOT NULL, external_id TEXT NOT NULL,
 address TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, opted_out INTEGER NOT NULL DEFAULT 0,
 reminders INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(provider,account_id,external_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE messaging_inbox (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, account_id TEXT NOT NULL, event_id TEXT NOT NULL,
 link_id TEXT NOT NULL REFERENCES messaging_links(id), body_hash TEXT NOT NULL, body TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed','unknown','canceled')),
 received_at TEXT NOT NULL, updated_at TEXT NOT NULL, error_code TEXT,
 UNIQUE(provider,account_id,event_id)
);
CREATE TABLE messaging_outbox (
 id TEXT PRIMARY KEY, link_id TEXT NOT NULL REFERENCES messaging_links(id), dedupe_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('reply','notice','system')), reference_id TEXT,
 body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','dispatching','accepted','delivered','failed','unknown','canceled')),
 provider_id TEXT, provider_status TEXT, segments_reserved INTEGER NOT NULL DEFAULT 0,
 segments_actual INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 reconcile_at TEXT, error_code TEXT
);
CREATE UNIQUE INDEX messaging_outbox_provider_id ON messaging_outbox(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX messaging_inbox_pending ON messaging_inbox(status,received_at);
CREATE INDEX messaging_outbox_pending ON messaging_outbox(status,created_at);
CREATE INDEX messaging_links_owner ON messaging_links(organization_id,office_id,user_id);
