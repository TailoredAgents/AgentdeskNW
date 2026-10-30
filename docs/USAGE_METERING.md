# Usage metering and credit-wallet demonstration

The local subscription simulator and real provider evidence are separate ledgers. Proposed subscription rates are not actual charges. No customer payment is collected. Unknown provider expense remains `null`.

## Current retail-credit wallet

The workforce plans include $15 of simulated retail credits per billing period. Purchased simulated top-ups of $10/$25/$50/$100 roll over separately. `wallet.ts` performs scoped, transaction-bound estimates, reservations, sample settlement/release, pending/unknown handling and spending-limit checks. Monetary arithmetic uses integer cents, and the ledger/events are append-only. Monthly credit is spent before purchased credit. Expired included credit cannot be recreated by canceling an old reservation in a newer period.

The sample-work rate card has a version and server-owned provider-cost examples multiplied by 5. An estimate returns a scoped quote valid for 15 minutes. The employee explicitly confirms that quote to reserve/finish/cancel/sample an unknown outcome. Stable event keys and expected wallet versions prevent duplicate or stale changes. Unknown operations remain reserved until a reviewed simulator resolution. The monthly cap is $25 by default, configurable from $0 to $1,000; this is a sample-spending cap, not a cap on existing live provider calls.

**Live provider activity does not debit the new wallet in this phase.** Existing text, voice, research and SMS allowances remain independent operational safeguards. Simulated wallet top-ups do not increase those allowances. Before live wallet billing, Phase 6 must integrate real usage with versioned model/tool/audio rates, cost reconciliation, holds, failure/refund policy and payment settlement. Unknown provider dollars remain unknown. No estimated or fictional amount is relabeled as an invoice.

Ordinary navigation and deterministic task management do not consume retail credits. Background communications processing will need explicit scope and budgets in later phases.

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
