# Copilot communications workflow — Phase 3

Historical Phase 3 status: **implemented and verified**. Phase 2 is checkpointed at `e9d21b2`; Phase 3 at `77e69b7`. Its verification passed 413 automated tests, 535 compiled HTTP checks, typecheck, lint, production build, desktop/phone inspection and a migration-copy preservation rehearsal. Render deployment and live connections remain separate.

Current extension: [Phase 4A company-email demonstration](COMPANY_EMAIL_DEMO.md) makes fictional Company email · Salesforce the primary path without replacing legacy account histories. The same reviewed services enforce source body/draft/send limits, duplicate-source identity and current access revisions. Captured activity permits local drafts but no sending; headers-only sources cannot support body-derived work. Revoked access masks content and blocks actions/replays; restoration requires fresh review. Company-specific Copilot requests use exact source/thread links. Current verification belongs in [PROGRESS.md](PROGRESS.md).

## Current accepted extension — employee-edited replies and email CC

The locally accepted C3/C4 increment extends the fictional review path to employee-written or edited text and explicit email CC recipients, preserving current sender/primary-recipient identity, private account access, versions, exact reviews, expiration and idempotent receipts. Model-prepared replies remain bounded relationship drafts and never acquire CC recipients or approval from model text. Employee edits are labeled employee-authored, not verified facts or an approved property package. The final review displays every recipient and exact content; manual saving does not send. SMS remains one-to-one and rejects CC. The new-composition extension below adds opening drafts. Live delivery, file transfer and title opening remain subsequent work.

## Employee experience

Open a private Inbox conversation and ask Copilot to explain the relevant source messages, the linked investor's current journey, and the useful next step. Prepare a concise relationship reply using the employee's saved preferences. Review the exact saved sender, recipient, subject and body before explicitly confirming a **simulated** send. A local outbound record and receipt show precisely what happened; they never claim provider delivery.

After a fictional reply arrives, separately review a proposed relationship observation and a personal follow-up. Choose the wording and due time. A relationship observation is employee-reported evidence, not independently verified investor intent. No incoming investor message can approve its own CRM update, change employee preferences, schedule work or grant sending authority.

Typed Copilot, linked employee Slack and linked employee SMS use the same private inbox tools. Native Agent Inbox artifacts open the corresponding native Inbox; dashboard links retain the web review flow. Live channel acceptance still depends on separately configured employee accounts. Inbox tools are not exposed to the current live voice workflow; reviewed native dictation enters the typed path.

The C3 native Inbox slice has local/browser acceptance. It uses existing GET/POST/PATCH routes for company-first sources, private thread/detail, relationship context, draft history, exact simulation, reviewed note/follow-up, status/read changes and explicit investor association. A dirty editor retains its original version after a desktop change; the employee compares both drafts before explicitly choosing a new base. Tab/thread navigation warns about unsaved edits. Source changes clear protected text and reviews. Unsaved edits/pending UI state are memory-only: save before backgrounding/leaving. There is no offline draft store. A saved follow-up opens directly in native Work, which now supports reviewed reminder changes, completion/cancellation and history. Its original-conversation link rechecks private source access; completion does not resolve an investor concern or confirm a deal outcome. A reviewed follow-up offers no due date or an explicit tomorrow-9-AM device-local time; the saved server task is shared with desktop/Copilot.

## Scope and limits

- Search and read only the authenticated employee's organization/office mailbox. A manager's CRM visibility does not grant access to someone else's correspondence.
- Analyze one selected conversation, with at most twelve source messages. Show source excerpts, relevant authorized relationship evidence, unknowns and the preferences used. There is no background mailbox analysis.
- Assistance and reply preparation use bounded deterministic services. Assistance also shows a shared [versioned provisional working method](RELATIONSHIP_METHODS.md), useful question and checks selected from current correspondence/relationship evidence. They do not make an AI provider call or charge the simulated wallet. A live Copilot conversation can still use the existing metered model/tool loop; its provider usage is tracked separately from the wallet.
- Generated replies are relationship-only. They can ask for missing repair information or clarify timing without inventing an estimate, verified facts, completed work or a promise of delivery. Property distribution continues through the existing disclosure-gated Deal packages workflow.
- The simulator accepts the exact saved employee-authored reply or the current server-generated relationship reply. Authorship is set by the server authoring path, never supplied by a client/model. An employee-written message is not verified business evidence or an approved property package. Generated replies still require current method/content eligibility. Saving an edit never approves delivery.
- Attachments remain metadata-only and unavailable. Every simulated outbound attachment set is empty. No file transfer, provider draft sync, OAuth account connection or number purchase is implemented here.
- Unlinked/ambiguous correspondence must not borrow an investor's private history. Review a permitted association before using relationship-specific context or recording a journey observation.

## Review and persistence

A server-created review binds the current account, sender, primary recipient, every CC recipient, authorship and exact saved text, draft/thread versions, empty attachment set and protected context, including the current relationship method catalog fingerprint. The employee sees this snapshot before confirming. Expired reviews or changes to the message, draft, association, preferences, relevant context, method revision or access require fresh review. Neither a model tool nor an investor message can create the approval.

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

Run typecheck, lint, automated tests, production build and isolated HTTP suites, including `npm run test:communications` and `npm run test:mobile-inbox`. Independently typecheck/test/export the mobile package. Inspect desktop and phone layouts, conflict/dirty-edit behavior and review states. When adding a migration, apply it to a disposable copy and confirm preserved business IDs and invoices; the native Inbox/method slice adds none. Record final evidence in PROGRESS.md before commit/push.

Phase 4A now implements the fictional Salesforce company-email workflow and capability examples. Phase 4B is the approved live company source/delivery connection after administrator discovery. Gmail/Microsoft remain optional adapters or approved underlying company infrastructure. Dedicated investor Twilio lines and actual delivery are Phase 5. Real cost settlement, payments and company rollout are Phase 6.

## Edited-correspondence acceptance

Employee-written subject/body and up to ten explicit unique email CC addresses are saved with draft history and shown in the exact review. Sender and primary correspondent remain bound to the existing private conversation. SMS remains one-to-one. Duplicate, malformed, sender/primary-duplicate and header-breaking CC input is rejected. Preparing a generated relationship reply clears CC with an explicit replacement notice; previous versions remain in history. A CC-only change is a dirty edit and invalidates old send review.

New optional JSON fields preserve existing records; there is no schema migration. Legacy draft request hashes remain recognizable for exact replay without rewriting a draft or its authorship. New requests distinguish employee and generated authoring paths. Old drafts without authorship retain the generated-reply eligibility check until deliberately resaved. Every simulated send stores the reviewed CC envelope and one receipt; a model still has no approve/send tool.

Verification: nine new backend cases, two additional native editor cases and fifteen additional phone/desktop HTTP checks, plus the full application regression. The connected browser rehearsal saved edited body/subject/CC on desktop, retrieved it on the native browser export, reviewed the exact envelope and confirmed one simulated outgoing message. That earlier checkpoint did not implement new-conversation composition (now accepted below), existing-thread To/BCC changes, document transfer, real email or investor SMS. Current totals and follow-on work are in [PROGRESS](PROGRESS.md) and the single roadmap.


## New-correspondence acceptance

Desktop and native Inbox offer New message. Employees choose an available owned account, primary recipient, optional email CC, subject and body. Email addresses, unique CC and one-line names/subjects are validated. SMS accepts an international number, no subject/CC and at most 1,600 characters. Switching channels preserves input and requires clearing incompatible fields explicitly. Captured CRM activity can hold a local draft but has no simulated delivery route; headers-only/revoked sources cannot compose.

`POST /inbox/compose` creates a private thread, initial employee-authored draft and audit event atomically. It creates no incoming message, CRM fact, wallet charge or delivery. Exact unique contact matching may reference an already permitted investor; name similarity does not establish a link or verified identity. The UI labels a zero-message saved conversation Draft only. A new thread's handling status is initially done (no incoming request to answer); delivery later changes it to waiting. New-conversation count is bounded to 500 per employee in this demonstration.

A scoped event key binds the original request. Same-request replay returns current thread/draft state, never resurrects the original draft or duplicates a send. Ownership, entitlement and source access are rechecked before replay. Desktop and mobile share a composition controller: uncertain outcomes lock edits/closing and retry the same payload; definitive validation failures allow correction; unsaved discard requires a separate decision. Server-derived sender and existing exact version/context review bind every simulated outcome. Account revocation also withholds outgoing CC addresses.

Assistance on a conversation without an incoming message explicitly says no response exists, disables generated replies and offers no source-based follow-up or relationship observation. Models cannot submit arbitrary employee-authored opening drafts. Natural-language opening-draft preparation remains a separate capability extension; no approve/send model tool is introduced.

Acceptance: nine backend cases, four shared-client cases, fourteen added cross-surface HTTP checks, full regression and a desktop opening-email → native-browser review/simulation rehearsal. A mobile-created opening business text saved successfully. Browser/export evidence is not physical-device acceptance. No migration or new dependency. Document contents, attachment transfer, transaction milestones/parties, existing-thread To/BCC changes and live delivery remain open under the canonical roadmap.
