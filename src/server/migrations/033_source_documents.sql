CREATE TABLE source_documents (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX source_documents_owner ON source_documents(organization_id,office_id,owner_id);
CREATE TABLE source_document_revisions (
 document_id TEXT NOT NULL REFERENCES source_documents(id), revision INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(document_id,revision)
);
CREATE TABLE source_document_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, document_id TEXT NOT NULL REFERENCES source_documents(id),
 data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,owner_id,event_key)
);
CREATE TRIGGER source_document_revisions_no_update BEFORE UPDATE ON source_document_revisions BEGIN SELECT RAISE(ABORT,'Document revisions are immutable'); END;
CREATE TRIGGER source_document_revisions_no_delete BEFORE DELETE ON source_document_revisions BEGIN SELECT RAISE(ABORT,'Document revisions are immutable'); END;
CREATE TRIGGER source_document_events_no_update BEFORE UPDATE ON source_document_events BEGIN SELECT RAISE(ABORT,'Document events are append-only'); END;
CREATE TRIGGER source_document_events_no_delete BEFORE DELETE ON source_document_events BEGIN SELECT RAISE(ABORT,'Document events are append-only'); END;
