CREATE TABLE standing_permissions (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 thread_id TEXT NOT NULL REFERENCES communication_threads(id),version INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','revoked','blocked')),data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX standing_permissions_owner ON standing_permissions(organization_id,office_id,user_id,thread_id);
CREATE TABLE standing_permission_commands (
 organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,event_key TEXT NOT NULL,
 payload_hash TEXT NOT NULL,permission_id TEXT NOT NULL REFERENCES standing_permissions(id),
 PRIMARY KEY(organization_id,office_id,user_id,event_key)
);
CREATE TABLE standing_permission_receipts (
 permission_id TEXT NOT NULL REFERENCES standing_permissions(id),message_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('created_task','coalesced')),task_id TEXT,created_at TEXT NOT NULL,
 PRIMARY KEY(permission_id,message_id)
);
CREATE TRIGGER standing_permission_receipts_fixed BEFORE UPDATE ON standing_permission_receipts
BEGIN SELECT RAISE(ABORT,'Standing action receipts are immutable'); END;
CREATE TRIGGER standing_permission_receipts_retained BEFORE DELETE ON standing_permission_receipts
BEGIN SELECT RAISE(ABORT,'Standing action receipts are retained'); END;
CREATE TRIGGER standing_permissions_identity BEFORE UPDATE ON standing_permissions
WHEN NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.office_id<>OLD.office_id
 OR NEW.user_id<>OLD.user_id OR NEW.thread_id<>OLD.thread_id
BEGIN SELECT RAISE(ABORT,'Standing permission owner and conversation are immutable'); END;
