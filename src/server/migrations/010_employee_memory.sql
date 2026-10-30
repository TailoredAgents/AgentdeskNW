CREATE TABLE employee_memory (
 organization_id TEXT NOT NULL,
 office_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version >= 1),
 data TEXT NOT NULL CHECK(json_valid(data)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
