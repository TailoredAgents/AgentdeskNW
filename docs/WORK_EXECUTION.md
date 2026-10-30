# Durable Copilot work — Phase A1–A3

## Implemented scope

This checkpoint adds a bounded persistent work executor around existing services. An employee can create a role-specific sample job in **Work queue → Copilot jobs**, inspect its exact steps and simulated estimate, approve or deny an expensive job, pause/resume/cancel, and return to its saved results. A configured text Copilot can discover available capabilities and compose its own supported plan. The local fallback offers narrower explicitly described starter jobs; it is not equivalent to model reasoning.

The worker performs local deterministic services and fictional research only. It does not run additional reasoning-model calls, contact investors, send mail/SMS, change CRM, purchase credits or connect company systems. The existing live text request remains separately metered; the new simulated $1 rule does not yet protect real provider spending. Real usage admission remains E5a. Automatic top-up remains A5/E5b, not part of this checkpoint.

The catalog still contains 2 locally ready, 10 demo and 4 planned specialists. These workflows demonstrate shared execution and cost authority, not completion of the 16-specialist depth plan or proven expert-level reasoning.

## Useful starting workflows

| Role | Starter job | Outcome |
| --- | --- | --- |
| Dispositions | Select a property and optional investor; optionally add fictional fresh research | Read property → match existing CRM buyers → prepare the selected investor's sourced relationship next step/draft → optionally wait for fictional research → save one requested personal follow-up |
| Acquisitions | Select a property | Read property → review available acquisition release/handoff fields and missing facts → save one personal follow-up; no valuation or release publication |
| Management | Review office priorities | Read permitted office workload and overdue records → save one personal review task; no teammate assignment or private mailbox access |

The new-job form explicitly includes saving that personal task. Generic model-composed plans can omit it; the current employee message must explicitly request a task before a model plan can include one. New research also requires deliberate request. Existing quick questions, direct task controls and workflow forms remain available.

Example offline command: “Start a job for 123 Example Street and Mike Bennett and create a follow-up task.” Add “with fictional new-investor research” to exercise cost review, or “without research” to keep the basic scope. “Show my Copilot jobs” retrieves saved statuses. Unsupported or ambiguous offline requests point to the starter form rather than inventing a completed job.

## Capability execution

The server-owned catalog in work-capabilities.ts declares input schemas, output fields, role/feature requirements, effect and fictional rate version. Implemented capabilities are property inspection, existing-buyer matching, relationship next step, acquisition handoff review, office priorities, personal follow-up, synthetic research start and synthetic research result collection. The planner composes up to twelve steps with explicit dependencies; it does not rely on only the three UI presets.

Input references may select a field inside a completed dependency's structured result. The server validates reference paths and concrete inputs again at dispatch. Models cannot supply tenant/role overrides, arbitrary code, private credentials, arbitrary tools or prices. Cycles, unknown capabilities, malformed inputs and undeclared/prototype-path references fail validation. Research must follow existing-buyer matching for the same property and include a result-collection step. Changed property facts require refreshing the shortlist before starting research.

A work run contains versioned instructions, plans, steps, states, events and actual outputs. Completed steps and their immutable receipts survive plan revisions; revision cannot remove, change or silently repeat them. The service supports versioned revision of remaining work. The present UI exposes pause/resume/cancel and exact cost decisions; a convenient revision editor and cross-channel control interpretation are A4 work.

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
- Work artifacts and ?work= links open the exact job. Linked employee SMS/Slack use the same typed Copilot service, but job controls/cost approval currently use the dashboard. Real account delivery acceptance and A4's direct channel approvals remain pending. Voice excludes these new work tools.

The existing Responses integration was checked against [official function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling#strict-mode). Strict tool envelopes keep every property required and disallow undeclared properties; server validation and authority remain independent of the model output. No model or SDK migration was performed.

## Verification and next work

Run `npm run build` then `npm run test:work` for the isolated compiled HTTP/worker suite. It requires its own disposable database and rejects `SMOKE_BASE_URL`; it never operates on the active demonstration database.

Acceptance includes unit/service tests, mocked model planning/replay, compiled HTTP checks, a real local worker processing fictional work, source/role/cost failures, migration-copy preservation and desktop/phone walkthroughs. Actual results and remaining limitations belong in PROGRESS.md; passing local tests does not establish live model quality, real channel delivery or production readiness.

Next are A4 channel continuation/revision controls, A5 opt-in automatic top-up simulation and A6 expanded all-role acceptance. Phase B develops source/versioned methods and stronger specialist judgment; E5a later connects actual provider spending to the new job authority. The UI starter scenarios in this checkpoint do not finish those later packages.
