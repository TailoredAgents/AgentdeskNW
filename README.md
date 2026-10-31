# AgentDesk NW

**One assistant. A coordinated AI workforce.**

AgentDesk NW is Tailored Agents' working demonstration of a business AI workforce for New Western's dispositions, acquisitions and management employees. It is a prospective-customer concept, not an official New Western product or an authorized production integration. Business fixtures are fictional.

## Start here

- **[Roadmap to completion](docs/IMPLEMENTATION_ROADMAP.md): the single place for where we are, what comes next and what counts as finished.**
- [Product direction](MASTER_PLAN.md): confirmed audiences, experience and commercial decisions.
- [Documentation map](docs/README.md): current specifications versus historical briefs/reports.
- [Progress evidence](docs/PROGRESS.md): dated implementation, checks and release limits.
- [All sixteen specialists](docs/AI_EMPLOYEES.md): current scope and the depth still required.

The target is a primary iPhone/Android app and a detailed desktop workspace, with one shared Copilot and optional $19/month employee SMS. Slack is retained as an optional later integration because the workforce does not currently use it. Deeper role workflows develop alongside mobile. App access is included in the workforce subscription.

## Current state

**Current local checkpoint: whole-assignment metered admission with test transport**, verified October 30, 2026, extending automatic top-up checkpoint `32580fb`. Planning and delegated parts share one server-derived maximum, dispatch claims survive restart, and authoritative test receipts settle once. Unknown outcomes retain holds; cancellation releases only unused funds. This server foundation uses fictional tariffs and is not yet connected to the existing live AI paths. Desktop/phone top-up, analysis, intake and work controls remain available.

Verification: **726 root tests, 27 mobile tests, 1,303 HTTP/workflow checks and 12 metered restart/adapter checks**, plus root typecheck/lint/build. Mobile typecheck/tests passed; the unchanged native exports/interface walkthrough remain the previous checkpoint's evidence. Migration 029 preserved all 316 prior rows across 98 tables on a disposable schema-028 copy. No dependency change. Sixteen specialists remain two locally ready, thirteen demo and one planned; effectiveness and company-approved expertise are not established.

**Mobile is prepared locally, not yet installed or released.** The phone-width browser rehearsal passed pairing, shared history, cross-surface cost approval, pause/resume, background worker completion and remote device revocation. Native binary builds, real phone speech/push and store distribution remain pending. [Mobile preparation notes](mobile/README.md) distinguish each acceptance layer. Whole-job costs remain fictional; live model/provider usage is separately metered.

Implementation follows the single roadmap. C1–C4 remain partial. Next: chosen briefings/watchers and proactive usefulness, followed by further role depth. Live-host spending integration remains required before broader paid autonomy under the canonical roadmap. The owner has deferred real-world/device/provider acceptance to a later assessment; independent fictional development continues.

Repository: [TailoredAgents/AgentdeskNW](https://github.com/TailoredAgents/AgentdeskNW). The owner reported a Render deployment; the latest deployed revision has not been verified. Push and deployment are separate. Real company data, live mailboxes/investor delivery, actual payments, managed identity and broad expert autonomy remain unfinished.

## Local web setup

Requirements: Node.js 20.19 or later and npm. SQLite is embedded. The native client uses its own Node/dependency environment; see its README.

This prepared workspace has dependencies and private local configuration. Double-click **Start AgentDesk.command**, keep its Terminal open, and visit [the local workspace](http://127.0.0.1:3000) after Ready appears. For a new checkout:

```sh
npm ci
cp .env.example .env.local
```

Set `AGENTDESK_SESSION_SECRET` in the ignored `.env.local` to a locally generated random value of at least 32 characters, then:

```sh
npm run dev
```

First database access creates fictional records. Data lives in `data/agentdesk.sqlite` unless `AGENTDESK_DB_PATH` overrides it. Preserve existing data and backups; do not replace the active database with an older checkpoint. `npm run dev` and `npm start` launch the web app and local worker together. Stopping them stops execution while retaining saved state. This is a single-machine demonstration, not a distributed queue.

For a compiled local demo, run `npm run build`, then `AGENTDESK_ALLOW_PRODUCTION_DEMO=true npm start`. This permits a loopback demonstration under Next.js production mode, not production employee identity. The separately configured hosted demonstration entrance is described in [Render setup](docs/RENDER_DEMO.md).

## Optional AI and voice

Set `OPENAI_API_KEY` server-side in `.env.local` and restart. `OPENAI_MODEL` and `OPENAI_REALTIME_MODEL` select configured models. Without a key, deterministic tools and dedicated workflows remain usable and labeled as local demonstration behavior; voice shows its configuration state. Configuration is not live acceptance. Existing browser voice has narrower tool coverage than typed Copilot; native dictation is a separate integration awaiting device acceptance. See [voice and messaging](docs/VOICE_AND_MESSAGING.md).

## Engineering verification

For major runtime changes, follow AGENTS.md and the relevant specifications:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:smoke
npm run test:intelligence
npm run test:conversation
npm run test:wallet
npm run test:metered
npm run test:hosted
npm run test:inbox
npm run test:communications
npm run test:company-email
npm run test:relationship
npm run test:work
npm run test:mobile
npm run test:mobile-inbox
npm run test:mobile-followthrough
npm run test:handoffs
npm run test:opportunities
npm run test:work-questions
npm run test:relationship-quality -- --all
```

The smoke runner normally starts the compiled app on a temporary loopback port with a disposable SQLite database and model credentials disabled. It stops its processes and removes that database afterward. Do not run against the active demo database casually: `SMOKE_BASE_URL` deliberately targets an existing instance and creates fictional records there. The work suite requires its own disposable database. The mobile HTTP suite exercises the compiled backend and worker with mock notification transport and a disposable database.

Existing employee-channel adapters have a separate mocked acceptance suite, `npm run test:messaging`. Account setup and real round-trips are still pending; see [messaging setup](docs/MESSAGING_SETUP.md). No suite result establishes Salesforce, payment or physical-phone acceptance unless that integration was actually tested.

## Project map

| Location | Responsibility |
| --- | --- |
| `src/app` and `src/components` | Web UI and HTTP boundary |
| `src/lib` | Shared contracts; no credentials or persistence |
| `src/server` | Scoped domain services, orchestration, persistence, workers and adapters |
| `src/server/migrations` | Additive database migration source |
| `scripts` and `tests` | Worker tooling and verification |
| `mobile` | Independent native client foundation; same backend; actual-device acceptance pending |
| `docs` | Specifications and evidence, indexed in the documentation map |

Use the verified [work walkthrough](docs/WORK_EXECUTION.md), [company-email demonstration](docs/COMPANY_EMAIL_DEMO.md) and [relationship quality evidence](docs/RELATIONSHIP_QUALITY.md) within their stated boundaries. Earlier presentation scripts and numbered phase reports are retained as historical references; check the current roadmap and deployed revision before using them.
