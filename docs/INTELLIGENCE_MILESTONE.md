# Relationship intelligence milestone

AgentDesk now demonstrates a coworker remembering an employee's explicit writing preferences, keeping a sourced investor journey, and changing its next recommendation when a concern is learned or resolved. This remains a fictional concept demonstration for a prospective customer; it does not imply New Western approval or access to its systems.

## What is implemented

- **Employee memory:** tone (`direct` or `warm`), length (`concise` or `detailed`), phrases to avoid and work priorities are persisted per organization, office and employee. Preferences are explicit, inspectable, editable and forgettable, with version and source text. A narrow current-message parser recognizes requests such as `Remember: I prefer short, direct messages. Avoid salesy language.` Retrieved investor notes cannot set employee preferences. Preferences are available to Copilot's model context; recommendation drafts directly apply tone, length and phrase exclusions. Work priorities are saved context, not an autonomous ranking algorithm.
- **Investor journey:** approved buy boxes, current activity and outcomes, authorized relationship history, personal debrief extractions, personal open/completed tasks and explicit employee observations form a source ledger. Each item identifies its source record, capture date where available and status: fictional fixture, reviewed record, employee report or unreviewed extraction. Capture time is not represented as an independently verified call time. Completing a task does not establish an investor response.
- **Learning and correction:** recording an objection, property pass or investor preference appends an employee report. Resolving a specific observation appends a linked resolution and retires it from active concerns without erasing the original. These observations never directly overwrite canonical CRM fields. A property pass requires an actual authorized property reference; repeated references do not become invented counts of distinct opportunities.
- **Next action:** the relationship service checks a recorded pause, outstanding reports and open follow-up work before suggesting another property. With a selected property it also checks distribution eligibility, buy-box conflicts and missing facts. The response includes the action, reasons, evidence, unknowns, writing preferences and a reviewable draft. Repair concerns prompt verification of scope/cost information and availability rather than a claim that a breakdown or walkthrough already exists.
- **Continuity:** the same scoped services are available from the dashboard and Copilot. Linked employee messaging channels use that employee's memory; provider connection and delivery remain separate. A draft does not send an investor message or authorize a CRM change.

## Repeatable presentation

Use the fictional Alex/Mike relationship with the Investor Relationship Manager entitlement enabled. No external delivery is needed. Existing data may affect the initial recommendation, so inspect the open tasks/concerns first.

1. Open Mike's investor workspace and **Relationship intelligence**. Show the source labels and current recommended next step. In Copilot, `Show Mike's investor journey` and `What should I do next with Mike?` use the same services.
2. Under **Record something you learned**, choose **Concern or objection** and enter: `Mike says unclear repair costs are holding up his next property decision.` Save. Show that the next action now addresses the repair concern and requests verified information. It does not invent prior passes, attachments, repair costs or investor readiness.
3. In Copilot enter `Remember: I prefer short, direct messages. Avoid salesy language.` Open Settings to inspect the saved preference. Refresh Mike's next step: the draft is shorter and direct, while the factual concern and its source stay the same. A fresh chat can use the same preference.
4. Record **Resolve an earlier concern**, select that specific report, and enter: `Mike reports the repair scope answered his concern; confirm his purchase timing next.` The concern remains visible as resolved evidence, and the recommendation moves to the remaining task or missing qualification information. This is still employee testimony, not independent verification.
5. Optionally select a released fictional property from the calling workspace. Show how missing disclosure/media access prevents a property-specific draft, and how missing repair/economics evidence remains explicit even when sharing is eligible. Chat property distribution copy continues through the existing Deal Package workflow.
6. Edit or forget the writing preference in Settings and refresh. The next draft uses the current version. Historical conversation text is retained; forgetting is not a claim that every historical mention has been deleted.

Do not describe a passive inference as learning. In this demonstration the employee deliberately supplies the fact or correction. The visible change in recommendation and wording is the evidence to show.

## Specialist standard and evaluation

The Investor Relationship Manager's narrow standard is to select a useful next step from authorized evidence, distinguish testimony from confirmed records, preserve unresolved concerns across property changes, retire explicitly resolved concerns, apply saved style, and withhold ineligible property copy. Missing evidence must remain missing; apparent fit is not a profit forecast or a claim of investor interest.

Regression cases cover new concern → changed next step; explicit resolution → stale concern retired; style correction/forget → changed next draft; ambiguous debrief → unreviewed evidence only; completed task → no invented investor outcome; paused investor → timing confirmation; fit conflict → qualification review; property gating → no draft; scoped access and entitlements; event replay → no duplicate report. These are behavioral acceptance checks, not evidence of a measured sales improvement.

For a future generic-AI comparison, hold the fictional case, available evidence and requested outcome constant. Blind-review each answer for: relevant objection recall, correct source attribution, handling of missing facts, useful next action, unsupported claims, sharing eligibility and edits needed to use the draft. Record the full outputs and rubric results. No superiority over a generic model or real-world conversion/retention benefit has been established by this milestone.

## Architecture and access

`src/server/memory.ts` owns explicit employee memory; `src/server/journey.ts` owns the ledger, employee observations and recommendation rules. Migrations 010/011 add these records without replacing CRM tables. `src/lib/memory-contracts.ts` and `src/lib/journey-contracts.ts` are shared browser/server contracts. `memory-journey-api.ts` runs behind the main route's authentication, request protections and error handling.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/memory` | Read the current employee's preferences |
| `PATCH /api/memory` | Explicitly update allowed preference fields; optional expected version |
| `DELETE /api/memory` | Forget saved values and sources; retain a new version/tombstone |
| `GET /api/investors/:id/journey` | Read current scoped evidence with Core entitlement |
| `POST /api/investors/:id/journey/observations` | Append an owner/office-manager report or explicit resolution using an idempotency key |
| `POST /api/investors/:id/recommendation` | Prepare a next step, optionally with `propertyId`; requires the relationship specialist |

Journey access follows authorized investor scope. Office-shared investors remain read-only to other employees; only the owner or authorized office manager can record observations. Private debriefs and personal tasks remain private even when a manager reads the investor. Property-linked reports disappear from the requesting employee's journey when property access is revoked. Personal preference memory is not shared with managers. Audit entries store operation metadata, not observation bodies or preference source text.

Recommendation calculation does not require purchasing Buyer Matchmaker or Deal Marketing as additional dependencies. Property-specific drafts use the equivalent current release, disclosure and media-recipient checks; they create no package or delivery. The chat recommendation tool accepts only an investor, so property distribution copy uses the existing package flow and its approval/revalidation behavior. Structured property/debrief references support existing historical-chat access redaction.

## Limits

The next-step service is a deterministic, source-based workflow with controlled draft templates. An OpenAI-backed Copilot can use its evidence and employee context, but this milestone is not a set of independently trained expert agents. The full specialist roster remains intact with its existing readiness labels. There is no automatic learning from every draft edit, no broad personality profiling, no independent confirmation of employee reports, and no established generic-AI advantage. Broader live-provider evaluation, genuine customer data, specialist comparisons and production identity/infrastructure remain separate work. Voice uses saved preferences but currently does not capture preference commands from speech.

Read `docs/PROGRESS.md` for the root integration's final verification results; this specification does not assert live provider validation or deployment.

## Verification commands

`npm run test:intelligence` runs the compiled application against a disposable fictional database with AI and outbound transports disabled. `node --import tsx scripts/rehearse-intelligence.ts --live` explicitly opts into two billable AI turns (at most six requests), writes a local report, and removes its temporary database. It changes neither the active workspace nor the configured production model defaults. Review the full outputs and receipts; a successful request alone does not establish useful reasoning.
