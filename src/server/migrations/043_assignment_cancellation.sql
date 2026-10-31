CREATE TABLE assignment_cancellations (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 event_key TEXT NOT NULL, review_id TEXT NOT NULL REFERENCES assignment_reviews(id),
 payload_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER assignment_cancellations_no_update BEFORE UPDATE ON assignment_cancellations
BEGIN SELECT RAISE(ABORT,'Assignment cancellation commands are retained'); END;
CREATE TRIGGER assignment_cancellations_no_delete BEFORE DELETE ON assignment_cancellations
BEGIN SELECT RAISE(ABORT,'Assignment cancellation commands are retained'); END;
