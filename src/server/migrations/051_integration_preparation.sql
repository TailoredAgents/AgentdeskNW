CREATE TABLE capability_connections (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 provider TEXT NOT NULL,remote_tenant TEXT NOT NULL,remote_user TEXT NOT NULL,
 version INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('prepared','disconnected')),
 mode TEXT NOT NULL CHECK(mode IN ('demo','live')),data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,user_id,provider,remote_tenant,remote_user),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE connection_sync_batches (
 connection_id TEXT NOT NULL REFERENCES capability_connections(id),batch_id TEXT NOT NULL,
 input_hash TEXT NOT NULL,connection_version INTEGER NOT NULL,created_at TEXT NOT NULL,
 PRIMARY KEY(connection_id,batch_id)
);
CREATE TABLE connection_sync_records (
 connection_id TEXT NOT NULL REFERENCES capability_connections(id),external_id TEXT NOT NULL,
 revision INTEGER NOT NULL,connection_version INTEGER NOT NULL,deleted INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(connection_id,external_id)
);
CREATE TABLE company_identity_bindings (
 issuer TEXT NOT NULL,subject TEXT NOT NULL,organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 role TEXT NOT NULL,version INTEGER NOT NULL,revoked_at TEXT,
 PRIMARY KEY(issuer,subject),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE worker_health (
 instance_id TEXT NOT NULL,lane TEXT NOT NULL,started_at TEXT NOT NULL,heartbeat_at TEXT NOT NULL,
 last_success_at TEXT,last_failure_at TEXT,state TEXT NOT NULL CHECK(state IN ('running','idle','failed','stopped')),
 PRIMARY KEY(instance_id,lane)
);
CREATE TRIGGER capability_connection_identity BEFORE UPDATE ON capability_connections
WHEN NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.office_id<>OLD.office_id
 OR NEW.user_id<>OLD.user_id OR NEW.provider<>OLD.provider OR NEW.remote_tenant<>OLD.remote_tenant
 OR NEW.remote_user<>OLD.remote_user OR NEW.mode<>OLD.mode
BEGIN SELECT RAISE(ABORT,'Connection identity and mode are immutable'); END;
CREATE TRIGGER connection_sync_batches_fixed BEFORE UPDATE ON connection_sync_batches
BEGIN SELECT RAISE(ABORT,'Synchronization receipts are immutable'); END;
CREATE TRIGGER connection_sync_batches_retained BEFORE DELETE ON connection_sync_batches
BEGIN SELECT RAISE(ABORT,'Synchronization receipts are retained'); END;
CREATE TRIGGER company_identity_subject_fixed BEFORE UPDATE ON company_identity_bindings
WHEN NEW.issuer<>OLD.issuer OR NEW.subject<>OLD.subject OR NEW.organization_id<>OLD.organization_id
 OR NEW.office_id<>OLD.office_id OR NEW.user_id<>OLD.user_id OR NEW.role<>OLD.role
BEGIN SELECT RAISE(ABORT,'Company identity membership binding is immutable'); END;
