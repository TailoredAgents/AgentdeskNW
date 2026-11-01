# Conversational Copilot rehearsal

## November 1 follow-up — interrupted connection recovery

**C-10 passed_local_engineering:** production browser build, disposable fictional database, no live model or delivery. A first separate conversation received an intentionally unreadable HTTP 200 response after the server saved its answer. The recovery card preserved the original request; **Check saved result** found its conversation without a conversation ID and restored the answer using one original POST and one read-only lookup. That reminder request correctly reported that the local fallback had not created a natural-language reminder; this is not a task-creation pass. A subsequent **Show my open tasks** answer remained visible even while the following bootstrap read was deliberately rejected. A named completion request then saved the fictional Marietta task change while its response was made unreadable; checking recovered “marked complete.” Cumulative proxy counts: three chat POSTs and two saved-result GETs, with no recovery POST. A missing conversation link showed targeted checking/unavailable copy rather than a blank new-chat welcome. A separate final fixture with 51 newer conversations loaded its older exact link and retained it through periodic refresh, using fresh scoped reads.

**C-11 passed_local_browser:** the 390-pixel native browser preview showed explicit first-read failures for follow-ups, saved jobs and Inbox. No empty-list prompt appeared during those failures. On restored transport, saved jobs reached the genuine empty state; Inbox’s read-only retry restored the seeded company-email thread and cleared the read error. Follow-up counts stay unknown until loaded. Accepted Agent replies/recoveries invalidate older read tickets and clear the loading indicator. This is browser/export acceptance, not installed-phone, audio, real SMS or offline acceptance.

Evidence: `/tmp/agentdesk-state-recovery-pending.png`, `/tmp/agentdesk-state-recovered-task.txt` and PNG, `/tmp/agentdesk-state-saved-answer.txt` and PNG, `/tmp/agentdesk-state-phone-error.txt` and PNG. Transport/lookup tests separately cover exact request/conversation mismatch, current source redaction and employee/organization/office scope. These checks establish recovery behavior, not conversational model quality.


## November 1 follow-up — inspectable memory and natural reminder choices

**C-06 passed_observed_run on `c67080e`, 12:38–12:40 p.m. Eastern, Jordan:** starting Settings had no preferences. “Remember: keep my replies short and friendly” saved warm/concise preferences. Natural readback matched; Settings showed the exact employee statement as the source for both fields. A fresh conversation produced short, friendly walkthrough wording. The request itself also asked for quick wording, so this establishes compatible behavior, not a controlled measurement of memory’s causal effect. Quoting a wholesaler’s detailed/direct preference did not change the saved values or timestamp. “Forget my saved writing preferences” cleared Settings; a follow-up in the same chat correctly reported no saved preferences without reviving earlier instructions. No draft, investor record, delivery or allowance was changed. Automated context tests separately inspect versions and provider input. Local evidence: `/tmp/agentdesk-memory-readback-c67080e.txt`, `agentdesk-memory-settings-c67080e.txt`, `agentdesk-memory-later-chat-c67080e.txt`, `agentdesk-memory-quoted-c67080e.txt`, `agentdesk-memory-after-quote-c67080e.txt`, `agentdesk-memory-forgotten-chat-c67080e.txt` and `agentdesk-memory-forgotten-settings-c67080e.txt` in `/tmp/`.

**C-09 passed_observed_run on `a70ce2c`, 12:53–12:54 p.m. Eastern, Jordan:** two new personal rehearsal reminders started with no dates. In a fresh conversation, “Move it to tomorrow afternoon” listed both actual candidates and changed nothing. “I mean Check walkthrough access rehearsal” selected the named reminder and asked for the missing clock. “2pm” saved Monday, November 2 at 2 p.m. Eastern; “Yes, that one” correctly restated the saved result without another action. Work showed exactly those two reminders, with the other still undated, and zero approvals/research. The exact IDs/versions/retry and consequential-assent rejection are separately checked in automated cases; the browser inspection does not expose every protected identifier. Both rehearsal-only tasks were then canceled through their own UI controls, returning Jordan to zero open tasks. Evidence: `/tmp/agentdesk-ambiguity-before.txt`, `/tmp/agentdesk-ambiguity-conversation-a70ce2c.txt`, `/tmp/agentdesk-ambiguity-work-a70ce2c.txt`, `/tmp/agentdesk-ambiguity-cleanup-a70ce2c.txt` and `/tmp/agentdesk-ambiguity-conversation-a70ce2c.png`.

**Post-deploy draft display:** Taylor’s earlier rewrite conversation now has the title “Conversation with earlier drafts” and the draft/source-change notice for the two retired messages. The current saved answer and source link remained usable; opening it verified the unchanged current Copilot-authored unsent Morgan Sample reply. Evidence: `/tmp/agentdesk-draft-notice-a70ce2c.txt` and PNG. Render reported `a70ce2c` Live; the first reload briefly returned 502 during handover, then recovered on retry and all stated checks completed. No extra allowances or provider/payment settings changed.

**Engineering follow-up:** temporary/conditional style requests must not become saved defaults, even if prefixed by “remember.” An exact displayed reminder title must resolve the current pending choice without losing the requested date or changing the pending action. Retired draft-dependent messages receive a truthful friendly notice; their original content/actions remain withheld, and obsolete tool snapshots cannot re-enter later model context. Native answers now format headings, lists, emphasis/code and phone-width table cards while keeping employee text literal. These are bounded improvements, not broader specialist or physical-device acceptance.


**Operational acceptance reference, not a development roadmap.** Follow [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for scope and sequence, [CONVERSATION_WORKFLOWS.md](CONVERSATION_WORKFLOWS.md) and [WORK_EXECUTION.md](WORK_EXECUTION.md) for execution contracts, and [PROGRESS.md](PROGRESS.md) for completed evidence. Authored cases remain **not run** unless the observed-run record below says otherwise. Earlier read-only role reviews do not automatically pass these multi-turn cases.

## Latest observed status — November 1, 2026

### Current development follow-up

**C-02 saved-style variant passed_observed_run on `00b3332`, 12:23–12:25 p.m. Eastern:** Taylor’s private fictional Morgan Sample company-email draft was prepared through Inbox, then retrieved in a fresh Copilot conversation. “Keep it casual and shorter” saved one revised body without another save prompt. “Did you save that version or just show it here?” correctly confirmed the saved/unsent outcome. Inbox showed the same new wording, unchanged sender/recipient/subject, `Rewritten by Copilot`, 12:24 p.m. saved time and one previous draft in history. Settings still showed no saved writing preferences. The rewrite retained uncertainty about repair-breakdown/contractor-review availability. This is the shared-tool variant under Taylor’s existing allowance, not a repetition of Alex’s whole C-01→C-02 script. No extra credits were granted. Evidence: `/tmp/agentdesk-rewrite-starting-draft.txt`, `/tmp/agentdesk-saved-rewrite-conversation-00b3332.txt`, `/tmp/agentdesk-saved-rewrite-inbox-00b3332.txt`, `/tmp/agentdesk-rewrite-memory-00b3332.txt`, and `/tmp/agentdesk-saved-rewrite-00b3332.png`. Exact draft/source IDs are protected metadata rather than a full browser export; automated cases supply version/retry checks. At that revision, superseded draft-dependent messages showed a generic withheld-history notice; the later `a70ce2c` display verification above closes that presentation follow-up.


**C-08 preparation path observed on `9b35ef3`, 12:12–12:15 p.m. Eastern:** Taylor’s fresh browser conversation identified the blocked Preview Lane and unassigned Example Street handoffs, prioritized Preview Lane, asked for a future deadline, and accepted “Tomorrow at 10 a.m. Eastern” as the short continuation. Work showed one pending preparation for Jordan, opportunity v1/follow-up v3, exact next action and Nov 2 at 10 a.m. Existing follow-up v3 remained acknowledged/blocked at its original 9:04 a.m. deadline. The review was inspected but not applied. The first priorities result incorrectly included Alex’s personal-task cards; the model noticed and distinguished them, but this is still a product defect. The personal feed is now owner-scoped in code with an actual chat/tool regression; explicit office overview retains authorized team scope. Hosted correction check on `00b3332` passed: a fresh personal-priorities request showed zero Taylor tasks/approvals/research and separately listed the two office handoffs, with no Alex task cards. Evidence: `/tmp/agentdesk-personal-priorities-00b3332.txt`. The original full four-turn script was not repeated; the preparation and corrected-feed passes are separate observed runs. Evidence: `/tmp/agentdesk-management-conversation-9b35ef3.txt`, `/tmp/agentdesk-management-preparation-9b35ef3.txt` and corresponding PNG.


Saved ordinary draft rewrites are now implemented with exact source/draft checks, current shown-thread continuity, truthful Copilot authorship and unchanged recipients. Automated mocked-provider tests exercise read → rewrite → saved response → exact retry; domain/history tests cover obsolete context, access restoration, previews and unsupported complex drafts. These automated checks are engineering evidence; the separate live-model saved-edit variant is recorded above. Alex’s remaining allowance was not increased.

**C-07 passed_observed_run on `9b35ef3`, November 1 at 12:09–12:11 p.m. Eastern:** Jordan’s fresh browser conversation identified the repair-scope/walkthrough blocker, proposed a concise wholesaler question, and treated Friday access as conditional on occupant agreement. The linked Work view retained opportunity v1 and follow-up v3, acknowledged/blocked with the original Nov 2 deadline; no milestone or assignment changed. Settings showed the configured `gpt-6-astra` receipt. Evidence: `/tmp/agentdesk-acquisition-conversation-9b35ef3.txt`, corresponding PNG, and `/tmp/agentdesk-acquisition-source-9b35ef3.txt`. This is one bounded model conversation; no repeated reliability, external messaging or practitioner acceptance is inferred.


The owner approved one additional 250,000-token operational demo grant for Alex. The UI confirmed the included total changed from 1,000,000 to 1,250,000 with prior usage unchanged. No payment, dollar-wallet top-up or provider setting changed.

- **C-02 draft-continuity check passed at `5e30685`:** in a fresh conversation, company email → next-step journey review → “Draft a reply to that” produced a complete saved/unsent confirmation. Inbox verified the same grounded body, intended recipient and 11:16 a.m. saved time. The earlier casual-rewrite/accurate-unsaved-preview evidence remains valid; the whole three-turn style script was not repeated in that run. Saved ordinary rewriting is now implemented as described above; its live-model acceptance remains separate.
- **C-03 passed_observed_run at `33915ae`:** the live compound request first exposed an authorization-parser gap and created nothing. After the reviewed fix auto-deployed, the same wording in a fresh chat listed five old tasks and saved one David funding reminder for Nov 2, 10 a.m. Eastern. The immediate “Actually, make that 2 p.m.” selected the newly saved task without a choice. “What did you set?” confirmed the same title and Nov 2, 2 p.m. Work showed exactly six tasks with the five prior tasks unchanged. This tests the actual list-plus-create artifact path. Existing automated tests supply exact-version/retry coverage; the browser run is not a full request-ID/source-version export.
- **C-01/C-04/C-05 retain their earlier observed passes. C-09 remains not_run in that run; the later C-06 pass is recorded above. C-07 and the C-08 partial/preparation evidence are recorded above.** No general specialist, physical-device or real-message acceptance is inferred.

The final operational balance was 1,182,916/1,250,000 consumed, zero reserved and 67,084 remaining. No additional grant was needed. Local proof: `/tmp/agentdesk-live-reminder-rehearsal-33915ae.txt`, `/tmp/agentdesk-live-reminder-work-33915ae.txt`, `/tmp/agentdesk-live-reminder-rehearsal-33915ae.png` and `/tmp/agentdesk-after-allowance-saved-draft.txt`. Earlier observations below are historical, including the resolved allowance stop and failures.

## Observed hosted run — November 1, 2026

Revision `08667ed`, Alex/dispositions, desktop-browser Copilot, existing configured model and spending mode unchanged. The UI showed AI configured; the provider model identifier was not exposed or independently exported. All business records were fictional. This is bounded browser-observed evidence, not a complete source-version/request-ID export, repeated reliability test or specialist benchmark.

| Case | Observed status | Evidence and limits |
| --- | --- | --- |
| C-01 | passed_observed_run | The company-email question identified Mike's current repair-source/contractor-review request, then recommended addressing that gap before another walkthrough. Inbox showed the same Nov 1, 9:34 a.m. message. Both answers were concise and grounded. |
| C-02 | partial | After the journey lookup, “Draft a reply to that” incorrectly demanded Mike's name. An explicit request saved one inspected unsent draft. “Keep it casual and shorter” produced a clearly unsaved revision; “Did you save?” correctly said no. Returning to Inbox verified the original body and 10:22 a.m. saved time unchanged. Settings still showed no writing/detail preferences. Continuity fix reached the saved draft on the follow-up revision, but allowance stopped the final answer; arbitrary saved-body editing remains unsupported. |
| C-03 | partial | One Mike repair-breakdown reminder saved for Nov 2 at 10 a.m. Eastern. The 2 p.m. correction unnecessarily asked which task after a duplicate-check lookup. Choice 1 changed the intended task; Work displayed Nov 2 at 2 p.m. The existing-task short-correction variant passed on the follow-up revision; full post-creation model retest remains pending. |
| C-04 | passed_observed_run | Copilot first recommended Mike with relationship caveats. After the reported structural-repair exclusion, it changed to a conditional fit, held the pitch pending a qualified assessment and kept the property's actual structural condition unknown. “Should I still pitch it?” received a short “Not yet” with the relevant reason. No claimed CRM criteria change or outreach. |
| C-05 | passed_observed_run | Short recommendation → requested evidence/uncertainty breakdown → short conclusion again, retaining Mike/property context. Settings afterward still showed no saved writing/detail preferences. |
| C-06–C-09 | not_run | No live permanent-memory, acquisition follow-up, manager preparation or ambiguity case completed in this run. Authored/control tests are separate evidence. |

Local browser evidence: `/tmp/agentdesk-conversation-rehearsal-08667ed.txt` and before/after saved-draft inspections. These temporary files are not a durable repository export. The source scenarios below retain their original acceptance criteria; the table records only what was actually observed.

### Follow-up at `a4d84dd`

Render auto-deployed the fix and reported Live. The same email → brief next-step/journey lookup → “Draft a reply to that” now reached the correct saved Inbox draft; inspection showed the original unsent body saved at 10:40 a.m. The final model response then stopped at insufficient operational text-token allowance (886,784/1,000,000 consumed, 113,216 remaining, zero reserved). C-02 therefore remains **partial**: correct saved effect observed, complete conversational response not accepted.

An exact existing-reminder reschedule to Nov 2 at 10 a.m., followed by “Actually, make that 2 p.m.”, succeeded without a model call or redundant clarification. Work displayed the same reminder at Nov 2, 2 p.m. This existing-task variant has **passed_observed_run**; full C-03 list→create→correct remains **partial**, with automated coverage passed and its live-model repeat awaiting allowance. No new reminder was created in this retest and no allowance or payment setting changed. C-06–C-09 remain not run. Browser records are `/tmp/agentdesk-conversation-retest-a4d84dd.txt`, `/tmp/agentdesk-conversation-retest-draft-a4d84dd.txt` and `/tmp/agentdesk-conversation-retest-task-a4d84dd.txt`.

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

**Evidence:** exact source thread/version and relevant message; both responses; source link opens the same thread. **Observed status: see the hosted-run table above.**

### C-02 — “Draft a reply to that,” then a style correction

**Role:** dispositions. **Setup:** continue C-01 only after one current thread is uniquely established.

1. “Draft a reply to that.”
2. “Keep it casual and shorter.”
3. “Did you save that version or just show it here?”

**Pass:** draft preparation uses the selected thread and current source, saves at most one intended draft, and reports it as unsent. The style correction preserves facts and uncertainty. The final answer accurately distinguishes a changed saved draft from revised wording shown only in conversation. A turn-local style correction must not silently become a permanent preference.

**Current capability distinction:** ordinary saved reply bodies can now be revised with the exact `revise_inbox_draft` tool. Package/title/CC/file drafts and recipient/subject changes remain in their own preparation or Inbox editing path. If a rewrite cannot be saved, label any preview unsaved. Do not mark the saved-edit portion passed because chat wording sounds better; inspect the persisted version and source context.

**Evidence:** before/after thread and draft versions, exact saved body, recipients, unsent state and current preference version; all three responses. **Observed status: see the hosted-run table above.**

### C-03 — Save a reminder, correct it and check it

**Role:** dispositions. **Setup:** a fresh conversation or a clearly unique task focus; inspect existing tasks to avoid a duplicate.

1. “Remind me tomorrow at 10 a.m. to check whether Mike got the repair breakdown.”
2. “Actually, make that 2 p.m.”
3. “What did you set?”

**Pass:** one owned task is saved, then that exact task is rescheduled once. The answer uses the employee's America/New_York date and offset, including daylight-saving changes, and confirms the saved local time. It does not claim an investor response, sent notification or calendar booking. If the task focus is ambiguous, ask which task before changing anything.

**Evidence:** task ID, title, owner, before/after version and ISO due time; actual displayed local time; replay has no second task or reschedule effect. **Observed status: see the hosted-run table above.**

### C-04 — A correction changes the next recommendation

**Role:** dispositions. **Setup:** current property and buyer criteria; record what is confirmed versus merely reported.

1. “Who already in our CRM fits 123 Example Street, and who would you start with?”
2. “Mike just told me he won't take on structural repairs. How does that change your advice?”
3. “So should I still pitch it to him?”

**Pass:** keeps the same property in focus, treats the new employee statement as reported evidence, and adapts the recommendation. Unknown property condition remains unknown. It neither assumes structural damage nor quietly updates approved criteria. It identifies the useful condition question or appropriate reviewed update, and does not revive the previous fit recommendation without considering the correction. No external research or outreach starts merely because the employee asked for advice.

**Evidence:** current property/criteria versions, prior recommendation, supplied correction and next recommendation; any proposal remains pending separate review. **Observed status: see the hosted-run table above.**

### C-05 — Let the employee choose the depth

**Role:** dispositions; repeat with a manager if needed. **Setup:** continue a current evidence-grounded answer.

1. “Just give me the short version.”
2. “Now show me why, including what's uncertain.”
3. “Okay, back to the quick version—what matters most?”

**Pass:** short answers lead with the useful conclusion; the requested deeper answer exposes relevant evidence and uncertainty without inventing missing detail. The third turn contracts again. It does not make the employee restate the subject or save a permanent length preference from these local requests. The saved sources remain accessible through supporting links.

**Evidence:** three outputs, current source links and unchanged saved preference version. **Observed status: see the hosted-run table above.**

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

**Evidence:** current opportunity/assignment references, exact blocker, three responses and unchanged milestone/resolution state. **Status: passed_observed_run; see current follow-up above.**

### C-08 — Management can discuss a decision without silently applying it

**Role:** management. **Setup:** Taylor's current office handoff board, including the blocked acquisition and any unassigned released property.

1. “What needs my attention this morning?”
2. “Which one would you tackle first?”
3. “Prepare that next step for review.”

**Pass:** identifies current owners and decision needs, separates blocked work from completed outcomes awaiting review, and explains prioritization briefly. The third turn uses the current uniquely selected source and supported preparation path; missing assignee or instructions trigger one useful clarification. Any prepared proposal remains distinct from an applied assignment or resolution. Private employee mailboxes are not accessed through manager CRM authority.

**Evidence:** current board counts and source versions, selected target, any preparation ID and pending status, unchanged applied assignment until separate employee review. **Status: preparation and corrected-personal-feed paths passed in separate observed runs; the full script has not been repeated as one run. See current follow-up above.**

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
