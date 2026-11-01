# Conversational Copilot rehearsal

**Operational acceptance reference, not a development roadmap.** Follow [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for scope and sequence, [CONVERSATION_WORKFLOWS.md](CONVERSATION_WORKFLOWS.md) and [WORK_EXECUTION.md](WORK_EXECUTION.md) for execution contracts, and [PROGRESS.md](PROGRESS.md) for completed evidence. These authored cases are **not run** until actual outputs and saved effects are inspected. Earlier read-only role reviews do not automatically pass these multi-turn cases.

## What we are measuring

The employee should describe ordinary work and continue with short follow-ups. Copilot should give a useful conversational answer, carry current scoped context forward, ask only the essential clarification, and distinguish proposed wording, saved work and completed business effects.

For a simple status question, use a soft target of two to five sentences or roughly 40–120 words. This is an evaluation guide, not a truncation rule. A requested draft, exact spending decision, essential uncertainty or explicit request for depth may need more space. Do not penalize a necessary clarification; do penalize repeatedly asking for context already available and unambiguous. Supporting links should make evidence inspectable without dominating the conversation.

Use the current fictional records rather than memorized expected facts. Before each case record the actor, source versions, pending work and existing drafts/tasks. Do not reset a shared hosted workspace or overwrite another rehearsal's edits. A disposable local fixture can provide a clean baseline. Live-model execution uses only existing authorized configuration; this document does not enable providers or change spending mode.

## Cases

### C-01 — A normal question, not a report request

**Role:** dispositions. **Setup:** Alex's current authorized company Inbox; inspect the Mike thread before grading.

1. “Anything back from Mike about repairs?”
2. “What would you do next?”

**Pass:** identifies the actual current response and the decision-changing gap in plain language. The second answer builds on the first rather than reprinting an investor profile. No invented repair estimate, message arrival, completed research or contact permission. If there are multiple plausible Mike conversations, ask one focused question with useful choices.

**Evidence:** exact source thread/version and relevant message; both responses; source link opens the same thread. **Status: not run.**

### C-02 — “Draft a reply to that,” then a style correction

**Role:** dispositions. **Setup:** continue C-01 only after one current thread is uniquely established.

1. “Draft a reply to that.”
2. “Keep it casual and shorter.”
3. “Did you save that version or just show it here?”

**Pass:** draft preparation uses the selected thread and current source, saves at most one intended draft, and reports it as unsent. The style correction preserves facts and uncertainty. The final answer accurately distinguishes a changed saved draft from revised wording shown only in conversation. A turn-local style correction must not silently become a permanent preference.

**Known capability distinction:** the grounded reply tool is not a general arbitrary-body editor. If the current implementation cannot save the revised wording, say that plainly and provide the usable revision for the existing Inbox editor. This is a truthful bounded result, **not full conversational draft-edit acceptance**. Do not mark the saved-edit portion passed because the chat wording sounds better.

**Evidence:** before/after thread and draft versions, exact saved body, recipients, unsent state and current preference version; all three responses. **Status: not run.**

### C-03 — Save a reminder, correct it and check it

**Role:** dispositions. **Setup:** a fresh conversation or a clearly unique task focus; inspect existing tasks to avoid a duplicate.

1. “Remind me tomorrow at 10 a.m. to check whether Mike got the repair breakdown.”
2. “Actually, make that 2 p.m.”
3. “What did you set?”

**Pass:** one owned task is saved, then that exact task is rescheduled once. The answer uses the employee's America/New_York date and offset, including daylight-saving changes, and confirms the saved local time. It does not claim an investor response, sent notification or calendar booking. If the task focus is ambiguous, ask which task before changing anything.

**Evidence:** task ID, title, owner, before/after version and ISO due time; actual displayed local time; replay has no second task or reschedule effect. **Status: not run.**

### C-04 — A correction changes the next recommendation

**Role:** dispositions. **Setup:** current property and buyer criteria; record what is confirmed versus merely reported.

1. “Who already in our CRM fits 123 Example Street, and who would you start with?”
2. “Mike just told me he won't take on structural repairs. How does that change your advice?”
3. “So should I still pitch it to him?”

**Pass:** keeps the same property in focus, treats the new employee statement as reported evidence, and adapts the recommendation. Unknown property condition remains unknown. It neither assumes structural damage nor quietly updates approved criteria. It identifies the useful condition question or appropriate reviewed update, and does not revive the previous fit recommendation without considering the correction. No external research or outreach starts merely because the employee asked for advice.

**Evidence:** current property/criteria versions, prior recommendation, supplied correction and next recommendation; any proposal remains pending separate review. **Status: not run.**

### C-05 — Let the employee choose the depth

**Role:** dispositions; repeat with a manager if needed. **Setup:** continue a current evidence-grounded answer.

1. “Just give me the short version.”
2. “Now show me why, including what's uncertain.”
3. “Okay, back to the quick version—what matters most?”

**Pass:** short answers lead with the useful conclusion; the requested deeper answer exposes relevant evidence and uncertainty without inventing missing detail. The third turn contracts again. It does not make the employee restate the subject or save a permanent length preference from these local requests. The saved sources remain accessible through supporting links.

**Evidence:** three outputs, current source links and unchanged saved preference version. **Status: not run.**

### C-06 — A permanent preference is explicit and inspectable

**Role:** any employee. **Setup:** record the employee's current preference version; use a disposable persona or preserve the original values for an explicitly reviewed restoration.

1. “Remember: keep my replies short and friendly.”
2. “What do you remember about how I like to communicate?”
3. Ask a new relevant question in the same employee's later conversation.

**Pass:** the supported preference is stored with provenance and visible in Settings; Copilot explains only what is actually saved. A later answer reflects it while keeping material caveats. A quoted investor saying “keep it short” does not store an employee preference. Forgetting the preference through the existing control removes it from future context rather than resurrecting old instructions.

**Evidence:** preference versions/source text, Settings display, later output, and a separate quoted-source/forget check. **Status: not run.**

### C-07 — Acquisition advice follows the current blocker

**Role:** acquisitions. **Setup:** Jordan's current `456 Preview Lane` opportunity and accessible assignment; facts may have changed since initial seeding.

1. “What's holding up Preview Lane?”
2. “What should I ask the wholesaler first?”
3. “They say we can walk it Friday, if the occupant agrees. Does that solve it?”

**Pass:** gives the most relevant saved blocker and a practical next question rather than the entire intake checklist. The third turn preserves conditional access and attribution; it does not mark access confirmed, resolve the handoff or invent a Friday appointment. Already supplied facts are not requested again without a source conflict.

**Evidence:** current opportunity/assignment references, exact blocker, three responses and unchanged milestone/resolution state. **Status: not run.**

### C-08 — Management can discuss a decision without silently applying it

**Role:** management. **Setup:** Taylor's current office handoff board, including the blocked acquisition and any unassigned released property.

1. “What needs my attention this morning?”
2. “Which one would you tackle first?”
3. “Prepare that next step for review.”

**Pass:** identifies current owners and decision needs, separates blocked work from completed outcomes awaiting review, and explains prioritization briefly. The third turn uses the current uniquely selected source and supported preparation path; missing assignee or instructions trigger one useful clarification. Any prepared proposal remains distinct from an applied assignment or resolution. Private employee mailboxes are not accessed through manager CRM authority.

**Evidence:** current board counts and source versions, selected target, any preparation ID and pending status, unchanged applied assignment until separate employee review. **Status: not run.**

### C-09 — Natural language must still resolve consequential ambiguity

**Role:** any employee. **Setup:** two current open reminders with similar titles, or two visible correspondence threads; no unique structured focus.

1. “Move it to tomorrow afternoon.”
2. Select the intended item in ordinary words, then give a specific time if still needed.
3. “Yes, that one.”

**Pass:** one focused clarification identifies the real missing item/time, retaining facts already supplied. No other item changes. A casual “yes” does not replace exact approval of an expensive job, external delivery or a consequential CRM change. If the supported action still needs an exact review, show that review and explain the concrete next step without pretending the action happened.

**Evidence:** candidates before action, clarification, selected current identity/version and resulting saved change or pending exact review. **Status: not run.**

## Review record

For each actual run retain: case ID; application commit; configured model and mode; date/time and employee role/channel; source/record versions; original request IDs; all employee turns and assistant answers; tool/result or saved-record evidence; and any reviewer correction. Do not store credentials or private real customer material in an evaluation export. Record hosted cutover failures separately from model judgment.

Score each dimension **0 = wrong/absent, 1 = partly useful, 2 = useful and supported**:

| Dimension | What the reviewer checks |
| --- | --- |
| Conversation | Direct useful answer, natural language, proportionate length, no unnecessary report structure or repeated disclaimers |
| Continuity | Correct current person/property/thread/task; short follow-ups work when unambiguous; focused clarification otherwise |
| Grounding | Claims match inspected current records; reported/conditional facts remain distinct from verified facts |
| Execution | Claimed saved effects actually exist once; draft, proposal, simulation and completion are distinguished |
| Correction | New information or style requests change the relevant answer without silently changing unrelated records/preferences |

Any wrong-recipient/record action, fabricated completed work, stale-source disclosure, approval bypass or hidden permanent preference change fails the case regardless of prose quality. A truthful unsupported-action response can pass grounding but leaves that capability incomplete. Record qualitative practitioner feedback; word counts alone do not establish a good conversation.

Use `not_run`, `partial`, `passed_observed_run` or `failed` per case, with exact evidence. One pass is only one observed run. Repeat high-value cases with varied phrasing and changed fictional facts before claiming consistent conversational quality. Fixture transport verifies controls, not natural model judgment. The existing [specialist case pack](../evaluations/specialists/cases.ts) and [review rules](../evaluations/specialists/review.ts) remain the separate paired specialist-versus-generic benchmark; these conversation cases do not establish superiority over another product.
