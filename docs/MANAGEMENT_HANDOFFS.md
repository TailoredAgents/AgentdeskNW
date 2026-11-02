# Shared handoff coordination

Updated November 2, 2026. This C4 specification supports [the canonical roadmap](IMPLEMENTATION_ROADMAP.md); it is not a competing schedule. The bounded workflow uses fictional operational records. Management practitioner acceptance and company procedure approval remain pending.

## Management reporting contract — November 2

The owner requested management visibility into dispositions/acquisitions work, business effectiveness and data control, then authorized development while leaving meeting timing to them. The first current-business reporting increment is implemented; period/outcome performance analytics remain separate. Build order/status live only in the roadmap's M1–M6 sequence.

### Questions and first-report boundaries

The first increment answers: what needs attention in my authorized office, which role/employee owns it, what evidence explains the blocker, and what reviewed next step is available? Keep outcomes, current workload and AI use separate. It does not observe work outside connected/recorded sources, rank employees, infer effort from prompt counts, or determine employment outcomes.

Use one server-owned report for the manager UI, model tool and saved office-priority work. Do not independently total bootstrap data in the UI. The old Team overview mixed personal usage with office counts. Its replacement uses `getManagementReport` through `/api/management-report`, `team_overview` and `office_priorities`. Private job/approval payloads and personal-only reminders are excluded. AI usage stays in Credits & billing; the management report does not imply missing usage is zero.

| Measure | Definition/source for the first report | Interpretation and exclusions |
| --- | --- | --- |
| Current recorded relationships | Current permitted investor records grouped by current owner | Workload context only; not acquisition production, contacts made or sales success |
| Recorded follow-ups needing attention | Currently permitted open business-linked tasks and recorded due dates, excluding personal-only reminders from shared reporting | A missing date is undated, not overdue. Completed task status is reported completion, not customer reply or closed deal |
| Acquisition opportunities | Current authorized pre-inventory intake records, current revision, supplied/verified labels and missing required facts | Reviewing and not-pursuing remain distinct; saved intake is not published inventory or verified valuation |
| Shared handoff attention | Existing current-source active assignments, overdue deadlines, missing acknowledgment, reported blockers, reports awaiting manager review and reviewed resolutions | Denominators and overlaps follow handoff method v4. Exclude changed/withdrawn sources from current performance totals and label them separately |
| Available inventory/releases | Current permitted property/release status and separate recorded targets | A release is not a sale. A past closing target prompts reconfirmation; no inferred reservation, deposit or closure |
| AI/work usage | Excluded from this report; existing Credits & billing remains the usage surface | Usage is not effectiveness or time saved. A future shared usage projection needs its own explicit unit/scope/coverage policy |

Report each metric with its definition, as-of time, current scope, coverage, applicable denominator and evidence IDs resolved through current access checks. Return missing/unavailable coverage distinctly from a measured zero. Tie employee attribution to the actual record owner/assigned employee; roles alone do not prove work performed. A manager's approved action is attributed to that manager, not silently credited to the employee. Do not sum overlapping categories or treat retries as distinct work.

### Sources, events and time

Start with existing permitted business records and immutable handoff/intake events. Inventory history before adding a generic activity stream. Any new events must be written atomically with the actual domain mutation, use stable scoped identities and distinguish event time from capture time. Keep only minimal source references, actor, event kind and version; no private content snapshots or model-authored outcome events. Exact retry, source correction, reassignment, withdrawal and departure must preserve their original provenance without double counting.

First-report snapshots do not establish weekly trends. Optional period measures require equal closed date windows, an explicit reporting timezone, a comparable eligible cohort and sufficient supported history. Show observed counts and denominators together. An empty or partial period is not a zero-percent conversion rate. Late-arriving records and corrections must be labeled; compare only currently permitted sources. Do not retain hidden historical aggregates to evade changed access. Company-wide office comparisons require a separately authorized executive scope; manager status remains office-scoped.

Fictional historical examples may be authored only by explicit versioned demo fixture tooling. Label those events as authored sample history and preserve original event/capture provenance. Do not backdate actual user actions, reset existing fixtures, reopen resolved work or silently replace employee edits. A small coherent sample should cover a disposition follow-up, acquisition missing facts, blocked handoff, reported completion awaiting review, reviewed resolution and a changed source. Denied-scope examples belong in disposable tests, not a browsable management list.

### Drill-down, Agent and follow-through

Team overview should present office scope/as-of, role filters, an employee workload list and an attention list. Open a card to the exact permitted evidence and existing action screen. Role-specific missing-data and empty states are required. The responsive phone view uses the same records; graphs are secondary to readable next steps.

Copilot should answer questions such as “What is holding up this office?”, “What is Jordan waiting on?” and “Which handoffs need my review?” with the same counts and current source references. It may prepare an existing scoped handoff proposal; authenticated review still applies it. An answer must distinguish preparation, acknowledgment, employee report and manager resolution. Unsupported comparisons should explain missing coverage and offer the available current report.

Bind model/history/derived-work references to current report scope, versions, permitted source sets and relevant time boundaries. Source correction or lost access retires stale summaries and navigation; a generated report cannot grant access. Bound rows and show truncation/coverage rather than claiming a partial list is complete. Aggregate-only billing/usage information must not become private message or job evidence.

### Implemented first increment

`ManagementReport` is re-exported by the shared browser/server contract. The service runs in a synchronous SQLite read transaction, authenticates the current manager and Team Performance entitlement, restricts CRM sources to the actual office even when broader sharing is enabled, and builds totals before bounded source pagination. Role/employee/metric filters never accept tenant IDs or caller prices. Invalid employee selection is unavailable, not a leaked identity. Opportunity restrictions return `null` for both metric and employee counts; other supported empty sets return zero. Missing/unavailable ownership remains an unattributed office record, never a guessed employee.

Ten current measures cover relationships, open and overdue buyer follow-ups, reviewing opportunities, blocked/awaiting-review/unassigned/changed/resolved handoffs, and inventory. Four main cards keep phone navigation compact; additional measures expand below. Source pages contain at most 40 records with total/offset/next-page coverage. Handoff evidence over 4,000 characters is explicitly an excerpt; the exact current source remains available. A buyer follow-up opens its permitted relationship, not another employee's private task editor. Opportunity and handoff links open their current scoped screens. Dates display the browser timezone abbreviation; no date-range series is claimed.

A stable `managementAccessReference` binds the current scope, identities, business-source versions/content, reporting definitions and date-sensitive classifications. Worker/browser actor property order cannot change this identity. Company binding versions are included when that sign-in mode is selected. History, model/voice context and saved work recheck the reference; receipts remain immutable. Private-only reminders do not alter it. The legacy shared task list/bootstrap also omits colleagues’ personal-only reminders and tasks linked to unavailable/out-of-office investors; an employee still sees their own personal reminders. Legacy office-priority outputs without this reference require a fresh report, and the old office-summary artifact is withheld without affecting ordinary handoff preparation history. Specialist-method revision is `2026-11-02.1`.

Existing additive fictional buyer/Preview Lane fixtures are reused without resets or backdated activity. Disposable cases exercise blocker → employee completion report → separate manager resolution, exact retries, changed sources, due boundaries, role/office restrictions and source pagination. This reporting increment adds no generic activity collector, provider call, message, CRM mutation or employee scoring. The report is read-only; existing authenticated handoff reviews remain the only follow-through mutation path.

### Later outcome reporting and validation

Define real performance reporting with company practitioners after source approval: investor response time from authorized communication event metadata; qualified opportunity cohorts; conversion stages supported by reviewed outcomes; explicit closing records; agreed acquisition/disposition revenue attribution; and measured task-time baselines. New private-source aggregates need an explicit company reporting policy and a minimal authorized projection, not a blanket manager mailbox grant. Do not display conversion, revenue, saved hours or an employee effectiveness score until their source/definition/coverage is available.

Acceptance for the first increment includes independently expected counts, identical UI/tool results, overlap/zero/missing-data cases, source versions, denied office/employee scope, private-source exclusions, revocation, actor attribution, duplicate retries and current saved-work replay. At least one normal and one changed-fact journey must end with inspectable fictional records. Record service/transport tests separately from actual model and practitioner effectiveness. Reporting does not establish production security certification.

## Purpose and supported workflow

Management can identify a released opportunity with no tracked acknowledgment, an approaching recorded closing target, an overdue follow-up, a blocker, or an outcome needing review. The review identifies the release owner, current stage/version/source, responsible employee and actual recorded dates. “No acknowledgment recorded here” does not assert that nobody acknowledged the deal elsewhere. The seven-day closing review window is explicitly provisional, not an official company deadline or sales-performance metric.

Desktop **Work queue → Copilot jobs → Shared handoffs** and native **Work → Handoffs** share one service:

1. A manager reviews and assigns a specific next step and future deadline to an employee who already has release access.
2. That employee acknowledges the exact assignment/version.
3. The employee records a blocker or completed next step, with an outcome note and operational evidence reference. Evidence is employee-supplied text, not a fetched or independently verified document.
4. A manager reviews a reported completion and records a separate resolution. Blocked/unreported work cannot be resolved by this action.
5. Reassignment or a fresh assignment preserves history and resets acknowledgment/outcome. A release revision requires a fresh assignment; earlier resolution does not silently carry forward.

This records internal coordination only. It does not send employee/investor messages, alter transaction stages, confirm title/closing, update investor CRM, change a personal reminder, or charge credits. Completing a personal task is not an acknowledgment or outcome. Assignment notifications and proactive escalation remain C5 work; employees currently find assigned work in Work or ask Copilot.

## Master-agent and channel behavior

The read-only `handoff_overview` tool returns the employee’s currently authorized board and a Work link. The local demonstration recognizes requests such as “Show office handoffs.” The existing manager `team_overview` and durable `office_priorities` capability include the same evidence; no new paid worker capability/rate is added. Typed app/web and configured employee messaging share the dispatcher. Native Agent artifacts open Handoffs; desktop links open the shared Work view.

Assignment, acknowledgment, reporting and resolution remain explicit reviewed screen/API actions. There is no model write/approval tool or claim of complete SMS conversational execution. Read-only web voice uses the same current scope fingerprint, but no live audio/channel acceptance is claimed. General missing-information continuation and broader conversational work controls remain C1.

## Access, versions and recovery

- Every request rechecks current organization/office membership. Managers see office releases and coordination; another employee sees only their current assignment while retaining current release access. Release ownership alone does not grant someone else’s coordination record, and a coordination assignment never grants release access.
- Assignment and resolution require manager role, core and Team Performance entitlement. Employee acknowledgment/report requires core access and the current assignment. Historical reads remain scoped; private conversations/mailboxes are not queried by the handoff service.
- `GET /api/handoffs` lists the board, `GET /api/handoffs/:releaseId` returns detail, and `POST` accepts a strict discriminated action with expected release/follow-up versions and an employee-scoped event key. No client organization/role/price can grant authority.
- Exact retries return current authorized state without duplicating an event. Conflicting reuse and stale writes fail. Withdrawal/draft status blocks new coordination actions; removing source access or reassigning hides the prior assignee’s record.
- Polling rechecks the evidence and disables obsolete reviews. Exact decisions bind the original source and follow-up version. An uncertain result offers explicit same-action retry, including inside the review dialog. Native navigation guards unsaved forms. UI state is memory-only and is cleared on backgrounding; no offline recovery is implemented.
- A stable, actor-scoped board fingerprint covers source versions, assignments, history, current action authority, method revision and deadline attention state. Copilot display/replay, model scope, voice scope, immutable work provenance and saved work outputs recheck it. Changed evidence withholds obsolete content without deleting receipts. This conservative board-level invalidation requires a fresh review; it does not automatically regenerate a job or selectively refresh one sentence.

## Persistence and method

Additive migration **025** creates `handoff_coordination` (one current record per scoped release) and `handoff_events` (immutable actor/action/version snapshots and scoped idempotency). Composite foreign keys bind the release and actor membership. Mutations and safe audit metadata commit in one transaction. Existing tasks, releases, correspondence, wallet and job records are not migrated or repurposed.

The initial provisional code-owned method was `handoff-follow-through`, version 1, source `2026-10-30.1`; subsequent revisions are recorded below. Its approach is to inspect current operational evidence, identify the missing acknowledgment/outcome, assign the smallest useful next step and require an explicit outcome review. This deepens the demo Team Performance Assistant; registry readiness remains unchanged. It does not establish official company policy, expert judgment or competitive superiority.

## Acceptance and unfinished scope

Thirteen service/conversation tests cover sourced gaps, actor/office/tenant boundaries, current membership, assignment authority, acknowledgment, evidence requirements, blocked outcomes, separate resolution, replay, stale versions, source revision/withdrawal, private-task separation, and stale work/history/voice context. Two mobile client cases cover current decision authority and evidence-backed report parsing. The new 52-check isolated HTTP/worker suite covers scoped phone sessions, cross-surface manager/employee decisions, Copilot links/history, durable reviews, reassignment and revocation with unchanged investor/provider state.

A disposable copy of the prior accepted schema-024 database upgraded to 025 with all **316 prior rows across 89 tables preserved**, clean integrity and no foreign-key violations. The active database was not used. Browser/phone-width acceptance and final release-wide checks are recorded in [PROGRESS.md](PROGRESS.md). Native binaries, actual devices, notifications, role usefulness testing, external documents and company connections remain unaccepted. Workload analysis beyond current sources, flexible standing authority, broader coordination cases and measured employee effectiveness remain roadmap work.


## Conversational preparation and pre-inventory sources — October 31

Provisional method v2 extends the same reviewed coordination to saved pre-inventory acquisition opportunities. Separate opportunity-handoff tables reference the actual opportunity. Status remains `reviewing` or `not_pursuing`; it is never converted to a released property. The acquisition owner is the eligible assignee; assignment cannot expose an intake to dispositions or another acquisition owner. Source revisions retire old acknowledgments/outcomes until a fresh reviewed assignment. Withdrawing pursuit stops actions. Existing release-backed coordination is preserved.

`prepare_handoff_action` lets the master prepare an assignment, acknowledgment, evidenced report or management resolution using exact current source/follow-up versions. It does not execute that action. Desktop/native Work shows the private proposal and its source, employee, instructions, deadline and implications before applying. The server rechecks permissions, eligible assignee, future deadline, version and state. The immutable employee decision and resulting coordination event commit atomically. A blocked employee report cannot be resolved as completed, and a manager cannot acknowledge an assignment on behalf of its employee. Current preparation status is available through `review_prepared_actions`.

Handoff labels distinguish Opportunity from Release. The legacy source identifier/version field names remain for route compatibility; scoped readers and history/work provenance recognize both real source types. A handoff follow-up remains distinct from investor messaging, private mailbox/file access, valuation, inventory promotion, title status and completed transactions.


## Phase 2 — defined operational metrics and priority

Handoff method v3 (`2026-10-31.2`) returns a current authorized snapshot: visible/active sources, unassigned active sources, current-source active unresolved assignments, overdue work, pending acknowledgment, blocked work, pending manager review, reviewed resolutions and changed-source work. The unresolved-assignment count is the denominator for overdue/blocked/acknowledgment/review metrics. These categories can overlap and must never be summed as distinct deals. Changed-source or withdrawn work is counted separately, and a report alone never increments reviewed resolutions. Zero remains zero; no conversion rate or period trend is invented.

Within the same attention category, the actual earliest follow-up/closing target sorts first. Existing source-change, blocker and review distinctions remain. Each item retains its source, responsible employee, recorded dates and available actions. Assignment retries do not inflate counts, and managers gain no access to private messages or reminders. Shared desktop/native boards, Copilot and saved office-priority work use the same projection and fingerprint; time crossing a due boundary or changed evidence retires old derived conclusions.

Excellent-output example: “One of one current unresolved assignments is overdue; that same assignment is blocked. Review its recorded access issue with the assigned employee.” This is one overlapping operational issue, not two failed deals or evidence of poor employee performance. Separate manager resolution changes the count only after the employee’s outcome is reviewed. Practitioner-approved urgency rules, period comparisons, broader pipeline measures and sales-performance interpretation remain open.

## Connected GM journey — November 1

The presentation-only `opportunity-journey.ts` joins current intake/screening with accessible shared follow-through. It never changes base opportunity identity or derives source fingerprints from coordination, avoiding circular invalidation. The ordinary API, Copilot and saved `review_opportunity` capability carry the handoff reference, so assignment/report/source changes retire old advice. Current-source summaries distinguish employee reports from manager resolution; obsolete assignment evidence stays in history rather than appearing as current completion. Desktop/native exact links connect opportunity and handoff without granting access. Managers can act from Team overview.

Explicit presentation setup adds one fictional opportunity and an authored assignment/acknowledgment/blocker through existing services, once under its own marker. It preserves existing work, does not renew expired access and never contacts a provider. This is sample history, not evidence of a conversation with a real wholesaler. See DEMO_RUNBOOK for the cross-role rehearsal and PROGRESS for verification.

## Current-source priority explanations — November 1

Method v4 (`2026-11-01.1`) adds explicit reasons and a responsible next step to the same scoped handoff projection. A blocker remains an employee report for manager/employee review. A reported completion directs the next step to independent manager review, including when its follow-up deadline has passed; the overdue date alone does not establish employee failure. Missing acknowledgment names the assigned employee without claiming the assignment was never received elsewhere. A reviewed resolution remains closed even after an old target passes.

The existing attention-category precedence is unchanged. Within an equal category, the earliest **current** follow-up deadline or recorded closing target sorts first. When the closing target precedes the assigned deadline, the explanation identifies the timing conflict and asks for review; it changes neither date. Upcoming targets retain the provisional seven-day window. A past closing target calls for status reconfirmation, not an inferred successful or failed deal. These are operational signals, not a sales-performance assessment or official company urgency policy.

Changed-source assignments explain their old versus current version and keep old acknowledgment/outcome reports historical. Their old assignment deadlines cannot drive current sorting. Withdrawn, draft or not-pursuing sources recommend keeping follow-through stopped, not creating an active assignment. Lost employee access calls for a manager to select an already-authorized employee; assignment still cannot grant source access. Terminal sources and reviewed resolutions do not gain active deadline advice.

Desktop/native handoff views, Copilot and saved `office_priorities` work receive the same `evidence` and `nextStep` fields. No action/tool/contract expansion is needed. The method and explanations remain in the board fingerprint: a source correction, reassignment or a closing target passing retires old saved advice even if the primary attention label does not change. Historical receipts and employee records remain intact. Free service cases cover these changes, current result replay and pre-inventory/withdrawal boundaries; actual-model prioritization and practitioner acceptance remain separate unproven gates.
