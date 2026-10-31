# Durable Copilot work — service specification

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for completion status, development order and the next checkpoint. This file defines the durable-work contracts and acceptance boundaries. Historical A1–A3 labels identify the verified foundation in commit `2d16665`; conversational controls belong to canonical C1, native surfaces to C2/C3, specialist depth to C4, proactive messaging to C5, actual spending/top-up to C6 and connected pilot/rollout to C7. They are not a second delivery sequence.

The October 30 shared-controls/mobile foundation has local integrated acceptance. Bounded conversational controls, native-client source and notification infrastructure extend the earlier `2d16665` engine. Real employee SMS/Slack, installed-phone speech/push, broader planning and deployment remain separate acceptance gates.

## Verified committed foundation

This checkpoint adds a bounded persistent work executor around existing services. An employee can create a role-specific sample job in **Work queue → Copilot jobs**, inspect its exact steps and simulated estimate, approve or deny an expensive job, pause/resume/cancel, and return to its saved results. A configured text Copilot can discover available capabilities and compose its own supported plan. The local fallback offers narrower explicitly described starter jobs; it is not equivalent to model reasoning.

The worker performs local deterministic services and fictional research only. It does not run additional reasoning-model calls, contact investors, send mail/SMS, change CRM, purchase credits or connect company systems. The existing live text request remains separately metered; the simulated $1 rule does not yet protect real provider spending. Actual usage admission and optional automatic top-up are C6 requirements, not completed by this foundation.

The catalog still contains 2 locally ready, 10 demo and 4 planned specialists. These workflows demonstrate shared execution and cost authority, not completion of the 16-specialist depth plan or proven expert-level reasoning.

## Useful starting workflows

| Role | Starter job | Outcome |
| --- | --- | --- |
| Dispositions | Select a property and optional investor; optionally add fictional fresh research | Read property → match existing CRM buyers → prepare the selected investor's sourced relationship next step/draft → optionally wait for fictional research → save one requested personal follow-up |
| Acquisitions | Select a property | Read property → review available acquisition release/handoff fields and missing facts → save one personal follow-up; no valuation or release publication |
| Management | Review office priorities | Read permitted office workload and overdue records → save one personal review task; no teammate assignment or private mailbox access |

The new-job form explicitly includes saving that personal task. Generic model-composed plans can omit it; the current employee message must explicitly request a task before a model plan can include one. New research also requires deliberate request. Existing quick questions, direct task controls and workflow forms remain available.

Example offline command: “Start a job for 123 Example Street and Mike Bennett and create a follow-up task.” Add “with fictional new-investor research” to exercise cost review, or “without research” to keep the basic scope. “Show my Copilot jobs” retrieves saved statuses. Unsupported or ambiguous offline requests point to the starter form rather than inventing a completed job.

## Saved questions and continuation

The `request_information` capability pauses a saved job for an employee-supplied property, investor, text, number or timezone-explicit date/time. It costs zero simulated credits. A dependent step can read its `answer`, `propertyId` or `investorId`; supported task title/date and research-count fields accept typed result references. Missing-property acquisitions/dispositions starters now create this question rather than discarding the request. Management and other custom supported plans can compose questions as well.

The shared `POST /api/work/:id/answer` action binds the authenticated owner, expected job version and a question reference derived from the current plan, prompt and authorized source/choice data. Exact retries preserve one answer receipt. Record choices require one exact current ID/name/address; arbitrary text remains employee-supplied data, never verified CRM facts or action authority. Invalid types or incompatible immediately dependent inputs fail before saving the answer, so the same question can be corrected. This is typed dependency continuation, not arbitrary document ingestion or unrestricted replanning.

An answer completes only the zero-cost question step, retains earlier results/receipts and creates a new immutable plan/whole-job quote. Any previous cost approval is invalidated; above $1 waits for a fresh explicit decision. Future missing answers remain pending. Resume cannot bypass a question, and neither an answer nor an instruction-like string can authorize spending or sending. Cancellation remains available. No new schema migration is required: current job/plan JSON and immutable step receipts hold the state.

Copilot displays the question and a source-bound `Answer Q…: …` command. A bare exact record selection such as “Use 123 Example Street” is accepted only when the latest delivered, still-visible assistant message identifies one current question. Otherwise the employee uses the explicit current question reference or Work. Older queued channel answers cannot answer a newer question. Question references also protect stored conversation/tool replay and derived work provenance when choices or source facts change. Desktop and native Work have answer controls, explicit uncertain-result retry and fresh-source checks; native navigation guards unsaved answers. UI state remains memory-only.

Real SMS/Slack, installed-device behavior and model-quality acceptance remain deferred. The dispatcher and tests establish local shared authority, not live channel delivery. Saved answers do not add a general model approval/write tool, guarantee every missing fact can be inferred, or complete all C1 planning/edit/voice requirements.

## Capability execution

The server-owned catalog in work-capabilities.ts declares input schemas, output fields, role/feature requirements, effect and fictional rate version. Implemented capabilities are property inspection, existing-buyer matching, relationship next step, acquisition handoff review, office priorities, personal follow-up, synthetic research start and synthetic research result collection. The planner composes up to twelve steps with explicit dependencies; it does not rely on only the three UI presets.

Input references may select a field inside a completed dependency's structured result. The server validates reference paths and concrete inputs again at dispatch. Models cannot supply tenant/role overrides, arbitrary code, private credentials, arbitrary tools or prices. Cycles, unknown capabilities, malformed inputs and undeclared/prototype-path references fail validation. Research must follow existing-buyer matching for the same property and include a result-collection step. Changed property facts require refreshing the shortlist before starting research.

A work run contains versioned instructions, plans, steps, states, events and actual outputs. Completed steps and their immutable receipts survive plan revisions; revision cannot remove, change or silently repeat them. The service supports versioned revision of remaining work. The committed UI exposes pause/resume/cancel and exact cost decisions; broader editing remains planned. Bounded conversational control and dispositions-starter corrections are locally verified, as described below; broader C1 acceptance remains open.

## Persistence, recovery and visibility

Migration 020 adds private organization/office/employee work runs, immutable plan versions/events/step receipts and replay-protected employee commands. Leases prevent two workers executing the same step; an expired local claim can resume. Each synchronous local mutation, fictional step settlement and receipt commits in one database transaction. Failed transactions roll back all three. The worker checks cancellation, current membership, feature access and source access before dispatch.

Synthetic research remains a child in the existing research service. The parent waits for its actual saved result before completing. Canceling the parent cancels its pending synthetic child; completed tasks/results are retained. Waiting does not consume an additional sample charge. Unknown financial outcomes retain holds and prevent additional dispatch; no automatic blind retry/refund is introduced.

Saved job content is private even from an office manager acting as another employee. Direct source IDs and saved structured results are rechecked for investor/property/release/task/research access. Model-authored titles/instructions also retain server-derived original context and role provenance. Cached work artifacts bind an immutable plan version, so removing an unexecuted step cannot make an old result visible after its source is revoked. Revoked content is masked in work detail, conversation history, tool-result reuse and cached replies. Protected context changes invalidate opaque model history. Historical work remains inspectable after a subscription ends when the employee still has source access; new execution remains subject to current entitlement.

The production worker entry point now advances work runs alongside existing jobs. A closed browser does not stop an active server worker. Stopping the server pauses processing while persisted progress survives. This remains the single-instance SQLite demonstration, not distributed production orchestration.

## Whole-job sample spending

Migration 021 adds a scoped budget and immutable quote/decision/consumption events. The budget uses the existing simulated wallet and ledger rather than a second spendable balance. The complete plan maximum is reserved atomically before its first step, and each completed step settles its server-defined fictional amount.

- Exactly $1 or less can proceed within account authority, available credits and the monthly limit. Above $1 waits for an employee's approve/deny decision bound to the exact job version, quote and maximum.
- The approval screen shows actual step targets, requested task content and research count. It freezes the reviewed version; polling cannot silently substitute a changed quote or scope.
- All specialist steps and the synthetic child share the parent budget. Repeated model start calls within one employee turn use one stable assignment identity; different payloads cannot create separate cheap jobs to evade approval.
- Revisions include prior consumed credit plus all remaining work. If the revised total exceeds the threshold or approved scope/maximum, work waits for a fresh decision. Expired quotes require refresh. The model has no approval, credit-purchase or wallet-resolution tool.
- Canceling after partial execution retains settled usage and releases only unused holds. A timeout/unknown outcome retains its reservation. Concurrent jobs, sample-wallet operations and monthly caps share the same ledger admission.
- Direct wallet sample-resolution controls cannot release a job-owned reservation. Credits & billing links those holds back to their job.

These are fictional sample prices, not provider invoices or a measured AI charge. Property lookup and task creation cost zero. Buyer analysis is 40¢ estimated/50¢ maximum; relationship preparation 35¢/50¢; handoff or office review 50¢/75¢; synthetic research start 150¢/225¢; waiting for its results is free. Research's fictional charge is consumed at child creation in this scenario; it is not incremental provider usage. The basic dispositions job with relationship preparation therefore has a $1 maximum and settles 75¢; with research its maximum is $3.25 and settles $2.25. The existing direct services do not gain a new fee.

## API and Copilot surfaces

- GET /api/work and /api/work/:id return private currently authorized work.
- GET /api/work/capabilities returns availability and schemas, not permission grants.
- POST /api/work creates a server-owned role starter from a stable request ID and selected records.
- POST /api/work/:id/control, /decision and /revise require employee session, expected version and stable event key; cost decisions also require the exact quote ID. The current public revision route rebuilds a validated starter plan; the service supports general typed revisions.
- Typed Copilot has work_capabilities, start_work and work_status. New jobs attach to the current employee conversation. The model tool's closed schema carries capability input JSON as a string, then validates the decoded object against that capability's typed server schema.
- Work artifacts and ?work= links open the exact job. Linked employee SMS/Slack use the same typed Copilot service. The shared dispatcher supports bounded actual-employee job commands and exact cost review codes to that dispatcher; real account delivery acceptance remains pending. Its long reviews require the full app view, and short channel approvals require the reviewed message's recorded acceptance/delivery before the decision. Live voice excludes these work tools and does not have conversational job-control parity.

The existing Responses integration was checked against [official function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling#strict-mode). Strict tool envelopes keep every property required and disallow undeclared properties; server validation and authority remain independent of the model output. No model or SDK migration was performed.

## Verification and acceptance boundaries

Run `npm run build` then `npm run test:work` for the isolated compiled HTTP/worker suite. It requires its own disposable database and rejects `SMOKE_BASE_URL`; it never operates on the active demonstration database.

Acceptance includes unit/service tests, mocked model planning/replay, compiled HTTP checks, a real local worker processing fictional work, source/role/cost failures, migration-copy preservation and desktop/narrow responsive-browser walkthroughs. [PROGRESS.md](PROGRESS.md) records historical verification evidence; the canonical roadmap owns current completion status. Passing local tests does not establish live model quality, real channel delivery or production readiness.

Outstanding acceptance includes richer document/context clarification and broader corrections (C1/C3), native-device behavior (C2/C3), source/versioned methods and useful workflows across all three roles (C4), proactive/SMS behavior (C5), actual spending and optional top-up (C6), and approved connections/rollout (C7). The canonical roadmap sets their order and dependencies; this specification does not create another delivery schedule.


## Shared conversational work controls — local acceptance

Saved jobs have short W references in Copilot output. Actual authenticated employee messages are interpreted before any model call; the model has no cost-approval tool. Supported examples include `Show my Copilot jobs`, `Review job W1234ABCD`, `Pause job W1234ABCD`, `Resume job W1234ABCD`, `Cancel job W1234ABCD`, `Remove research from job W1234ABCD` and `Change investor for job W1234ABCD to Mike Bennett`. Corrections are restricted to reconstructable dispositions starter plans and preserve completed steps; unsupported edits explain what remains necessary. This is not arbitrary natural-language plan revision.

A cost review lists actual step targets, scope, estimate/maximum, prior spend and expiry. `Approve A1234ABCD` or `Deny A1234ABCD` acts only on that actor/conversation's exact immutable review, job version, plan and quote. Ambiguous assent is not a decision. Reviews from SMS/Slack must have confirmed reply delivery before the decision's received time; a long scope directs the employee to full app review instead of issuing a truncated authority token. Dashboard/native buttons continue calling the same versioned services. Fictional costs remain distinct from actual provider metering.

Short references such as `Pause that job` require exactly one current structured job reference and no competing task. Scope, plan version and channel delivery timing are rechecked. If an artifact is withheld after access changes, a bare `Cancel it` stays in the job-selection flow, asks for a fresh selection and excludes restricted jobs from its choices. It cannot fall through to an older personal task. A regression verifies unchanged job/task state, no restricted investor name and no model call.

Migration 022 adds scoped conversation command receipts and immutable exact-review records. Mobile transport and notifications are subordinate specifications in [MOBILE_DELIVERY_PLAN.md](MOBILE_DELIVERY_PLAN.md); their local foundation is verified, with installed-phone acceptance pending. New device credentials do not grant a role or permit another employee's jobs. Reviewed native dictation uses the typed command path, not the current live-voice tool path.

Local acceptance includes 23 work-conversation tests, the 96-check mobile HTTP suite, existing work/conversation/messaging suites and a connected browser/phone-width walkthrough. Exact reviews, stale/replayed decisions, withheld references, pairing/session/role changes and worker persistence are covered. The full evidence ledger is in [PROGRESS.md](PROGRESS.md); real provider transport and actual-phone acceptance remain outstanding.