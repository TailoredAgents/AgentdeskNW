CREATE TABLE relationship_reports (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 investor_id TEXT NOT NULL, buy_box_id TEXT,
 supersedes_id TEXT REFERENCES relationship_reports(id),
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,owner_id,event_key),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id)
);
CREATE INDEX relationship_reports_investor ON relationship_reports(organization_id,office_id,investor_id);
CREATE UNIQUE INDEX relationship_reports_correction ON relationship_reports(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE TRIGGER relationship_reports_no_update BEFORE UPDATE ON relationship_reports BEGIN SELECT RAISE(ABORT,'Relationship reports are immutable'); END;
CREATE TRIGGER relationship_reports_no_delete BEFORE DELETE ON relationship_reports BEGIN SELECT RAISE(ABORT,'Relationship reports are immutable'); END;
