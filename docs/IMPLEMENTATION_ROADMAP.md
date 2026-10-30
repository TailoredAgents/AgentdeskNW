# AgentDesk NW — implementation roadmap

## Authority and purpose

Updated October 30, 2026. This is the **authoritative development sequence** for bringing the current application to the owner's company-wide vision. It replaces competing “next” instructions and historical phase ordering, not completed work or its evidence. [CAPABLE_WORKFORCE_PLAN.md](CAPABLE_WORKFORCE_PLAN.md) defines product direction; this document defines execution order and completion gates. [PROGRESS.md](PROGRESS.md) records what actually shipped. Original briefs remain historical requirements; later explicit owner decisions take precedence.

The product serves dispositions, acquisitions and management as three primary audiences. One personal Copilot coordinates the available specialists through the dashboard, SMS and Slack. Dispositions receives a broader specialist lineup and deeper workflows where needed; the other roles must also have complete daily work. Alex's input represents dispositions, not corporate policy or acquisitions/management acceptance.

This checkpoint plans implementation. It does not implement these capabilities, activate payments, connect company data or deploy a release. Keep building with fictional sources while company access is pending. Commit and push verified changes under the owner's standing instruction; report the deployed revision separately from the repository revision.

## Target experience

An employee states an outcome, rather than choosing an agent or learning commands. Copilot retrieves relevant current context, composes an executable plan, performs authorized work, asks only for a necessary fact or decision, follows through after the chat closes, and returns verifiable results. The employee can inspect, correct, pause, resume or cancel that work from any supported channel.

The assistant improves through sourced relationship/deal knowledge, inspectable employee preferences and tested specialist methods. It uses calculations and direct services for simple work, focused reasoning where needed, and connected tools for actions. Broader capability comes from reusable tools and composable plans, not a longer hard-coded command list or simply increasing the model loop limit.

The complete assignment must request approval before costing more than **$1 in customer-facing credits**. Auto top-up is optional and never authorizes an expensive job. All roles inherit this behavior. Exact rules are in [USAGE_METERING.md](USAGE_METERING.md).

## Starting point and remaining gap

Inspected against repository checkpoint 6766a59; last major application acceptance is recorded at c958f2f. Those historical results are 459 tests, 648 HTTP checks, 36 relationship scenarios, type/lint/build, migration preservation and desktop/phone acceptance. They are not newly run results or evidence that the new roadmap is complete.

| Area | Built foundation | Still needed for the vision |
| --- | --- | --- |
| Copilot | Persistent conversation, typed tools, shared domain services, request/tool receipts, bounded live text runner | General durable planning, dependencies, continuation, flexible recovery and complete assignment outcomes |
| Specialists | 16 registered: 2 locally ready, 10 demo, 4 planned | Each specialist's methods, sufficient tools, varied quality cases and employee acceptance; none has proven independent expert superiority |
| Context | Explicit private preferences; sourced investor journeys, reports, corrections and separate buy boxes | Company knowledge retrieval, reviewable learning, wholesaler/opportunity/deal/party/document context and better judgment |
| Communications | Shared employee conversation adapters; fictional Salesforce-first inbox; reviewed generated-reply simulation | Actual employee channel acceptance, general edited correspondence, recipients/CC/files, company-authorized sync and sending |
| Work and initiative | Durable research jobs, personal task actions and selected notifications | Durable general work, recurring briefings, event watchers and bounded standing action authority |
| Commercial | Workforce entitlement and fictional wallet/quotes/holds/ledger | Whole-job $1 gate, auto-top-up lifecycle, real usage settlement and verified payments |
| Experience and operations | Light workspace, ink/green navigation, phone layouts, hosted fictional demo foundation | Complete role homes, onboarding, accessible work controls, managed identity, production persistence/workers and measured rollout |

## Three separate release levels

| Level | Definition of done | What it does not prove |
| --- | --- | --- |
| Fictional workflow complete | All three agreed role journeys work end to end with realistic data, actual persistence, explicit simulated delivery/payment outcomes, recovery and quality evidence | Company connections, live delivery, measured employee adoption or production operations |
| Connected pilot ready | Approved users and data use verified connections with identity, permissions, operating controls, receipts and measured usage | Readiness for every office or a proven advantage over competing agents |
| Company rollout ready | Supported role workflows pass employee acceptance, operations recover reliably, onboarding/support work and controlled cohorts show useful repeat usage | Unlimited capabilities or support for arbitrary inaccessible systems |

A specialist is complete only for a declared task scope and release level. Track functional coverage, knowledge/judgment, connection readiness, autonomy/recovery and employee acceptance separately. Do not average a polished UI and an unbuilt agent into an unsupported completion percentage.

## Delivery order

| Phase | User-visible result | Depends on | Exit gate |
| --- | --- | --- | --- |
| A — Reliable work and spending | Ask for a job, leave it running, return from another channel, control cost and see its result | Existing services and fictional adapters | Durable composed work for every role, whole-job approval, recovery and top-up simulation pass |
| B — Context and working expertise | Copilot understands this employee, these relationships and this stage of work | A's contracts; knowledge inventory can begin immediately | Source/versioned methods and corrections materially change supported next actions |
| C — Complete specialist workflows | All 16 specialists perform their agreed jobs within connected role journeys | A; relevant B methods/data | Every specialist and all three role journeys meet fictional functional/quality gates |
| D — Proactive follow-through | Briefings, reply/deal watchers and authorized follow-ups run without repeated prompting | A; relevant B/C workflow | Schedules/events use the same execution, budget and permission services without duplicates or noise |
| E — Approved connections and operations | Real channels, CRM/email, investor line and payments work under company-authorized identity | Each connection's authorization; relevant A–D capability | Measured connected pilot, correct receipts/costs and recoverable production operations |
| F — Proof and rollout | Employees repeatedly choose the product because it finishes their work | Evaluation starts in A; pilot depends on E | Predeclared task/quality/usability targets pass for each role before expanding cohorts |

UI work and evaluation are part of every phase. E workstreams are dependency gates, not a requirement to finish all of A–D before starting any connection. E1 employee demo-account channel tests may run alongside A when the owner can sign in; E5a real usage admission can follow A3 on fictional data without waiting for payments or company access; E2 operating prerequisites must precede real company-data ingestion. C can proceed by independent role slices after their required B context exists. Do not wait for all live integrations to finish fictional role workflows, or wait until F to discover whether specialists are useful.

## Phase A — Reliable work and spending

All items below are planned. Keep existing quick questions and services useful while introducing the general work path.

| ID | Concrete implementation package | Required evidence |
| --- | --- | --- |
| A1 | Add work runs, versioned instructions/plans, steps/dependencies, evidence/artifacts, events, leases and recovery; link child research jobs to their parent assignment | Restart before/after a step preserves results; only one worker claims it; changed instructions invalidate obsolete pending work; cancellation stops later dispatch |
| A2 | Describe capabilities by inputs/results, role/access, readiness, source availability, side effects, cost and completion evidence; let the planner compose existing services and request missing information | Varied/paraphrased requests produce valid plans; unsupported work identifies the missing capability; each dispatch rechecks current authority; a tool error cannot become a success claim |
| A3 | Add a server-owned budget for the entire assignment, quote versions, reservations, employee approve/deny and revised-cost decisions using fictional prices first | $0.99/$1.00/$1.01, multiple cheap substeps, child research, retries, concurrent holds, denied/expired approval, growth, partial cancellation/failure and unknown outcomes all behave correctly |
| A4 | Add work detail/progress/result controls and shared run references to Copilot, Work queue, employee SMS and Slack; short approvals identify exact job/version/maximum | Start in one channel, correct in another, approve or decline from an authenticated channel, resume after restart and inspect one consistent result; ambiguous “yes” does not pick a job |
| A5 | Implement optional simulated auto top-up settings and purchase lifecycle: payer, low-balance trigger, purchase amount, monthly auto-purchase cap, pending/success/failure/unknown, disablement and receipts | Off initially; one pending purchase per trigger; pending purchases count toward cap; only success grants credit; duplicates/failures cannot charge or grant twice; funding never approves a job; successful/failed purchases cannot retrigger on every worker poll |
| A6 | Add initial composed-work scenarios for all roles, migration preservation, HTTP/UI coverage and quality baseline | Each role completes the modest scope below; established workflows still pass; evidence records what the new planner cannot yet do |

The work lifecycle must distinguish queued/planning/running, waiting for information, cost approval or action approval, paused, reconciling an unknown result, completed, failed and canceled. Exact state names are an implementation choice. Separate action execution state from message delivery state. A queued email is not sent; an unknown outcome is not safe to retry blindly.

Cost scope includes planning itself, specialist reasoning, tool/research fees, chargeable retries and verification. Use a bounded preflight and reserve any paid planning allowance inside the same run; do not spend an unbounded amount discovering the estimate. Quote the total estimate and maximum, pause before crossing $1 or an approved maximum, and reconcile actual usage without silently increasing the authorized customer debit. Quick billable turns also need stable cost identity. For cancellation, failure or a declined increased quote after partial execution, settle consumed authorized work, release only unused reservations, and retain unresolved provider holds until reconciliation. Do not reuse whole-operation sample refunds for partially executed real work. Simulated enforcement must never be presented as enforcement on the existing live provider path; enable each new autonomous billable provider path only after E5a cost-integration acceptance. Existing configured live text remains separately accounted and E1 can verify actual messaging transport with fictional work and bounded/mock AI.

Auto top-up performs one replenishment per eligible low-balance cycle. Re-arm only after the balance recovers above the trigger and a subsequent eligible event lowers it again, or an explicit payer recovery/configuration decision establishes a new cycle. A recharge that still leaves the balance low must not trigger repeated purchases. Failure/unknown outcomes require reconciliation or explicit recovery, not a purchase attempt on every worker poll. Disablement prevents new purchases while pending outcomes are still reconciled accurately.

A's role examples deliberately reuse existing capabilities:

- **Dispositions:** inspect an available release → find existing buyers → consider relationship concerns → prepare an eligible package/draft and a personal follow-up; optionally propose a costed child research job.
- **Acquisitions:** inspect an existing release/opportunity fixture → identify missing property/handoff facts → prepare a sourced checklist and personal follow-up. This is not a completed valuation agent.
- **Management:** inspect permitted office workload → identify a supported exception → prepare priorities and a personal follow-up. Team reassignment is not assumed to exist.

**First implementation checkpoint: A1–A3.** Establish the durable work model, capability executor and fictional job-budget gate together, with an inspectable minimal work view and bounded test adapters. Do not expose an unbudgeted autonomous executor while postponing cost controls. A4–A6 then complete convenient channel controls, top-up simulation and the full Phase A acceptance. Keep checkpoint scope reviewable and update its actual status before moving on.

Likely touchpoints, to confirm at implementation: new work contracts/services/worker and additive migration after 019; existing orchestrator, text runtime, registry, provider receipts, wallet, messaging worker, conversation focus and task UI. Reuse their domain services; do not fork CRM/inbox logic into a separate agent framework. External operations retain durable dispatch identifiers and reconciliation; local mutations and receipts should remain transactionally coupled.

## Phase B — Context and working expertise

| ID | Package | Exit evidence |
| --- | --- | --- |
| B1 | Versioned knowledge sources, ownership/role visibility, effective dates, provisional vs approved methods, permission-aware retrieval and citations | Advice identifies its applicable source/revision; missing, conflicting, withdrawn or outdated knowledge changes the answer; retrieved instructions cannot grant actions |
| B2 | Link wholesaler/contact, opportunity, property, deal, participant, document/version, milestone and commitment records to existing investors, messages and work runs | Two deals or buy boxes do not merge; sources and corrections persist; changed party/document/state invalidates dependent pending work |
| B3 | Extend employee memory with reviewable suggestions from draft corrections and accepted work; inspect/edit/forget, evidence and scope | A confirmed writing correction improves a later relevant draft; one exception does not become permanent preference; forgetting removes subsequent influence |
| B4 | Define specialist method contracts: objective, context, sources, reasoning/checking steps, tools, output, missing-fact handling, examples and evaluation | Methods work on varied cases, select a useful next action, expose uncertainty and use tools instead of producing advice alone |

Start B1/B4 with Investor Relationship Manager stage 3, then qualification, notetaking and workflow guidance across roles. Continue relationship stages 4–7 within C/D/F. Preserve the existing sourced record rather than replacing it with unsourced chat memory. Apply the shared context model to acquisitions and management from the beginning.

The employee should be able to ask “why this recommendation?” and see the few relevant facts, sources and assumptions. They should not need to inspect raw prompts or internal agent traces. Private preferences/mailboxes remain separate from shared company deal records and authorized manager metrics.

## Phase C — Complete specialist workflows

Use the [16-specialist delivery matrix](AI_EMPLOYEES.md#capability-depth-delivery-matrix) as the completion checklist. Its next-depth column describes work to build, not current functionality. No specialist becomes ready by changing a registry label alone.

| ID | Workflow delivery slice | Required outcome |
| --- | --- | --- |
| C1 | Dispositions relationship-to-opportunity: Qualification, Relationship, Matchmaker, Marketing, shared Notes/Workflow/CRM | Interpret replies/recaps, resolve missing criteria, choose existing buyers first, address current objections, draft in the employee's style and create/track useful next work |
| C2 | Acquisitions intake-to-handoff: Acquisition Lead, Valuation/Diligence, Acquisition-to-Disposition and shared services | Track wholesaler submissions and revisions, gather missing facts, compare sourced scenarios, prepare supported screening conclusions and deliver a complete versioned handoff |
| C3 | Management exception-to-resolution: Team Performance, Daily Coordinator, Coaching and scoped action services | Define metrics and denominators, explain what is stuck, identify an owner, prepare/perform authorized assignments and verify follow-through without private mailbox access |
| C4 | Deal economics and external research: Investment Deal Analyst, Valuation and Hunter | Shared tested calculations with distinct acquisition/investor methods; explicit ranges/assumptions; evidence-ranked external candidates only when deliberately requested, with whole-job cost control |
| C5 | Correspondence and transaction completion: Marketing, Transaction/Document, Salesforce and handoff coordination | Editable drafts, exact sender/recipients/CC, supported document files, deal milestones, conditional lender participation, title-opening preparation and subsequent evidence-backed tracking |
| C6 | Cross-role handoff and universal guidance | Changes in price, release, ownership, reservation, document or assignment update dependent work; Notetaker, Workflow Navigator and Coaching assist each role in normal work |

C1, C2 and C3 are peer delivery tracks. Review one coherent slice at a time while keeping all three on the acceptance board. Do not finish an entire dispositions product before starting acquisition/management depth. C4 calculations can be built alongside C2; C5 depends on B2's deal/document model. Implement actual file access/versioning and attachment selection before calling an email package complete; today's metadata-only attachments are insufficient.

**Dispositions acceptance, based on Alex:** select a current company property → match permitted CRM buy boxes first → prepare personalized eligible outreach → choose optional extra-cost Hunter research → associate investor replies → report changed commitments → track sourced signed-agreement/deposit evidence → prepare title-opening email with investor, attorney, acquisition agent and lender only when relevant → follow acknowledgment, issues, clearance, signing, funding and closing as distinct events. A reservation or stop-marketing transition requires a confirmed authoritative source and company rule; Alex's description is provisional until validated. Never infer wire instructions or a completed payment from a draft.

**Acquisitions acceptance, provisional pending practitioner review:** receive a wholesaler opportunity → resolve duplicate/revised submission → identify missing property, price and document facts → compare supported valuation/repair scenarios → explain diligence gaps and decision options → prepare an authorized release → dispositions acknowledges the correct version → correction/withdrawal propagates to affected work. Do not assume direct-seller prospecting or autonomous offer authority.

**Management acceptance, provisional pending manager review:** ask what is stuck across the permitted team → see sourced pipeline/work exceptions with meaningful denominators → drill into a specific handoff → assign or request next work within configured authority → receive an outcome → compare an agreed period without counting retries/duplicate events as productivity. Office visibility does not grant private chat or mailbox visibility.

## Phase D — Proactive follow-through and delegated actions

| ID | Package | Exit evidence |
| --- | --- | --- |
| D1 | Recurring briefings with selected topics, times, timezone, channel, quiet periods and change summaries | Three daily updates work; daylight/timezone changes, downtime and catch-up do not create a message storm; user can revise/stop by message |
| D2 | Reply, commitment, deal and handoff watchers with event deduplication and bounded processing scope | New evidence triggers one relevant job; event storms coalesce; resolved/withdrawn work does not keep prompting; meaningful exceptions reach the right employee |
| D3 | Explicit standing authorization for routine actions, scoped by actor/account/contact/deal/action/content/frequency/expiry with revocation | Previously authorized routine work completes without repeated action approval; out-of-scope changes request a concrete decision; revoked/in-flight work stops or reconciles correctly |
| D4 | Continue work after answers, changed records or external outcomes | A missing lender contact or corrected record resumes the right job; old assumptions and approvals cannot execute silently; a materially superseded recommendation is visibly corrected with the reason and original history retained |

Every scheduled execution uses the same whole-job budget. Standing business-action authority does not waive approval for a run above $1. Existing exact-review requirements remain until their tested replacement exists; loosening a prompt or removing server checks is not an autonomy implementation. Authenticated short channel decisions should suffice when the exact action is clear; use a linked review only when recipients, documents or ambiguity need inspection.

## Phase E — Approved connections and company operation

| ID | Package and dependency | Exit evidence |
| --- | --- | --- |
| E1 | Employee Slack/SMS acceptance on owner-controlled demo accounts; may overlap A | Real DM/SMS round-trips, reminders, shared work continuity, STOP/disconnect and uncertain-delivery handling on the actual hosted origin; no claim that investor SMS is thereby implemented |
| E2 | Before real company-data ingestion: managed identity/membership, scoped access and revocation, data lifecycle, PostgreSQL migration, supervised durable workers, telemetry, backup/restore and environment separation | Separate employees/offices remain isolated; assignment/departure interrupts pending work; recovery preserves records and receipts; representative concurrent-job/channel load and provider limits are tested; presentation PIN/shared sample roles cannot authenticate real employees |
| E3 | Approved Salesforce/company email, after administrator capability discovery and E2 for real records | Confirm object/field visibility, email body/history/file coverage, sender/transport, incremental sync, refresh/revoke, conflicts and deduplication; approved sandbox read/write/send outcomes verified independently |
| E4 | Dedicated investor business lines, after approved ownership/registration/consent setup | Number assignment and payer clear; two-way routing, opt-out during queued work, reassignment/departure, allowance/cost and trusted delivery reconciliation tested; employee Copilot number remains separate |
| E5a | Real provider cost admission after A3 and authorized bounded provider test access; may start early with fictional data | New autonomous billable dispatch uses whole-job admission, supported upper bounds, versioned rate calculations and actual receipts; $1/approved maxima work; unknown cost stays unresolved; shadow retail accounting is not a collected customer charge |
| E5b | Payment settlement and automatic purchases after A5, usage integration and explicit payer/commercial setup | Verified idempotent payments, opted-in top-ups, failure/refund handling, caps and payer isolation pass payment test-mode then authorized live settlement; no simulation grants real funds |
| E6 | Broader connected work: approved documents/calendar/research sources, real voice acceptance and reusable connector installation/health | Concrete requested tasks complete with current source/delivery evidence; scoped credential lifecycle, missing capability, rate limits, disconnection and recovery work; actual two-way voice quality tested |
| E7 | Isolated browser-assisted fallback for approved tasks lacking a suitable API | Employee-scoped sessions, bounded tool/cost authority, recoverable steps and independently verified outcomes on selected supported sites; no claim of arbitrary-site reliability |

Salesforce-first describes the employee workflow, not a guessed mail host. Keep Gmail/Outlook as optional connectors or company-approved underlying transport. Do not silently switch to personal email when company coverage is incomplete. Company acceptance is required before ingesting real records; owner-account fictional demonstrations can proceed independently. Implement API connectors first where they cover the job. Broader task/plugin capability and browser fallback are explicit roadmap work, not a reason to delay usable domain workflows.

Begin E2 schema/queue design alongside A to avoid single-process assumptions. The existing one-instance Render demo remains a separate presentation environment until production migration passes. Verify the actual deployed commit before presentations; a successful GitHub push alone is not deployment evidence.

## Phase F — Prove usefulness and roll out

Create one scorecard per specialist and one end-to-end scorecard per role, versioned with task scope, data/source version, application/model configuration, reviewer, date, results and limitations. Keep the existing 36 relationship record cases as regression evidence; they are not an independent intelligence benchmark.

- Before implementation of a specialist slice, write representative cases and expected useful outcomes. Include paraphrases, missing/contradictory/stale facts, conditional statements, changed instructions, denied costs/actions, failed tools, restart and channel continuation. Reserve unseen variations and freeze the acceptance set before scoring the release.
- Separate deterministic calculation/service tests from model-quality trials. Use acquisition/dispositions/management reviewers for their own work. Require zero critical access, unauthorized-charge, duplicate-action or fabricated-completion failures in the release suite; a high average cannot hide one.
- Proposed internal quality target: at least 90% completion of the declared supported tasks on the reserved scenario set and at least 4/5 usefulness from the relevant role reviewer. Agree case counts and scoring before a run; report counts and uncertainty. These are engineering acceptance targets, not achieved results or sales claims. If a role representative is unavailable, employee acceptance stays pending.
- Compare against a capable generic connected agent with equivalent tasks, information, tools/access and budget. Measure setup time separately from execution. Record factual errors, missed commitments, employee edits/interventions, time to usable outcome, total customer cost and provider expense. Reverify current competitor features when running that benchmark.
- Run a small approved pilot including each role, then expand by cohort/office only after reliability, quality, support and payer controls pass. Measure useful tasks completed and repeat weekly use by role, not raw messages or logins. Establish the pilot's repeat-use target and observation window with the sponsor before launch; no retention target is currently achieved.

A comparison report must include failures and unavailable integrations. Do not claim AgentDesk beats Grok Bot, ChatGPT agents or current employee workflows until the relevant comparisons support that conclusion. App-specific knowledge and memory are the hypothesis; less effort and better completed work are the evidence.

## Experience work in every phase

Preserve the chosen light professional workspace with an ink sidebar and restrained green accents. Aesthetic work includes the complete product, not just the home dashboard:

- Role-specific home, first useful request, navigation and onboarding for dispositions, acquisitions and management; no investor-heavy default for every employee.
- Copilot and Work queue show desired outcome, current step, what is needed, estimate/approved maximum, completed artifacts and meaningful recovery controls. Keep internal tool traces out of normal user flows.
- Coherent investor/wholesaler/property/deal timeline, clear sources and private/shared boundaries; inspectable preferences and corrections.
- Phone-friendly cost review and top-up controls; clear purchased/included credit balance, processing/payment failures and receipts without technical ledger jargon.
- Inbox, deal packages, documents, specialist pages, settings, billing and management receive the same typography, spacing, forms and empty/loading/error/disconnected states.
- Verify desktop/phone layouts, keyboard/focus/contrast, long text, slow/failed operations and cross-channel links. Each release includes a real walkthrough of changed screens, not only screenshots of static fixtures.

## Inputs to collect without blocking independent work

| Needed input | Who/what supplies it | Build now | Dependent acceptance |
| --- | --- | --- | --- |
| Dispositions/title specifics | Alex plus authorized company process owner | Configurable fictional parties, stages and draft packages | Official reservation/stop-marketing rule, PSA/deposit evidence, title routing and exceptions |
| Acquisition daily work | Acquisitions practitioner/lead | Wholesaler intake, explicit assumptions, calculator and handoff fixtures | Screening criteria, sources, decision authority and approved diligence method |
| Management daily work | Manager/sponsor | Scoped exceptions, configurable metrics and assignment fixtures | Metric definitions, oversight visibility, assignment/escalation policies and rollout outcomes |
| Company systems/knowledge | Salesforce/email administrator and process owner | Capability adapters, source/version retrieval and disconnect cases | Actual mail coverage/transport, field mapping, SOP authority and permitted data access |
| Employee demo channels | Owner signs into chosen Slack/Twilio accounts | Existing mocks plus new run/approval controls | E1 real account installation, phone receipt and channel walkthrough |
| Commercial operation | Owner and designated payer/company sponsor | Simulated $1 gate and opt-in top-up lifecycle | Pricing/rates, payment provider, sponsorship, line ownership and purchased-credit terms |

Treat provisional defaults as visible assumptions. Ask the smallest role-specific questions when the next dependent slice needs them. Do not turn missing company access into a reason to stop fictional engineering, and do not call a provisional business rule confirmed.

## Development and release discipline

For each implementation checkpoint: declare its supported outcomes and dependencies, build the vertical slice, run meaningful service/model/permission/failure tests, check changed screens on desktop/phone, preserve existing data through additive migrations, update specifications and PROGRESS, commit/push and record remaining limits. Major changes require typecheck, lint, tests, build and the appropriate isolated HTTP smoke suites under AGENTS.md. Migration-copy tests protect prior records, drafts, receipts and balances.

Do not rebuild completed workflows or change the model/framework solely for architectural novelty. Verify current provider APIs when implementing those connections. A blocked credential-dependent test remains pending; complete independent work and label the evidence accurately. Planning/documentation changes alone require link/consistency/diff checks, not a claim of newly passing application tests.

The November 2 presentation is a separate demonstrated slice, not a deadline claim for finishing every agent or production deployment. Choose only verified workflows, include a useful example for each role and rehearse the deployed version with fictional data. Use the local fallback honestly if a live channel has not passed acceptance.

## Relationship to existing plans

| Existing plan | How it fits now |
| --- | --- |
| Capable workforce phases A–F | Same phase names; this document supplies actionable packages and gates |
| Relationship stages 1–2 | Completed record/baseline foundation preserved |
| Relationship stages 3–7 | B methods/context, C judgment/communication, D follow-through and F independent acceptance |
| Communications 1–3 and 4A | Implemented fictional wallet/inbox/company-email foundations preserved |
| Communications 4B | E3 approved company source and delivery route |
| Communications 5 | E4 dedicated investor business lines |
| Communications 6 | A3/A5 simulated spend/top-up controls, then E2/E5a/E5b live operations/usage/billing and F rollout |
| Original numbered phases and Phase 2–4 directives | Historical requirements/checkpoints, not competing current scheduling instructions |

**Next build:** A1–A3, followed by A4–A6. Prepare B's source/method inventory in parallel where it does not depend on executor changes. No new runtime capability is marked complete by publishing this plan.
