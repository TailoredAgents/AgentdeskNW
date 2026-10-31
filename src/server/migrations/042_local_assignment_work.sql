CREATE TABLE local_assignment_work (
 run_id TEXT PRIMARY KEY REFERENCES work_runs(id),
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 assignment_id TEXT NOT NULL REFERENCES metered_assignments(id),
 parent_binding_id TEXT NOT NULL REFERENCES assignment_bindings(id),
 parent_request_id TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX local_assignment_work_parent ON local_assignment_work(assignment_id);
CREATE TRIGGER local_assignment_work_fixed BEFORE UPDATE ON local_assignment_work
BEGIN SELECT RAISE(ABORT,'Local work retains its original spending assignment'); END;
CREATE TRIGGER local_assignment_work_retained BEFORE DELETE ON local_assignment_work
BEGIN SELECT RAISE(ABORT,'Local assignment work is retained'); END;
