CREATE TABLE conversation_focus_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  event_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('assistant_result','reminder','choices','clear')),
  turn_key TEXT,
  occurred_at TEXT NOT NULL,
  available_at TEXT,
  data TEXT NOT NULL CHECK(json_valid(data)),
  UNIQUE(organization_id,office_id,user_id,conversation_id,event_key),
  FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX conversation_focus_recent ON conversation_focus_events(organization_id,office_id,user_id,conversation_id,occurred_at);
