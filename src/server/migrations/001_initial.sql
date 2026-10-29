CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL, settings TEXT NOT NULL CHECK(json_valid(settings)));
CREATE TABLE offices (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, UNIQUE(organization_id,id));
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE memberships (
  organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('dispositions','acquisitions','manager')),
  PRIMARY KEY(organization_id,office_id,user_id), FOREIGN KEY(organization_id,office_id) REFERENCES offices(organization_id,id)
);
CREATE TABLE investors (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX investors_scope ON investors(organization_id,office_id,owner_id);
CREATE TABLE properties (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX properties_scope ON properties(organization_id,office_id);
CREATE TABLE conversations (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(organization_id,office_id,owner_id,id),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX conversations_scope ON conversations(organization_id,office_id,owner_id);
CREATE TABLE messages (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), sequence INTEGER NOT NULL,
 FOREIGN KEY(organization_id,office_id,owner_id,conversation_id) REFERENCES conversations(organization_id,office_id,owner_id,id) ON DELETE CASCADE,
 UNIQUE(conversation_id,sequence)
);
CREATE TABLE research_jobs (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), lease_until TEXT, next_attempt_at TEXT,
 status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) VIRTUAL,
 CHECK(status IN ('queued','running','awaiting_input','completed','failed','canceled')),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX research_scope ON research_jobs(organization_id,office_id,owner_id);
CREATE INDEX research_pending ON research_jobs(status,lease_until,next_attempt_at);
CREATE TABLE proposed_actions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 status TEXT GENERATED ALWAYS AS (json_extract(data,'$.status')) VIRTUAL,
 CHECK(status IN ('pending','approved','rejected','executed','failed')),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX actions_scope ON proposed_actions(organization_id,office_id,owner_id,status);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 investor_id TEXT, data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id)
);
CREATE INDEX tasks_scope ON tasks(organization_id,office_id,owner_id);
CREATE TABLE notifications (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 dedupe_key TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
 UNIQUE(organization_id,office_id,owner_id,dedupe_key)
);
CREATE INDEX notifications_scope ON notifications(organization_id,office_id,owner_id);
CREATE TABLE user_settings (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(organization_id,office_id,owner_id), FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE audit_logs (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 event TEXT NOT NULL, entity_id TEXT, metadata TEXT NOT NULL CHECK(json_valid(metadata)), created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,actor_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX audit_scope ON audit_logs(organization_id,office_id,created_at);
CREATE TABLE usage_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 kind TEXT NOT NULL, quantity REAL NOT NULL CHECK(quantity>=0), created_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX usage_scope ON usage_events(organization_id,office_id,owner_id,kind);
