# AgentDesk communications and credits delivery plan

Owner: Tailored Agents. Approved direction: October 29, 2026.

This plan follows the owner's supplied email/business-line/pricing discussion and supersedes the individually purchased specialist model for new simulated subscriptions. The current authorization covers writing/updating the project documentation, implementing **Phase 1**, and committing/pushing the result to `TailoredAgents/AgentdeskNW`. Later phases remain planned. No live payment collection, phone-number purchase, investor message or Render deployment is part of Phase 1.

## Product outcome

An employee uses one personal Copilot to coordinate the available workforce. Connected email and business texting eventually supply the relationship context: incoming message → matched investor → sourced understanding → useful draft → employee approval → delivery receipt → reply → follow-up. Employees can use the dashboard inbox or instruct Copilot through the existing private channels.

The personal assistant conversation and external investor correspondence remain separate records with different authority. An investor's email/text is evidence, never an employee command. Sources, uncertain identity matches, permissions, reviewed CRM changes and delivery outcomes remain explicit.

## Working commercial decisions

| Component | Working direction | Status |
| --- | --- | --- |
| Retail workforce | $50/employee/month | Phase 1 simulated plan |
| Company workforce | $30/assigned paid seat/month under an explicit agreement | Phase 1 administrator-controlled simulation; no New Western agreement is assumed |
| Included credits | $15 in retail AgentDesk usage value each billing period | Phase 1 wallet demonstration |
| Purchased credits | $10, $25, $50 or $100; unused purchased balance rolls over | Phase 1 simulated top-ups, no payment collected |
| AI pricing | Initial internal 5× cost target; versioned prices | Phase 1 server-owned sample scenarios; actual provider billing integration remains later work |
| Email | Gmail/Workspace and Outlook/Microsoft 365 first; multiple mailboxes | Packaging of the first mailbox and extra-mailbox price remains open |
| Dedicated business line | Provisional $39/month plus a defined messaging allowance | Planned; no line is sold, provisioned or connected in Phase 1 |
| Business calling/recording | Separate future extension | Planned after SMS acceptance and approved recording policies |

All implemented specialists are included subject to role and company permission. All sixteen catalog entries remain visible; the four planned specialists do not execute. Specialist count is not evidence of sixteen independently trained expert agents. Employee-to-Copilot SMS remains a separate existing service until business-line packaging is implemented; buying a future line must not charge twice for included services.

700 potential users is a reported opportunity, not a paid-seat commitment. A company's base-seat payment and an employee's optional top-ups/add-ons must have separate payer records and authority. Corporate phone-number ownership, mailbox visibility and employee-departure policy must be settled before live provisioning.

## Phase 1 — Workforce subscription and credit-wallet demonstration

Status: **implemented and verified**. This phase is included in the owner-authorized repository checkpoint. Verification: 355 automated tests, 356 compiled HTTP checks, production build, type/lint checks, desktop/mobile inspection and preservation on a migrated database copy. See `PROGRESS.md` for details. Phase 2 is the next planned work; real payment collection and provider wallet debiting remain deferred.

### Deliverables

- Replace per-specialist purchase controls with one workforce offering. Preserve role, organization restriction, implementation-readiness and provider-connectivity checks.
- Add retail and administrator-assigned company-seat plans with a $15 monthly credit allowance. Employees cannot self-select the company discount.
- Migrate legacy simulated subscriptions once, audit the previous selection, preserve period/status, existing invoices and business records, and remove redundant specialist add-ons. Retain valid existing SMS selection. Company-seat removal must not silently start personal billing or reactivate higher-priced legacy company funding.
- Add a private, persisted credit wallet with included and purchased balances, monthly reset, purchased rollover, spend limit, low-balance state and readable activity.
- Add explicit simulated top-ups and server-priced sample work. Review an estimate, reserve the maximum, settle the defined sample outcome or release unused credit. Uncertain outcomes retain their hold until explicitly resolved in the simulator.
- Use integer monetary units, immutable ledger entries, stable operation IDs, optimistic versions and transactions. Repeated requests cannot duplicate grants, spending, refunds or top-ups.
- Keep current operational AI/voice/research/SMS admission limits and provider receipts intact. **The new wallet does not yet debit live provider activity.** Its sample-work prices are not provider invoices or a claim of measured 5× margin.
- Update the AI workforce and Credits & billing screens in the existing light workspace design. Show upcoming email/business-line services as planned, with no misleading purchase or connection control.
- Update current pricing, billing architecture, metering, marketplace, README, demo runbook, master plan and progress documentation. Preserve original supplied briefs as historical requirements.

### Acceptance

- Fresh and migrated employees can use implemented role-authorized specialists without buying each one; planned and forbidden capabilities remain blocked at the service boundary.
- Retail quote is $50; a valid company seat is $30 company-paid; employee cannot grant a company seat. No duplicate legacy sponsorship charges.
- $15 included grant appears exactly once per period; purchased credits survive renewal; old included credit and unresolved holds cannot manufacture new spendable credit.
- Replay, stale version, isolation, cancellation, failure, pending work, period change and spend-limit cases have meaningful tests.
- UI demonstrates estimate → confirm → hold/settle/release and simulated top-up without moving money or contacting a provider.
- Typecheck, lint, unit tests, build, isolated billing/legacy HTTP suites, desktop/mobile inspection and migration-copy preservation pass.
- Commit and push all phase changes; verify GitHub main matches the local commit. Render deployment remains separate.

## Phase 2 — Unified communications inbox with fictional adapters

Create All, Email, Texts, Needs reply and Drafts views. Store connected-account ownership, message/thread identity, participants, timestamps, source references, attachments/links, status and investor association independently of any provider. Seed realistic Gmail-like, Outlook-like and business-number conversations with explicit demo labels. Support multiple mailboxes and sender identities from the beginning. Show ambiguous investor matches for review.

Acceptance: a fictional message persists, is linked to the right permitted investor, can be read/replied to as a draft, and remains isolated from another employee's private accounts. Existing assistant SMS/Slack commands still work independently.

## Phase 3 — Copilot communication workflow and relationship intelligence

Add bounded tools to search permitted communications, summarize a thread with sources, identify relevant property information, draft in the employee's saved style, and propose follow-ups/CRM changes. Before any send, bind approval to the exact sender, recipient, body, attachments and current disclosure/media eligibility. A changed draft requires fresh review. Simulated send receipts remain clearly distinguished from actual delivery.

Acceptance: incoming email → investor/context retrieval → grounded draft → review → simulated send → fictional reply → sourced journey update → follow-up. No unsupported claim of delivery, verified investor intent or automatic CRM approval. Background analysis has a visible processing scope and budget.

## Phase 4 — Gmail and Microsoft connections

Implement OAuth consent, secure token custody/refresh/revocation, account identity, incremental sync/cursors, subscription/watch renewal, retry/deduplication, provider thread/draft/send reconciliation and disconnect controls. Begin with one provider end to end while retaining the common multi-provider interface. Obtain required provider verification and company consent. Use approved test accounts before customer mailboxes.

Acceptance: real authorized test email arrives, produces a sourced draft, and an explicitly approved reply is found in the correct provider's sent history without duplicates. Disconnect/revocation stops further access. Mailbox ownership and visibility are confirmed before company rollout.

## Phase 5 — Dedicated Twilio business lines and approved investor SMS

Add administrator-approved number provisioning/assignment, business identity and messaging registration, consent/opt-out records, per-number routing, two-way investor threads, exact-message send approval, delivery/status reconciliation, message allowances and transparent charges. Keep employee assistant ingress separate. Define reassignment, retention and portability before selling a number. Existing personal-phone copy/handoff remains available.

Acceptance: authorized test number sends and receives with trusted receipts, correct investor/employee association, valid consent, STOP handling, no duplicate send, and no cross-tenant route. No cold marketing authority is inferred from a researched phone number. Voice calling and recording are separate later work.

## Phase 6 — Real billing and controlled company rollout

Connect live provider usage to versioned cost/rate calculations and wallet admission/settlement. Handle cached/input/output/audio/tool fees separately, retain unknown-cost states, reconcile invoices, set retry/refund rules and measure complete task cost. Validate allowances and the 5× target using observed usage; do not multiply expensive third-party data blindly. Ordinary navigation and deterministic internal actions remain free of AI wallet debits.

Implement authorized payment checkout, server-bound customer/payer identities, verified payment webhooks, refunds, top-up settlement and purchased-credit terms. Introduce managed identity, PostgreSQL, durable distributed workers, backup/recovery, monitoring and support before broad deployment. Establish company seat commitments, sponsorship, employee spending controls, departure policies and communication-data ownership.

Acceptance: a small approved pilot proves payments/usage reconcile, retries are safe, budget limits work, account departure is handled, and support can diagnose failures. Expand seat counts based on observed reliability and adoption rather than the opportunity estimate.

## Demonstration sequence

Phase 1: show all available workforce capabilities → compare retail/company payer presentation → inspect $15 included balance → review a sample-work estimate → simulate completion/cancellation → add simulated purchased credit → show history and spend limit.

After Phases 2–3: show one investor relationship across email and text with improved recommendations and employee-approved action. The same scenario must clearly identify fictional sources and simulated delivery until Phases 4–5 receive live acceptance.

## Open commercial choices

- Who pays for initial New Western seats, committed volume and contract terms.
- Whether one mailbox is included; extra mailbox pricing and background-analysis budget.
- Business-line included SMS allowance, overage rate, owner and departure policy.
- Purchased-credit terms, expiration/refund policy and company-funded versus personal top-ups.
- Measured economics and allowed automation before committing to a final usage price.

These choices do not block the Phase 1 demonstration. No unavailable integration is presented as connected, and no simulated purchase establishes a real financial commitment.
