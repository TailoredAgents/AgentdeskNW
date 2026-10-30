# Finish routine work in the conversation

This milestone lets an employee complete, cancel, snooze or reschedule a personal task in typed Copilot, Slack or SMS. It also supports an explicit investor-concern resolution. The same services power the Work queue and conversational actions; the conversation does not bypass record access, subscription access, version checks or CRM approval.

All supplied demo people and records remain fictional. Live Slack/Twilio account configuration and real delivery acceptance are still pending. This document describes implemented behavior, not a claim that those accounts are connected.

## One ongoing Copilot

The dashboard's default first message opens the employee's ongoing Copilot conversation, the same one used by linked Slack and SMS. The **Continue phone and Slack conversation** control returns to it. Selecting **New conversation** deliberately starts a separate chat; it does not merge every conversation into one history. Writing preferences remain employee-wide, while short references such as “it” are resolved within the selected conversation.

Slack and SMS transport the employee's requests to the same dispatcher as web Copilot. Linked-channel notifications respect the employee's reminder setting, quiet hours, subscription/allowance and current permissions. They do not send messages to investors. Long replies retain a concise preview and a link to the saved answer when the configured channel origin is available.

## Supported requests

| Say this | What happens |
| --- | --- |
| `Show my open reminders.` | Lists the employee's current personal tasks. |
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

The application saves structured references to tasks it actually returned, including their current versions. A recent turn with one task can support “it.” A turn with several tasks, or several subsequent reminders, requires a choice. Pending numbered choices expire after 15 minutes; ordinary task references expire after 24 hours. Changing a task, closing it, losing access or changing membership makes its old reference unusable.

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

After actual channel configuration, repeat with a message in SMS, a reminder/reply in Slack, and the ongoing dashboard conversation. Confirm real provider receipts, delivery status and the correct task in each step. Automated transports can verify the software path but cannot establish carrier delivery or employee experience.

## Current boundaries and verification

The new edit and concern-resolution commands are available in **typed** Copilot, Slack and SMS. Voice continues to use its existing supported tools; these task edits are not yet accepted from spoken transcripts. Real audio acceptance, actual Slack/Twilio setup, calendar/email/file integrations, bulk task edits, recurring task schedules and CRM approvals within channels remain separate work.

Personal task reads and edits remain employee-owned, including for managers. Office management views do not give the assistant authority to change another employee's personal task. Unlinked or disconnected identities, missing subscription access and stale records remain blocked by the services.

Focused tests cover request intent, ambiguity, numbered choices, replay, task versions, Eastern dates and DST, midnight clarification, concern provenance and channel delivery ordering. `npm run test:conversation` runs the compiled HTTP workflow with a disposable database and external providers disabled. See `docs/PROGRESS.md` for the final verification and release status of the integrated milestone.
