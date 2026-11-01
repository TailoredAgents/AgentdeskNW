CREATE TABLE metered_research_hosts (
 job_id TEXT PRIMARY KEY REFERENCES research_jobs(id),organization_id TEXT NOT NULL,office_id TEXT NOT NULL,user_id TEXT NOT NULL,
 root_id TEXT NOT NULL,assignment_id TEXT,parent_request_id TEXT,input_hash TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX metered_research_assignment ON metered_research_hosts(assignment_id);
CREATE TRIGGER metered_research_identity BEFORE UPDATE ON metered_research_hosts
WHEN NEW.job_id<>OLD.job_id OR NEW.organization_id<>OLD.organization_id OR NEW.office_id<>OLD.office_id OR NEW.user_id<>OLD.user_id OR NEW.root_id<>OLD.root_id OR NEW.input_hash<>OLD.input_hash
BEGIN SELECT RAISE(ABORT,'Research assignment identity is immutable'); END;
CREATE TABLE research_conversation_events (
 job_id TEXT NOT NULL REFERENCES metered_research_hosts(job_id),event_key TEXT NOT NULL,
 message_id TEXT NOT NULL REFERENCES messages(id),PRIMARY KEY(job_id,event_key)
);
