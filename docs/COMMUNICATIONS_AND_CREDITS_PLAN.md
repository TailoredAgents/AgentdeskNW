# AgentDesk communications and credits delivery plan

Owner: Tailored Agents. Approved direction: October 29, 2026; company-email priority updated October 30, 2026.

This plan follows the owner's supplied email/business-line/pricing discussion and supersedes the individually purchased specialist model for new simulated subscriptions. Phase 1 is implemented and pushed as `414fb0d`; Phase 2 is pushed as `e9d21b2`. Phase 3, Copilot’s inbox workflow, is implemented and pushed as `77e69b7` to `TailoredAgents/AgentdeskNW`. Phase 4 is now prioritized around New Western’s company-email workflow inside Salesforce, based on the owner’s October 30 report from Alex; Phase 4A is now implemented; live company access in Phase 4B and Phases 5–6 remain planned. No live payment collection, phone-number purchase, investor message or Render deployment is part of this work.

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
| Email | Company email through Salesforce first; optional Gmail/Workspace and Outlook/Microsoft 365 adapters | Underlying company mail service and permitted Salesforce capabilities require administrator discovery; packaging remains open |
| Dedicated business line | Provisional $39/month plus a defined messaging allowance | Planned; no line is sold, provisioned or connected in Phase 1 |
| Business calling/recording | Separate future extension | Planned after SMS acceptance and approved recording policies |

All implemented specialists are included subject to role and company permission. All sixteen catalog entries remain visible; the four planned specialists do not execute. Specialist count is not evidence of sixteen independently trained expert agents. Employee-to-Copilot SMS remains a separate existing service until business-line packaging is implemented; buying a future line must not charge twice for included services.

700 potential users is a reported opportunity, not a paid-seat commitment. A company's base-seat payment and an employee's optional top-ups/add-ons must have separate payer records and authority. Corporate phone-number ownership, mailbox visibility and employee-departure policy must be settled before live provisioning.

## Phase 1 — Workforce subscription and credit-wallet demonstration

Status: **implemented and verified**. This phase is included in the owner-authorized repository checkpoint. Verification: 355 automated tests, 356 compiled HTTP checks, production build, type/lint checks, desktop/mobile inspection and preservation on a migrated database copy. See `PROGRESS.md` for details. Phase 2 is now implemented; real payment collection and provider wallet debiting remain deferred.

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

Status: **implemented and verified**. Verification passed: 379 automated tests across 19 files, 475 compiled HTTP checks (119 new inbox checks), production build, type/lint checks, desktop/phone inspection and migration-copy preservation. Detailed design and acceptance are in [COMMUNICATIONS_INBOX.md](COMMUNICATIONS_INBOX.md). This phase includes manually saved reply drafts and explicit inbox status; AI drafting, mailbox search through Copilot and simulated sending are Phase 3.

Create All, Email, Texts, Needs reply and Drafts views. Store connected-account ownership, message/thread identity, participants, timestamps, source references, attachments/links, status and investor association independently of any provider. Seed realistic Gmail-like, Outlook-like and business-number conversations with explicit demo labels. Support multiple mailboxes and sender identities from the beginning. Show ambiguous investor matches for review.

Acceptance: a fictional message persists, is linked to the right permitted investor, can be read/replied to as a draft, and remains isolated from another employee's private accounts. Existing assistant SMS/Slack commands still work independently.

## Phase 3 — Copilot communication workflow and relationship intelligence

Status: **implemented and verified**. Verification passed 413 automated tests, 535 compiled HTTP checks, production build, type/lint checks, desktop/phone inspection and migration-copy preservation. See [COMMUNICATIONS_WORKFLOW.md](COMMUNICATIONS_WORKFLOW.md) and PROGRESS.md. Includes bounded private inbox search/read tools, a sourced relationship reply that respects saved employee preferences, an exact saved-draft review and simulated receipt, and separately reviewed source-linked observations and personal follow-ups. Dashboard, typed Copilot and linked employee channels use the same services. The selected conversation is the explicit processing scope; there is no background mailbox sweep or new wallet charge. Property distribution continues through the existing disclosure-gated package workflow. Inbox attachments remain unavailable metadata and are never included in a simulated reply.

Add bounded tools to search permitted communications, summarize a thread with sources, identify relevant property information, draft in the employee's saved style, and propose follow-ups/CRM changes. Before any send, bind approval to the exact sender, recipient, body, attachments and current disclosure/media eligibility. A changed draft requires fresh review. Simulated send receipts remain clearly distinguished from actual delivery.

Acceptance: incoming email → investor/context retrieval → grounded draft → review → simulated send → fictional reply → sourced journey update → follow-up. No unsupported claim of delivery, verified investor intent or automatic CRM approval. Background analysis has a visible processing scope and budget.

## Phase 4 — Company email through Salesforce first

**Priority update, October 30:** Alex reportedly uses the company-provided email workflow only inside Salesforce. AgentDesk should support that existing workflow without making a separate personal Gmail/Outlook connection the default. This identifies the employee experience, not the underlying mail host or permitted APIs. Gmail/Workspace and Outlook/Microsoft 365 remain optional adapters and may also be necessary as the company-authorized transport behind Salesforce. No New Western administrator access or live configuration is assumed.

### Phase 4A — Company-workflow demonstration and discovery

Status: **implemented and verified**. The owner requested this phase on October 30, including testing, documentation and commit/push. Verification passed 438 automated tests, 606 compiled HTTP checks, type/lint/build checks, desktop/phone acceptance and disposable migration-copy preservation. See [COMPANY_EMAIL_DEMO.md](COMPANY_EMAIL_DEMO.md) and PROGRESS.md. This is fictional company-email workflow work only; live Salesforce, account authorization, external messages and Render deployment remain separate.

- Add a clearly fictional **Company email · Salesforce workflow** source to the demonstration and make it the primary presentation path. Preserve existing Gmail/Outlook fixtures and saved correspondence; do not relabel existing data as Salesforce-connected.
- Separate correspondence source from delivery transport and expose explicit capabilities: CRM activity/header lookup, full-body retrieval, thread history, attachments, draft handling, reviewed send and receipt reconciliation. Missing capabilities remain unavailable rather than being inferred from a Salesforce connection.
- Associate fictional company-email records with existing investor journeys, tasks and review workflows. Model Salesforce activity-only, header-only, revoked-access and duplicate-source examples. The shared inbox and Copilot services remain reusable.
- Prepare a concise administrator discovery checklist: where messages are recorded, which bodies/attachments/history are accessible, the permitted sender identity and sending method, employee/manager visibility and approved sandbox access. Details are in SALESFORCE_INTEGRATION.md.

Acceptance: the company-email demonstration presents incoming investor correspondence → sourced context → reviewed relationship reply → simulated receipt → reviewed follow-up, without separate personal mailbox setup or a claim of live Salesforce access. Existing demo records and private mailbox isolation remain intact.

### Phase 4B — Approved company connection

After company approval, implement the confirmed Salesforce activity reader and the approved sending/receiving route. A CRM activity reader alone is not a full inbox connector and does not authorize outbound email. Retain explicit sender identity, company access boundaries, provider/source IDs, deduplication and reconciliation when the same email appears in both Salesforce and an approved mailbox.

Implement delegated consent, server token custody/refresh/revocation, organization/user identity binding, incremental synchronization, retry/limit handling and disconnect controls for the actual selected adapter. Use administrator-approved fictional sandbox/test records before any customer mail. Reviewed outgoing actions retain exact-content approval and the existing property disclosure/media gates; a synced activity or provider acceptance is not proof of delivery to the recipient.

Acceptance: an authorized test message is retrieved through the confirmed company workflow, a reviewed reply uses the approved company sender/route, and provider evidence plus CRM association reconcile without duplicate sends or activity records. Missing body/attachment access is explicit. Revocation stops dependent work. Expand to optional Gmail/Outlook connections afterward or use them as approved company infrastructure when required.

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
