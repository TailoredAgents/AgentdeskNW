-- Additive checkpoints contain validated candidates and usage, never full provider transcripts.
ALTER TABLE research_jobs ADD COLUMN worker_token TEXT;
CREATE TABLE research_provider_calls (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 job_id TEXT NOT NULL REFERENCES research_jobs(id),
 sequence INTEGER NOT NULL CHECK(sequence>0),
 state TEXT NOT NULL CHECK(state IN ('started','completed','failed','unknown')),
 data TEXT NOT NULL CHECK(json_valid(data)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(job_id,sequence),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX research_provider_scope ON research_provider_calls(organization_id,office_id,owner_id,created_at);
