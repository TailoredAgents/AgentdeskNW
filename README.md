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

**Current local checkpoint: private transaction coordination**, verified October 31, 2026, extending `b94b7bb`. Employees track contacts, financing, a closing target, reported milestones and unresolved issues across desktop and phone. Current supporting text enables an unsent title-opening preparation. Title opening, clearance, signing, funding and closing remain separate reports; none is independently verified by saving a record.

Verification: **903 root tests, 57 mobile tests, 1,553 HTTP/workflow checks and 12 metered restart checks**; root/mobile typechecks, lint/build, native/web exports and desktop/phone-browser rehearsal passed. Migration 034 preserved 316 prior rows across 112 tables in a disposable copy. Sixteen specialists remain two locally ready and fourteen demo; complete expertise and effectiveness are not established.

**Mobile is prepared locally, not yet installed or released.** The phone-width browser rehearsal passed pairing, shared history, cross-surface cost approval, pause/resume, background worker completion and remote device revocation. Native binary builds, real phone speech/push and store distribution remain pending. [Mobile preparation notes](mobile/README.md) distinguish each acceptance layer. Whole-job costs remain fictional; live model/provider usage is separately metered.

Implementation follows the single roadmap; C1–C7 remain partial. Current foundations include private/shared transaction work, reviewed title-email simulation, sourced guidance and document retrieval, PDF originals, shared conversations and saved work, chosen updates, assignment roots and employee spending reviews. Text execution now persists model/tool progress. An explicit `admitted_demo` development mode connects bounded text quotes, employee approval, background continuation and simulated settlement using counted input and validated receipts. Exact conversation spending reviews/decisions and original-channel SMS/Slack completion now pass local mock checks. New local saved jobs delegated by admitted text now remain in the same assignment with no additional AI charge; reasoning receipts settle once and unused credit releases while free work waits. Employees can now cancel the original assignment through desktop/native reviews or an exact conversation reference, including while the Agent is responding. Completed usage remains and uncertain requests keep their holds. Unstarted text requests can refresh their original quote through app or conversation, retaining the request and requiring a fresh decision above $1. Standalone/legacy sample pricing remains unchanged. The mode is off by default and does not yet combine other paid hosts into a complete assignment cap. Follow the roadmap for current sequencing; semantic document reasoning, broader role depth, phone file picking, provider connections, device/practitioner acceptance and the other listed completion gates remain open. Real-world acceptance is deferred; fictional development continues.

Repository: [TailoredAgents/AgentdeskNW](https://github.com/TailoredAgents/AgentdeskNW). Render was checked October 31: the live service still ran `529486f` (four-digit PIN update), while GitHub contained later development. The blueprint has automatic deployment turned off. A push does not update that live service until a deployment succeeds. Real company data, live mailboxes/investor delivery, actual payments, managed identity and broad expert autonomy remain unfinished.

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

Set `OPENAI_API_KEY` server-side in `.env.local` and restart. `OPENAI_MODEL` and `OPENAI_REALTIME_MODEL` select configured models. Without a key, deterministic tools and dedicated workflows remain usable and labeled as local demonstration behavior. The primary browser/native spoken conversation uses device speech and the same typed Copilot tools; full AI reasoning still needs the configured text provider. Reviewed dictation remains a separate option. Physical audio acceptance is pending. The retained OpenAI Realtime host is a separate, narrower integration with unfinished aggregate audio spending. Configuration is not live acceptance. See [voice and messaging](docs/VOICE_AND_MESSAGING.md).

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
npm run test:text-restart
npm run test:text-spending
npm run test:local-delegation
node scripts/smoke-runner.mjs proactive
node scripts/smoke-runner.mjs transactions
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


Typed Copilot can now search/read current private source text and save a bounded cited checklist review. Agent and saved-work links open the exact document on desktop and native; corrections invalidate obsolete answers/results. This adds the sixteenth composable work capability without claiming semantic analysis, OCR, verified transaction evidence or provider delivery. See [document work](docs/DOCUMENT_WORK.md) and the [canonical roadmap](docs/IMPLEMENTATION_ROADMAP.md).
