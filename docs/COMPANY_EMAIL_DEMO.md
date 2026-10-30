# Company email through Salesforce — Phase 4A demonstration

Status: implemented and verified. This extends the reviewed communications workflow from `77e69b7` and the Salesforce-first priority recorded in `3ddaaa1`. It does not connect to New Western or send email.

## Purpose

Alex reportedly works with company email only inside Salesforce. AgentDesk's presentation should reflect that workday: the employee opens company correspondence, asks Copilot for help, reviews a useful reply and follows through. The existing personal assistant conversation remains shared across dashboard and configured employee channels. Investor email is evidence, never an employee command.

## Demonstration accounts

The company-email presentation is additive. Existing Gmail, Outlook and business-text accounts, message IDs, drafts and receipts remain intact. A separate seed marker installs the new fictional accounts once; reopening or restarting cannot reset their state.

- **Company email / Salesforce workflow:** full fictional message bodies, relationship context, saved local drafts and exact reviewed simulated replies. This is the default presentation source.
- **CRM email activity:** readable fictional correspondence with local draft preparation, but no outgoing transport. Reading a CRM email record does not establish sending access.
- **Headers only:** participant/timestamp metadata without a subject/body supplied as email content. Copilot explains the missing evidence and cannot draft a message-grounded response or infer an objection from unavailable text.
- Existing Gmail/Outlook and business-text examples stay available as optional sources.

The source of a record and the route for sending a reply are separate. Each account declares its coverage, current access, access version and capabilities. Attachments are metadata-only and remain unavailable for transfer. Everything is explicitly a demonstration; company addresses and source references are synthetic, and no New Western schema or domain is invented.

## Current permissions and source identity

All records still belong to one authenticated organization, office and employee. Manager CRM visibility never opens another employee's mailbox. Account capabilities are enforced in shared services as well as the interface: local-draft access, body access and simulated-send access are distinct.

A fictional revoke/restore scenario demonstrates loss of company-email access. Revoked reads mask message content, preview text, saved drafts and relationship context; actions stop, including repeats of previously successful operations. Search cannot match hidden content. Copilot's cached results and stored history recheck current source access. Restoring access increments the access version rather than recreating the old review state; prior unsent reviews require a fresh review.

A second fictional source can refer to the same original message. The scenario uses a trusted server-owned correlation reference, preserves the original message and adds source provenance without adding a duplicate email or action. It does not infer message identity from a matching subject or text. This demonstrates the intended behavior when an approved mailbox and Salesforce later expose the same correspondence.

## Presentation sequence

1. Open **Inbox**. The primary company-email demonstration is selected; optional accounts remain available.
2. Open Mike's company repair-cost conversation. Show the original fictional message and linked investor context.
3. Ask Copilot to review the conversation. Inspect the supporting records, unresolved questions and saved writing preferences.
4. Prepare a relationship reply, review its exact company sender/recipient/content, then confirm **simulated sending**. The outbound history and receipt remain explicitly not delivered.
5. Add the company repair follow-up scenario. Separately review a journey note and personal task; verify the task appears in Work queue.
6. In typed Copilot, try “Show my company email.” Use its exact conversation link to continue in Inbox. Unqualified “show my inbox” can include optional sources.
7. Show the CRM-activity and headers-only examples. Explain why the available actions differ instead of implying that all Salesforce configurations expose a full mailbox.
8. Demonstrate duplicate-source reconciliation and access revocation/restoration. Verify no duplicate message appears and a revoked review cannot send after access returns.

Custom drafts remain editable but the current simulator accepts only the current generated relationship reply. Property details continue through the existing disclosure-gated Deal packages workflow. Source notes are employee-reviewed reports, not verified investor facts.

## Verification and limits

Verification passed 438 automated tests across 23 files and 606 compiled HTTP checks, including 70 company-email checks. Typecheck, lint and production build passed. Desktop (1280×720) and phone (390×844) browser acceptance covered company default, the reviewed reply and follow-through, limited sources, duplicate provenance, access pause/restore, protected drafts and exact Copilot navigation. No horizontal overflow or browser warning/error logs were observed. A disposable schema-17 inbox with saved drafts and a simulated receipt upgraded to schema 18 while preserving every original row across nineteen tables; wallet balances stayed unchanged and SQLite integrity was `ok`. The active database was unchanged.

Meaningful acceptance covers the full company workflow, source capabilities across direct API and Copilot, private ownership, stale/replayed approval, hidden-content search/history, restoration, duplicate-source identity, and preservation of previous correspondence. Run `npm run test:company-email` against the isolated compiled application, plus existing inbox/workflow/channel/billing regressions. Inspect desktop and phone layouts and migrate disposable copies rather than the active local database.

Live Salesforce integration is Phase 4B and still requires approved administrator discovery. The company may use Salesforce, a mailbox provider or another approved service for delivery; this demonstration does not establish which route New Western uses. Refer to SALESFORCE_INTEGRATION.md for the confirmed-source checklist. Real investor messaging, provider-wallet debiting and payment collection remain later work. Render deployment is separate from this commit/push checkpoint.
