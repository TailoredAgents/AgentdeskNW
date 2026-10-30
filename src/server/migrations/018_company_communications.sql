CREATE TABLE communication_company_demo_seeds (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,office_id,owner_id), FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE UNIQUE INDEX communication_messages_scoped_id ON communication_messages(id,organization_id,office_id,owner_id,account_id);
CREATE TABLE communication_source_links (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 account_id TEXT NOT NULL, message_id TEXT NOT NULL, source_system TEXT NOT NULL, source_ref TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,owner_id,account_id,source_system,source_ref),
 FOREIGN KEY(account_id,organization_id,office_id,owner_id) REFERENCES communication_accounts(id,organization_id,office_id,owner_id),
 FOREIGN KEY(message_id,organization_id,office_id,owner_id,account_id) REFERENCES communication_messages(id,organization_id,office_id,owner_id,account_id)
);
CREATE TRIGGER communication_source_links_no_update BEFORE UPDATE ON communication_source_links BEGIN SELECT RAISE(ABORT,'Communication source references are immutable'); END;
CREATE TRIGGER communication_source_links_no_delete BEFORE DELETE ON communication_source_links BEGIN SELECT RAISE(ABORT,'Communication source references are immutable'); END;
