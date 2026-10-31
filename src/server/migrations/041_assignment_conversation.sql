CREATE TABLE assignment_conversation_reviews (
 code TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL REFERENCES conversations(id), request_id TEXT NOT NULL,
 review_id TEXT NOT NULL REFERENCES assignment_reviews(id),
 quote_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
 presentation_hash TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('web','mobile','sms','slack')),
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 UNIQUE(organization_id,office_id,user_id,conversation_id,request_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TRIGGER assignment_conversation_reviews_fixed BEFORE UPDATE ON assignment_conversation_reviews
BEGIN SELECT RAISE(ABORT,'Conversation spending review is immutable'); END;
CREATE TRIGGER assignment_conversation_reviews_retained BEFORE DELETE ON assignment_conversation_reviews
BEGIN SELECT RAISE(ABORT,'Conversation spending reviews are retained'); END;
