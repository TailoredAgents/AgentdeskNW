CREATE TABLE assignment_reviews (
 id TEXT PRIMARY KEY,
 assignment_id TEXT NOT NULL REFERENCES metered_assignments(id),
 binding_id TEXT NOT NULL REFERENCES assignment_bindings(id),
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 quote_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
 scope_hash TEXT NOT NULL, presentation_hash TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 state TEXT NOT NULL CHECK(state IN ('waiting','ready','claimed','continued','denied')),
 claim_token TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(assignment_id,quote_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX assignment_reviews_owner ON assignment_reviews(organization_id,office_id,user_id,created_at);
CREATE TRIGGER assignment_reviews_fixed_scope BEFORE UPDATE ON assignment_reviews
WHEN NEW.id<>OLD.id OR NEW.assignment_id<>OLD.assignment_id OR NEW.binding_id<>OLD.binding_id
 OR NEW.organization_id<>OLD.organization_id OR NEW.office_id<>OLD.office_id OR NEW.user_id<>OLD.user_id
 OR NEW.quote_id<>OLD.quote_id OR NEW.revision<>OLD.revision OR NEW.scope_hash<>OLD.scope_hash
 OR NEW.presentation_hash<>OLD.presentation_hash OR NEW.data<>OLD.data OR NEW.created_at<>OLD.created_at
BEGIN SELECT RAISE(ABORT,'Assignment review scope is immutable'); END;
CREATE TRIGGER assignment_reviews_no_delete BEFORE DELETE ON assignment_reviews
BEGIN SELECT RAISE(ABORT,'Assignment reviews are retained'); END;
