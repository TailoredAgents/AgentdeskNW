CREATE TABLE text_executions (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL, request_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id),
 binding_id TEXT NOT NULL REFERENCES assignment_bindings(id), identity_hash TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 phase TEXT NOT NULL CHECK(phase IN ('ready','dispatching','received','completed','failed','unknown')),
 scope_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,user_id,request_id),
 FOREIGN KEY(organization_id,office_id,user_id,request_id) REFERENCES assistant_turns(organization_id,office_id,user_id,request_id)
);
CREATE TRIGGER text_executions_fixed_identity BEFORE UPDATE ON text_executions
WHEN NEW.organization_id<>OLD.organization_id OR NEW.office_id<>OLD.office_id OR NEW.user_id<>OLD.user_id
 OR NEW.request_id<>OLD.request_id OR NEW.conversation_id<>OLD.conversation_id
 OR NEW.binding_id<>OLD.binding_id OR NEW.identity_hash<>OLD.identity_hash OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT,'Text execution identity is immutable'); END;
