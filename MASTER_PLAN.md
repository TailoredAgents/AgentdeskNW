# AgentDesk master plan

## Phase 2 implementation — existing application preserved

The October 29 discovery expands the working local build into a connected investor-to-property workflow. Phase 1 is checkpointed at `cded4cd`; conversations, tasks, research, approvals and local data must survive forward migrations.

Implementation maps to the actual modules: `intelligence.ts`/`access.ts` extend `services.ts` with structured buy boxes, provenance, disclosure, private duplicate detection, matching and daily calling priorities. `workflows.ts`/`debrief.ts` add versioned property releases, disclosure-gated deal packages and reviewed post-call proposals. The existing HTTP boundary and `orchestrator.ts` expose these same services to forms, chat and voice. New interface panels reuse the existing component system; this is not a new app or separate CRM.

P0 is additive schema and access corrections. P1 is the complete release → match → call briefing → debrief → approved intelligence update → eligible property package → follow-up flow. P2 preserves credential-gated provider boundaries, prioritizes Slack investigation over Telegram, and keeps paid SMS separate. Advanced valuation, verified comps and production performance reporting remain later milestones until their required data and authorizations exist.

Acceptance is working local workflows with explicit synthetic labels, backend-enforced disclosure/ownership, preserved regression tests, new risk-focused tests, build/type/lint checks and browser verification. Alex's observations and unresolved corporate questions are separated in `docs/NEW_WESTERN_DISCOVERY.md`.

**Owner:** Tailored Agents  
**Initialized:** October 29, 2026  
**First target:** Local demonstration, Monday, November 2, 2026  
**Product principle:** One persistent personal coworker coordinates the workforce.

## Purpose and commercial context

Build real software that helps dispositions, acquisitions, and management staff research investors, understand business context, prepare work, and follow through. New Western is a prospective customer. Neither national authorization nor access to its Salesforce instance, Marketplace, proprietary procedures, or customer records is assumed. Epique/Lofty and other brokerages are future adapters, not special cases embedded in core business logic.

Reported prior research performance exceeding conventional lists by 400% is an unverified founder observation. It is not a product claim or a supported forecast. Pilot evaluation must establish a baseline and measure results using authorized outreach and reliable denominators.

## Product commitments

1. The primary interface is Copilot. Users do not need to select a specialist to ask for work.
2. Guidance is integrated into operations. There is no separate training mode.
3. Investor Hunter discovers external candidates; Buyer Matchmaker searches existing authorized CRM buyers.
4. Every business action has a real state, authenticated actor, scoped data access, and auditable outcome.
5. Research evidence, employee statements, model suggestions, and confirmed mutations remain distinguishable.
6. Live voice is two-way speech with tool execution and shared context. A microphone icon or dictation alone is insufficient.
7. Missing credentials are represented honestly while local adapters allow useful progress.
8. All 16 employees have explicit contracts and statuses; a catalog entry is not a completed specialist.

## Initial architecture

A Next.js App Router/React/TypeScript application hosts a modular Node backend. SQLite via better-sqlite3 provides transactions and durable local storage without a database installation. Zod validates API and tool inputs. A manager orchestrator uses typed REST requests to the OpenAI Responses API with a five-round typed tool loop; no SDK dependency requiring a newer Node runtime is introduced. Simple services remain deterministic. WebRTC uses server-side creation of a short-lived Realtime credential; permanent API keys stay on the server.

This choice prioritizes a reproducible, inspectable local demonstration. It does not satisfy multi-instance enterprise operations. Before a production pilot, replace demo identity with managed SSO, migrate persistence to PostgreSQL with database-enforced tenant controls, and operate a durable queue/scheduler. See [DECISIONS](docs/DECISIONS.md).

## Vertical delivery strategy

| Milestone | User-visible outcome | Exit criteria |
| --- | --- | --- |
| M0 — Foundation | Navigable, responsive local workspace | Typed build, persisted seed data, clear demo identity, baseline docs |
| M1 — Daily assistant | Conversation continuity, priorities and approved actions | Messages survive refresh; tool permissions and action state tests pass |
| M2 — Investor research | Address → job → evidence-aware ranked list → reviewable CRM proposal | Job survives process interruption; duplicates identified; no false verification |
| M3 — Call-to-next-step | Transcript → extracted facts → proposed note → local CRM update | Facts have excerpts; human approval required; repeated approval is safe |
| M4 — Voice and continuity | Speak with Copilot using the same services and context | Secure session setup; microphone teardown; real credential integration test |
| M5 — Pilot | Real authorized identity, CRM and research integrations | Tenant/field access verified; provider rights and operational controls approved |
| M6 — Commercial platform | Multi-office subscriptions and channel access | Billing/entitlements, lifecycle operations, support and measured adoption |

M0–M3 and the Phase 2 operational slice are implemented locally; see `docs/PHASE_2_REPORT.md` and `docs/PROGRESS.md` for evidence. M4 is built as a real integration boundary and is not certified operational without live testing. Work on later phases must not undermine the repeatable demonstration.

## Scope by horizon

**Initial build:** organization/office/user context, role checks, persistent conversations, specialist registry, durable research jobs, evidence and scoring, local CRM lookup and approved note/import mutations, transcript review, task creation/completion, guidance, preferences, notifications, usage/audit foundation, responsive design, secure voice integration path, tests and demonstration script.

**Pilot:** user provisioning and SSO, approved SOPs and source versions, licensed property/research provider, Salesforce sandbox OAuth and schema mapping, secure token store, scoped sync, live voice quality/cost trials, retention/deletion controls, backup recovery, production queue and telemetry.

**Expansion:** remaining specialist execution, acquisition workflow depth, approved document coordination, authorized Slack first if useful to the customer, optional paid SMS with consent/entitlements, later Telegram/Teams alternatives, subscriptions, multi-office management and broker CRM adapters.

## What success means

The November demonstration should show an employee requesting work in natural language, leaving a research job running, extracting a fictional call, reviewing the CRM changes, and returning to persisted tasks and results. All visible claims must match tool results. Failure and unconfigured states should be clear and recoverable.

Pilot measures should include time to complete a qualified workflow, research evidence completeness, duplicate rate, reviewed false matches, approval acceptance/correction rate, follow-up completion, latency, per-user usage cost, and opt-in employee satisfaction. Outreach answer/appointment rates require comparable cohorts and sufficient sample sizes; no effectiveness claim should precede that evaluation.

## Non-goals for the demonstration

No investor contact, automatic external communication, binding offers, altered contract terms, payment collection, real Salesforce writes, unofficial scraping, or public deployment. No fake live voice, fabricated phone verification, or implied customer endorsement.

## Operating discipline

`docs/PROGRESS.md` records actual implementation and verification. A required credential blocks only its dependent integration. Continue independent work. Maintain the shared contracts; keep persistence and approval authority on the server; run meaningful checks after major changes. The original specification remains in `docs/ORIGINAL_BRIEF.md`.
