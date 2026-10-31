-- Durable simulated adapter dispatches. No client or model may submit receipts.
CREATE TABLE assignment_operations (
 assignment_id TEXT NOT NULL REFERENCES metered_assignments(id),
 operation_key TEXT NOT NULL,
 binding_id TEXT NOT NULL REFERENCES assignment_bindings(id),
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 identity_hash TEXT NOT NULL, adapter_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
 scope_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('dispatched','unknown','received')),
 receipt_hash TEXT, result TEXT CHECK(result IS NULL OR json_valid(result)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(assignment_id,operation_key),
 UNIQUE(assignment_id,attempt_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER assignment_operations_fixed_identity BEFORE UPDATE ON assignment_operations
WHEN NEW.assignment_id<>OLD.assignment_id OR NEW.operation_key<>OLD.operation_key
 OR NEW.binding_id<>OLD.binding_id OR NEW.organization_id<>OLD.organization_id
 OR NEW.office_id<>OLD.office_id OR NEW.user_id<>OLD.user_id
 OR NEW.identity_hash<>OLD.identity_hash OR NEW.adapter_id<>OLD.adapter_id
 OR NEW.attempt_id<>OLD.attempt_id OR NEW.scope_hash<>OLD.scope_hash OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT,'Assignment operation identity is immutable'); END;
CREATE TRIGGER assignment_operations_final BEFORE UPDATE ON assignment_operations
WHEN OLD.state='received'
BEGIN SELECT RAISE(ABORT,'Assignment operation receipt is immutable'); END;
CREATE TRIGGER assignment_operations_no_delete BEFORE DELETE ON assignment_operations
BEGIN SELECT RAISE(ABORT,'Assignment operations cannot be deleted'); END;
