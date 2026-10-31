# Unified communications inbox — Phase 2 foundation

Foundation status: **implemented and verified at `e9d21b2`**. This document preserves the Phase 2 acceptance boundary. The current Phase 3 additions—Copilot retrieval, grounded replies, reviewed simulated sending and source-linked actions—are specified in [COMMUNICATIONS_WORKFLOW.md](COMMUNICATIONS_WORKFLOW.md). 379 automated tests across 19 files and 475 compiled HTTP checks passed, including 119 inbox checks. Desktop/phone verification and migration-copy preservation also passed. This is the second phase of [COMMUNICATIONS_AND_CREDITS_PLAN.md](COMMUNICATIONS_AND_CREDITS_PLAN.md), following workforce/wallet commit `414fb0d`. Detailed evidence is recorded in [PROGRESS.md](PROGRESS.md).

## Current extension — communications Phase 4A

The foundation below remains the Phase 2 checkpoint. The implemented [company-email demonstration](COMPANY_EMAIL_DEMO.md) now makes fictional Company email · Salesforce the primary Inbox entry, while preserving the original optional Gmail/Outlook/text records. It adds visible source capabilities, activity/header-only examples, scoped duplicate-source provenance and access revocation/restoration. The reviewed workflow remains in [COMMUNICATIONS_WORKFLOW.md](COMMUNICATIONS_WORKFLOW.md); current verification is in [PROGRESS.md](PROGRESS.md). No live company connector or investor delivery is enabled.

## User outcome

An employee can open Inbox, see fictional Gmail, Outlook and investor-text conversations together, inspect the appropriate investor's existing relationship context, and save a reply draft under the correct sender identity. The same inbox supports multiple mailboxes, account/search filters, All/Email/Texts/Needs reply/Drafts views and explicit read/handling status. The phone layout opens a thread from the list and returns to the same inbox.

This inbox contains external-correspondence demonstrations. It is separate from the employee's private Copilot conversation across the dashboard, Slack and employee SMS. An investor message is source material, never an instruction to the assistant or authority to change an investor record.

## Scope and honest boundaries

- All accounts, addresses, phone numbers, messages and arrival events are fictional and visibly labeled. Provider names describe the demonstration adapters, not live connections.
- A reply is employee-written, saved locally, and marked not sent. There is no send endpoint, provider draft synchronization, OAuth consent, number purchase, real SMS receipt or AI draft-generation control in this phase.
- Attachment metadata illustrates a future provider attachment without creating a downloadable file or upload control. Message content is plain text; it cannot execute HTML or alter application instructions.
- The context pane reads existing authorized investor information and its provenance. Linking a thread does not add a CRM fact, confirm a phone number, resolve an objection or write a relationship observation.
- Inbox work is deterministic and does not call an AI provider or debit the credit wallet. Existing personal assistant messaging remains independent.
- Saved correspondence remains readable after a subscription ends. Creating/editing drafts, changing status, linking and receiving demo events require current Core access.

## Implementation boundaries

| Module | Responsibility |
| --- | --- |
| `communications-contracts.ts` | Browser/server account, thread, message, draft, association and scenario contracts |
| `communications.ts` and demo fixture module | Scoped persistence, filtering, linking, current investor context, versions and replay-safe mutations |
| `communications-api.ts` | Validated `/api/inbox` routes behind the shared authentication, request-origin, size and rate checks |
| Migration 016 | Additive correspondence storage, separate from assistant messages and employee channel inbox/outbox |
| `InboxPanel.tsx` / `inbox.css` | Responsive inbox, source/context review, explicit draft save/discard and unsaved-edit protection |

Accounts, threads, messages, drafts and action receipts belong to the authenticated organization, office and employee. A manager's authority over office CRM records does not grant access to another employee's mailbox. IDs from the browser never grant ownership. Investor access is rechecked when linked details or context are returned, including action replay. Lost CRM access suppresses protected investor identity/context while preserving the owner's original correspondence.

Contact matches use authorized records. Ambiguous suggestions require the employee to choose; matching a name alone never silently links a person. Manual linking stores an employee-reviewed association, not verified identity. Unlinking changes only correspondence metadata.

## Persistence and conflict behavior

Fictional accounts and initial conversations are created once for a permitted demo workspace. Reopening the inbox cannot replace edits, recreate discarded drafts or reset status. Scenario arrivals use server-owned message fixtures and stable event keys. Their persisted message/source identifiers prevent a retried arrival from duplicating a message.

Mutations bind the payload to a scoped event key and expected thread version in a transaction. Identical retries return fresh currently permitted state; conflicting key reuse or stale edits fail. Reply sender, account and recipient come from the persisted thread, never a submitted identity. Saved drafts keep a visible revision/history and not-sent status; discard remains distinguishable from delivery.

Unsaved edits trigger a choice before switching threads or leaving Inbox. A version conflict must not silently overwrite another revision or clear the employee's current text. The employee reviews the current saved draft before deliberately saving a new version.

## Demonstration sequence

1. Open Inbox as Alex. Show the separate Gmail, Outlook and business-text demo accounts and channel filters.
2. Open Mike's repair-cost question. Read the original message, its sender/account and source label. Review Mike's existing criteria, commitments and unresolved concerns with their recorded provenance.
3. Write a concise reply that acknowledges the missing repair detail without inventing a repair estimate or promising a completed action. Save the draft and confirm it is not sent.
4. Switch to Drafts and reopen it. Navigate away/return or refresh after saving to verify persistence.
5. Use the fictional-arrival control to add a sample follow-up. Verify that it becomes unread/needs reply and retains the saved reply draft for employee review.
6. Review an uncertain investor association, choose a permitted record or leave it unlinked, and show that it does not change CRM facts.
7. Mark a thread Waiting/Handled and inspect Needs reply. Explain that these are employee-selected inbox states, not delivery confirmations or automated reminders.

## Acceptance before commit/push

- Correct filters/search, multiple accounts, stable seeded data and replay-safe arrivals.
- Scope tests reject another employee, office, organization, forged role and private investor link; manager authority never widens mailbox access.
- Draft save/edit/discard survives restart and enforces versions, idempotency and server-bound identity. No request can create a send or a provider receipt.
- Revoked investor access removes protected context on reads and replay. New work cannot bypass subscription/policy restrictions.
- Existing assistant/channel history and credit balances remain unaffected.
- Typecheck, lint, automated tests, production build, isolated inbox/existing HTTP suites, desktop/phone browser checks and migration-copy preservation.
- Updated plan, specifications, demo instructions and progress evidence; commit/push with a clean worktree and verified remote revision.

## Phase 3 extension

The implemented Phase 3 extension adds bounded Copilot tools to retrieve permitted inbox content, create grounded drafts in the employee's style, suggest follow-ups and review exact simulated sending. Phase 4A extends those services with fictional company-email source capabilities; see [COMPANY_EMAIL_DEMO.md](COMPANY_EMAIL_DEMO.md). Live company access is Phase 4B after administrator discovery; optional live Gmail/Microsoft adapters and Twilio investor texting remain separately gated later work.


### Transaction preparation correspondence

Transactions can save current title preparation to an owned email source, then open the same draft in desktop/native Inbox. This trusted path binds the thread to the private transaction and the draft to its current preparation reference. Repeating the preparation reopens the same result without replacing edits or recreating a sent/discarded draft. Changed sources withhold obsolete unsent content and invalidate reviews, while historical simulated messages retain their original text with current source access. List/search/detail/actions and saved Copilot references recheck that access. Public composition cannot forge transaction metadata. Existing exact simulation review remains required; no message or file reaches a provider, and no transaction outcome is inferred. See [DOCUMENT_WORK](DOCUMENT_WORK.md) for the domain contract and [PROGRESS](PROGRESS.md) for acceptance evidence.

Copilot and durable jobs can now invoke this same title-draft preparation under a bound employee request, exact transaction and owned account. They reuse the current draft and preserve edits; they cannot approve or send. Current transaction references also protect saved job results and model context.


## Routine personal follow-ups

Desktop and native conversation details now offer an exact reviewed permission for future incoming replies to create personal follow-up tasks. The default is at most ten tasks over seven days, no more than one per six hours, due 24 hours after creation. The grant binds current employee/account/source revision, correspondent and linked business context. It has zero AI budget and cannot send correspondence, change CRM facts or approve paid work. Revocation prevents future effects; source or entitlement loss blocks the grant permanently. Message receipts and tasks commit atomically. Old messages do not retroactively trigger work. See WORK_EXECUTION for the service contract.
