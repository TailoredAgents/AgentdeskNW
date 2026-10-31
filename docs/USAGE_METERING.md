# Usage metering and credit-wallet demonstration

The local subscription simulator and real provider evidence are separate ledgers. Proposed subscription rates are not actual charges. No customer payment is collected. Unknown provider expense remains `null`.

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for completion status and development order. This document defines spending contracts and evidence boundaries. C1 covers shared work controls, C2 the native client, and C6 actual spending and top-up integration; the historical A1–A3 label below refers to the committed fictional-work checkpoint.

## Committed job cost approval — bounded fictional work

Saved Copilot jobs use a server-owned whole-job quote, an employee cost decision above $1, and the existing simulated wallet for reservation and per-step settlement. This committed behavior applies only to the bounded local/synthetic work executor. A configured text Copilot may compose a plan through existing text tools, but that initial live text turn remains separately metered; the worker itself makes no additional reasoning-model calls. **The fictional $1 rule does not yet enforce real provider spending.** Optional automatic top-up settings and outcomes now have local simulated acceptance; real purchases and actual provider-wide admission remain separate C6 work.

The server derives estimated and maximum cents from its capability rate card. The budget aggregates all steps and any synthetic child research; UI/model input cannot set the price. At $1 or less it can proceed within current permissions, available balance and the monthly cap. Above $1 the accepted foundation waits for a dashboard approve/deny decision bound to the job plan version and quote. Linked employee channels use the shared typed Copilot for supported work.

C1/C2 include bounded conversational decisions, exact review records and native controls, verified with fictional charges in local HTTP and connected browser tests. Actual employee messaging and installed-phone acceptance remain separate gates. The app is the primary interface, employee SMS is the optional provisional $19/month channel, and Slack is retained for optional future demand. App access is included in the workforce subscription; this does not grant unlimited AI/voice usage or a separate spending balance.

Quote validity is 15 minutes before approval/new reservation. An existing reservation may finish within its approved scope after that quote window. The entire remaining maximum is held atomically before dispatch. Local action, completed-step receipt and fictional settlement commit together; rollback cannot leave a charge for a failed local mutation. Waiting for the already-created synthetic child consumes no extra step charge. Revisions retain prior consumed credit, replace only remaining work and require a new quote/decision when appropriate.

Pause preserves progress and its reservation. Cancellation/completion releases only unused funds; completed steps stay settled. Unknown outcomes keep their hold and block further dispatch or release. Other recoverable errors stop the job for review rather than silently repeating work. Old-period unused included credit expires instead of reappearing in a newer period; purchased funds retain their existing rollover behavior. Job reservations share balance/cap admission with the original wallet samples and cannot be resolved through their manual simulation buttons.

These prices are explicit fictional scenarios, not observed provider expense: property inspection and personal-task creation cost zero; existing-buyer analysis is 40¢ estimated/50¢ maximum; relationship preparation 35¢/50¢; handoff/office analysis 50¢/75¢; synthetic research start 150¢/225¢; collecting its completed result is free. Research's fictional charge occurs at child creation, not as incremental live provider usage. Existing direct lookups, task controls and workflow forms remain unmetered by the wallet. See [WORK_EXECUTION.md](WORK_EXECUTION.md) for supported capabilities, interfaces and remaining limits.

## Metered assignment admission — test-transport acceptance

Migration 029 adds a server-only metered assignment contract that reuses the existing whole-job budget and wallet. A stable assignment key groups bounded planning, delegated reasoning, search and retries. Versioned parts declare permitted features, rates, aggregate unit bounds and call limits. The server derives one estimate/maximum; no HTTP or model caller supplies prices. The original authored `test-text-v1` and `test-search-v1` rates remain fictional fixtures. Optional operator-owned customer text tariffs now have separate local acceptance below. Unknown/unconfigured rates fail closed; no provider price is inferred.

Every attempt commits its request fingerprint, immutable rate snapshot and unit allocation before the adapter runs. Concurrent attempts compete within the same remaining allocation and wallet hold. Exact replays never redispatch. Unknown outcomes stop subsequent dispatch and retain reservations; cancellation records a stopping intent until all already-admitted outcomes reconcile. Revisions cannot remove consumed work, change its rate, shrink below actual usage or proceed with unresolved calls. New scope uses a new quote and appropriate cost decision.

Trusted receipts calculate cumulative customer charges in integer nanodollars, rounding the assignment total to cents rather than each subcall. Historical micro-dollar fields remain readable; new small tariffs can produce fractional micro-dollar evidence without changing integer-cent wallet accounting. Cached tokens are separated from uncached input; reasoning tokens are included in output, not charged again. Known rejected requests settle zero; incomplete/failed responses with usage settle consumed units. Missing/malformed usage remains unknown. Duplicate final receipts are idempotent; conflicting outcomes and reused provider response IDs fail. Actual provider invoice expense stays independently nullable. An unexpected unit overrun records a discrepancy, halts further dispatch and caps customer debit at the approved maximum; excess is retained as unbilled evidence.

Receipt-only internal settlement can reconcile original holds after subscription cancellation without granting new execution. Current membership/ownership still applies; loss of identity requires future operator reconciliation, not invented receipt authority. No client/model settlement endpoint exists. The test adapter performs no network request, and the new contract is not yet wired into live text, voice, Hunter or SMS. Existing live calls therefore remain outside this whole-job credit gate. Host integration must bind each paid quick turn and every delegated job to the same stable root, derive trustworthy input/output/tool bounds, expose its exact review in each channel, validate current rates/tier/cache variants and retain provider receipts before live acceptance.

Verification: 30 unit cases plus twelve disk-backed restart/adapter checks (`npm run test:metered`). These cover the $0.99/$1/$1.01 boundaries, aggregation, quotas, concurrent/exact requests, scoped approval, revisions, partial cancellation, late/unknown/overrun receipts and unchanged caps. The trusted receipt convention follows [OpenAI reasoning usage guidance](https://developers.openai.com/api/docs/guides/reasoning#controlling-costs): output limits include reasoning, and an incomplete result can still incur usage. No current provider price or invoice is inferred from that guidance.

## Authoritative assignment identity — local integration

Migration 038 adds immutable employee-private assignment roots and bindings. The server derives each binding from an existing owned conversation turn, saved job or research job; no UI/model input selects a root or parent. A typed request creates one root. Saved jobs and research created during that request inherit it. Workers restore the persisted job/research binding before executing; exact retries cannot reparent work or replace its original identity. Supported explicit job-control/answer/cost continuations attach their new conversation turn to the selected job's existing root. Unrelated requests remain separate assignments. Broader natural-language continuation still needs C1 work.

Async execution context is isolated per assignment/employee and revalidated against the persisted host. Root creation and local delegated-record creation commit together. Membership, original ownership and host fingerprints are required; a manager cannot inherit another employee's private assignment. Roots/bindings are immutable, and pause/resume, process restart and research collection retain them. Historical unbound work receives a labeled legacy root on first execution; it cannot enter paid admission pretending that earlier spending was zero. No historical parent/cost evidence is invented.

`assignment-metering.ts` derives the one metered ledger key from the active server root. Planning and delegated parts therefore revise the same quote; they cannot select another budget. The existing metered admission rules aggregate parts and preserve consumed receipts. The 99¢ planning + 2¢ delegation case waits on a $1.01 whole-root decision, and later delegation retains consumed planning and its original approved maximum. There is no client/model root, price, receipt or approval authority.

**This is the identity prerequisite, not full live spending enforcement.** The bound metered service has local test acceptance, while the running text/voice/research hosts still need employee quote/continuation, current rate/bounds and actual admission integration. Saved local jobs retain their existing fictional budget; that separate sample charge has not been folded into a live root bill. Voice-session roots and broad conversational replanning remain unfinished. No paid host is newly enabled by this increment, and no existing live-cost gap is claimed closed.

## Responses admission adapter and strict text receipts — local acceptance

`responses-admission.ts` now exercises a text-only Responses host against an injected offline transport and `test-text-v1`. It reuses one existing assignment for successive reasoning rounds. Whole-assignment approval precedes token counting; the count includes the same instructions, input/history, function schemas and reasoning settings as generation. It omits response-only output/tier/storage fields. The token count and maximum output derive the attempt bounds; neither a model nor a client supplies a price or receipt. Both cache classes receive conservative allocation, while actual usage separates cached input once. A combined-input overrun stops continuation even if each individual cache class fits its allocation.

Dispatch commits before the response await. Concurrent count completions cannot duplicate a dispatch. Counts do not create billable attempts; failed counts, changed context and canceled work cannot proceed to inference. Exact admitted retries neither recount nor resend. Missing/malformed usage, unexpected model/tier and interrupted or uncertain responses retain holds and stop further work. Known rejections settle zero; valid incomplete/failed/canceled receipts settle consumed usage and stop. In-flight source changes or cancellation withhold the output while preserving incurred usage. This adapter deliberately accepts only the fictional model/rate, local function schemas and text/reasoning history; no network transport, production tariff, built-in search, audio or binary-file admission is enabled.

The existing live text runtime now shares the strict receipt validator and explicitly requests the default processing tier. It requires a response ID, matching model/tier, terminal status and valid usage subsets **before exposing output or executing tools**. Previously a completed envelope with missing usage could still execute its output; that path now stops with an unresolved allowance reservation. This correction does not yet connect live text to the wallet or the assignment adapter. Existing live-host dollar admission, cross-channel quote/continuation, delegated-root linkage and current production tariffs remain open C6 work.

Verification: 31 offline adapter cases, nine additional live-host malformed/identity cases, and the complete 853-test regression. Updated older provider mocks supply complete response identities/status/tier/usage. No live provider operation or payment occurred. The design follows OpenAI's [per-run spending controller](https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api#check-the-budget-before-each-request) and [token-count request contract](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count), reviewed October 30, 2026. Those sources establish protocol behavior, not our customer tariffs or actual invoice expense.

## Versioned customer text tariffs — local simulated acceptance

`metered-rates.ts` separates customer credit prices from provider expense. An optional **server/operator-only** `AGENTDESK_TEXT_CUSTOMER_TARIFFS` JSON array defines exact model, default processing tier, source/policy label, effective interval and integer `customerNanosPerUnit` for `input_tokens`, `cached_input_tokens` and `output_tokens`. One nanodollar per token equals $0.001 per million tokens. Input/output rates must be positive, cached input cannot cost more than ordinary input, and overlapping intervals for the same model are rejected. Unknown fields, unsupported units, malformed or oversized configuration fail without echoing its contents. There is no default live-model tariff.

Configuration shape (illustrative field names; supply an operator-approved **customer** policy before use):

```json
[
  {
    "model": "exact-response-model-name",
    "serviceTier": "default",
    "source": "Fictional example customer-credit policy; not provider pricing",
    "validFrom": "2026-10-01T00:00:00Z",
    "validUntil": "2026-11-01T00:00:00Z",
    "customerNanosPerUnit": {
      "input_tokens": 25,
      "cached_input_tokens": 5,
      "output_tokens": 125
    }
  }
]
```

These example numbers are test data, not proposed retail prices or current OpenAI prices. Changing any field creates a different immutable tariff ID. Every new dispatch rechecks the original snapshot against the currently effective configuration. Expiry, removal or invalid configuration stops further calls; admitted receipts still settle against their original snapshot after a change. A revised assignment may retain a retired rate only on a part with every permitted call already consumed; additional work needs a current rate and one new aggregate quote including prior spending. It cannot erase earlier expense or reset the $1 threshold.

All multiplication and aggregate rounding use safe integer nanodollars. This supports prices smaller than one micro-dollar per token while preserving old fixture settlements. Existing stored rate snapshots and JSON records need no migration. Invoice expense remains independently unknown; all wallets/assignments still carry simulated accounting. Configuring a tariff does **not** enable a network adapter, alter the legacy live host, authorize a payment, select prices from model output or complete C6. The offline Responses adapter remains limited to its fixture rate; paid-host and employee approval/continuation integration remain next work.

Local acceptance covers version identity, effective boundaries, overlapping/invalid configuration, exact $0.99/$1/$1.01 gates, fractional prices, cumulative rounding, original-rate late receipts, withdrawn-rate dispatch refusal, preserved historical parts and aggregate revision approval. No real prices, provider charges or purchases were tested.

## Full policy and remaining expansion

Owner requirement, October 30, 2026: before a complete job will cost **more than $1**, the employee must be able to approve or deny it, with optional automatic credit top-ups. The policy below covers the intended complete product, including later real provider, scheduled-work and channel-approval integration. The bounded implementation above does not establish that those later paths are connected or protected.


### Job approval rule

- Interpret $1 as the customer-facing usage value deducted from the employee's AgentDesk Credits, including included credits, rather than raw provider expense before AgentDesk pricing. Show dollars to the employee; token counts can be secondary detail. Include every billable part of the job in its quote so tool/research fees cannot create a hidden extra charge.
- Apply the threshold to the complete job, including planning, specialist substeps, delegated work, verification and chargeable retries. Do not evade approval by splitting one assignment into several requests below $1. Recurring executions are individually identifiable jobs; a run above the threshold requires approval for that run, even if its schedule/actions have standing authorization.
- A job with a defensible total maximum of $1.00 or less can proceed under otherwise valid authority and available budget. If its estimate or supported upper bound exceeds $1.00, ask before beginning that job's paid execution. If a reliable bound is unavailable, prepare a limited scope and price for review rather than guessing it is below the threshold. The approved limit must cover the entire job, not only the next model call.
- Present the scope, estimated cost, maximum authorized charge, payer/credit balance and **Approve / Deny** controls in the current supported channel. Bind approval to the employee, job, scope and versioned quote. A model or background worker cannot approve the charge. Declining or an expired/unanswered request must not start the quoted paid work.
- Reserve budget before dispatch. If a job initially below the threshold grows, pause before a further step could take the aggregate above $1.00. If already approved, pause before exceeding the approved maximum. Explain what changed, what is already spent/reserved, the revised total and the additional amount requested. Approval of one maximum is not permission for unlimited research.
- Account for concurrent substeps, pending provider outcomes and retries atomically. Use fixed-precision rate calculations before display rounding; per-step rounding must not hide aggregate usage. Do not release uncertain reservations and then spend the same budget again. Record actual provider expense separately from customer billing; an unexpected provider overrun cannot silently increase the employee's authorized charge.
- Canceling/failing a partially executed job or declining its revised quote does not erase consumed authorized work. Settle the consumed portion, release only unused reservations and retain uncertain provider holds until reconciled. A whole-operation sample refund is not a correct model for partially completed real work.
- Exact $1.00 does not trigger this particular greater-than threshold. Other account permissions, available balance and monthly spending limits still apply. The $1 approval rule remains in effect regardless of wallet balance, company sponsorship, a routine's standing permission or automatic top-up settings.

### Automatic credit top-ups — locally accepted simulation

Automatic top-up is initially off. Desktop Credits & billing and native Settings share an exact settings review: available-credit trigger ($0–$100), purchase amount ($10/$25/$50/$100), UTC calendar-month automatic-purchase cap ($0–$1,000), and an optional explicit cycle re-arm. The personal demo payer is the authenticated employee; there is no payment method, company payer selection or actual charge. A company-funded base seat does not change that payer. Models cannot enable, alter or resolve purchases.

Available credit is calculated after reservations. An immediate transaction and unique pending index permit one pending/unknown purchase per wallet across offices. Pending, unknown and successful requests count against the request month's purchase cap; failures do not. The worker prepares a simulated pending request; only an exact reviewed simulated success credits the purchased bucket once. Unknown/failed outcomes add no funds. Exact retries retain identity, conflicting replays fail, and versioned outcomes cannot overwrite terminal success/failure.

Each low-balance cycle produces at most one request. Balance recovery above the threshold re-arms it, including recovery/spending between worker checks. A successful purchase that leaves the balance low does not trigger a loop. Failed purchases do not retry themselves; an explicit reviewed re-arm is needed. An unknown purchase must be reconciled first. Disablement or loss of purchase eligibility stops new requests while existing outcomes can reconcile. Settings previews bind current settings, balance, permissions and purchase commitments, so intervening changes require a fresh review.

The automatic-purchase cap is separate from the monthly usage limit. Funding never approves a job above $1, raises its maximum, changes spending limits, grants a subscription or overrides company policy. Worker-generated in-app outcome notices use existing quiet hours, daily limits and deduplication. Push/SMS routing and actual payment notifications remain later integration work.

Local acceptance covers opt-in, personal payer isolation, concurrent checks, capped pending/failed/unknown outcomes, exact retries, credit once, recovery timing, subscription/policy changes, month transitions, and unchanged job authorization. Real payment setup, verified provider settlement and actual usage admission remain separate gates. The simulation does not enforce the whole-job rule for existing live AI calls.

### Acceptance coverage and remaining gates

The historical A1–A3 tests cover $0.99, exactly $1.00, and $1.01 whole-job bounds; multiple substeps totaling more than $1; competing reservations; estimated growth mid-job; partial cancellation/failure and unused/uncertain reservations; increased approved maximum; denial, expiration and changed quotes; scoped approval identity; and attempts to bypass job admission with a top-up or replay. Later C1/C2 checkpoints verified bounded mobile/channel approvals locally. Real SMS delivery, installed phones, scheduled-run decisions and actual provider-cost aggregation still need their declared acceptance. Auto-top-up local acceptance covers low balance, explicit opt-in, payer isolation, monthly purchase/spending caps, pending/failed/duplicate payment results, trigger re-arming, still-low balance after success, disablement and recovery. Report actual costs and unknown outcomes without presenting an estimate as a provider receipt.

## Current retail-credit wallet

The workforce plans include $15 of simulated retail credits per billing period. Purchased simulated top-ups of $10/$25/$50/$100 roll over separately. `wallet.ts` performs scoped, transaction-bound estimates, reservations, sample settlement/release, pending/unknown handling and spending-limit checks. `work-budget.ts` adds complete-job authority and partial settlement through that same ledger; it does not create a second spendable balance. Monetary arithmetic uses integer cents, and the ledger/events are append-only. Monthly credit is spent before purchased credit. Expired included credit cannot be recreated by canceling an old reservation in a newer period.

The sample-work rate card has a version and server-owned provider-cost examples multiplied by 5. An estimate returns a scoped quote valid for 15 minutes. The employee explicitly confirms that quote to reserve/finish/cancel/sample an unknown outcome. Stable event keys and expected wallet versions prevent duplicate or stale changes. Unknown operations remain reserved until a reviewed simulator resolution. The monthly cap is $25 by default, configurable from $0 to $1,000; this is a sample-spending cap, not a cap on existing live provider calls.

**Live provider activity still does not debit this wallet.** Saved local/synthetic job simulations do. Existing text, voice, research and SMS allowances remain independent operational safeguards. Simulated wallet top-ups do not increase those allowances. Before live wallet billing, C6 must integrate real usage with versioned model/tool/audio rates, cost reconciliation, holds and failure/refund policy; payment settlement has its own acceptance. Unknown provider dollars remain unknown. No estimated or fictional amount is relabeled as an invoice.

Ordinary navigation, deterministic task management and the Phase 2 fictional Inbox do not consume retail credits. Inbox filtering, context reads, manual drafts and sample arrivals make no AI/provider calls. Background communications processing will need explicit scope and budgets in later phases.

## Existing operational allowances and admission

| Category | Provisional allowance | Current behavior |
|---|---|---|
| Text | Workforce: 100,000 tokens/month (operational guardrail) | Reserve serialized request bytes (including tools) plus maximum output tokens. Settle provider-reported input/output tokens, including above-estimate usage. Known rejection releases the hold; timeout/missing/invalid receipt retains it. |
| Voice | Workforce: 60 minutes/month (operational guardrail) | Hold at most 10 remaining minutes per session. Realtime reports token/audio usage, not authoritative session minutes; connected-session holds remain unresolved. Never settle guessed elapsed minutes. |
| Hunter | 1 operational research credit/month; target 25 candidates/credit | Reserve before queueing, consume once on successful bounded completion, release unused credits on failure/cancel. Retain incurred provider receipts independently. A target is not a promised count. |
| External search | Accounting counter | Record actual provider search-call counts, even above an admission estimate. Unknown outcomes retain unresolved holds and stop further work. |
| Provider requests | Accounting counter | Record durable dispatch once. A failed or canceled job may still have incurred expense. |
| SMS | 500 segments/month in optional add-on | Actual channel usage can be recorded when explicitly configured; account setup and real delivery acceptance remain pending. Provisional overage is not a provider bill. |

All service, text, voice, direct API and worker admission checks use existing roles, policies and entitlements. Expiration cannot erase incurred usage. Late trusted voice receipts inherit the original scoped operation and may be recorded after subscription cancellation; they grant no execution permission.

## Evidence ledger

Migration 006 adds `provider_operations`, keyed by organization, office, employee and operation ID. It records provider/model/feature/kind, request fingerprint, provider response ID, status, timestamps, numeric usage, known actual cost (nullable), configured estimate (separate), and a bounded error code. Secrets, prompts and raw transcripts are not audit metadata.

Exact receipt replay is idempotent. Conflicting receipts and reused provider response IDs are rejected. An unknown operation may accept a later authoritative receipt. A provider request header is correlation, not a provider billing deduplication guarantee. Requests are never automatically retried after ambiguous completion.

Text requests also have durable employee request IDs; model tool mutations and their receipts share a SQLite transaction. Browser retry of the same request returns freshly permission-filtered saved history. Audio sideband receipts use provider response/item IDs. External worker call checkpoints survive restarts; uncertain in-flight calls are not dispatched again.

## Voice minute limitation

Realtime audio input/output/cached token details and transcription duration/tokens (when actually reported) are stored. Local elapsed seconds remain operational telemetry labeled `voice_elapsed_seconds_estimate`, never financial settlement. There is no supported automatic conversion from those receipts to the current wall-clock minute allowance. Connected voice therefore reserves its admission block until a reviewed reconciliation policy is implemented. Unused setup failures release their reservation.

Server session limits, heartbeat expiry, entitlement/access revocation and provider hangup bound normal sessions. Unconfirmed hangups and server crashes remain operational risks; a short-lived credential is not a hard provider spending cap. No user endpoint can invent a receipt or release incurred usage.

## Research scope and estimates

External mode requires OpenAI credentials, explicit provider selection, a positive operator-configured per-request estimate and an employee-approved job budget. Enforced bounds include requests, search calls, maximum output tokens, duration and a provider-wide interval. Each attempt consumes estimate budget even if it fails. Actual dollar cost remains unknown until billing evidence is integrated. These estimates are not a guaranteed provider invoice cap.

Completion may return fewer candidates than requested. Public web claims, company identity and contacts remain unverified. A research credit does not buy a fixed number of verified phones, searches or transactions. Synthetic jobs emit no external provider expense.

## Reporting and economics

Settings → Provider verification and authenticated `/api/providers` show the latest 100 employee-scoped operations, usage totals, unresolved operations, cost coverage and source boundaries. Credits & billing shows current-period consumed/reserved allowance. Provider receipts are a bounded operational view, not a complete monthly cost/profit report. Pricing decisions need full-period aggregation, provider invoice reconciliation, real task success rates and cost per qualified lead.

The former $49 Core and $79 Hunter prices are historical. Current workforce and communication prices remain provisional. Prior live OpenAI acceptance is documented in PROGRESS; no live provider call is required by the wallet demonstration. Payment and subscription lifecycle events still collect no money.

## Employee SMS receipts (October 29)

Employee Copilot SMS now reserves a conservative Unicode segment count before dispatch and reconciles the trusted Twilio receipt to actual usage. Signed inbound receipts also record actual segments; they can reflect already-incurred usage after entitlement expiry. Queued/provider-zero estimates do not settle a reservation. Definitive request rejection releases it; ambiguous delivery retains it until a trusted receipt resolves it. Duplicate receipts cannot double-charge; inconsistent settled quantities fail for review. Provider monetary cost remains null rather than estimated as an invoice. The commercial ledger remains a demonstration and never collects payment. See MESSAGING_SETUP.md.

The SMS adapter and receipt handling exist; mocked acceptance is not proof of an actual carrier round-trip. C5 prioritizes real employee SMS acceptance. The unfinished mobile notification source similarly distinguishes a queued notice, Expo acceptance and a push-service receipt from a phone displaying it. It defaults to live sending disabled, has no actual delivery acceptance and does not add a billing integration.

## Deterministic proactive updates

Chosen briefings and change watchers summarize current authorized records without paid reasoning or wallet charges. Scheduling an update never grants paid-job execution or spending approval. If later initiative introduces model/tool costs, it must enter the same whole-assignment admission contract before dispatch.

## Employee root reviews and original-host continuation

Migration 039 adds `assignment_reviews`, an immutable scope/presentation bound to the existing root ledger, exact quote/revision and private persisted host. `presentCurrentAssignmentQuote` is trusted server-only: every allocation needs one description; supplied source artifacts/references and the original saved-job plan are rechecked. It cannot choose another root or change a quote's description under the same identity. Desktop/native Work render only employee projections; root IDs, provider payloads/rate details, source fingerprints and claim tokens stay server-side.

`/assignment-reviews` and its private detail route support reads. The sole mutation is an authenticated exact `decision` with quote ID, revision, approve/deny and idempotency key. Creation, claim and receipt endpoints do not exist. Model approval tools do not exist. A cost approval records readiness, never successful execution, wallet top-up authority, action authority or a new job. Expired/changed/restricted/closed reviews reject decisions. An old projection retains its original estimate and maximum, while settled/held amounts reflect the owned assignment.

`claimAssignmentContinuation` runs only in the original bound host context, validates the current scope callback and sources, and commits one claim. No automatic lease expiry or re-claim is allowed: an interrupted host must reconcile its own durable execution state and admitted attempt receipts. `completeAssignmentContinuation` accepts only that host's saved token and records return to its execution, not assignment completion. Exact approval retries cannot reset a claimed/returned state. All subsequent paid attempts still require root admission and supported rate/unit limits.

Acceptance is currently test-host/API/browser/native-export only. Running paid hosts do not publish/consume these reviews yet; the live text runtime still has its separate operational allowance. The next integration must persist original-turn/payload/round state, bound the entire assignment including delegation, publish the quote before paid work, resume exactly once and reconcile uncertain receipts. Existing sample-job budget commands remain distinct. Root-review SMS/conversation commands and live voice parity are not implemented. Never present these review cards as evidence that live spending is capped.

## Running text execution durability

Migration 040 stores `text_executions` under the actual employee turn and immutable assignment binding. `runLiveText` opens a private snapshot of original instructions, tool/configuration identity, authorized context and retained conversation items. Fresh reentry must match the stored execution identity and current protected scope; it never substitutes a caller-selected root or fresh budget. Completed results and tool artifacts are rechecked before reuse.

Operational allowance reservation, provider operation and a non-expiring dispatch claim commit together before the network request. The authoritative response receipt and saved raw response commit together before output is used. Tool mutations/receipts and next-round state/scope commit atomically. A failed tool checkpoint can therefore reuse the already-saved paid response; a committed tool step is not rerun after a between-round interruption. Unknown outcomes retain their operational hold and block re-dispatch. Confirmed failures/incomplete output remain stopped; no partial calls are applied later.

This is integrated runtime durability, verified with mock transport and a separate-process restart harness (`npm run test:text-restart`). It is not customer-credit admission. Cost-triggered waiting, quote publication, root-ledger settlement and employee/worker continuation remain to be connected. Normal chat replay continues to return its existing saved reply. No response recovery API is exposed to clients/models. The future bounded adapter will use the [official input-token counting contract](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count); this checkpoint does not call that endpoint or claim actual-price bounds.
