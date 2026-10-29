CREATE TABLE property_releases (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 property_id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 UNIQUE(organization_id,office_id,property_id), UNIQUE(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,property_id) REFERENCES properties(organization_id,office_id,id)
);
CREATE TABLE release_events (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, event_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 release_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 PRIMARY KEY(organization_id,office_id,event_key),
 FOREIGN KEY(organization_id,office_id,release_id) REFERENCES property_releases(organization_id,office_id,id)
);
CREATE TABLE deal_packages (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 investor_id TEXT NOT NULL, release_id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 canonical_body TEXT NOT NULL, canonical_subject TEXT NOT NULL,
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,release_id) REFERENCES property_releases(organization_id,office_id,id)
);
CREATE TABLE debriefs (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), proposal_result TEXT CHECK(proposal_result IS NULL OR json_valid(proposal_result)),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE channel_templates (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE TABLE channel_links (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, user_id TEXT NOT NULL,
 provider TEXT NOT NULL, workspace_id TEXT NOT NULL, external_id TEXT NOT NULL,
 PRIMARY KEY(provider,workspace_id,external_id),
 FOREIGN KEY(organization_id,office_id,user_id) REFERENCES memberships(organization_id,office_id,user_id)
);
