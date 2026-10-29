# Implementation roadmap

Completion evidence belongs in [PROGRESS](PROGRESS.md). This roadmap describes gates, not claims of finished implementation.

## Phase 4 development directive — intelligence activation

The October 29 Phase 4 directive takes priority over the historical numbering below. Preserve the Phase 1–3 workflows and commercial simulator while completing these gates:

1. **Text and existing services:** configurable Responses integration; complete conversation replay; durable request/tool receipts; bounded usage; current scope, paid entitlement and human-approval enforcement. Mocked provider regression coverage passes as part of the 188-test suite. Live acceptance requires a real API project and representative multi-turn/tool conversations.
2. **Two-way voice:** WebRTC audio, trusted server-side tool execution, interruption/turn-taking, lifecycle cleanup and shared history. The sideband path is implemented for validation; microphone permission, audible responses, interruption and reconnect require a live account/browser walkthrough.
3. **External Hunter:** explicitly selected web-search research, bounded asynchronous jobs, provider source metadata, transparent uncertainty, duplicate checks and reviewable local CRM import. The fictional provider remains a separate choice. Acceptance needs a real source-backed run; public-source business contact text must not be labeled verified contact data.
4. **Integration and demonstration:** finish targeted regressions, required type/lint/test/build checks, isolated HTTP smoke and browser/mobile review; update the demonstration procedure and create a verified source checkpoint. No live connectivity or production-readiness claim follows from mocked tests.

Remaining setup includes the server-side OpenAI key and model access, a deliberate research provider selection plus a conservative cost estimate, and a browser/microphone for live voice validation. Licensed transaction data and independent business-contact verification remain later provider gates. Production identity, remote hosting, Salesforce writes, payments, messaging and outreach are outside this phase.

## Phase 2 directive checkpoint and next sequence

The numbered phases below are the original architecture roadmap. The October 29 **Phase 2 development directive** adds an operational slice across those phases: investor intelligence/access, disclosure gating, releases, composer, debriefs, calling queue, briefings and enhanced matching. These are implemented locally; their external data and communication providers remain disconnected. Do not treat the roadmap's later stages as evidence of completed production integration.

Next work, in priority order:

1. Confirm the GM's ownership/sharing/transfer rules, disclosure version and authoritative evidence, release audience/source, approved templates and measurable pilot outcomes.
2. Add an authorized Salesforce sandbox with field mappings for multiple buy boxes, investor ownership and disclosure references; implement token lifecycle and conflict-aware synchronization.
3. Connect approved release/media sources and a real disclosure evidence provider. Manual link attestation must be replaced or supplemented by actual recipient access checks where supported.
4. Evaluate a licensed Georgia transaction/contact source using labeled examples; preserve uncertainty and private duplicate checks.
5. Validate configured live text/voice on actual devices. Harden identity, retention, worker supervision and cross-device sessions before any real-data pilot.
6. Employee Slack/SMS adapters are implemented with expiring account linking, signed/deduplicated ingress, a shared Copilot thread, optional reminders and app-based approvals. Complete actual Slack installation and Twilio number/recipient setup, then verify real delivery. General multi-workspace OAuth and investor outreach remain future work; Telegram is optional. See MESSAGING_SETUP.md.
7. Add advanced comps, valuation and richer transaction/management analytics only when the required evidence and customer policy are available.

## Phase 1: reproducible foundation

Initialize Node/Next.js/React/TypeScript, shared contracts and lint/test configuration. Establish the premium responsive shell, local database migrations, fictional organization/office/users, scoped records and demonstration access. Exit when setup is repeatable and the first build serves without broken navigation.

## Phase 2: persistent assistant and policy

Implement conversations, message artifacts, common specialist definitions, direct services and validated tool dispatch. Add signed local sessions, role/record scoping, usage and audit foundation. Exit when refresh preserves history and tests reject cross-tenant/office/owner access.

## Phase 3: flagship vertical workflows

Research: create job → persist progress → produce synthetic evidence/rank → check duplicates → export → prepare import → approve once. Notes: text → structured extraction → review source excerpts → prepare note → approve → verify local CRM state. Guidance: read investor context → identify missing criteria → suggest next action. Exit when the whole flow works through the UI and API smoke suite.

## Phase 4: mobile, voice and proactivity

Add installable metadata, a microphone entry point, WebRTC setup, shared conversation/tool context and truthful connection errors. Build persisted reminders, preferences and event notifications. Exit voice only after a valid API account and browser microphone test; absent credentials, record integration as implemented but unverified.

## Phase 5: authorized pilot integrations

Dependencies: customer sponsor and administrator authorization, approved procedures, test users, selected licensed research provider, verified contact source and Salesforce sandbox. Implement External Client App OAuth with PKCE, encrypted token custody, organization/field mapping, record ownership, throttling and sandbox contract tests. Replace synthetic evidence with actually fetched source records and evaluate identities/contact accuracy. Exit when real records can be read and proposed writes reviewed in a sandbox with approved permissions.

## Phase 6: production operations

Replace demo login with SSO, implement provisioning and revocation, migrate to PostgreSQL, supervise workers, establish backups and restoration tests, retention/deletion controls, alerts and incident response. Add provider budgets, robust idempotency and request replay protection. Commission security/access testing. Exit only after explicit production launch authorization.

## Phase 7: workforce breadth

Make the remaining catalog specialists operational against permitted data. Prioritize relationship preparation, qualification updates, marketing drafts and acquisition handoffs before speculative autonomous actions. Add document/transaction versioning and approved knowledge retrieval. Evaluate each specialist on its own evidence quality and completed workflow, not catalog presence.

## Phase 8: channels and commercial controls

Implement one organization-approved non-SMS channel with signed/replay-safe webhooks and expiring account linking. Add SMS only with consent, entitlements, spend limits and provider registration. Add seat subscriptions and usage reporting through an external billing service; do not store payment details. Expand office permissions and CRM adapters after proving one pilot.

## Immediate remaining inputs

- API project key and text/voice model access for live validation.
- Customer authorization, Salesforce sandbox, admin owner and object/field mapping.
- Licensed source provider and coverage/cost evaluation for Georgia transactions.
- Approved qualification/workflow documents and customer communication policy.
- Hosting/identity/retention decisions before any real customer information is ingested.

These inputs do not block fictional local demonstration development. They do block claims of connected production readiness.
