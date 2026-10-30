# Salesforce integration

## Current status

No New Western Salesforce credentials, administrator authorization, schema or Marketplace access has been supplied. The initial CRM is a local adapter backed by fictional SQLite records. Approved changes genuinely update that local database. They are not Salesforce API calls.

The core CRM vocabulary is independent of Salesforce object names. Investor IDs in the demonstration are local IDs, not Salesforce record IDs. Production object/field mapping must be explicitly configured per tenant after discovery with the customer.

## Company-email priority — October 30, 2026

The founder reports that Alex uses company-provided email and opens it **only inside Salesforce**. The owner has therefore prioritized the **company Salesforce email workflow** for AgentDesk NW. Optional Gmail/Google Workspace and Outlook/Microsoft 365 connections remain useful for other approved accounts and customers. The report establishes the intended employee experience, but not which service hosts the mailbox or which email records/actions this Salesforce org exposes. This section specifies a planned integration, not an implemented connector.

Salesforce documents several outgoing routes: Salesforce, Gmail, Microsoft 365 and a company relay. Using the Salesforce interface therefore does not identify the configured transport. [Salesforce email setup guidance](https://help.salesforce.com/s/articleView?id=000382640&language=en_US&type=1).

Email activity access also depends on configuration. Salesforce's Sync Email as Salesforce Activity can expose EmailMessage/Task records through APIs, while capture can be limited to headers. Its documented limitations include unsynced attachments, unmatched-message gaps and possible duplicates. These are discovery considerations, not findings about New Western's configuration. [Activity synchronization](https://help.salesforce.com/s/articleView?id=sales.eac_email_activity.htm&language=en_US&type=5), [capture considerations](https://help.salesforce.com/s/articleView?id=sales.eac_email_activity_e2c_considerations.htm&language=en_US&type=5).

Treat the source of readable correspondence and the approved sending route as separate capabilities. An administrator-confirmed Salesforce activity source can supply the permitted correspondence it actually exposes; it must not be labeled a complete inbox without evidence of that coverage. A mailbox or send adapter is enabled only after its own supported route, sender identity and delegated permissions are confirmed. Never silently fall back to an employee's personal email account.

### Planned capability discovery

| Capability | What must be confirmed | Product behavior until confirmed |
| --- | --- | --- |
| Read CRM email activity | Approved objects/fields, captured-message coverage, body/participant availability, delegated record access and retention | Fictional Salesforce-source examples only; no claim of live history or complete mailbox coverage |
| Read company mailbox | Actual mailbox host, supported access method, company consent and employee mailbox identity | Do not offer a connected live inbox or infer access from CRM permission |
| Synchronize changes | Supported incremental mechanism, cursors, deletions, limits and reconciliation | Explicitly scoped demo arrivals; no promise of continuous synchronization |
| Prepare a remote draft | Supported draft location and sender/account permissions | Existing private AgentDesk draft; no claim of provider synchronization |
| Send a reviewed reply | Company-approved transport, permitted sender/reply-to identities, recipient scope, threading and outcome reconciliation | Existing reviewed simulator only; CRM activity creation is not proof of delivery |
| Log a confirmed outcome | Approved activity schema, allowed write path, external identifiers and duplicate rules | Keep local receipts separate from remote CRM write status |
| Read or share attachments | File access, recipient eligibility, company policy and approved transfer mechanism | Metadata only; unavailable files cannot be read, attached or described as sent |

### Planned adapter and permission boundaries

Reuse the existing Inbox, relationship context and exact-review services. Extend the provider contract deliberately: the current code supports fictional `gmail`, `outlook` and `twilio` accounts only. A future Salesforce activity source needs its own source identity and coverage metadata, distinct from its optional sending transport. A label change alone is not an integration.

Retain organization, office, employee and remote-source bindings for every account, thread and message. Use only administrator-approved schema mappings and delegated source permissions. Reading an investor or managing an office must not grant general mailbox access. Do not copy email activity visible through a broader CRM role into another employee's private mailbox or assistant history by default. Source access, mailbox access, field visibility and sender permission must each be checked under the approved policy, including replay and revocation.

Correlate permitted CRM activity, mailbox messages and local receipts without mixing their authority. Store separate remote record/message/thread identifiers and origin references. Where reliable identifiers are available, use scoped mappings to recognize the same message seen through two adapters; do not merge correspondence based only on a subject or matching text. An ambiguous match remains reviewable. Reconciliation must not create duplicate sends, CRM activities, journey notes or follow-ups, and a delivery receipt must never be inferred from the mere existence of a CRM record.

Bind each send approval to the exact account/transport, allowed sender and reply-to, recipients, content, attachments, thread context and current property/disclosure eligibility. Changes require fresh review. Provider acceptance, delivery confirmation, failure and uncertain outcomes remain different states. Only a confirmed remote outcome can advance the corresponding live state; existing simulated receipts remain visibly fictional.

### Next demonstration and live acceptance

Before New Western authorizes access, implement a fictional company-email/Salesforce source in the existing communications demonstration. Show email linked to the permitted investor, Copilot retrieving relevant history, a grounded draft, exact reviewed simulated sending, a fictional reply and separately reviewed follow-through. Exercise both an activity-only account with no sending capability and a company-email account with simulated send capability so the interface explains actual capabilities instead of assuming them. Gmail/Outlook remain optional external examples. No New Western host, custom field, connected org or authorization is fabricated.

After discovery, implement one approved company-email route end to end in an authorized test environment. Acceptance must demonstrate restricted reads, sender binding, exact approval, disconnect/revocation, duplicate-safe synchronization and send reconciliation, with CRM logging tested separately from transport delivery. Live sending stays unavailable if only activity reading is approved or technically available.

## Adapter boundary

The CRM layer owns permitted buyer lookup, record detail, duplicate matching and proposed note/import execution. Callers supply the trusted actor and validated intent. Generic models may not construct arbitrary SOQL, field names, object names, URLs or direct write payloads.

Expected production operations:

- Search/read mapped investor, contact, opportunity, task and approved activity records.
- Map local canonical fields to verified Salesforce object/field identifiers.
- Check ownership/sharing/field visibility under the delegated user.
- Prepare a minimal change set and show before/after values.
- Execute only a specific approved proposal; record provider IDs and confirmed outcomes.
- Handle revoked access, API limits, partial failure and safe retry without duplicate records.

`src/server/crm.ts` includes `CrmAdapter` and `DemoCrmAdapter`. A separately defined, unselected `SalesforceReadAdapter` validates administrator-supplied object/field identifiers, HTTPS Salesforce instance host, API version and bound employee/office/organization. It issues an assigned-owner query limited to 100 records through a server token callback, with timeout and safe error handling. It is not connected to the UI and does not write remote records.

`prepareSalesforceOAuth` creates state, PKCE verifier/challenge and an authorization URL. Callback/state persistence, token exchange, encrypted token storage, refresh and actual connection setup remain unimplemented. Adding a credential alone does not activate Salesforce. The source code and [PROGRESS](PROGRESS.md) identify the current subset.

## Implemented qualification update proposal

`PATCH /api/investors/:id` accepts `{ changes }` and creates a `crm_update` proposal; it does not apply a patch immediately. Allowed fields are counties, strategy, minimum/maximum budget, financing, rehab and timeframe. Empty updates, unknown fields and inverted budgets are rejected. The proposal freezes the relevant before-values, and approval rejects stale changes if those values no longer match.

The model tool `prepare_investor_update` uses an investor ID plus `confirmedChanges`; nullable fields mean unchanged or unconfirmed and are omitted from the proposal. It must use employee-confirmed facts, not infer a qualification budget from research purchase prices. Both entry points call the same scoped proposal service. Only the separate authenticated approval operation applies it to the local sample CRM.

## Current authentication guidance

Salesforce now recommends External Client Apps; creating new Connected Apps is restricted as of Spring ’26, although existing Connected Apps continue to work. The planned new integration should use an administrator-approved External Client App. [Salesforce REST authorization guide](https://developer.salesforce.com/docs/platform/api-rest/guide/intro-oauth-and-connected-apps.html).

For an employee-facing application, use Authorization Code/Web Server flow with PKCE. Keep the client secret and refresh tokens on the server. Request narrow scopes appropriate to the approved feature set; an API scope does not bypass the user’s object, field or sharing permissions. Salesforce’s guidance distinguishes this delegated flow from backend client-credentials integrations. [Salesforce architecture guidance](https://www.salesforce.com/blog/architecting-inbound-governance-external-client-apps/).

These are integration design choices, not a claim that an OAuth connector is already active.

## Proposed OAuth sequence

1. An authorized tenant administrator enables the integration and confirms allowed Salesforce organization/domain.
2. The server creates an expiring, single-use state record bound to the tenant, user, redirect URI and PKCE verifier.
3. Redirect to the configured Salesforce authorization endpoint with the selected scopes and challenge.
4. On callback, validate state, age, user/tenant association and exact redirect before exchanging the code.
5. Verify the returned Salesforce organization and user identity. Reject unexpected orgs or instances.
6. Encrypt tokens using a managed key, store only a server-side reference, and retain scopes/expiry/connection health.
7. Refresh with concurrency control; mark revoked/invalid connections disconnected and stop dependent jobs.
8. Allow explicit disconnect and revoke/delete credential material according to policy.

The application must not accept arbitrary token exchange URLs or instance hosts. This prevents a tenant setting from becoming an unrestricted server-side request destination.

## Mapping and access questions

| Canonical data | Must be confirmed with customer |
| --- | --- |
| Investor/person/company | Lead, Contact, Account or custom object; record types and identity rules |
| Budget/strategy/geography | Exact field API names, types, picklists and source-of-truth policy |
| Ownership/office | Assignment fields, sharing rules, territories and manager visibility |
| Notes/transcripts | Approved object and attachment policy, sensitive content/retention limits |
| Tasks/commitments | Status values, due date semantics, related-record fields and assignment |
| Property/deal/opportunity | Authorized object schema and which fields may leave Salesforce |
| Duplicate detection | Existing matching rules, blocked duplicates and review workflow |

Do not fabricate a New Western-specific object or field. Avoid storing full remote copies when a scoped reference and limited cache suffice.

## Write safety

Store exact proposal payload and target, its creator and timestamp. Approval rechecks actor access and record state. Repeated approval cannot execute twice. On conflicts, return a new review requirement rather than overwriting changes. Remote request IDs/idempotency keys and provider responses must determine actual success. A model statement is never proof of a write.

## Sandbox acceptance gate

Require written customer authorization, an administrator owner, External Client App configuration, least-privilege test user, approved schema mapping, representative fictional sandbox fixtures and callback/secrets configuration. Test read restrictions, field-level restrictions, expired/revoked tokens, cross-office records, duplicate conflicts, repeated approvals, API limit responses and disconnected behavior. Production remains disabled until those checks pass and deployment is authorized.

## Phase 2 supplemental intelligence and mapping

AgentDesk now stores multiple versioned buy boxes, field-level source/review metadata, privacy-scoped relationship context, disclosure fixtures and pending changes beside the local CRM. `salesforceRef` remains null in the demo; `local_demo` is a synchronization state, not a remote receipt. Existing investor IDs and Phase 1 records are preserved.

The reviewed mapping bridge keeps legacy primary criteria consistent: approving a `crm_update` changes the corresponding primary buy-box fields; approving the primary buy box maps its counties, strategy, price, rehab and financing back to the local investor. Unchanged fields retain their original provenance. Additional boxes remain independent. Stale versions/before-values fail instead of overwriting newer data. Typical research transaction prices remain unconfirmed evidence and never populate an investor’s confirmed budget automatically.

Customer discovery must choose whether multiple boxes belong in related custom records, approved standard fields or supplemental AgentDesk storage. Confirm object/field types, multi-value conventions, external IDs, source-of-truth precedence, version conflicts, supported remote transactions and Salesforce synchronization status before enabling any write adapter. The existing bridge is a canonical local mapping seam; it is not a completed customer-specific Salesforce mapping.

AgentDesk ownership is configurable for the demo, but cannot replace Salesforce sharing or field security. Production duplicate checks must be authorized to return only permitted details; protected same-organization collisions currently return an opaque possible-duplicate flag with no ID. Production assignment/transfer must follow approved remote rules and delegated user permissions.

Property releases currently use explicit local acquisition/manager entry with versioned event keys. Their source system, Marketplace permissions, media access, disclosure document/version, signing provider and approved transaction-stage vocabulary remain unknown. Neither a release nor a signed synthetic disclosure fixture establishes access to a New Western system.
