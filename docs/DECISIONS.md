# Architecture decisions

## ADR-001 — Local modular TypeScript monolith

**Accepted October 29, 2026.** Next.js App Router and React provide the application and HTTP boundary; server modules own business logic. Node 20.19 is already available. Strong shared types reduce integration friction. No Python backend or microservices are introduced without a concrete need.

Tradeoff: the web and local queue initially share a machine. Production workers and persistence must be separated operationally before horizontal scaling.

## ADR-002 — SQLite for the first demonstration

Use better-sqlite3 with migrations, relational constraints, transactions and tenant-scoped queries. This provides real persistence with no local database service. Preserve a persistence boundary so PostgreSQL can replace it before multi-instance production.

Tradeoff: local file storage is not enterprise availability, backup, encryption or database-enforced row-level security. Tests must verify scope; future production work must add database controls and operational recovery.

## ADR-003 — Manager with direct typed tools

Use typed server-side `fetch` against the official OpenAI Responses REST API for a five-round bounded tool loop, with Zod-validated arguments. Copilot owns the conversation and dispatches to domain services. This is a justified manager-orchestrator implementation, not a requirement to invoke a separate model for every employee.

The current Agents SDK documentation describes manager agents and agents-as-tools but lists a newer Node baseline than the existing environment. The latest OpenAI client package also requires Node 22; the available runtime is Node 20.19.3. Direct REST calls avoid an unsupported SDK/runtime combination. A direct Responses manager avoids unnecessary runtime changes and abstraction while retaining structured calls and validation. Reevaluate SDK adoption if handoffs, tracing or agent composition justify it. [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling) and [Agents SDK overview](https://openai.github.io/openai-agents-js/).

## ADR-004 — Honest adapters and statuses

All fictional research/CRM records carry synthetic/demo provenance. The product never treats the reported founder performance advantage as verified. Unimplemented employees remain planned. A configured API key indicates configuration, not a passed connection test.

## ADR-005 — Server authority over actions

Tool inputs are untrusted. Actor scope comes from the session. CRM notes/imports are explicit proposals; the approval endpoint authorizes a specific stored proposal and applies it once. No conversational phrase or model-generated result is approval authority. External communications and binding business actions are outside initial executable scope.

## ADR-006 — Voice via WebRTC

Use OpenAI Realtime browser WebRTC, server-created short-lived client credentials and shared backend tools. Keep microphone controls, connection errors, interruption support and teardown explicit. Do not substitute text-to-speech/dictation for the live feature. The checked documentation also describes a newer GPT-Live API; this implementation deliberately targets the supported Realtime interface and a configurable model. [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc).

## ADR-007 — Customer procedures are not invented

The demonstration uses a clearly labeled baseline qualification checklist. Approved New Western knowledge is not available. Versioned, scoped knowledge ingestion and customer sign-off precede any claim that advice reflects official company procedure.

## ADR-008 — Local-only demo identity

Signed cookies and loopback enforcement bound the initial fixed-persona experience. `AGENTDESK_ALLOW_PRODUCTION_DEMO` only supports a compiled local Next.js demonstration, never production deployment. Managed SSO and membership lifecycle remain a release gate.

## ADR-009 — Salesforce External Client App

As of the current documentation, new Connected App creation is restricted and External Client Apps are recommended. The planned user-facing connector uses Authorization Code/Web Server flow with PKCE and narrow scopes, plus actual user object/field permissions. No customer schema or admin authorization is assumed. [Salesforce authorization](https://developer.salesforce.com/docs/platform/api-rest/guide/intro-oauth-and-connected-apps.html).

## ADR-010 — No deployment or contact during initial build

Work stays local. Investor outreach, external messages, production CRM changes, publishing and changes to third-party accounts require explicit authorization. Documentation and harmless local preparation continue independently of missing credentials.
