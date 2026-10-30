CREATE TABLE communication_send_reviews (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, context_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,owner_id,event_key),
 FOREIGN KEY(thread_id,organization_id,office_id,owner_id) REFERENCES communication_threads(id,organization_id,office_id,owner_id)
);
CREATE TABLE communication_send_receipts (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 review_id TEXT NOT NULL UNIQUE REFERENCES communication_send_reviews(id), event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,owner_id,event_key),
 FOREIGN KEY(thread_id,organization_id,office_id,owner_id) REFERENCES communication_threads(id,organization_id,office_id,owner_id)
);
CREATE TABLE communication_workflow_actions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,owner_id,event_key),
 FOREIGN KEY(thread_id,organization_id,office_id,owner_id) REFERENCES communication_threads(id,organization_id,office_id,owner_id)
);
CREATE TRIGGER communication_send_reviews_no_update BEFORE UPDATE ON communication_send_reviews BEGIN SELECT RAISE(ABORT,'Communication reviews are immutable'); END;
CREATE TRIGGER communication_send_reviews_no_delete BEFORE DELETE ON communication_send_reviews BEGIN SELECT RAISE(ABORT,'Communication reviews are immutable'); END;
CREATE TRIGGER communication_send_receipts_no_update BEFORE UPDATE ON communication_send_receipts BEGIN SELECT RAISE(ABORT,'Communication receipts are immutable'); END;
CREATE TRIGGER communication_send_receipts_no_delete BEFORE DELETE ON communication_send_receipts BEGIN SELECT RAISE(ABORT,'Communication receipts are immutable'); END;
CREATE TRIGGER communication_workflow_actions_no_update BEFORE UPDATE ON communication_workflow_actions BEGIN SELECT RAISE(ABORT,'Communication workflow sources are immutable'); END;
CREATE TRIGGER communication_workflow_actions_no_delete BEFORE DELETE ON communication_workflow_actions BEGIN SELECT RAISE(ABORT,'Communication workflow sources are immutable'); END;
