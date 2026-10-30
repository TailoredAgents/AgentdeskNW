CREATE TABLE communication_accounts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), office_id TEXT NOT NULL REFERENCES offices(id), owner_id TEXT NOT NULL REFERENCES users(id),
 provider_ref TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,owner_id,provider_ref), UNIQUE(id,organization_id,office_id,owner_id)
);
CREATE TABLE communication_threads (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, account_id TEXT NOT NULL,
 provider_ref TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(account_id,organization_id,office_id,owner_id) REFERENCES communication_accounts(id,organization_id,office_id,owner_id),
 UNIQUE(account_id,provider_ref), UNIQUE(id,organization_id,office_id,owner_id)
);
CREATE TABLE communication_messages (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, account_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 provider_ref TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(thread_id,organization_id,office_id,owner_id) REFERENCES communication_threads(id,organization_id,office_id,owner_id),
 FOREIGN KEY(account_id,organization_id,office_id,owner_id) REFERENCES communication_accounts(id,organization_id,office_id,owner_id), UNIQUE(account_id,provider_ref)
);
CREATE TABLE communication_drafts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','discarded')), data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(thread_id,organization_id,office_id,owner_id) REFERENCES communication_threads(id,organization_id,office_id,owner_id)
);
CREATE UNIQUE INDEX communication_active_draft ON communication_drafts(thread_id) WHERE status='draft';
CREATE TABLE communication_draft_revisions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 draft_id TEXT NOT NULL REFERENCES communication_drafts(id), version INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(draft_id,version),
 FOREIGN KEY(thread_id,organization_id,office_id,owner_id) REFERENCES communication_threads(id,organization_id,office_id,owner_id)
);
CREATE TABLE communication_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, event_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL, thread_id TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(thread_id,organization_id,office_id,owner_id) REFERENCES communication_threads(id,organization_id,office_id,owner_id), UNIQUE(organization_id,office_id,owner_id,event_key)
);
CREATE TABLE communication_demo_seeds (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,owner_id), FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX communication_threads_owner ON communication_threads(organization_id,office_id,owner_id);
CREATE INDEX communication_messages_thread ON communication_messages(thread_id);
CREATE INDEX communication_draft_revisions_thread ON communication_draft_revisions(thread_id);
CREATE TRIGGER communication_messages_no_update BEFORE UPDATE ON communication_messages BEGIN SELECT RAISE(ABORT,'Communication source messages are immutable'); END;
CREATE TRIGGER communication_messages_no_delete BEFORE DELETE ON communication_messages BEGIN SELECT RAISE(ABORT,'Communication source messages are immutable'); END;
CREATE TRIGGER communication_revisions_no_update BEFORE UPDATE ON communication_draft_revisions BEGIN SELECT RAISE(ABORT,'Communication draft history is immutable'); END;
CREATE TRIGGER communication_revisions_no_delete BEFORE DELETE ON communication_draft_revisions BEGIN SELECT RAISE(ABORT,'Communication draft history is immutable'); END;
CREATE TRIGGER communication_events_no_update BEFORE UPDATE ON communication_events BEGIN SELECT RAISE(ABORT,'Communication events are immutable'); END;
CREATE TRIGGER communication_events_no_delete BEFORE DELETE ON communication_events BEGIN SELECT RAISE(ABORT,'Communication events are immutable'); END;
