# Deal Package Composer and post-call debrief

## Current local composer

The composer produces a saved, source-grounded demonstration package for an authorized investor and property release. Email, SMS, personal text, iMessage and Slack are format labels. The package itself supports copy handoff and its `deliveryStatus` remains `not_sent`. Eligible email/SMS packages can separately prepare a private Inbox draft for exact employee-reviewed simulated delivery through [COMMUNICATIONS_INBOX](COMMUNICATIONS_INBOX.md). That saved Inbox receipt is separate from package approval/copy state; no live investor delivery is implied.

The state machine is `blocked → draft → approved → handed_off`, with a new composition required after a blocked eligibility change. Editing an eligible package returns it to `draft` and clears its approval. “Handed off” records that approved content was returned for copying, not that a person pasted it, sent it or delivered it.

Before composing restricted details, the server checks investor access and release audience/status, then requires a signed disclosure with a valid, nonfuture signed timestamp, evidence reference, current demo policy version and no expired validity. A model response cannot approve a disclosure or a package. The fictional Mike record has a labeled synthetic disclosure fixture; managers may record synthetic demo evidence for fictional investors. No event is represented as a legal signature.

Media links must be HTTPS and contain no embedded credentials. A supplied link marked `unverified` blocks preparation for sharing. `recipient_confirmed` additionally requires the selected investor in the stored permitted-recipient list. `public_confirmed` means an employee has confirmed public access; neither label means AgentDesk tested the link. No URL is fetched by the composer.

Blocked packages have a generic subject/body containing no property address, price, photos or release notes. Reasons explain what must be resolved. Package listing, approval, editing and handoff repeat the current eligibility checks. They scrub saved content when investor/release access is revoked, disclosure expires or changes version, or a release/template changes. A cached debrief proposal also refreshes its package before returning it.

## Source and approval boundaries

Eligible bodies include the supplied address, asking price, beds/baths/size, property type, rehab, description, notes, optional ARV/repair assumptions and their source, available photo link and showing instructions. Missing photos, estimates, descriptions, showing instructions and economics sources are flagged, not filled in with invented claims. Upstream transaction notes are not automatically inserted into investor messages.

New packages include the selected investor's recorded profile-comparison reasons and any fit conflicts. These are explanations of stored criteria, not a claim that a buyer is suitable or ready to purchase. A fingerprint of the criteria prevents an approved comparison from being copied after those criteria change. Existing drafts retain their original canonical wording. Email has a property-specific subject and paragraph spacing; personal text, SMS and iMessage use compact line spacing, while Slack uses paragraph spacing. Content is still retained for review; no carrier-segment pricing or delivery is inferred from formatting.

All bodies retain a demonstration label and explain that no message has been sent. Managers can configure introductory and closing template copy per format, with a local demo-approved/draft status and version. The defaults and manager approvals are explicitly not corporate-approved New Western templates. Property facts and links belong in release data, not template copy.

The editor permits removing or reordering complete original lines while preserving the demo label. Subject choices are the original source subject, “Property details for review” or blank. Arbitrary new facts, numbers or links cannot be inserted through package edits and then approved. To change factual wording, revise the release and compose again. This intentionally limited edit boundary can be expanded after source/claim validation and approved communication policy are available.

## Post-call recap

The same backend accepts typed or authorized transcribed post-call recaps. It does not record ordinary cellular calls. A conservative local parser identifies an investor by an unambiguous authorized name and a property by address or unambiguous city; missing/ambiguous links require employee selection. It extracts attributed affirmative budget ceilings (including `$250k`), cash/hard-money financing, light/cosmetic or heavy rehab, simple flip/rental strategy and selected Georgia county names. Unsupported, uncertain, negated or employee-speaker statements are not promoted to investor criteria. Multiple strategies/price profiles are flagged for separate reviewed buy boxes instead of flattened.

Each proposed field keeps its exact source excerpt. A linked recap appears in relationship history explicitly as an unreviewed employee statement, with capture time distinguished from phone-call time. The workflow prepares a pending CRM note and, when unambiguous fields exist, a pending CRM update. Approval through the existing server approval service applies the update and versions the primary buy box with provenance. No source statement becomes a confirmed preference merely because a model or parser extracted it.

A clear “follow up tomorrow” commitment proposes 10 a.m. America/New_York on the next local calendar day, handling daylight saving changes. A reminder is only created when the employee requests it via `createFollowUp:true`. Uncertain or negated commitments do not produce a proposed deadline. Repeating a debrief proposal returns the existing proposal/task IDs rather than creating duplicates. A request for photos/details may compose an eligible package, or a blocked package explaining the disclosure/media requirement. It never approves or sends the package.

The parser is deliberately limited: nuanced budgets, nonlocal geography, ambiguous speakers, competing profiles and unsupported qualification facts need human review. Optional future model extraction must preserve the same service permissions, excerpts and approval boundary.

When another authorized investor is mentioned, only statements explicitly naming the selected investor are extracted; ambiguous pronouns are omitted with an attribution warning. Qualification guidance is derived from the conservative extracted fields so it does not ask for an already captured strategy merely because the legacy transcript parser used different wording.

## Current inventory and package corrections

Package composition and every later eligibility read compare the release snapshot with current scoped inventory: address, city, county, asking price, bedroom/bathroom counts, size, strategy, rehab, inventory status and demo designation. A mismatch names the changed fields without publishing either stale or unreviewed replacement facts. The employee must ask the acquisition owner or manager to review and refresh the release, then compose a new package. Refreshing the release never silently rewrites an existing package or employee-edited Inbox draft.

Blocked packages remove obsolete copy and missing-data advice. Their source-bound unsent Inbox drafts and exact-send reviews become unusable; current conversation and saved-work references retire affected advice. Old packages stay blocked even after a replacement is prepared. A new eligible package can be saved through the existing explicit Inbox preparation, preserving exact retry behavior. Original simulated-delivery messages/receipts remain history rather than being rewritten. Missing buyer-fit evidence now joins the package's employee-facing review checklist; it does not become an invented investor fact or an automatic outgoing claim.

These are local fictional service behaviors, covered by inventory-field corrections, refreshed-release preparation, source/history invalidation and original-receipt preservation in `package-correspondence.test.ts`. They do not prove broad actual-model correction judgment or provider delivery.

## Saved conversations and replay

New chat/voice messages store record references derived from structured tool artifacts, previous linked context and the authorized baseline supplied to a live model. On subsequent reads, messages tied to revoked investor/property access or ineligible/stale package content are withheld. Saved CRM, briefing, release, debrief and package artifact snapshots are omitted; opening a workflow retrieves its current scoped state. Authorized source-note artifacts remain immutable excerpts. Voice duplicate tool receipts return completion metadata rather than replaying saved property bodies, and never execute the action twice.

The reference policy is deliberately conservative: a conversation that used several records can have later context withheld when one becomes inaccessible. Phase 1 messages created before reference tracking may lack reliable record IDs; arbitrary old prose cannot be accurately reassigned by guessing names. Previously viewed, copied or externally sent information cannot be retracted. This limitation is distinct from current service access and copy eligibility, which remain enforced.

Saved approval payloads also recheck current investor access when listed, retrieved or decided, including repeated approve/reject requests. Reassignment therefore cannot leave a former employee reading protected notes or criteria through an old pending/executed action.

## Historical channel foundations

The following records the initial channel foundation, not current channel activation/readiness. Use [VOICE_AND_MESSAGING](VOICE_AND_MESSAGING.md), [WORK_EXECUTION](WORK_EXECUTION.md) and the canonical roadmap for the current shared conversation, messaging and delivery controls. Package format labels alone never establish connectivity.

`channels.ts` verifies Slack raw-body HMAC signatures, checks a five-minute timestamp window, compares signatures in constant time and resolves only explicitly linked local test identities. Links are scoped to actual memberships and cannot claim another tenant's external identity. There is no live Slack HTTP ingress, OAuth installation, message dispatch or delivery receipt. Production setup needs organization approval, OAuth token custody and verified identity binding. The foundation follows Slack's [request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/) and [OAuth installation](https://docs.slack.dev/authentication/installing-with-oauth/) documentation.

SMS entitlement reads organization-level paid-add-on allowance and provider-segment usage. Requests without allowance fail; requests with allowance still fail closed because no provider is configured. Copy-only SMS formatting incurs no provider cost. Personal iMessage accounts are not automated. Telegram remains a future adapter.

The workflow suite covers disclosure/version/expiry/revocation checks, media recipient gating, edit/approval separation, stale release/template invalidation, exact source facts, missing-data flags, no fabricated delivery, debrief linking/extraction/proposals/reminder idempotence, daylight saving normalization, Slack authentication and SMS fail-closed behavior. Full verification results belong in `PROGRESS.md`.
