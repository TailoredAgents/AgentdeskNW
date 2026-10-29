# AgentDesk

**One assistant. A coordinated AI workforce.**

AgentDesk is a local, persistent demonstration of Tailored Agents’ real estate workforce platform. It is a concept for a prospective New Western Georgia office pilot, not an official New Western product, partnership, or authorized production integration. Initial demonstration target: **Monday, November 2, 2026**.

The application centers on one Copilot that coordinates research, call notes, buyer context, next steps, reminders, and reviewable CRM actions. All 16 proposed specialist roles share a registry and permission model. Unimplemented specialists are explicitly marked planned.

## Local setup

Requirements: Node.js 20.19 or later and npm. SQLite is embedded; no separate database server is required for the demonstration.

This prepared workspace already has dependencies and a private local configuration. Double-click **Start AgentDesk.command**, keep its Terminal window open, and open **http://127.0.0.1:3000** after the Ready message. The commands below reproduce setup in a new checkout.

```sh
npm ci
cp .env.example .env.local
```

Set `AGENTDESK_SESSION_SECRET` in `.env.local` to a locally generated random secret of at least 32 characters. For example, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and paste the result into the ignored file. Never commit that value.

```sh
npm run dev
```

Open http://127.0.0.1:3000. The application starts with fictional records on first database access. Data lives in `data/agentdesk.sqlite` unless `AGENTDESK_DB_PATH` overrides it. Keep this directory outside source control.

`npm run dev` and `npm start` launch the web application and a local worker together. The worker checks pending work every two seconds, so research can continue while the browser is closed. `npm run worker` is available for an independently managed worker. Keep the launcher running; stopping it stops execution while retaining database state. This is a single-machine demonstration, not a distributed queue.

## Optional model and voice setup

Set `OPENAI_API_KEY` in `.env.local`, then restart the server. The key is used only by the backend. `OPENAI_MODEL` selects the text model and `OPENAI_REALTIME_MODEL` selects the voice model; model availability depends on the API project. A ChatGPT subscription is not an API credential.

Without a key, deterministic tools and local transcript extraction remain usable. Copilot clearly identifies its local demonstration behavior. Live voice displays a configuration state instead of simulating a connection. The model-backed paths require a real account integration test before any claim of live readiness.

## Engineering checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:smoke
```

The smoke suite requires the compiled build. By default it starts the built application and worker on a temporary loopback port with a disposable SQLite database, disables model credentials, runs HTTP workflow checks, then stops the processes and removes its temporary database. No manually started server is needed, and your demonstration data is unchanged.

For an intentional check against an existing local instance, set `SMOKE_BASE_URL` (for example, `SMOKE_BASE_URL=http://127.0.0.1:3000 npm run test:smoke`). That override creates fictional records in the selected instance. Neither mode connects to Salesforce or contacts investors.

For a local compiled build, `npm run build` followed by `AGENTDESK_ALLOW_PRODUCTION_DEMO=true npm start` explicitly allows the local demonstration identity under Next.js production mode. This remains bound to loopback and is **not a production authentication strategy**.

## Initial milestone

The core local workflows are implemented: a responsive workspace, persisted conversations and work, all 16 specialist definitions, synthetic investor research, transcript extraction, qualification guidance and approved local CRM changes. Enterprise identity and deployment readiness are incomplete. Live OpenAI and voice behavior still require credential-backed testing. See [PROGRESS](docs/PROGRESS.md) for the latest verification checkpoint.

Verified October 29, 2026: **36 automated tests, 45 HTTP smoke checks, lint, typecheck and production build passed**. The runtime dependency audit reported zero vulnerabilities. Browser checks exercised research, evidence, reviewed imports, transcript notes and qualification changes against the persisted local database.

## Capabilities and boundaries

| Area | Initial implementation intent | Production dependency |
| --- | --- | --- |
| Copilot | Persisted conversations and typed service dispatch; OpenAI Responses integration when configured | API project, live validation, evaluation and budgets |
| Investor Hunter | Durable research jobs, synthetic provider, explainable ranking, duplicate checks, evidence, export and import proposal | Licensed external sources, verified evidence and professional contact channels |
| Call notes | Conservative local extraction from manually entered or uploaded text; structured review and local CRM proposal | Recording integration, consent process, extraction-quality evaluation |
| Workflow guidance | Qualification gaps and contextual next actions from local records | Customer-approved, versioned procedures |
| CRM | Fictional SQLite records with actual approved mutations | Salesforce administrator authorization, External Client App, mappings and sandbox tests |
| Voice | Browser WebRTC and server-issued short-lived credential integration | API access, microphone permission and live validation |
| Tasks and notifications | Persisted tasks, queue events and local reminder foundation | Reliable deployed scheduler, push delivery policy |
| Enterprise access | Scoped local demo users and tests | SSO, provisioning, PostgreSQL, retention, operational review |
| Telegram, SMS, billing | Documented adapter and entitlement design | Implementation, organization approval, provider accounts |

See [PROGRESS](docs/PROGRESS.md) for the verified checkpoint; the table above does not imply every integration is operational.

## Project map

- `src/app`: Next.js application and HTTP boundary.
- `src/components`: browser interface components.
- `src/lib/contracts.ts`: shared types; no secrets or persistence.
- `src/server`: authorized domain services, persistence, specialists, orchestration and integrations.
- `src/server/migrations`: relational migration source.
- `scripts`: local worker and workflow smoke checks.
- `tests`: domain, permission and integration-boundary checks.
- `docs`: product, implementation, integration and operational source of truth.

Start with [MASTER_PLAN](MASTER_PLAN.md), [DEMO_RUNBOOK](docs/DEMO_RUNBOOK.md), and [PROGRESS](docs/PROGRESS.md). The complete supplied specification is retained in [ORIGINAL_BRIEF](docs/ORIGINAL_BRIEF.md).
