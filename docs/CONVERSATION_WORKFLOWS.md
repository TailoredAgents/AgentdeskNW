# Finish routine work in the conversation

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for completion status, development order and the next checkpoint. This is the shared-conversation behavior specification, chiefly supporting C1 and the native C2/C3 surfaces. It does not define another delivery sequence.

The verified committed baseline through `2d16665` lets an employee complete, cancel, snooze or reschedule a personal task in typed Copilot, Slack or SMS. It also supports an explicit investor-concern resolution. The same services power the Work queue and conversational actions; the conversation does not bypass record access, subscription access, version checks or CRM approval. Durable-job conversation commands, native transport and notification infrastructure have local integrated acceptance, described below; real transport/device acceptance remains separate.

All supplied demo people and records remain fictional. Live Slack/Twilio account configuration and real delivery acceptance are still pending. The product direction is a primary native app for iPhone/Android, included in the workforce subscription; optional employee SMS is provisionally $19/month. New Western does not currently use Slack, so that retained channel is lower priority. Desktop remains available for detailed work. These decisions do not imply the native draft is released.

## Conversational presentation and focused replies

The master’s text/voice instructions now use brief natural answers for ordinary exchanges, with explicit depth on request and saved employee preferences respected. Specialist methods guide the reasoning, not a mandatory report format. No generated answer is mechanically truncated for style. Web/native supporting source links collapse separately from primary drafts, tasks, jobs and decisions; a sole result remains directly available.

Typed Inbox preparation accepts short explicit follow-ups such as “Draft a reply to that” after one current, scoped thread is uniquely established. It may cross up to two replies to recognized short continuations such as “what would you do next?” when they have no substantive artifacts or contain only investor/journey briefing artifacts with exact IDs matching the original thread's current investor association, plus harmless guidance. A generic investor list, different investor, competing task/property/work, or new topic stops traversal. The original Inbox anchor must contain only that thread and optional guidance; mixed-subject answers cannot establish an omitted target. The original source must remain visible, younger than 24 hours and at the same thread version. Channel follow-ups additionally require accepted/delivered replies before the inbound timestamp. No hidden raw text or model-chosen thread grants authority. Ambiguous references need a focused clarification, without requiring a particular phrase or a repeated name when current focus is clear. This is bounded continuity, not arbitrary-topic resolution.

Short task corrections such as “Actually, make that 2 p.m.” resolve only the current owned structured task focus and shown subject. When one completed answer contains a task list followed by a single saved task action, the exact completed turn's stored action event may identify that task despite the earlier duplicate-check results. Prose, artifact order or an old action cannot do so; two changed tasks still require a choice. A time-only correction keeps its existing date; a task without a date needs clarification. Ambiguous or stale references, missing channel delivery and DST ambiguity still require resolution. An explicit new date uses the existing Eastern date parser. Wording changes such as “make it 2 sentences” do not become task edits.

A casual/shorter wording request is not a permanent memory command. Explicit rewrites of one current saved ordinary reply now use `revise_inbox_draft`: the model reads the saved body and source context, then supplies a complete replacement body with exact thread/draft/source references. Short requests such as “Keep it casual and shorter” require a uniquely shown current draft; named requests must identify one permitted conversation. Preview-only, quoted, hypothetical, ambiguous and stale requests cannot save. Sender, recipients and subject stay fixed; CC, files, property packages and title drafts use Inbox or their dedicated preparation. The result stays Copilot-authored and unsent. Source freshness does not verify the generated wording; exact employee content/recipient review remains necessary before a simulation. Current source changes retire old rewrite history and reviews; a retry cannot overwrite a later edit. Conversational wording alone never proves persistence or delivery. Use [CONVERSATIONAL_REHEARSAL](CONVERSATIONAL_REHEARSAL.md) for authored multi-turn acceptance cases; actual model results are recorded separately.

## One ongoing Copilot

The dashboard's default first message opens the employee's ongoing Copilot conversation, the same one used by linked Slack and SMS. The **Continue phone and Slack conversation** control returns to it. The native client joins that same employee-owned conversation through the shared server. Selecting **New conversation** deliberately starts a separate chat; it does not merge every conversation into one history. Writing preferences remain employee-wide, while short references such as “it” are resolved within the selected conversation.

Slack and SMS transport the employee's requests to the same dispatcher as web Copilot. Linked-channel notifications respect the employee's reminder setting, quiet hours, subscription/allowance and current permissions. They do not send messages to investors. Long replies retain a concise preview and a link to the saved answer when the configured channel origin is available.

## Answering a saved job

A supported job can ask for missing information and wait without losing its progress. App/web Work and the ongoing conversation share the same versioned answer service. Use the displayed `Answer Q…: …` command across configured employee channels; an exact property/investor selection also works as the immediate reply to one current question. Ambiguous, obsolete or early-arriving replies do not select another job. A supplied answer remains unverified data, cannot approve spending and refreshes the whole-job estimate before continuation. See [WORK_EXECUTION.md](WORK_EXECUTION.md#saved-questions-and-continuation).

## Shared handoff review

“Show office handoffs” and the read-only `handoff_overview` tool retrieve current authorized assignments, acknowledgment, blockers and outcomes. Managers see their office; employees see only their current release-authorized assignment. Links open desktop/native Work. Current board references participate in saved conversation/work provenance and invalidate obsolete assessments. Assignment/report/resolution still use reviewed Work actions; full conversational handoff execution and general clarification are not implemented by this read tool. See [MANAGEMENT_HANDOFFS.md](MANAGEMENT_HANDOFFS.md).

## Native personal follow-ups

Native Work now has My follow-ups and history, using the same owner-only list/read/PATCH task services. Inbox’s saved follow-up and Agent task artifacts open its exact detail. Employees review completion, cancellation, a two-hour snooze, a device-local custom date/time or removal of a reminder date before saving. Polling preserves the reviewed version; competing changes disable stale confirmation, and the server checks it again. Uncertain responses offer an explicit retry with the same operation ID. The original Inbox link is returned only after rechecking current private source access. Losing that source does not erase the separately saved task. Task completion does not resolve an investor concern or establish a transaction outcome.

This is local/browser acceptance, not installed-phone lifecycle or offline recovery. No new conversational grammar or provider transport is introduced by these controls.

## Committed personal-task and concern requests

| Say this | What happens |
| --- | --- |
| `Show my open reminders.` | Lists the employee's current personal tasks. |
| `Show my open reminders, then remind me tomorrow at 10am to check David’s funding.` | A clear task-list request followed by an explicit reminder instruction can save the requested task in the same turn. Quoted/conditional read-then text and negative creation instructions do not authorize it. |
| `Complete Call Mike about repair scope.` | Completes one uniquely matching open task. |
| `Can you mark that reminder as done?` | Uses a current, unambiguous task reference; otherwise asks which task. |
| `I finished the task Call Mike about repair scope.` | Records completion of that task, without inventing an investor response. |
| `Move it to tomorrow at 9am.` | Reschedules the current task and reports the exact new date and Eastern time. |
| `Move the reminder to call Mike to Friday at 2pm.` | Resolves the named task and requested deadline; multiple matches require a choice. |
| `Snooze it for two hours.` | Sets its next deadline to two hours from processing time. |
| `Cancel the reminder to call Mike.` | Cancels a uniquely identified task and stops its scheduled reminders; keeps history. |
| `2` | Selects the second task in a recent clarification, preserving the action originally requested. |
| `Resolve Mike’s repair-cost concern: he confirmed the breakdown answered it.` | Links an employee-reported resolution to exactly one matching open concern. |

Task names can be matched by exact title or a sufficiently specific contained phrase. Names that match several tasks do not authorize changing all of them. A bare “done” without a trusted reference asks for a choice, even when only one open task happens to exist. Quoted recaps, hypothetical statements and explicit negative instructions are not task commands.

The recognition layer intentionally supports a bounded set of useful phrases. Unsupported dates or incomplete actionable requests produce a clarification instead of letting the model guess. Broader phrasing can be added without weakening target selection.

## How short replies stay attached to the right work

The application saves structured references to tasks it actually returned, including their current versions. A recent turn with one task can support “it.” A turn with several tasks, or several subsequent reminders, requires a choice, except for the short time-correction case above when the exact completed turn proves one current saved task action. Pending numbered choices expire after 15 minutes; ordinary task references expire after 24 hours. Changing a task, closing it, losing access or changing membership makes its old reference unusable.

For channel messages, the system distinguishes work saved in the conversation from a reply the provider accepted. A queued, failed or delivery-unknown reply does not establish the context for a subsequent “2” or “done.” Reminder context requires an accepted/delivered provider receipt for the exact current task revision. Context received after an incoming message cannot retroactively become that message's target; equal timestamps are treated conservatively.

**Provider acceptance is not proof that the employee read the message or that a handset received it.** SMS delivery status is tracked separately. The app still asks when several valid references could apply.

## Dates, state and retries

- The current scheduling timezone is **America/New_York**. Responses state the actual resulting date/time. This is not yet a per-employee timezone preference.
- `Tomorrow` without a new time preserves the task's existing Eastern time. A task without a deadline needs a time clarification. A follow-up such as `9am` preserves the original requested calendar day even if the clarification crosses midnight.
- Supported dates include today/tomorrow, weekdays with a time, `YYYY-MM-DD` with a time, and an ISO timestamp with an explicit UTC offset. Use am/pm or 24-hour `HH:mm` notation; a bare `9` does not silently mean 9am.
- Daylight-saving changes preserve local wall time. A nonexistent spring-forward time or duplicated fall-back time requires clarification rather than silently choosing an instant. An explicit timestamp/offset can disambiguate it.
- Snoozing accepts one minute through 30 days and starts from the time the action is processed. A reported deadline must still be in the future.
- Completed and canceled tasks remain available in history. They cannot be silently reopened by rescheduling; create another task for further work. Canceling is not deleting.
- Task versions prevent a stale action from overwriting a newer change. Stable request/event identifiers prevent a retry from performing the same mutation twice or reverting newer work.
- Rescheduling/snoozing retires old queued reminder notifications and creates a new reminder revision. The worker checks the current revision again before sending. A completed or canceled task does not continue to generate reminders.

## Investor concern resolution

A resolution must identify the investor, match one open concern and include what answered it. The original report remains in the investor journey and the new resolution points to it. The record is labeled **employee reported**; it is not independent verification or an approved change to canonical CRM buying criteria.

If several concerns match, Copilot asks for a more specific concern. If the explanation says it is still unresolved or not addressed, Copilot asks for clarification. Task completion by itself does not resolve an investor concern or establish an investor's interest. CRM proposals and approval remain in the existing review workflow.

## Repeatable demonstration

Use the fictional dispositions employee and a future task deadline. No external account is needed for the web demonstration.

1. In **Work queue**, create `Call Mike about repair scope` with a deadline. With the live AI configured, an explicit reminder-creation request can also use the existing create-task tool.
2. In Copilot, say `Snooze Call Mike about repair scope for two hours.` Confirm the named task and new deadline.
3. Say `Move it to tomorrow at 9am.` Confirm the updated time in both the response and Work queue.
4. Say `Done.` Verify the task remains in completed history and its version has advanced.
5. Create two open tasks with overlapping names, such as `Call Mike about inspection` and `Call Mike about paperwork`. Say `Cancel the reminder to call Mike.` Choose the intended number and verify only that task changed.
6. Say `Remember an objection for Mike: Repair scope was unclear.` Then say `Resolve Mike’s repair concern: he confirmed the breakdown answered it.` Inspect the linked resolution and updated recommendation. If an earlier rehearsal left several matching concerns, use the specific concern instead of assuming which one applies.

After actual channel configuration, repeat across SMS and the ongoing dashboard conversation. Slack is an optional retained-channel acceptance run, not a prerequisite for New Western's mobile/SMS experience. Native continuation belongs to C2/C3 device acceptance. Confirm real provider receipts, delivery status and the correct task in each exercised channel. Automated transports can verify the software path but cannot establish carrier delivery or employee experience.

## Durable-job conversation controls — local acceptance

C1 now includes pre-model employee commands for job lists/status, pause/resume/cancel, exact cost review and approve/deny decisions. A short W reference identifies a scoped job; an A reference identifies an immutable cost review for one employee/conversation, plan version, quote and maximum. Ambiguous assent cannot authorize spending. Limited dispositions-starter corrections can add/remove fictional research or change the selected investor while preserving completed results. See [WORK_EXECUTION.md](WORK_EXECUTION.md) for the exact contract and supported examples.

Short commands such as `Pause that job` require one current structured job reference, no competing task and suitable channel delivery timing. If access changes and a work artifact is withheld, a bare `Cancel it` asks for a fresh job selection. Restricted jobs are omitted from choices, and the command cannot fall through to an older personal task. The regression exercises the actual mobile chat dispatcher and verifies no mutation or source disclosure.

Native reviewed dictation submits an employee-confirmed transcript through the typed dispatcher. It does not establish live spoken-command parity. General plan correction, broader missing-information continuation and the complete mobile review/Inbox experience remain roadmap acceptance requirements.

## Current boundaries and verification

The committed edit and concern-resolution commands are available in **typed** Copilot, Slack and SMS. Current live voice uses its existing supported tools; its provider transcripts do not execute these edit commands or the durable-job commands. Native dictation's reviewed typed submission is a different path. Real audio/device acceptance, actual Slack/Twilio setup, live calendar/email/file integrations, bulk task edits, recurring task schedules and CRM approvals within channels remain separate requirements in the canonical roadmap.

Personal task reads and edits remain employee-owned, including for managers. Office management views do not give the assistant authority to change another employee's personal task. Unlinked or disconnected identities, missing subscription access and stale records remain blocked by the services.

Focused tests cover request intent, ambiguity, numbered choices, replay, task versions, Eastern dates and DST, midnight clarification, concern provenance and channel delivery ordering. `npm run test:conversation` runs the compiled HTTP workflow with a disposable database and external providers disabled. [PROGRESS.md](PROGRESS.md) preserves historical verification evidence; [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) owns current acceptance and release status. Integrated local/browser and mocked-channel checks passed for the bounded controls; actual carrier/Slack delivery and installed-phone acceptance remain pending.

## Wholesaler opportunity context

Acquisitions/management can ask “Show my wholesaler opportunities” through the shared conversation. Read-only `opportunity_review` retrieves the authorized board or one detail; Agent links open native New opportunities or desktop Work. The same evidence is available to composed jobs through `review_opportunity`. Employee-reviewed creation/revisions stay in Work; no source statement, model argument or follow-up draft authorizes an inventory change or delivery. Current opportunity fingerprints protect saved conversation/tool/work context. See [acquisitions intake](ACQUISITIONS_INTAKE.md#pre-inventory-wholesaler-opportunities).


## Original reasoning controls

The shared employee conversation accepts exact **Pause S…**, **Continue S…**/**Resume S…** and **Revise S…: updated remaining instructions** commands. They select an existing owned spending review and do not invoke another model turn. Pause is accepted while the original response is running, then acknowledges a saved boundary before tools or further generation. Continue/revise wait until the original host has returned. Vague/quoted commands do not identify a spending decision.

A revision retains the original request, prior actions and incurred charges, replaces unused reasoning scope, and returns a new S review. Above-$1 revised work needs the exact R approval or full app review. Continuing unchanged work retains a still-valid prior approval. The same API and command services serve web, native text/dictation, configured SMS and Slack. Text controls are not live voice parity. Unknown outcomes and changed protected business context require separate recovery; existing delegated job plans are revised through their own supported controls.

## Phase 3 result navigation and interrupted replies

`GET /api/chat/requests/{requestId}?conversationId={conversationId}` is an authenticated read-only reconciliation endpoint. It validates the employee’s conversation and original turn, returns the current protected conversation and distinguishes missing, running/interrupted and completed responses. It never creates, claims, resumes, bills or re-executes a turn. Recovery does not bypass source invalidation in saved history.

Desktop pending requests remain in their employee-scoped session storage; native uncertain requests remain in the current mounted session. Different instructions cannot silently replace their identity. A completed saved result permits the next request; unavailable/running work retains explicit exact retry or existing job/recovery review. Mobile sign-out/background privacy rules and lack of an offline request queue remain unchanged.

Short channel replies may link to one current saved artifact. Multiple distinct targets retain the conversation link. Excerpts always link to the complete saved reply; if a focused link would truncate an otherwise complete cost decision, the complete conversation-linked review wins. Link parsing is allowlisted and navigation-only. Private record, recipient and job authority is checked again by the destination service.


## Saved-response recovery

Browser and native clients retain the original request/body while its outcome is uncertain. Malformed HTTP-success bodies and mismatched conversation envelopes cannot clear that identity. A confirmed response is published immediately and invalidates older read tickets, so a failed or delayed background refresh cannot hide it. Checking is read-only: `GET /chat/requests/:requestId` resolves a first-turn conversation from the authenticated employee's persisted request, or returns `not_found` with no conversation and no side effect. An optional known `conversationId` keeps exact mismatch rejection. Lookup enforces current organization, office, owner and source visibility; it never creates/retries/resumes work or changes the original request hash. Not-found/running checks retain pending identity; only a validated completed response clears it. Employee-chosen retry uses that exact original body. New unrelated work is held until uncertainty is resolved. Missing linked conversations get a targeted read check rather than a false empty-chat state. Native list retry likewise reads current saved data without repeating an action.
