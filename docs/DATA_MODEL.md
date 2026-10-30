# Data model

## Communications and credits update — October 29, 2026

Migrations 014/015 add enterprise seat assignments, preserved legacy subscription migration snapshots, and the credit wallet (accounts, reviewed quotes, operations, append-only ledger and events). The wallet belongs to the organization/employee paid seat across office memberships; actions retain office provenance and validate current membership. Included monthly credit and purchased rollover are distinct. Business records and old invoice rows are retained. See BILLING_ARCHITECTURE.md.


## Principles

Every business row belongs to an organization and, when applicable, an office and owner. References between scoped entities must not permit cross-tenant joins. The initial implementation uses SQLite with foreign keys and migrations; exact table names/constraints in `src/server/migrations` are authoritative. Shared API types are in `src/lib/contracts.ts` and `src/lib/intelligence-contracts.ts`.

Fictional seed records exercise the application rather than imitating a customer export. Business records carry explicit synthetic provenance. API payloads do not accept a tenant ID as an authority.

## Implemented tables and migrations

`001_initial.sql`: `organizations`, `offices`, `users`, `memberships`, `investors`, `properties`, `conversations`, `messages`, `research_jobs`, `proposed_actions`, `tasks`, `notifications`, `user_settings`, `audit_logs`, `usage_events`. The database bootstrap also creates `schema_migrations`.

Business tables generally use scoped relational columns plus a validated JSON `data` payload. Memberships use an organization/office/user composite key; scoped business owners reference it. Tasks reference investors with an organization/office/id foreign key. Messages reference a personal conversation via a composite foreign key, and their sequence is unique per conversation. Research and action statuses are generated from JSON with checked allowed values. Notification deduplication keys are unique per scoped recipient.

`002_voice.sql`: `voice_sessions` binds an actor and conversation with start/end times; `voice_calls` stores unique session/call receipts and running/completed/failed result state; `voice_events` deduplicates transcript event IDs. Server scope checks protect voice sessions; production work should strengthen their relational composite constraints alongside identity replacement.

`003_investor_intelligence.sql`: `investor_intelligence` stores visibility, explicit sharing, relationship metadata and disclosure; `buy_boxes` stores active structured criteria; `buy_box_versions` preserves previous reviewed versions; `relationship_events` records employee-supplied recaps, reviewed notes, call outcomes, disclosure and assignment history; `call_priorities` persists employee dismissal and priority adjustment. All investor-linked tables use organization/office/investor foreign keys. Buy boxes carry revision and field-level provenance. Version records are unique per box/version.

`004_workflows.sql`: `property_releases` stores the latest version per office/property with actor assignments, source, property snapshot, media access and transaction context. `release_events` provides scoped event-key idempotency and immutable version snapshots. `deal_packages` binds owner, investor and release, with canonical property copy and review/handoff state. `debriefs` persists recaps, extracted proposals, linking status and idempotent proposal results. `channel_templates` stores manager-reviewed local copy; `channel_links` binds external channel identities to trusted memberships. An adapter foundation is not evidence of a connected external channel or successful delivery.

The database enables foreign keys, WAL journaling and a five-second busy timeout. Migration application and initial seeding are transactional. No customer data migration has been attempted.

## Current logical entities

| Entity | Key data and relationships |
| --- | --- |
| Organization | ID, display name and tenant settings |
| Office | Organization, name; the authorization scope for office-level management |
| User/actor | Organization, office, name, role; fixed demo personas initially |
| Investor | Scoped owner, company, contact channels, legacy primary criteria, notes, last contact, synthetic flag |
| Investor intelligence / buy box | Visibility, sharing, relationship state, disclosure and multiple versioned criteria sets with field provenance |
| Property release | Latest authorized property snapshot, version, source, assigned users, media access and configurable transaction context |
| Deal package | Investor/release binding, channel, exact draft, current eligibility and approval/handoff state; delivery remains not sent |
| Debrief / relationship event | Employee recap, source excerpts, ambiguities, reviewed proposals and actual call outcomes |
| Call priority | Per-employee dismissal and manual rank adjustment |
| Property | Scoped address/location, price, physical attributes, strategy, status, synthetic flag |
| Conversation | Scoped owner, title and timestamps |
| Message | Conversation, role, text, timestamp, specialist IDs and artifact references |
| Research job | Scoped owner, validated input, state/stage/progress, provider, attempts/lease, results and errors |
| Prospect/evidence | Job-linked normalized candidate, ranking, duplicate/contact states and source metadata |
| Task | Scoped owner, optional investor, title, due instant, completion state |
| Proposed action | Scoped owner, kind, frozen payload, review/execution status, timestamps and error |
| Notification | Scoped recipient, event content, read state, link and deduplication metadata |
| User preferences | Guidance level, notifications and quiet hours |
| Usage event | Actor/tenant, operation kind, quantity and timestamp |
| Audit event | Actor/tenant, operation/target, outcome and safe metadata |

Some nested records are serialized structured JSON in the first local database rather than separate tables. This is an explicit local implementation tradeoff, not a complete enterprise schema. Validate parsed JSON through typed services and preserve migration compatibility.

## Referential and state integrity

Foreign keys relate offices/users and business records to their tenant. Compound scope checks prevent a valid record ID from another tenant from being reused in a local proposal/task/conversation. Restrict role and state values with schema checks and domain validation. Use transactions for action approval plus mutation/audit, and atomic claims for jobs. Index scope plus status/date/owner columns used in dashboards and worker scans.

Research results and action payloads are immutable evidence of what was proposed/produced; execution records capture what actually changed. Do not overwrite a pending proposal’s meaning after approval. Action replay must not duplicate notes or imports.

## Time

Persist timestamps as UTC ISO strings. Render dates in the user’s time zone, initially America/New_York for the demonstration. A reminder is an instant; interpreting natural-language dates needs explicit local timezone context. Quiet-hour comparison must handle ranges crossing midnight. Date-only transaction milestones require a separate domain representation in a later transaction module.

## Migration discipline

Keep ordered schema migrations under version control and track applied versions. Migrations run before seeded data or domain queries. Base seed records are created only when the demo tenant is absent. An idempotent private duplicate fixture is added for Phase 2. Primary buy boxes and intelligence metadata are initialized lazily from existing CRM records on first permitted access; restarting never replaces existing reviewed boxes or preferences. Test a clean database and upgrade an existing database before shipping a schema change. Back up the local database before migration experiments.

## Production model extensions

- Provisioning, additional role grants and SSO identity bindings with revocation; basic memberships already exist.
- Tenant-approved AI definitions, workflow versions and tool policies.
- Knowledge documents/revisions, provenance and approved memory records.
- Salesforce connection references, encrypted secret custody and canonical-to-remote mappings.
- Job leases/idempotency keys and event outbox in a distributed transactional store.
- Channel identities, link tokens, consent and delivery receipts.
- Subscriptions, seat entitlements and authoritative usage aggregates.
- Document versions, transaction milestones and storage access grants.
- Retention/deletion requests and audit retention exceptions.

Do not add speculative tables merely to claim completeness. Add constraints and migrations when a real workflow needs them.

## PostgreSQL transition gate

Translate migrations; add database-enforced tenant boundaries and composite foreign keys; migrate synthetic data separately from authorized customer data; verify SQL portability, timestamp/JSON handling, idempotency and worker locks; rehearse backup/restore and rollback. Do not operate multiple web hosts against an ad-hoc shared SQLite file.

## Phase 2 compatibility and ownership

The existing investor JSON and IDs remain intact. Reviewed `crm_update` actions synchronize affected primary-box fields and provenance; approved primary-box changes map back to the legacy fields. Additional boxes remain separate. Immutable previous versions and frozen proposal before-versions prevent silent overwrites. A legacy typical transaction price never becomes a confirmed investor budget.

`organizations.settings.ownershipPolicy` contains `organizationVisibility`, `crossOfficeSharing` and `managerAssignment`. Defaults are false, false and true respectively. Visibility is enforced by the access service; sharing grants reads, while mutations require the owner or a manager in the owning office. Assignment currently changes owner within the same office and clears explicit sharing; it does not migrate tasks, historical events or remote Salesforce records to another office.

Timestamps distinguish call attempts, actual connected contact, recap creation, approval, release and copy/compose handoff. Package `deliveryStatus` remains `not_sent` because no provider-delivery integration is active. `synthetic` flags and `demo:` disclosure references are not real evidence.
