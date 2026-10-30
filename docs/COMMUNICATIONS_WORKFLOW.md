# Copilot communications workflow — Phase 3

Historical Phase 3 status: **implemented and verified**. Phase 2 is checkpointed at `e9d21b2`; Phase 3 at `77e69b7`. Its verification passed 413 automated tests, 535 compiled HTTP checks, typecheck, lint, production build, desktop/phone inspection and a migration-copy preservation rehearsal. Render deployment and live connections remain separate.

Current extension: [Phase 4A company-email demonstration](COMPANY_EMAIL_DEMO.md) makes fictional Company email · Salesforce the primary path without replacing legacy account histories. The same reviewed services enforce source body/draft/send limits, duplicate-source identity and current access revisions. Captured activity permits local drafts but no sending; headers-only sources cannot support body-derived work. Revoked access masks content and blocks actions/replays; restoration requires fresh review. Company-specific Copilot requests use exact source/thread links. Current verification belongs in [PROGRESS.md](PROGRESS.md).

## Employee experience

Open a private Inbox conversation and ask Copilot to explain the relevant source messages, the linked investor's current journey, and the useful next step. Prepare a concise relationship reply using the employee's saved preferences. Review the exact saved sender, recipient, subject and body before explicitly confirming a **simulated** send. A local outbound record and receipt show precisely what happened; they never claim provider delivery.

After a fictional reply arrives, separately review a proposed relationship observation and a personal follow-up. Choose the wording and due time. A relationship observation is employee-reported evidence, not independently verified investor intent. No incoming investor message can approve its own CRM update, change employee preferences, schedule work or grant sending authority.

Typed Copilot, linked employee Slack and linked employee SMS use the same private inbox tools and return links to the dashboard review flow. Live channel acceptance still depends on the separately configured employee accounts. Inbox tools are not exposed to the current voice workflow.

## Scope and limits

- Search and read only the authenticated employee's organization/office mailbox. A manager's CRM visibility does not grant access to someone else's correspondence.
- Analyze one selected conversation, with at most twelve source messages. Show source excerpts, relevant authorized relationship evidence, unknowns and the preferences used. There is no background mailbox analysis.
- Assistance and reply preparation use a bounded deterministic method. They do not make an AI provider call or charge the simulated wallet. A live Copilot conversation can still use the existing metered model/tool loop; its provider usage is tracked separately from the wallet.
- Generated replies are relationship-only. They can ask for missing repair information or clarify timing without inventing an estimate, verified facts, completed work or a promise of delivery. Property distribution continues through the existing disclosure-gated Deal packages workflow.
- The send simulator accepts only the exact **current server-generated relationship reply**, including its subject. This establishes its limited sharing scope. Custom/manual edits remain saved drafts; prepare a fresh Copilot reply before using the simulator. This is an intentionally bounded demonstration, not arbitrary email/SMS sending.
- Attachments remain metadata-only and unavailable. Every simulated outbound attachment set is empty. No file transfer, provider draft sync, OAuth account connection or number purchase is implemented here.
- Unlinked/ambiguous correspondence must not borrow an investor's private history. Review a permitted association before using relationship-specific context or recording a journey observation.

## Review and persistence

A server-created review binds the current account, sender, recipient, exact saved text, draft/thread versions, empty attachment set and protected context. The employee sees this snapshot before confirming. Expired reviews or changes to the message, draft, association, preferences, relevant context or access require fresh review. Neither a model tool nor an investor message can create the approval.

Scoped event keys and transactions make retries safe. A repeated approved simulation returns its existing receipt and fresh permitted thread state; it cannot create another outbound message or restore an obsolete draft. The immutable receipt distinguishes simulation from actual delivery. Historical correspondence remains readable after subscription cancellation; new assistance and reviewed actions require current access.

The full source reference for a reviewed observation or follow-up stays in a private communication receipt. Shared journey provenance exposes only a minimal label/channel/time, not private mailbox addresses, message identifiers or the entire source body. The employee deliberately selects the observation text that is added to the relationship record.

Copilot's protected context and stored history must respect current mailbox access and subscriptions. Retrieved messages remain untrusted data. Tools can read and prepare work; delivery confirmation and reviewed communication-to-journey changes are API/UI actions, never model approval tools.

## Presentation walkthrough

1. Open Mike's **Company email · Salesforce** conversation in **Inbox**. Inspect his original repair-cost request and its fictional source label. The original Gmail example remains available under other inboxes.
2. Open Copilot assistance. Show the concern, source excerpts, missing information and saved writing preferences. Explain that knowing this relationship changes the suggested next step.
3. Prepare the reply. Read its cautious request for verified repair detail. Confirm no unsupported price or completed contractor work is invented.
4. Review the exact saved message, sender and recipient. Confirm simulated sending, then show the local outbound message and explicit simulation receipt.
5. Use **Explore examples → Company-email follow-up**. It becomes unread and needs a reply; it invalidates any older unsent review.
6. Review the suggested relationship note. Save it deliberately and inspect its employee-reported provenance in the investor journey.
7. Review the follow-up title, choose a due date/time, and create the personal task. Confirm it appears once in the Work queue.
8. In typed Copilot, try “Find Mike company email” or “Search my company email for repair.” Open the exact returned conversation link. Explain that linked employee Slack/SMS use this same assistant service while investor messages remain separate evidence.

## Acceptance

Verify full incoming → grounded draft → exact review → simulated receipt → fictional reply → reviewed source-linked observation → reviewed personal follow-up. Include stale/replayed reviews, changed preferences, revoked CRM/mailbox access, ambiguous matches, forged sender/recipient/source, canceled subscriptions and malicious incoming instructions. No test may contact a live provider, debit real credits or alter the active demonstration database.

Run typecheck, lint, automated tests, production build and isolated HTTP suites, including `npm run test:communications`. Inspect desktop and phone layouts, conflict/dirty-edit behavior and review states. Apply the additive migration to a disposable copy and confirm preserved business IDs and invoices. Record final evidence in PROGRESS.md before commit/push.

Phase 4A now implements the fictional Salesforce company-email workflow and capability examples. Phase 4B is the approved live company source/delivery connection after administrator discovery. Gmail/Microsoft remain optional adapters or approved underlying company infrastructure. Dedicated investor Twilio lines and actual delivery are Phase 5. Real cost settlement, payments and company rollout are Phase 6.
