CREATE TABLE work_conversation_reviews (
 code TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id), run_id TEXT NOT NULL REFERENCES work_runs(id),
 request_id TEXT NOT NULL, run_version INTEGER NOT NULL, plan_version INTEGER NOT NULL,
 quote_id TEXT NOT NULL, maximum_cents INTEGER NOT NULL, channel TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)),
 UNIQUE(organization_id,office_id,user_id,conversation_id,request_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE work_conversation_commands (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id), request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,user_id,conversation_id,request_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX work_conversation_review_owner ON work_conversation_reviews(organization_id,office_id,user_id,conversation_id,created_at);
CREATE TRIGGER work_conversation_reviews_no_update BEFORE UPDATE ON work_conversation_reviews BEGIN SELECT RAISE(ABORT,'Work cost reviews are immutable'); END;
CREATE TRIGGER work_conversation_reviews_no_delete BEFORE DELETE ON work_conversation_reviews BEGIN SELECT RAISE(ABORT,'Work cost reviews are immutable'); END;
CREATE TRIGGER work_conversation_commands_no_update BEFORE UPDATE ON work_conversation_commands BEGIN SELECT RAISE(ABORT,'Work conversation receipts are immutable'); END;
CREATE TRIGGER work_conversation_commands_no_delete BEFORE DELETE ON work_conversation_commands BEGIN SELECT RAISE(ABORT,'Work conversation receipts are immutable'); END;
