# Data model

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for completion status and development order. This document records schema contracts and historical preservation evidence, not permission to apply migrations to the active database.

## Shared-work/mobile migrations — local acceptance

Migrations 022–024 passed integrated HTTP checks and preservation acceptance on a disposable schema-021 copy: all **266 prior rows across 82 tables** remained byte-for-byte unchanged by migration, excluding the migration journal. Existing drafts, wallet operations and holds survived; new pairing, job completion, generic notice and revocation checks passed. Integrity checks passed and no provider call was added. The active schema-009 local database remained untouched with its file checksum unchanged. Evidence: ignored `artifacts/mobile/migration-preservation.json`. This does not establish deployed schema state.

| Migration | Written schema and intended contract |
| --- | --- |
| 022 — shared work commands | `work_conversation_reviews` binds an immutable review code to the employee/conversation, run and plan versions, exact quote/maximum, channel, expiry and review result. `work_conversation_commands` retains scoped request identity/hash and immutable command results for replay. Both reference membership and conversation; reviews also reference the run. Service checks enforce their shared scope. |
| 023 — demonstration phone sessions | `mobile_pairings` stores scoped single-use code hashes and expiry/consumption; `mobile_sessions` stores the membership/role snapshot, device name, hashed bearer credential, lifetime and revocation; `mobile_pair_rate_limits` bounds pairing attempts. Session validation rechecks current membership and role. These are demonstration credentials, not production SSO or company provisioning. |
| 024 — phone notification foundation | `mobile_push_devices` binds one opt-in registration to a mobile session and employee, with unique nullable Expo token, platform and enablement timestamps. `mobile_push_outbox` binds a notice to device/run/plan/kind, with unique deduplication and ticket keys, delivery state and reconciliation timestamps. Live sending defaults off. |

Phone notices use generic wording and an exact job link; opening the job still requires current scope. Queue state, Expo acceptance and a push-service receipt remain different from a displayed phone notification. Interrupted or ambiguous sends remain unresolved instead of retrying automatically. Per-device opt-in and existing quiet hours do not yet provide preferred-channel routing, cross-SMS/push coalescing or employee-specific timezones. No physical-device push acceptance or real delivery is established by these tables.

The shared contracts are in `src/lib/work-conversation-contracts.ts`, `src/lib/mobile-contracts.ts` and `src/lib/mobile-notification-contracts.ts`. All phone transport and worker access reuse the existing server services; no separate phone CRM, conversation store or spendable wallet is introduced. Full native Work/Inbox, proactive/SMS acceptance and production identity/operations retain their separate roadmap gates.

## Durable work and fictional job budgets — migrations 020/021

Migration 020 adds five tables: `work_runs`, `work_run_plans`, `work_run_events`, `work_run_commands` and `work_step_receipts`. A run binds an organization/office/employee, stable request ID/hash, current version and plan version, status, lease token/expiry/step, timestamps and validated JSON. Plans retain immutable instruction/step versions. Events retain progress; commands bind expected-version employee mutations to scoped replay keys. One immutable receipt per run/step prevents a completed local effect from being executed again. Child records reference their parent run; service reads and every dispatch enforce that run's private scope. An office manager cannot inspect another employee's private jobs.

Each stored step includes its capability ID, validated input, dependencies, fictional estimate/rate version, resolved input, state, attempts, timestamps and actual result/artifacts. References can read only safe paths inside completed declared dependencies. Plan revisions preserve completed steps and receipts while changing remaining work. Synthetic research is linked through its saved child-job ID and required result-collection step; it retains the existing research schema and service. Source-access checks redact unavailable results on reads rather than deleting historical evidence.

Migration 021 adds `work_budgets` and immutable `work_budget_events`. The private budget records the whole assignment's plan hash/version, quote ID, expiry, estimate/maximum, approved maximum, consumed/reserved cents, state and backing wallet operation. Quote/decision/step events preserve their payload hashes and reject conflicting replay. These are fictional job-control records, not real provider billing or payment receipts.

Budget reservations and per-step settlements reuse `wallet_operations` and the append-only `wallet_ledger`. New operations identify `copilot-work` and `workRunId`; old sample records need no rewrite. The same wallet admits every job and sample against available funds and spending limits. A completed local mutation, fictional charge and step receipt commit atomically. Cancellation releases unused reserves, retains settled usage and preserves any unresolved hold. No auto-top-up settings, payment tables or live provider-cost settlement are added in this checkpoint.

Both migrations are additive. Preservation validation used a read-only backup of the active schema-009 database, advanced the copy with prior commit `2d545f3` to schema 019, seeded a manual inbox draft and wallet purchase/hold, then applied 020/021. All **228 existing rows across 75 tables** were byte-for-byte preserved, excluding the migration journal. The draft, balances and original hold survived; a new four-step job completed for 75¢ simulated usage. Foreign-key/integrity checks passed, no provider operation was added, and the active source remained schema 009 with its file checksum unchanged. Evidence is in ignored `artifacts/work/migration-preservation.json`; release-wide checks belong in [PROGRESS.md](PROGRESS.md).

See [WORK_EXECUTION.md](WORK_EXECUTION.md), [BILLING_ARCHITECTURE.md](BILLING_ARCHITECTURE.md) and the exact migrations for supported states and boundaries. Browser/server types for this domain are in `src/lib/work-contracts.ts` and `src/lib/wallet-contracts.ts`.

## Company correspondence — communications Phase 4A

Migration 018 adds `communication_company_demo_seeds` and immutable `communication_source_links`. Company seeding is separate and additive: original Gmail/Outlook/text account IDs, source records, draft histories and statuses are not renamed or rewritten. Source links bind organization, office, owner, account and message through composite foreign keys; a scoped unique source-system/reference key prevents duplicate mappings. A second trusted fictional reference attaches to the existing message rather than creating another message or workflow action.

Account JSON now carries source system/coverage/label, demo transport, access state/revision and primary-account status. Server normalization projects legacy records into the new capability contract without rewriting stored legacy data. Capabilities distinguish body access, full history, local drafts and simulated sending; attachment files remain unavailable. Send-review context and Copilot access references bind the current account state, so revocation/restoration cannot reuse an earlier authorization snapshot. Redaction is a read projection; it does not delete saved correspondence. See [COMPANY_EMAIL_DEMO.md](COMPANY_EMAIL_DEMO.md) and [PROGRESS.md](PROGRESS.md).

## Reviewed communications — Phase 3

Migration 017 adds private immutable `communication_send_reviews`, `communication_send_receipts` and `communication_workflow_actions`. Reviews bind exact saved sender/recipient/content, versions, expiration and protected-context hash. One review can produce only one simulated receipt; scoped event keys make repeats safe. The outgoing message remains explicitly `simulated_sent`, and its archived draft distinguishes simulation from ordinary discard. Source-linked action receipts retain the original private message/source reference and reviewed text; shared journey observations carry only minimal channel/time/source labels. No provider send or payment ledger is created. See COMMUNICATIONS_WORKFLOW.md.

## Unified inbox — communications Phase 2

Migration 016 adds correspondence accounts, threads, messages, saved/discarded drafts, replay receipts and a persistent demo-seed marker. Organization, office and employee ownership is independent of CRM manager visibility. Provider/source references, account identity, plain message text, attachment metadata, explicit read/handling status and investor association are preserved separately from assistant chat. Sender/recipient are server-bound when a draft is saved. Current permissions filter linked investor details on every read. See COMMUNICATIONS_INBOX.md and the migration for exact schema.

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
| Copilot work run | Private owner, request identity, versioned instructions/steps/dependencies, lease, state, outputs and immutable receipts |
| Work budget | Same private run scope, quote/plan binding, approved maximum, simulated consumed/held amounts and wallet operation |
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

## Structured relationship reports — migration 019

`relationship_reports` is an append-only, tenant/office/author/investor-scoped ledger. Each JSON report records topic, typed value, optional approved buy-box scope, exact source note, optional original statement time, server capture time and author. Corrections reference a previous report; a unique correction index prevents branches. Update/delete triggers preserve originals. Current active/superseded state is projected from correction links, not rewritten into old rows.

Writes require an expected report count and a hash of current investor/buy-box/contact/activity/report context, with scoped event keys and payload hashes for exact retries. Canonical criteria, private employee memory and private correspondence remain separate. No provider event, wallet debit or automatic CRM proposal follows from adding a report. Migration 019 adds the ledger without rewriting existing records. See RELATIONSHIP_QUALITY.md for preservation verification.
