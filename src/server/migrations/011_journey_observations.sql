CREATE TABLE journey_observations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  office_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  investor_id TEXT NOT NULL,
  property_id TEXT,
  resolves_id TEXT REFERENCES journey_observations(id),
  event_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  UNIQUE(organization_id,office_id,owner_id,event_key),
  FOREIGN KEY(organization_id,office_id,owner_id) REFERENCES memberships(organization_id,office_id,user_id),
  FOREIGN KEY(organization_id,office_id,investor_id) REFERENCES investors(organization_id,office_id,id),
  FOREIGN KEY(organization_id,office_id,property_id) REFERENCES properties(organization_id,office_id,id)
);
CREATE INDEX journey_observations_investor ON journey_observations(organization_id,office_id,investor_id);
CREATE UNIQUE INDEX journey_observations_resolution ON journey_observations(resolves_id) WHERE resolves_id IS NOT NULL;
