CREATE TABLE billing_enterprise_seats (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE billing_subscription_migrations (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 migration_key TEXT NOT NULL,
 before_data TEXT NOT NULL CHECK(json_valid(before_data)),
 after_data TEXT NOT NULL CHECK(json_valid(after_data)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,user_id,migration_key)
);
