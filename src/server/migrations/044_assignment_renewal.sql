CREATE TABLE assignment_renewals (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 event_key TEXT NOT NULL, original_review_id TEXT NOT NULL REFERENCES assignment_reviews(id),
 replacement_review_id TEXT NOT NULL REFERENCES assignment_reviews(id),
 payload_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER assignment_renewals_no_update BEFORE UPDATE ON assignment_renewals
BEGIN SELECT RAISE(ABORT,'Assignment renewal commands are retained'); END;
CREATE TRIGGER assignment_renewals_no_delete BEFORE DELETE ON assignment_renewals
BEGIN SELECT RAISE(ABORT,'Assignment renewal commands are retained'); END;
