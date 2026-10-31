CREATE TABLE proactive_deliveries (
 update_id TEXT PRIMARY KEY REFERENCES proactive_updates(id),
 channel TEXT NOT NULL CHECK(channel IN ('app','sms','slack')),
 target_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','dispatching','accepted','service_received','delivered','failed','unknown','canceled','expired')),
 outbound_id TEXT REFERENCES messaging_outbox(id),
 provider_id TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 reconcile_at TEXT
);
CREATE INDEX proactive_delivery_pending ON proactive_deliveries(status,updated_at);
