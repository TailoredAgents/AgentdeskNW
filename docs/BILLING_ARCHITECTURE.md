# Billing architecture — workforce and credits

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for completion status and development order. This specification preserves billing contracts; historical phase labels are not a competing implementation sequence.

## Committed whole-job simulation

Migrations 020/021 add durable work and scoped `work_budgets`/immutable `work_budget_events`. The budget binds a run, plan version/hash, quote ID, fictional rate version, expiry, estimated/maximum cents, approved maximum, consumed/held cents and the backing wallet operation. `work-budget.ts` owns quote, explicit employee decision, reservation, step consumption, release and unresolved-state handling. The coordinator calls it alongside validated capability execution; no HTTP/model endpoint accepts arbitrary prices or grants cost approval to the model.

Exactly $1 or less is automatically within this cost threshold, subject to permissions, available credits and the monthly limit. A larger complete-job maximum waits for a dashboard decision in the committed foundation. Revisions include already-consumed work and remaining steps; a changed scope cannot reuse the old quote. Quote/decision and step event keys reject conflicting replay. Quotes expire before new admission, while already-held work can continue within its unchanged authority. Cost authority remains separate from subscription access and action permissions.

C1/C2 source adds exact conversational reviews/decisions and native controls around those same services. Local integrated acceptance passed with fictional costs; actual phone/channel/provider usage remains a separate gate. Migration 022's immutable reviews and command receipts do not grant approval authority to a model or replace the existing job budget. Native device pairing does not create a new payer, wallet or production employee identity.

Internal wallet helpers reserve the job's maximum using the existing included/purchased buckets, settle each completed local step, and release only unused funds. The operation has `scenarioId: copilot-work` and `workRunId`; remaining reserved cents, rather than the original maximum, count toward active holds after partial consumption. Synchronous business mutation, cost settlement and immutable work receipt share the coordinator's outer SQLite transaction. Multiple jobs and standalone wallet samples compete for the same available funds and monthly cap. Unknown outcomes keep their reservation; they are not automatically retried or refunded.

The original sample `/api/wallet/simulate` and `/resolve` cannot execute or release a job-owned operation. Credits & billing shows its remaining hold and directs the employee to Work queue. Historical reads and unused release still require current membership/ownership but do not grant new paid execution after subscription expiry. Old-period included holds cannot be recreated in a later period.

The new worker performs bounded local services and synthetic research only. Its quotes and charges are fictional demonstrations. Existing live text—including a model turn that plans a job—voice, external research and messaging keep their separate provider receipts/allowances; **real provider spending is not yet governed by this new $1 gate**. See [WORK_EXECUTION.md](WORK_EXECUTION.md).

## Planned automatic purchases and real usage

Auto top-up requires its own explicit payer settings and idempotent purchase lifecycle. Deduplicate pending purchases, include them in the monthly automatic-purchase cap, credit only verified successful settlement, and preserve company/personal payer separation. A model cannot enable it, choose a payer or authorize a more expensive job. Auto-top-up settings, purchase simulation and live settlement remain planned in C6 with separate acceptance gates. Detailed rules and boundary cases are in [USAGE_METERING.md](USAGE_METERING.md). The committed fictional-work foundation activates no automatic purchase or real provider billing.

C6 separates provider usage admission/reconciliation from payment collection. Actual usage integration can be tested with fictional data and an authorized bounded provider budget; its shadow credit ledger does not collect customer payments. Verified purchases depend on accepted simulated purchase controls and explicit payer/commercial setup. Company-funded or personal real charges do not begin merely because usage receipts are recorded. The roadmap controls when this work proceeds.

## Current workforce extension

Migrations 014/015 extend the existing simulator. `billing_enterprise_seats` stores explicit administrator assignments and agreement labels. `billing_subscription_migrations` preserves original and migrated subscription snapshots. `wallet_accounts`, `wallet_quotes`, `wallet_operations`, `wallet_ledger` and `wallet_events` hold scoped balances, reviewed estimates, operations and immutable ledger/idempotency records. One wallet binds organization and employee across their authorized office memberships, consistent with subscription ownership. Ledger actions retain office provenance; each operation validates current membership and owner scope. Corporate base-seat assignment also binds organization and employee.

`workforce` is the $50 retail plan; `workforce-enterprise` is the $30 administrator-assigned company plan. Both carry a `wallet_cents:1500` monthly allowance and all sixteen specialist feature IDs. `featureAccess` still separately resolves role, organization restrictions, active foundation and implementation. Company assignment cannot override any of those checks. Only employee Copilot SMS remains a selectable current add-on. Retired plan/component records stay readable for historical quotes but cannot be newly selected.

Native app and desktop access are included in the workforce plan; the optional employee Copilot SMS add-on is provisionally $19/month. Slack has no additional channel-access fee and is retained as optional because New Western does not currently use it. The app is the intended primary daily interface, but local source acceptance is not an app-store release. All interfaces reuse the same entitlements and usage authority; included access does not mean unlimited AI or voice use. Actual employee SMS/Slack provider acceptance remains pending.

Legacy subscription migration is lazy and transaction-bound when the scoped subscription is loaded. It preserves ID, period, status, cancellation scheduling and old invoices, stores before/after snapshots, and removes redundant specialist selections. Reopening the app does not repeat the migration. Company-seat removal selects retail in canceled state so it cannot silently begin employee billing. Explicit company assignments override legacy base-sponsorship policies, including after removal. A removed company seat cannot silently fall back to a higher-priced company plan. Independent SMS sponsorship remains separate. Billing administrators can recover company payments when personal purchases are disabled.

`POST /api/billing/enterprise-seat` requires the existing billing-admin role plus an explicit assignment, target subscription version and event key. Company-funded base and optional personal SMS totals remain distinct. No provider funds move.

The wallet HTTP service uses `/api/wallet` for private state; `/topup`, `/settings`, `/estimate`, `/simulate` and `/resolve` for explicitly labeled demonstration actions. All requests use the same authentication/origin/body validation as the app. Estimate and operation records are scoped, expire when appropriate, and carry server-owned price snapshots. The client cannot supply a provider cost or grant itself a different price. No model tool can buy credits or manipulate the wallet.

Monthly included credit and purchased credit are separate buckets. Reservations retain their original funding sources across period boundaries. The ledger is append-only; events prevent duplicate top-ups, grants and settlements. Unknown outcomes retain holds. Spending limits cover settled sample work and active holds. See [USAGE_METERING.md](USAGE_METERING.md) for the deliberate boundary between this demonstration and real provider usage billing.

The original Phase 3 foundation below describes reusable historical infrastructure; individual specialist shopping has been superseded by the current workforce offer.

## Boundary and persistence

The existing Next.js API, authenticated local-demo session, request-origin checks, CSRF header, rate limiting, SQLite ownership rules and durable worker remain in place. Migration **005** adds tables without deleting or rewriting Phase 1/2 records:

| Table | Purpose |
|---|---|
| `billing_catalog` | Versioned plans, component features, prices and allowance configuration |
| `billing_customers` | Organization/employee customer with provider identifier and nullable provider reference |
| `billing_subscriptions` | Employee selection, item/price snapshots, status, optimistic version, calendar period and pending change |
| `billing_policies` | Organization-sponsored, required and restricted capabilities by role; purchase/trial eligibility |
| `billing_admins` | Explicit billing-admin assignments, separate from manager role |
| `billing_trials` | Scoped temporary features, timestamps and allowances |
| `billing_events` | Idempotent lifecycle events with payload hashes and saved results |
| `billing_invoices` | Simulated period amounts/status; unique per employee and period |
| `billing_usage` | Scoped operation receipts and reservation/consumption/release states |
| `billing_credit_grants` | Idempotent employee/period allowance grants |

Customers, subscriptions, policies, trials, usage and financial events remain organization scoped; employee bills are private. Authorized billing admins can view organization seat totals across offices. Existing CRM, conversation and release access rules still apply. Catalog prices are global configuration; their modification is restricted to the seeded platform demo admin. Taylor Reed is explicitly seeded as local billing admin; no other manager automatically acquires that power.

Plan contents and subscription items are normalized in validated JSON snapshots within the existing SQLite style. There is no additional payment service or dependency. `data/phase2-checkpoint.sqlite` was backed up before migration. It is ignored, as are the active database and secrets.

## Entitlement decisions

`featureAccess` resolves organization sponsorship/required policy, active plan/bundle, individual add-on and temporary trial. The final decision separately checks role, restrictions, Core access and implementation status. `requireFeature` is used by service entry points called by the HTTP API, model tools and voice tools. Worker stages independently check the current job owner's access, then reserve/settle usage.

Premium execution boundaries: Hunter research creation/retry/stages; Buyer Matchmaker public matching and automated match enrichment; Relationship pre-call briefing; Deal Marketing compose/update/approve/handoff/template changes; Acquisition-to-Disposition release writes; Team Performance reporting; Qualification review and Transaction context tools. The four planned specialists cannot execute.

Shared computations remain useful inside an already authorized feature. Package personalization and a Relationship briefing can compare property criteria without requiring a second Buyer Matchmaker purchase. Core still provides transcript extraction, reviewed CRM/buy-box proposals, tasks, ordinary workflow guidance, record access and history. It does not falsely report premium or planned employees as having executed these Core tools.

Removing a specialist never deletes historical research, conversations, approvals, releases or packages. Reading history continues to apply the Phase 2 fresh-reference/access checks. New premium execution is rejected. Marketplace artifacts are explicitly excluded from investor-record reference inference so an ID such as `investor-hunter` is never mistaken for a CRM investor ID.

## Simulator

`GET /api/billing` returns private state. `/quote` calculates without mutation. `/subscription` accepts an expected version and an idempotency event key, for immediate or next-period changes. `/lifecycle` simulates cancellation, scheduled cancellation and resumption; admin-only payment failure/recovery and renewal may target an organization employee. A failed payment cannot be bypassed by self-resuming or changing plans. Required/sponsored Core can continue independently of a canceled personal subscription.

Calendar renewals create simulated invoices and audit/lifecycle events; pending changes apply at the boundary. Scheduled cancellations end access without a new period invoice. Admin advancement uses the prior period end, so quota reset is deterministic. Immediate changes update the monthly rate without calculating proration; existing invoices remain period-start snapshots. No funds move.

Trials default to 14 days. The admin can grant 1–90 days of selected features with configured allowances. A new grant replaces the prior trial; expiration removes trial-only access and never converts to a paid add-on. Trial, restriction and sponsorship changes are audited.

The committed browser mutation routes require a signed demonstration session and the existing request protection. Billing admin calls also require explicit `billing_admins` membership. Simulation fails closed unless an explicit local or hosted fictional-demo mode is enabled. The hosted presentation uses its configured HTTPS origin, invitation gate and signed sessions; it is not company identity. Native bearer transport retains these service-level entitlement, actor and payer checks. No presentation persona or paired device becomes a real company employee through billing simulation.

## Provider-independent path

`BillingProvider` specifies a provider ID, configuration state and idempotent payment request shape. `LocalBillingProvider` describes simulated outcomes. `StripeBillingProvider` is a deliberately disconnected adapter that throws; no credentials, checkout session, card form, webhook ingress or real payment collection exists.

Production work must implement authorized checkout/customer binding, raw-body signature verification before webhook processing, tenant binding from server-owned provider references, replay-safe external event IDs, out-of-order handling and reconciliation. Provider events must call the same domain transitions; a client assertion must never activate a paid plan. Proration, taxes, refunds, collections, fraud handling and finalized commercial policies remain future work. The current simulator is not a production payment processor.
