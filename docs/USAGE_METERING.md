# Usage metering and credit-wallet demonstration

The local subscription simulator and real provider evidence are separate ledgers. Proposed subscription rates are not actual charges. No customer payment is collected. Unknown provider expense remains `null`.

## Planned job cost approval and automatic top-ups

Owner requirement, October 30, 2026: before a job will cost **more than $1**, the employee must be able to approve or deny it. Add optional automatic credit top-ups. These are new implementation requirements; the current wallet remains a simulator and live provider activity still does not debit it. Its existing sample-work reviews are unchanged.

### Job approval rule

- Interpret $1 as the customer-facing usage value deducted from the employee's AgentDesk Credits, including included credits, rather than raw provider expense before AgentDesk pricing. Show dollars to the employee; token counts can be secondary detail. Include every billable part of the job in its quote so tool/research fees cannot create a hidden extra charge.
- Apply the threshold to the complete job, including planning, specialist substeps, delegated work, verification and chargeable retries. Do not evade approval by splitting one assignment into several requests below $1. Recurring executions are individually identifiable jobs; a run above the threshold requires approval for that run, even if its schedule/actions have standing authorization.
- A job with a defensible total maximum of $1.00 or less can proceed under otherwise valid authority and available budget. If its estimate or supported upper bound exceeds $1.00, ask before beginning that job's paid execution. If a reliable bound is unavailable, prepare a limited scope and price for review rather than guessing it is below the threshold. The approved limit must cover the entire job, not only the next model call.
- Present the scope, estimated cost, maximum authorized charge, payer/credit balance and **Approve / Deny** controls in the current supported channel. Bind approval to the employee, job, scope and versioned quote. A model or background worker cannot approve the charge. Declining or an expired/unanswered request must not start the quoted paid work.
- Reserve budget before dispatch. If a job initially below the threshold grows, pause before a further step could take the aggregate above $1.00. If already approved, pause before exceeding the approved maximum. Explain what changed, what is already spent/reserved, the revised total and the additional amount requested. Approval of one maximum is not permission for unlimited research.
- Account for concurrent substeps, pending provider outcomes and retries atomically. Use fixed-precision rate calculations before display rounding; per-step rounding must not hide aggregate usage. Do not release uncertain reservations and then spend the same budget again. Record actual provider expense separately from customer billing; an unexpected provider overrun cannot silently increase the employee's authorized charge.
- Canceling/failing a partially executed job or declining its revised quote does not erase consumed authorized work. Settle the consumed portion, release only unused reservations and retain uncertain provider holds until reconciled. A whole-operation sample refund is not a correct model for partially completed real work.
- Exact $1.00 does not trigger this particular greater-than threshold. Other account permissions, available balance and monthly spending limits still apply. The $1 approval rule remains in effect regardless of wallet balance, company sponsorship, a routine's standing permission or automatic top-up settings.

### Automatic credit top-ups

Make auto top-up explicitly opt-in and initially off. The authorized payer chooses the available-credit trigger, amount to purchase per top-up and a monthly auto-purchase cap. Display the payer/payment method and the selected settings clearly, allow disabling/changing them, and notify after each completed purchase or payment failure. These values are settings, not automatically chosen purchase commitments.

Calculate available credit after existing reservations. Permit at most one pending top-up for the same wallet/trigger cycle. Count completed and pending automatic purchases against the monthly cap, and use idempotent payment requests and verified settlement events so worker retries or webhook duplicates cannot charge twice or grant credit twice. A pending, failed or unknown payment does not create spendable credit; stop retry loops and surface the status.

Use one replenishment per eligible low-balance cycle. Re-arm after the balance recovers above the trigger and a later eligible event lowers it again, or after an explicit payer recovery/configuration decision. If one successful purchase still leaves the balance below the trigger, show the remaining low balance rather than purchasing repeatedly. Do not retry failed/unknown purchases on every worker poll. Disabling auto top-up prevents new purchases while outstanding outcomes still reconcile correctly.

Keep the automatic-purchase cap separate from the existing monthly usage-spending limit. A top-up increases available funds; it does not approve a job above $1, increase its authorized maximum, raise a spending cap, grant a subscription or change role permissions. Company-paid seats do not authorize charging an employee's payment method, and employee auto top-ups do not authorize spending company funds. Recurring payment authorization must come from the actual payer.

Implement/test settings, job gates and top-up outcomes first with explicit fictional rates/payment simulation. Roadmap E5a connects real provider admission and receipt reconciliation after A3 using authorized bounded tests on fictional data; shadow customer-credit accounting is not payment collection. E5b separately connects verified payments and opted-in off-session purchases after their commercial setup. Do not label these new settings or the $1 rule as enforced for current live AI requests before that integration is complete.

### Required acceptance

Cover $0.99, exactly $1.00, and $1.01 whole-job bounds; multiple substeps totaling more than $1; parallel reservations; estimated growth mid-job; partial cancellation/failure and unused/uncertain reservations; increased approved maximum; denial, expiration and changed quotes; dashboard/SMS/Slack approval identity; each expensive scheduled run; and attempts to bypass approval with a top-up or task split. Test low balance, explicit opt-in, payer isolation, monthly purchase/spending caps, pending/failed/duplicate payment results, trigger re-arming, still-low balance after success, disablement and recovery. Report actual costs and unknown outcomes without presenting an estimate as a provider receipt.

## Current retail-credit wallet

The workforce plans include $15 of simulated retail credits per billing period. Purchased simulated top-ups of $10/$25/$50/$100 roll over separately. `wallet.ts` performs scoped, transaction-bound estimates, reservations, sample settlement/release, pending/unknown handling and spending-limit checks. Monetary arithmetic uses integer cents, and the ledger/events are append-only. Monthly credit is spent before purchased credit. Expired included credit cannot be recreated by canceling an old reservation in a newer period.

The sample-work rate card has a version and server-owned provider-cost examples multiplied by 5. An estimate returns a scoped quote valid for 15 minutes. The employee explicitly confirms that quote to reserve/finish/cancel/sample an unknown outcome. Stable event keys and expected wallet versions prevent duplicate or stale changes. Unknown operations remain reserved until a reviewed simulator resolution. The monthly cap is $25 by default, configurable from $0 to $1,000; this is a sample-spending cap, not a cap on existing live provider calls.

**Live provider activity does not debit the new wallet in this phase.** Existing text, voice, research and SMS allowances remain independent operational safeguards. Simulated wallet top-ups do not increase those allowances. Before live wallet billing, Phase 6 must integrate real usage with versioned model/tool/audio rates, cost reconciliation, holds, failure/refund policy and payment settlement. Unknown provider dollars remain unknown. No estimated or fictional amount is relabeled as an invoice.

Ordinary navigation, deterministic task management and the Phase 2 fictional Inbox do not consume retail credits. Inbox filtering, context reads, manual drafts and sample arrivals make no AI/provider calls. Background communications processing will need explicit scope and budgets in later phases.

## Existing operational allowances and admission

| Category | Provisional allowance | Current behavior |
|---|---|---|
| Text | Workforce: 100,000 tokens/month (operational guardrail) | Reserve serialized request bytes (including tools) plus maximum output tokens. Settle provider-reported input/output tokens, including above-estimate usage. Known rejection releases the hold; timeout/missing/invalid receipt retains it. |
| Voice | Workforce: 60 minutes/month (operational guardrail) | Hold at most 10 remaining minutes per session. Realtime reports token/audio usage, not authoritative session minutes; connected-session holds remain unresolved. Never settle guessed elapsed minutes. |
| Hunter | 1 operational research credit/month; target 25 candidates/credit | Reserve before queueing, consume once on successful bounded completion, release unused credits on failure/cancel. Retain incurred provider receipts independently. A target is not a promised count. |
| External search | Accounting counter | Record actual provider search-call counts, even above an admission estimate. Unknown outcomes retain unresolved holds and stop further work. |
| Provider requests | Accounting counter | Record durable dispatch once. A failed or canceled job may still have incurred expense. |
| SMS | 500 segments/month in optional add-on | Actual channel usage can be recorded when explicitly configured; current accounts remain disconnected. Provisional overage is not a provider bill. |

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
