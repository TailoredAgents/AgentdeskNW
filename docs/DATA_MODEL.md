# Data model

## Principles

Every business row belongs to an organization and, when applicable, an office and owner. References between scoped entities must not permit cross-tenant joins. The initial implementation uses SQLite with foreign keys and migrations; exact table names/constraints in `src/server/migrations` are authoritative. Shared API types are in `src/lib/contracts.ts`.

Fictional seed records exercise the application rather than imitating a customer export. Business records carry explicit synthetic provenance. API payloads do not accept a tenant ID as an authority.

## Implemented tables and migrations

`001_initial.sql`: `organizations`, `offices`, `users`, `memberships`, `investors`, `properties`, `conversations`, `messages`, `research_jobs`, `proposed_actions`, `tasks`, `notifications`, `user_settings`, `audit_logs`, `usage_events`. The database bootstrap also creates `schema_migrations`.

Business tables generally use scoped relational columns plus a validated JSON `data` payload. Memberships use an organization/office/user composite key; scoped business owners reference it. Tasks reference investors with an organization/office/id foreign key. Messages reference a personal conversation via a composite foreign key, and their sequence is unique per conversation. Research and action statuses are generated from JSON with checked allowed values. Notification deduplication keys are unique per scoped recipient.

`002_voice.sql`: `voice_sessions` binds an actor and conversation with start/end times; `voice_calls` stores unique session/call receipts and running/completed/failed result state; `voice_events` deduplicates transcript event IDs. Server scope checks protect voice sessions; production work should strengthen their relational composite constraints alongside identity replacement.

The database enables foreign keys, WAL journaling and a five-second busy timeout. Migration application and initial seeding are transactional. No customer data migration has been attempted.

## Current logical entities

| Entity | Key data and relationships |
| --- | --- |
| Organization | ID, display name and tenant settings |
| Office | Organization, name; the authorization scope for office-level management |
| User/actor | Organization, office, name, role; fixed demo personas initially |
| Investor | Scoped owner, company, contact channels, buy-box, notes, last contact, synthetic flag |
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

Keep ordered schema migrations under version control and track applied versions. Migrations run before seeded data or domain queries. Seed only when the intended demo tenant is absent; restarting the app must not overwrite user changes. Test a clean database and upgrade an existing database before shipping a schema change. Back up the local database before migration experiments.

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
