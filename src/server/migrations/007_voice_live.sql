-- Additive live-voice control state. Credentials and audio are never persisted.
CREATE TABLE voice_live_sessions (
 session_id TEXT PRIMARY KEY REFERENCES voice_sessions(id),
 status TEXT NOT NULL CHECK(status IN ('prepared','connecting','connected','ended','failed')),
 data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE INDEX voice_live_status ON voice_live_sessions(status);
