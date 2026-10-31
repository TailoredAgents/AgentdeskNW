CREATE TABLE knowledge_documents (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(office_id) REFERENCES offices(id)
);
CREATE INDEX knowledge_office ON knowledge_documents(organization_id,office_id);
CREATE TABLE knowledge_publications (
 document_id TEXT NOT NULL REFERENCES knowledge_documents(id), revision INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(document_id,revision)
);
CREATE TABLE knowledge_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE coaching_attempts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER knowledge_publications_no_update BEFORE UPDATE ON knowledge_publications BEGIN SELECT RAISE(ABORT,'Knowledge publications are immutable'); END;
CREATE TRIGGER knowledge_publications_no_delete BEFORE DELETE ON knowledge_publications BEGIN SELECT RAISE(ABORT,'Knowledge publications are immutable'); END;
CREATE TRIGGER knowledge_events_no_update BEFORE UPDATE ON knowledge_events BEGIN SELECT RAISE(ABORT,'Knowledge events are append-only'); END;
CREATE TRIGGER knowledge_events_no_delete BEFORE DELETE ON knowledge_events BEGIN SELECT RAISE(ABORT,'Knowledge events are append-only'); END;
CREATE TRIGGER coaching_no_update BEFORE UPDATE ON coaching_attempts BEGIN SELECT RAISE(ABORT,'Practice responses are immutable'); END;
CREATE TRIGGER coaching_no_delete BEFORE DELETE ON coaching_attempts BEGIN SELECT RAISE(ABORT,'Practice responses are immutable'); END;
