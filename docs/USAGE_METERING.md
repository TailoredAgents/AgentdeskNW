# Usage metering — Phase 4

The local subscription simulator and real provider evidence are separate ledgers. Proposed subscription rates are not actual charges. No customer payment is collected. Unknown provider expense remains `null`.

## Allowances and admission

| Category | Provisional allowance | Current behavior |
|---|---|---|
| Text | Core: 100,000 tokens/month | Reserve serialized request bytes (including tools) plus maximum output tokens. Settle provider-reported input/output tokens, including above-estimate usage. Known rejection releases the hold; timeout/missing/invalid receipt retains it. |
| Voice | Core: 60 minutes/month | Hold at most 10 remaining minutes per session. Realtime reports token/audio usage, not authoritative session minutes; connected-session holds remain unresolved. Never settle guessed elapsed minutes. |
| Hunter | 1 credit/month; target 25 candidates/credit | Reserve before queueing, consume once on successful bounded completion, release unused credits on failure/cancel. Retain incurred provider receipts independently. A target is not a promised count. |
| External search | Accounting counter | Record actual provider search-call counts, even above an admission estimate. Unknown outcomes retain unresolved holds and stop further work. |
| Provider requests | Accounting counter | Record durable dispatch once. A failed or canceled job may still have incurred expense. |
| SMS | 500 segments/month in optional add-on | Simulation only; no Twilio calls. Configured provisional overage is not a provider bill. |

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

Settings → Provider verification and authenticated `/api/providers` show the latest 100 employee-scoped operations, usage totals, unresolved operations, cost coverage and source boundaries. Usage & billing shows current-period consumed/reserved allowance. Provider receipts are a bounded operational view, not a complete monthly cost/profit report. Pricing decisions need full-period aggregation, provider invoice reconciliation, real task success rates and cost per qualified lead.

The proposed $49 Core and $79 Hunter prices have not been validated against actual provider costs. No live provider was exercised during this credential-free implementation run. All payment, SMS and subscription lifecycle events remain simulations.

## Employee SMS receipts (October 29)

Employee Copilot SMS now reserves a conservative Unicode segment count before dispatch and reconciles the trusted Twilio receipt to actual usage. Signed inbound receipts also record actual segments; they can reflect already-incurred usage after entitlement expiry. Queued/provider-zero estimates do not settle a reservation. Definitive request rejection releases it; ambiguous delivery retains it until a trusted receipt resolves it. Duplicate receipts cannot double-charge; inconsistent settled quantities fail for review. Provider monetary cost remains null rather than estimated as an invoice. The commercial ledger remains a demonstration and never collects payment. See MESSAGING_SETUP.md.
