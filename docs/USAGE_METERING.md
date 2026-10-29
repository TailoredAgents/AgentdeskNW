# Usage metering — Phase 3

The billing ledger is separate from the existing operational `usage_events` table. A billing receipt has organization/user columns plus feature, action/job ID, timestamp, quantity/unit, period/allowance association, provider cost (nullable), source, reservation status and simulated billing status. Unknown provider expense stays `null`, never a fabricated dollar amount.

## Included provisional allowances

| Category | Initial allowance | Execution behavior |
|---|---|---|
| Text inference | Core: 100,000 tokens/month, explicit planning assumption | Reserve a conservative request budget; settle returned token usage; release failed request reservations |
| Voice | Core: 60 minutes/month | Reserve at most 10 remaining minutes per session; settle server elapsed-time estimate on end |
| Research credits | Hunter: 1 credit/month | Each credit targets up to 25 candidates; reserve before queueing; settle after successful completion |
| SMS | Optional $19 add-on: 500 segments/month | Combined incoming/outgoing ledger; proposed $0.04 overage, only with explicit overage permission |
| Research jobs | Uncapped accounting counter | Record one successful synthetic job receipt |
| External searches / provider requests / other | Foundation counters | Not emitted as fictional external provider expenses |

Research targeting 100 candidates needs four credits even though the current synthetic provider contains only 12 candidates. Targets are never guarantees of verified investors or phone numbers. The demo admin can grant extra credits; no invented price is charged for those grants.

## Idempotency and lifecycle

Reservations and consumption use `(organization, employee, category, operationId)` uniqueness and immediate SQLite transactions. Repeated successful receipts do not consume twice; conflicting payloads are rejected. Research stages reuse the job's reservation. Cancellation/failure releases reserved credits; retry re-reserves, and completion settles once. A worker rechecks entitlement and role on every stage, so removal or trial expiry blocks queued work without deleting it. Consumed work is not silently refunded by a later cancellation.

Allowances combine active plan/add-on, sponsored and trial grants using the maximum configured amount per category, avoiding duplicated bundle allowance. Explicit admin credits add to that amount. Both reserved and consumed quantities reduce availability. Credit grants are idempotent and tied to a period. Renewal resets current-period balances while historical receipts remain. Operations spanning renewal settle against their original reservation period.

SMS failed/canceled simulations release their reservation. The ledger estimates overage only from the disclosed segment price; it does not claim an actual Twilio bill. Organization legacy `smsAddonEnabled` settings no longer activate an employee: employee entitlement and allowance are required, and actual delivery always reports that the provider is disconnected.

## Honest limits of the foundation

No live provider was activated or exercised. Voice measures elapsed connection time, not a provider-confirmed receipt. Abandoned sessions are reconciled when the same employee next starts voice; a future provider event/scheduled reconciliation must make this production authoritative and revoke active external sessions. Realtime client credentials do not constitute a production hard billing cap. Text settlement needs returned provider usage; missing usage currently records zero, with provider cost unknown. A production adapter must reconcile missing/late receipts and known costs before financial billing.

No failed/canceled external expense is charged in this phase. Any future policy permitting incurred provider expense must be explicit, recorded and disclosed before implementing that behavior. The admin simulation screen supports success/failure/cancellation, allowance grants and disclosed SMS overage, without contacting a provider.
