CREATE TABLE role_preparations (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 preparation_key TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
 UNIQUE(organization_id,office_id,owner_id,preparation_key)
);
CREATE TABLE role_preparation_decisions (
 id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL REFERENCES role_preparations(id),
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 event_key TEXT NOT NULL, payload_hash TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,owner_id,event_key)
);
CREATE TRIGGER role_decisions_no_update BEFORE UPDATE ON role_preparation_decisions BEGIN SELECT RAISE(ABORT,'Role decisions are immutable'); END;
CREATE TRIGGER role_decisions_no_delete BEFORE DELETE ON role_preparation_decisions BEGIN SELECT RAISE(ABORT,'Role decisions are immutable'); END;
