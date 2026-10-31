CREATE TABLE transaction_correspondence (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 transaction_id TEXT NOT NULL REFERENCES transaction_coordination(id), account_id TEXT NOT NULL REFERENCES communication_accounts(id),
 reference TEXT NOT NULL, thread_id TEXT NOT NULL REFERENCES communication_threads(id),
 PRIMARY KEY(organization_id,office_id,owner_id,transaction_id,account_id,reference)
);
CREATE TABLE transaction_correspondence_events (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, thread_id TEXT NOT NULL REFERENCES communication_threads(id),
 PRIMARY KEY(organization_id,office_id,owner_id,event_key)
);
CREATE TRIGGER transaction_correspondence_no_update BEFORE UPDATE ON transaction_correspondence BEGIN SELECT RAISE(ABORT,'Transaction correspondence is immutable'); END;
CREATE TRIGGER transaction_correspondence_no_delete BEFORE DELETE ON transaction_correspondence BEGIN SELECT RAISE(ABORT,'Transaction correspondence is immutable'); END;
CREATE TRIGGER transaction_correspondence_events_no_update BEFORE UPDATE ON transaction_correspondence_events BEGIN SELECT RAISE(ABORT,'Transaction correspondence events are immutable'); END;
CREATE TRIGGER transaction_correspondence_events_no_delete BEFORE DELETE ON transaction_correspondence_events BEGIN SELECT RAISE(ABORT,'Transaction correspondence events are immutable'); END;
