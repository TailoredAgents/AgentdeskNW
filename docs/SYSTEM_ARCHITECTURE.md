# System architecture

## Local implementation structure

```mermaid
flowchart LR
  Web[Responsive web application] --> API[Authenticated HTTP boundary]
  Voice[WebRTC voice client] --> API
  API --> Copilot[Manager orchestrator]
  API --> Services[Scoped domain services]
  Copilot --> Tools[Typed tool registry]
  Tools --> Services
  Services --> DB[(SQLite local database)]
  Worker[Local worker] --> Services
  Services --> Providers[Provider interfaces]
  Providers --> Demo[Synthetic research / local CRM]
  Copilot --> Responses[OpenAI Responses API]
  API --> Realtime[OpenAI Realtime credential endpoint]
```

The application is a modular monolith. Browser components receive shared contracts from `src/lib/contracts.ts`; they do not import persistence or integration credentials. `src/server` owns permission checks, domain state changes and integration execution. Next.js route handlers normalize transport details and errors.

Phase 2 extends this structure rather than replacing it. `intelligence-contracts.ts` holds profile, buy-box, release, package, debrief and calling contracts. `access.ts` enforces relationship ownership/sharing and opaque duplicate collisions. `intelligence.ts` owns reviewed buy boxes, disclosure evidence, matching, calling priorities and briefings. `workflows.ts` owns versioned releases, templates and eligible package review/handoff. `debrief.ts` turns employee recaps into source-backed proposals and explicitly requested tasks. `phase-two-api.ts` runs inside the existing authenticated, rate-limited request boundary. `channels.ts` is a disconnected provider foundation, not an active Slack integration.

## Request lifecycle

1. Check the allowed local origin and demonstration configuration; validate the signed session.
2. Resolve actor identity from trusted server state, never a model-supplied organization or role.
3. Validate a bounded input schema and apply request limits.
4. Retrieve only permitted records and conversation history.
5. Execute a direct service operation or the Copilot’s bounded model/tool loop.
6. Recheck permissions at the domain service, including owner/office and referenced record scope.
7. Commit state and audit metadata transactionally where possible.
8. Return typed, provenance-aware results and persist the conversation outcome.

## Orchestrator

Copilot is a manager, not a handoff to a swarm of independent speakers. The Responses API exposes validated application functions. Tool responses include `specialistIds`, a message, optional structured data and artifact references. The assistant synthesizes only confirmed tool results. It cannot approve its own proposals.

Simple summaries of actual task/job state, duplicate checks, task creation and local record lookup use deterministic services. The optional model interprets natural language and coordinates these functions. Its loop has a fixed tool-call budget to limit runaway cost. The application retains its own conversation state rather than relying exclusively on provider-side memory.

The local fallback supports a narrower set of requests and is labeled as such. It is a useful offline demonstration of service execution, not an equivalent language model.

Phase 2 adds typed tools for the calling queue, pre-call briefing, property releases, recap capture, reviewable recap changes and package composition. Text and live voice use the same dispatch. Approval and package handoff are deliberately absent from the model tool registry: an employee reviews the exact result in the app. `compose_deal_package` applies the same disclosure/release/media checks as the composer screen. Offline example commands include “Who should I call today?”, “Get me ready to call Mike” and “I just talked to Mike…”; exact selections and nuanced changes remain available in workflow forms.

## Persistence and jobs

SQLite supports local transactions and foreign keys. Jobs store input, owner scope, status, progress, stage, attempts, timestamps, provider, result and errors. The worker claims eligible work and handles stale running jobs on recovery. Cancellation is checked before further progression; completed results remain inspectable. Job completion generates a deduplicated notification.

The standard launcher starts a separate worker process alongside Next.js; `npm run worker` also starts it independently. It checks pending work every two seconds and advances one stage per eligible job. SQLite transactions claim stages with a 30-second lease, with a one-second delay between stages. A stopped laptop/server does not run work; persisted jobs resume on subsequent processing. This queue architecture is limited to a local single-machine deployment. PostgreSQL leasing or a queue such as Redis-backed workers will replace it for concurrent hosts.

Property release commands carry a source, explicit audience, unique event key and expected version. Successful commands create one persisted revision and per-employee notification; repeat keys with changed payloads are rejected. Matches are calculated for the requesting employee and are never stored with protected buyer identities in shared release data. Calling priorities are recalculated from current authorized state when requested. This is deterministic recomputation, not a continuously running autonomous calling agent. Revised/withdrawn releases invalidate old package content; package reads, approval and handoff recheck current evidence and permissions.

## Integration boundaries

| Boundary | Current local behavior | Production path |
| --- | --- | --- |
| CRM adapter | Authorized fictional buyer lookup and approved note/import mutations | Salesforce delegated OAuth, schema mappings, field access, replay protection |
| Research provider | Deterministic synthetic candidates and evidence | Licensed transaction/parcel APIs plus cited public professional research |
| Model provider | Responses API if configured | Project-scoped credentials, evaluated model selection, quotas and budgets |
| Voice | Authenticated short-lived credential and browser WebRTC | Live quality testing, sideband/server attestation, production metering |
| Channels | Web is operational surface; channel design documented | Verified external identity links and replay-safe webhooks |
| Knowledge | Baseline fixture guidance | Approved document revisions and permission-aware retrieval |

## Trust and memory boundaries

Employee context, business records, procedure knowledge and execution history are separate categories. Model hypotheses do not become verified CRM facts. Transcript text and retrieved documents cannot change system instructions, tools, access scopes or approval state. Long-term approved-memory promotion and versioned SOP retrieval are future work; current persistence consists of messages and domain records.

## Production transition

Introduce managed OIDC/SSO and membership provisioning before remote exposure. Move schema to PostgreSQL, enforce tenant relationships at the database layer, and test cross-tenant access independently. Deploy a separately supervised queue worker, migrations, backup/restore, secrets manager, structured redacted telemetry, provider rate/cost budgets and retention operations. Do not deploy the local demo role switcher.
