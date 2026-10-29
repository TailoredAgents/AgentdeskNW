# AgentDesk

**One assistant. A coordinated AI workforce.**

AgentDesk is a local, persistent demonstration of Tailored Agents’ real estate workforce platform. It is a concept for a prospective New Western Georgia office pilot, not an official New Western product, partnership, or authorized production integration. Initial demonstration target: **Monday, November 2, 2026**.

The application centers on one Copilot that coordinates investor intelligence, property releases, calling priorities, post-call debriefs, deal packages, research, reminders, and reviewable CRM actions. All 16 proposed specialist roles share a registry and permission model. Unimplemented specialists are explicitly marked planned.

## Local setup

Requirements: Node.js 20.19 or later and npm. SQLite is embedded; no separate database server is required for the demonstration.

This prepared workspace already has dependencies and a private local configuration. Double-click **Start AgentDesk.command**, keep its Terminal window open, and open **[http://127.0.0.1:3000](http://127.0.0.1:3000)** after the Ready message. The commands below reproduce setup in a new checkout.

```sh
npm ci
cp .env.example .env.local
```

Set `AGENTDESK_SESSION_SECRET` in `.env.local` to a locally generated random secret of at least 32 characters. For example, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and paste the result into the ignored file. Never commit that value.

```sh
npm run dev
```

Open [the local workspace](http://127.0.0.1:3000). The application starts with fictional records on first database access. Data lives in `data/agentdesk.sqlite` unless `AGENTDESK_DB_PATH` overrides it. Keep this directory outside source control.

`npm run dev` and `npm start` launch the web application and a local worker together. The worker checks pending work every two seconds, so research can continue while the browser is closed. `npm run worker` is available for an independently managed worker. Keep the launcher running; stopping it stops execution while retaining database state. This is a single-machine demonstration, not a distributed queue.

## Optional model and voice setup

Set `OPENAI_API_KEY` in `.env.local`, then restart the server. The key is used only by the backend. `OPENAI_MODEL` selects the text model and `OPENAI_REALTIME_MODEL` selects the voice model; model availability depends on the API project. A ChatGPT subscription is not an API credential.

Without a key, deterministic Copilot tools, typed post-call debriefs, authorized transcript extraction and the dedicated workflow screens remain usable. Copilot clearly identifies its local demonstration behavior. Live voice displays a configuration state instead of simulating a connection. The model-backed paths require a real account integration test before any claim of live readiness.

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

## Preserved milestone — Phase 2 local workflows

Phase 2 extends the existing application and database. The working local flow connects a versioned property release to permitted buyer matches, calling priorities, a pre-call briefing, a post-call recap, reviewed investor updates, and a disclosure-gated package for manual handoff. The existing Copilot, research, tasks, approvals, transcript path and all 16 specialist definitions remain available.

Investor profiles now support multiple structured buy boxes, source statements, revision history, relationship access and synthetic disclosure evidence. The mobile workspace exposes calling and debriefing directly. Slack is the next external messaging candidate; it remains unconfigured. SMS is a planned optional metered add-on, with Telegram later.

See [PROGRESS](docs/PROGRESS.md) for the latest test counts and verification results, [the Phase 2 report](docs/PHASE_2_REPORT.md) for the delivery assessment, and [the demonstration runbook](docs/DEMO_RUNBOOK.md) for the actual persisted examples. Local browser verification does not certify live OpenAI/voice, Salesforce, research providers, messaging delivery or production identity.

Phase 1 is preserved at Git checkpoint `cded4cd`, with a local database backup at `data/phase1-checkpoint.sqlite`. The active database contains prior demonstration and browser-QA records. Keep it intact; normal launches and migrations preserve the work. Do not replace it with the backup as part of meeting setup.

## Capabilities and boundaries

| Area | Working local scope | Remaining integration or production dependency |
| --- | --- | --- |
| Copilot | Persistent conversations and validated service dispatch; model integration when configured | API project, live validation, evaluation and budgets |
| Investor intelligence | Multiple buy boxes, provenance, reviewed revisions, owner/shared access, disclosure state and relationship history | Confirmed company access policy and authorized Salesforce mappings/sync |
| Property releases | Manual fictional releases, versions, explicit employee audience, transaction context and permitted buyer matches | Approved internal release source; no Marketplace access is assumed |
| Calling and briefings | Ranked relationship priorities, distinct property-fit/engagement signals, explanations, outcomes and pre-call context | Reliable real relationship/activity evidence and pilot evaluation |
| Post-call debrief | Typed recap, record linking, sourced criteria, proposed notes/changes, reminders and coaching; authorized text transcripts retained | Live voice validation; any future telephone recording requires a separate authorized provider |
| Deal packages | Disclosure/media eligibility checks, demo templates, reviewed drafts and manual copy handoff; actual status remains not sent | Approved templates/disclosure documents and authorized delivery integrations |
| Investor Hunter | Durable synthetic or explicitly selected OpenAI web-search jobs, bounded budgets, partial evidence, export and reviewed import | Credentials, live provider validation, licensed transaction evidence and verified professional contacts |
| Workflow guidance | Qualification gaps and contextual next steps from permitted local records | Customer-approved, versioned procedures |
| CRM | Fictional SQLite records with server-enforced approval for notes, imports and criteria changes | Salesforce authorization, identity, mappings, sync and sandbox tests |
| Voice | Browser WebRTC with server-held ephemeral credentials, trusted sideband tools and token receipts | API access, microphone/device validation, minute reconciliation; no cellular-call recording |
| Tasks and notifications | Persistent tasks, due reminders, release events and in-app notifications | Reliable deployed scheduler and approved push/delivery policy |
| Enterprise access | Scoped loopback-only demo users, ownership controls and permission tests | SSO, provisioning, PostgreSQL, retention and operational review |
| Slack, optional SMS, billing | Unconfigured Slack boundary and documented messaging/entitlement direction; Telegram deferred | Provider setup, implementation, organization approval and delivery evidence |

All seeded investor, property, research, disclosure and package examples are fictional. Optional external research is labeled separately as public-source, unverified evidence. Media permission is an employee-entered assertion; AgentDesk has not checked live Google Drive access. A copied package is never reported as a sent message.

## Project map

- `src/app`: Next.js application and HTTP boundary.
- `src/components`: browser interface components.
- `src/lib/contracts.ts` and `src/lib/intelligence-contracts.ts`: shared browser/server types; no secrets or persistence.
- `src/server`: authorized domain services, persistence, specialists, orchestration and integrations.
- `src/server/migrations`: relational migration source.
- `scripts`: local worker and workflow smoke checks.
- `tests`: domain, permission and integration-boundary checks.
- `docs`: product, implementation, integration and operational source of truth.

Start with [MASTER_PLAN](MASTER_PLAN.md), [DEMO_RUNBOOK](docs/DEMO_RUNBOOK.md), and [PROGRESS](docs/PROGRESS.md). The supplied specifications are retained in [ORIGINAL_BRIEF](docs/ORIGINAL_BRIEF.md) and [PHASE_2_DIRECTIVE](docs/PHASE_2_DIRECTIVE.md). Discovery observations and unresolved corporate questions are separated in [NEW_WESTERN_DISCOVERY](docs/NEW_WESTERN_DISCOVERY.md).

## Preserved milestone — Phase 3 commercial simulator

AgentDesk now includes the AI Employee Marketplace, My AI Workforce, subscription configurator, organization sponsorship/required policies, temporary trials, usage ledger and simulated billing lifecycle. Core is $49 proposed monthly; Core + Hunter + Deal Marketing is $147. All prices/allowances are configurable records, all payments are simulated, and planned specialists remain unavailable.

Premium access is enforced by the same backend services used by API requests, text/voice tools and worker stages. Removing an add-on preserves saved work. Core remains independently useful for notes, CRM approvals, daily coordination and workflow guidance.

Read [pricing](docs/PRICING_AND_PACKAGES.md), [billing architecture](docs/BILLING_ARCHITECTURE.md), [marketplace](docs/AI_EMPLOYEE_MARKETPLACE.md), [usage metering](docs/USAGE_METERING.md), and the updated [demo runbook](docs/DEMO_RUNBOOK.md). The provider boundary is prepared, but Stripe, live OpenAI/voice, external research, production Salesforce, Slack and Twilio remain disconnected. Production identity, provider receipts, payment webhooks, taxes/proration and the four planned specialists remain future work.

Migration 005 is additive. The ignored pre-migration backup is `data/phase2-checkpoint.sqlite`; Phase 2 source remains `de77fac`. No dependencies were added or updated for Phase 3.

## Current milestone — Phase 4 provider integrations

The Responses manager uses `gpt-6-astra` with supported configurable reasoning effort (`high` by default). It preserves validated reasoning/tool history, bounds calls, records provider token receipts, deduplicates request retries and commits local tool mutations with their receipts. The 12 implemented specialists are callable through one assistant; the other four remain planned. Acquisition coordination reviews saved release handoff context; release publication remains an explicit editor action.

Two-way voice uses browser WebRTC, server-held short-lived credentials, and an authenticated server WebSocket sideband for tools, transcripts and usage. Browser-provided tool calls or usage are rejected. External Hunter uses OpenAI Responses web search as a separate opt-in provider; it saves public-source candidates with citations and unverified claims. It does not verify recorded ownership or contacts and does not silently substitute demo fixtures.

No API key was present during implementation. Text, voice and research protocols are tested with mocks; live model access, actual speech, interruption/device behavior and external findings remain unverified. Settings shows configuration separately from provider receipt evidence. Production Salesforce, outreach, payment collection and production identity remain disconnected.

See `.env.example`, [provider setup and demonstration](docs/DEMO_RUNBOOK.md#phase-4-conversation-demonstration), [official API references](docs/OPENAI_PROVIDER_REFERENCES.md), [voice](docs/VOICE_AND_MESSAGING.md), [research](docs/INVESTOR_HUNTER.md), and [usage limitations](docs/USAGE_METERING.md). Migrations 006–008 are additive; `data/phase4-before.sqlite` preserves the pre-change data. Keep configured secrets only in ignored `.env.local`; restart the web app and worker after changing configuration.

### Live connection follow-up

The configured OpenAI project now passes authentication, live Responses tool execution and persisted conversation-memory checks. Realtime session credential setup also passed; microphone/audio, interruption and live voice tools still need a device walkthrough. External research remains off. See [live provider verification](docs/LIVE_PROVIDER_CHECK.md). Restart the launcher after changing `.env.local` so both app and worker load the configuration.
