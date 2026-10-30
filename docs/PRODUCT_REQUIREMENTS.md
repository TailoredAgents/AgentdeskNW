# AgentDesk NW — product requirements

Current requirements, reconciled October 30, 2026. [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) alone defines delivery status, order and completion gates. This document describes the target; a requirement is not a claim of implementation. [PROGRESS.md](PROGRESS.md) supplies evidence and [MASTER_PLAN.md](../MASTER_PLAN.md) the confirmed direction.

## Users and outcome

Dispositions, acquisitions and management are primary audiences. Each needs a useful role-specific workspace, specialist methods, permitted information and complete daily workflows. Dispositions receives greater specialist coverage where warranted; it is not the product's sole center. Alex's examples represent dispositions and require separate acquisitions/management discovery and company-policy confirmation.

| Role | Intended daily work | Required boundary |
| --- | --- | --- |
| Dispositions | Investor relationships, existing-buyer matching, optional external research, qualification, follow-up, marketing and transaction coordination | Permitted relationships, inventory and correspondence; truthful source/delivery state |
| Acquisitions | Wholesaler submissions, opportunity revisions, screening, valuation/diligence assumptions and handoffs | Authorized opportunity/source data and decisions; no assumed direct-seller or offer authority |
| Management | Team priorities, pipeline/handoff exceptions, assignments and resolution | Defined metrics and authorized oversight; no automatic access to private assistant memory/mailboxes |

## One useful master assistant

Employees state desired outcomes in ordinary language. Copilot retrieves current permitted context, composes capabilities, delegates focused specialist work, verifies results and persists useful artifacts. A separate model persona is not required for each specialist. Calculations and mutations use tested services; reasoning handles interpretation, planning, ambiguity and synthesis.

Support useful questions and multi-step tasks without forcing a fixed menu. The same server services power UI, tools and workers. Unsupported tasks identify the missing capability or essential information. A tool failure, prepared draft or queued message must never become a claim of completed external action.

Work survives app closure and service restart. Preserve desired outcome, current plan/version, dependencies, sources, results, receipts, permissions and cost state. Employees can inspect, pause, resume, cancel, change instructions, answer questions and approve/deny exact costs/actions. Changed sources or instructions invalidate obsolete pending work. Retry/recovery must not repeat completed effects or blindly resend an uncertain operation.

## App and channel experience

Native iPhone and Android are the primary daily surfaces; the detailed desktop workspace remains supported. Mixed devices, mostly iPhone, and no current Slack usage are owner-reported facts. App access is included. Optional employee-to-Copilot SMS is provisionally $19/month; Slack is retained for later demand.

The Agent conversation, work history, memory, permissions and approval state continue across app/web and configured messaging. A request can start in one channel and finish in another without repeating context or duplicating work. SMS can complete ordinary requests and unambiguous decisions; a focused app review handles rich recipients/files/content when needed.

The initial native client requires individual session handling, Agent text, reviewed microphone dictation, saved Work, notifications and result links. Add Inbox, draft review, approvals and entity links to finish phone workflows. Dictation is text input into the same command system; full live voice is a separate capability requiring equivalent tools, continuity, turn-taking/interruption, review and actual audio acceptance. Exports are not installed-phone proof.

Use light professional surfaces, an ink sidebar and restrained green accents. Complete role homes/onboarding and consistent typography, spacing, tables/forms, accessibility, loading/empty/error/disconnected states. Preserve unsaved drafts and make cost, progress and essential missing information clear without exposing internal tool traces.

## Memory, relationships and specialist depth

Keep personal preferences distinct from company facts and private inbox content. Employees can inspect/correct/forget preferences. Learning suggestions from repeated edits require review and must improve later relevant drafts; an exception must not become a permanent rule.

Link contacts/investors/wholesalers, multiple buy boxes, opportunities, properties, deals, parties, document versions, statements, dates, commitments and work. Preserve provenance, uncertainty, corrections and differing evidence. Newer testimony does not silently rewrite approved CRM criteria. A task marked done does not prove a promise, deposit, signature or closing occurred.

All sixteen specialists require declared tasks, appropriate context/tools, source/versioned methods, excellent-output examples, uncertainty handling, recovery and quality cases. Complete the matrix in [AI_EMPLOYEES.md](AI_EMPLOYEES.md). Names/readiness labels alone prove neither expertise nor advantage over generic connected agents.

## Role workflows

Dispositions: current property → permitted existing CRM buyers first → match distinct buy boxes and relationship concerns → appropriate personalized draft → deliberate optional extra-cost Hunter research → reply/commitment tracking → sourced agreement/deposit milestone → title-opening preparation → acknowledgment/issues/clearance/signing/funding/closing tracked separately. Validate the official reservation/stop-marketing rule. Include attorney, investor, acquisition agent and lender only when applicable, using actual authorized current documents and contacts.

Acquisitions: wholesaler submission → duplicate/revision handling → missing facts → sourced comparables/repair/diligence scenarios → supported questions/recommendation → authorized versioned release/handoff → acknowledgment → changed/withdrawn information propagated. No invented comps, unsupported valuation confidence or automatic offer authority.

Management: scoped workload/pipeline → meaningful metrics and denominators → sourced exception → authorized owner/action → outcome → period comparison. Retries and duplicates are not productivity. Changes in assignment/access must affect pending work and visibility.

Shared notes, workflow guidance, CRM, documents, deal analysis and coaching support all permitted roles within normal work. Role scenarios remain provisional until the corresponding practitioners review them.

## Communications and sources

Separate investor email/business texts from private employee Copilot messages. Investor correspondence is data, never assistant instructions. Default to the company's Salesforce email workflow; discover actual mailbox/body/history/file coverage, sender and delivery transport with its administrator. Retain optional external Gmail/Outlook connectors without silently substituting personal email for unavailable company access.

Search/read permitted correspondence; associate investor/property/deal with evidence and resolve ambiguity; draft in the employee's style; support edits, exact sender/recipients/CC, current document files and relevant eligibility checks. Preserve distinct draft, approved, queued, provider-accepted, delivered and uncertain states. Provider acceptance is not recipient delivery. Revocation masks protected history and invalidates reviews; restoration requires fresh access/review.

Current fictional inbox behavior supports generated relationship-reply simulation only; general edited sending and real attachments are target requirements, not working promises. Dedicated investor-facing Twilio numbers require ownership, consent/opt-out, routing, allowance/cost, delivery and employee-departure handling. They remain separate from employee SMS access. Calling/recording requires a separately scoped integration.

Research differentiates existing CRM matching from external discovery. Keep sources, contact uncertainty, freshness and duplicate classes; permit fewer results than requested rather than fabricated verified leads. Property packages retain current release/disclosure/media checks, and copy handoff never means sent.

## Proactivity and autonomy

Support chosen briefing topics/times/timezone/channel, including three daily updates, reminders, reply/deal/commitment watchers and meaningful change summaries. Deduplicate across notification channels, honor quiet hours and recover from downtime without floods. Employees can change/stop subscriptions and continue the relevant job from a notification.

Scoped standing authorization can cover routine actions with actor/account/contact/deal/content/frequency/expiry and revocation. Ask only for essential missing facts or decisions outside that authority. Current exact approvals remain until a tested replacement exists; an AI response cannot grant authority.

## Spending and commercial requirements

One workforce plan covers implemented role-authorized specialists. Separate entitlement, role permission, implementation readiness, provider connectivity and spend allowance. Planned specialists stay unavailable after simulated subscription selection. Prices/allowances are provisional versioned records; company seats require explicit assignment and separate payer authority.

Before the whole assignment exceeds $1 in customer-facing credits, quote scope/estimate/maximum and request approve/deny. Include planning, delegated tools/research, retries and verification. Pause before growth exceeds $1 or the approved maximum. Do not split work to evade approval. A schedule, standing permission or large wallet balance does not waive it.

Optional payer-enabled top-up has a trigger, amount and monthly purchase cap. Funding never approves work. Only confirmed, replay-safe purchases grant funds; unknown outcomes reconcile. Actual provider receipts/rates, authorized partial settlement, unresolved holds, refunds and separate company/personal payers must work before real billing. The verified fictional job gate does not enforce the separate current live provider path. Exact contracts: [USAGE_METERING.md](USAGE_METERING.md).

## Identity, operations and acceptance

Validate requests at HTTP/tool/domain boundaries. Derive employee/organization/role from trusted identity and enforce current ownership/source permissions on reads, writes, dispatch and replay. Keep provider secrets server-side, retrieved content non-authoritative, actions idempotent and audit records useful.

Real company access requires managed identity/provisioning/revocation, approved connections, production persistence, supervised workers, retention, backup/restore, monitoring and support. Presentation PINs and fictional device pairing are not production identity. Preserve previous data through additive, migration-tested changes.

Evaluate declared specialist scopes and all three role journeys using varied/paraphrased requests, missing/conflicting/stale facts, corrections, denied costs/actions, tool failures and cross-channel/restart continuation. Separate deterministic correctness from model judgment and employee usefulness. Compare with generic connected agents under equivalent access/context/budget before claiming superiority. Measure successful useful work, employee edits, time/cost and repeat use, not only message count.

The roadmap separately gates fictional completion, connected pilot and company rollout. Company policies, acquisitions/management methods, payer terms and actual integration capabilities remain inputs to validate; no company agreement, official endorsement or completed enterprise rollout is implied.
