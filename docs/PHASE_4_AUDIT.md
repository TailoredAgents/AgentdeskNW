# Phase 4 pre-implementation audit

Starting source checkpoint: `2701e3ad70bbd10e20a97f6fe0692ad3e1161ef3`. The checkout was clean before this directive was saved. The existing database and Phase 1–3 backups are retained.

- Text: a bounded manual Responses HTTP loop already calls validated services and persists conversation history. It needs durable turn/tool receipts, validated provider parsing, complete reasoning continuation, useful configuration/failure states, and trustworthy usage reconciliation.
- Voice: browser WebRTC and ephemeral credentials exist. Tools and transcripts are currently relayed by the client; the server records an elapsed-time estimate. Trusted provider events, lifecycle recovery and authoritative usage evidence are missing.
- Research: durable synchronous stages currently process twelve synthetic fixtures. There is no external source adapter or network-safe asynchronous worker path. Live research must have separate persisted source/mode, evidence validation, bounded scope and provider receipts; it must never fall back silently to synthetic prospects.
- Security/commercial: service-level entitlement, role, record scope, approval gates, usage reservations, catalog and billing simulator are implemented. All these boundaries must remain in effect for real model/voice/research paths.
- Credentials: no OpenAI key or supported property-data-provider key is configured in the project environment. No secret values were printed. Account access, true spoken audio and live research cannot be verified without authorized credentials.
- Baseline verification recorded by Phase 3: 117 tests, 93 API checks, lint/type/build and desktop/mobile walkthrough. New tests must distinguish mocks from live verification.

Implementation ownership: root handles Responses orchestration, shared configuration/provider usage, migration/API integration and final QA. Independent voice and research work is coordinated against those shared interfaces. Official OpenAI documentation and licensed-provider documentation are consulted before implementing network contracts. No live investor outreach, production Salesforce mutation, Stripe charges or deployment is authorized.
