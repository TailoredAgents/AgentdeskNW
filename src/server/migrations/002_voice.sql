CREATE TABLE voice_sessions (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 office_id TEXT NOT NULL REFERENCES offices(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 conversation_id TEXT NOT NULL REFERENCES conversations(id),
 started_at TEXT NOT NULL,
 ended_at TEXT
);
CREATE INDEX voice_sessions_scope ON voice_sessions(organization_id,office_id,user_id);
CREATE TABLE voice_calls (
 session_id TEXT NOT NULL REFERENCES voice_sessions(id),
 call_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
 result TEXT,
 PRIMARY KEY(session_id,call_id)
);
CREATE TABLE voice_events (
 session_id TEXT NOT NULL REFERENCES voice_sessions(id),
 event_id TEXT NOT NULL,
 PRIMARY KEY(session_id,event_id)
);
