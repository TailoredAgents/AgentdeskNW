# Salesforce integration

## Current status

No New Western Salesforce credentials, administrator authorization, schema or Marketplace access has been supplied. The initial CRM is a local adapter backed by fictional SQLite records. Approved changes genuinely update that local database. They are not Salesforce API calls.

The core CRM vocabulary is independent of Salesforce object names. Investor IDs in the demonstration are local IDs, not Salesforce record IDs. Production object/field mapping must be explicitly configured per tenant after discovery with the customer.

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
