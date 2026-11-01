CREATE TABLE company_login_transactions (
 state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,configuration_hash TEXT NOT NULL,
 secret TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','claimed','completed','failed'))
);
CREATE INDEX company_login_expiry ON company_login_transactions(expires_at);
CREATE TABLE company_sessions (
 token_hash TEXT PRIMARY KEY,issuer TEXT NOT NULL,subject TEXT NOT NULL,binding_version INTEGER NOT NULL,
 configuration_hash TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL,revoked_at TEXT,
 FOREIGN KEY(issuer,subject) REFERENCES company_identity_bindings(issuer,subject)
);
CREATE INDEX company_session_subject ON company_sessions(issuer,subject);
-- Identity and employee ownership stay fixed. Trusted reprovisioning may update
-- the role/version, invalidating all older browser/device bindings.
DROP TRIGGER company_identity_subject_fixed;
CREATE TRIGGER company_identity_subject_fixed BEFORE UPDATE ON company_identity_bindings
WHEN NEW.issuer<>OLD.issuer OR NEW.subject<>OLD.subject OR NEW.organization_id<>OLD.organization_id
 OR NEW.office_id<>OLD.office_id OR NEW.user_id<>OLD.user_id
BEGIN SELECT RAISE(ABORT,'Company identity ownership is immutable'); END;
CREATE TRIGGER company_identity_version BEFORE UPDATE ON company_identity_bindings
WHEN NEW.version<OLD.version OR ((NEW.role<>OLD.role OR NEW.revoked_at IS NOT OLD.revoked_at) AND NEW.version<=OLD.version)
BEGIN SELECT RAISE(ABORT,'Company membership changes require a new version'); END;
CREATE TABLE company_pairing_bindings (
 pairing_id TEXT PRIMARY KEY REFERENCES mobile_pairings(id),issuer TEXT NOT NULL,subject TEXT NOT NULL,binding_version INTEGER NOT NULL,
 FOREIGN KEY(issuer,subject) REFERENCES company_identity_bindings(issuer,subject)
);
CREATE TABLE company_device_bindings (
 session_id TEXT PRIMARY KEY REFERENCES mobile_sessions(id),issuer TEXT NOT NULL,subject TEXT NOT NULL,binding_version INTEGER NOT NULL,
 FOREIGN KEY(issuer,subject) REFERENCES company_identity_bindings(issuer,subject)
);
