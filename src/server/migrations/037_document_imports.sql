CREATE TABLE document_imports (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), bytes BLOB NOT NULL, expires_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX document_imports_owner ON document_imports(organization_id,office_id,owner_id);
CREATE TABLE source_document_files (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES source_documents(id),
 data TEXT NOT NULL CHECK(json_valid(data)), bytes BLOB NOT NULL
);
CREATE TRIGGER source_document_files_no_update BEFORE UPDATE ON source_document_files BEGIN SELECT RAISE(ABORT,'Original document files are immutable'); END;
CREATE TRIGGER source_document_files_no_delete BEFORE DELETE ON source_document_files BEGIN SELECT RAISE(ABORT,'Original document files are immutable'); END;
