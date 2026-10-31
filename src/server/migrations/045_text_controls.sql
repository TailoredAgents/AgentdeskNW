CREATE TABLE assignment_text_controls (
 review_id TEXT PRIMARY KEY REFERENCES assignment_reviews(id),
 state TEXT NOT NULL CHECK(state IN ('requested','paused','resumed')),
 updated_at TEXT NOT NULL
);
CREATE TABLE assignment_text_control_events (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 event_key TEXT NOT NULL, review_id TEXT NOT NULL REFERENCES assignment_reviews(id),
 replacement_review_id TEXT REFERENCES assignment_reviews(id),
 payload_hash TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,user_id,event_key),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER assignment_text_control_events_no_update BEFORE UPDATE ON assignment_text_control_events
BEGIN SELECT RAISE(ABORT,'Text control history is retained'); END;
CREATE TRIGGER assignment_text_control_events_no_delete BEFORE DELETE ON assignment_text_control_events
BEGIN SELECT RAISE(ABORT,'Text control history is retained'); END;
