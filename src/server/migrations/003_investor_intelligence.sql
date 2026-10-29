CREATE TABLE investor_intelligence (
 investor_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id)
);
CREATE TABLE buy_boxes (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, investor_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id)
);
CREATE INDEX buy_boxes_investor ON buy_boxes(organization_id,office_id,investor_id);
CREATE TABLE buy_box_versions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, investor_id TEXT NOT NULL,
 buy_box_id TEXT NOT NULL REFERENCES buy_boxes(id), version INTEGER NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(buy_box_id,version),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id)
);
CREATE TABLE relationship_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, office_id TEXT NOT NULL, investor_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id),
 FOREIGN KEY(organization_id,office_id,actor_id) REFERENCES memberships(organization_id,office_id,user_id)
);
CREATE INDEX relationship_events_investor ON relationship_events(organization_id,office_id,investor_id);
CREATE TABLE call_priorities (
 organization_id TEXT NOT NULL, office_id TEXT NOT NULL, owner_id TEXT NOT NULL, investor_id TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(organization_id,office_id,owner_id,investor_id),
 FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
 FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id)
);
