CREATE TABLE assignment_roots (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 legacy INTEGER NOT NULL CHECK(legacy IN (0,1)),created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE assignment_bindings (
 id TEXT PRIMARY KEY,root_id TEXT NOT NULL REFERENCES assignment_roots(id),
 organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 host_kind TEXT NOT NULL CHECK(host_kind IN ('turn','work','research')),host_id TEXT NOT NULL,
 host_fingerprint TEXT NOT NULL,parent_id TEXT REFERENCES assignment_bindings(id),created_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,user_id,host_kind,host_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX assignment_bindings_root ON assignment_bindings(root_id);
CREATE TRIGGER assignment_roots_no_update BEFORE UPDATE ON assignment_roots BEGIN SELECT RAISE(ABORT,'Assignment roots are immutable'); END;
CREATE TRIGGER assignment_roots_no_delete BEFORE DELETE ON assignment_roots BEGIN SELECT RAISE(ABORT,'Assignment roots are immutable'); END;
CREATE TRIGGER assignment_bindings_no_update BEFORE UPDATE ON assignment_bindings BEGIN SELECT RAISE(ABORT,'Assignment bindings are immutable'); END;
CREATE TRIGGER assignment_bindings_no_delete BEFORE DELETE ON assignment_bindings BEGIN SELECT RAISE(ABORT,'Assignment bindings are immutable'); END;
