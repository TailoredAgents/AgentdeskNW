# Workforce pricing and packages

This is a provisional commercial demonstration. No payment is collected, no card is stored, and no New Western agreement is assumed. The current direction supersedes individual specialist purchases. The complete delivery plan is [COMMUNICATIONS_AND_CREDITS_PLAN](COMMUNICATIONS_AND_CREDITS_PLAN.md).

## Current simulated catalog

| Offering | Monthly price | Payer and access |
| --- | ---: | --- |
| AgentDesk Workforce | $50 | Employee, unless the company sponsors the retail seat; all available role-authorized specialists |
| AgentDesk Company Seat | $30 | Company; explicitly assigned by a billing administrator under a named demonstration agreement |
| Included AgentDesk Credits | $15 retail value | Once per billing period on either workforce plan |
| Employee Copilot SMS access | $19 | Existing optional employee-to-assistant channel; provider setup and usage allowances remain separate |
| Purchased AgentDesk Credits | $10 / $25 / $50 / $100 | Simulated employee top-up; unused purchased balance rolls over |

The workforce includes all sixteen catalog capabilities, with role/company restrictions and actual implementation readiness enforced separately. Twelve have limited local/demo capabilities; four remain planned. There is no individual specialist purchase needed to coordinate authorized implemented work.

The fictional email/investor-text Inbox preview is available without buying or connecting an account. Live email connectors and the dedicated investor-facing Business Line remain **planned**, not purchasable connections in this phase. A $39 business-line price is provisional; allowance, registration, account ownership and actual delivery economics require later acceptance. Whether the first mailbox is included and what extra mailboxes cost remain open choices. Future business-line packaging should remove overlapping employee SMS fees where included.

## Company seats and payer separation

An employee cannot select the $30 rate or assert a company agreement. Only an explicitly assigned billing administrator can assign/remove a company seat, with target subscription version and an idempotent event key. Assignment activates the simulated corporate subscription; payment failure/cancellation still blocks execution. A company seat does not permit another role's records or unfinished specialists.

Removing a company seat leaves a canceled retail selection. The employee must explicitly resume it before a personal subscription starts. An explicit company-seat removal also overrides legacy base sponsorship for that employee, so it cannot restart a higher-priced company seat. Independent legacy sponsorship can still fund retail seats that have never received an explicit company assignment; it does not create the $30 discount. SMS sponsorship remains independent. The modern quote counts the base once; included legacy specialist sponsorship does not add individual specialist fees. Employee-selected SMS remains a separate personal line unless sponsored.

Examples with no other sponsorship:

- Retail workforce: $50 personal, $0 company.
- Assigned company workforce: $0 personal, $30 company.
- Assigned company workforce plus personal Copilot SMS: $19 personal, $30 company.
- All included specialists selected again: no duplicate charge.

## Credit demonstration

One dollar of AgentDesk Credits represents one dollar of retail usage value, not one dollar of provider cost. The wallet separates included and purchased funds, holds, settled sample spending, spend limits and history. Included credit resets each subscription period; purchased credit rolls over. An estimate must be reviewed before sample spending. The default monthly sample-spending cap is $25 and can be adjusted deliberately.

The demonstration uses server-owned fictional cost scenarios with a versioned 5× multiplier. These are examples for testing the experience, not measured provider costs or proven margins. It does not debit real AI, research, voice or SMS activity yet. Existing operational allowances/receipts remain separate until real usage settlement is integrated in Phase 6. Ordinary navigation and deterministic task controls do not debit the wallet.

## Versions and historical migration

Prices and allowances remain versioned catalog records; subscriptions store snapshots. Existing simulated legacy subscriptions migrate once to the workforce offering while retaining ID, status, calendar period, history and valid SMS selection. Original subscription snapshots are preserved in `billing_subscription_migrations`, and old invoice rows retain their original amounts. Specialist add-ons are absorbed into the workforce. Retired plan/component records remain for history and historical quote compatibility; new subscriptions cannot select them.

The old $49 Core / $147 Core + Hunter + Marketing examples are historical Phase 3 scenarios, documented in `PHASE_3_REPORT.md`. They are no longer the current offer. This migration moves no money and performs no live payment-provider change.
