CREATE TABLE local_assignment_research (
 job_id TEXT PRIMARY KEY REFERENCES research_jobs(id),
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 assignment_id TEXT NOT NULL REFERENCES metered_assignments(id),
 parent_binding_id TEXT NOT NULL REFERENCES assignment_bindings(id),
 parent_request_id TEXT NOT NULL, input_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX local_assignment_research_parent ON local_assignment_research(assignment_id);
CREATE TRIGGER local_assignment_research_fixed BEFORE UPDATE ON local_assignment_research
BEGIN SELECT RAISE(ABORT,'Research retains its original assignment'); END;
CREATE TRIGGER local_assignment_research_retained BEFORE DELETE ON local_assignment_research
BEGIN SELECT RAISE(ABORT,'Research assignment history is retained'); END;
