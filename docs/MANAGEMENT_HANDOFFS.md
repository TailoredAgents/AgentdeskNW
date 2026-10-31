# Shared handoff coordination

Updated October 30, 2026. This C4 specification supports [the canonical roadmap](IMPLEMENTATION_ROADMAP.md); it is not a competing schedule. The bounded workflow uses fictional operational records. Management practitioner acceptance and company procedure approval remain pending.

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

The provisional code-owned method is `handoff-follow-through`, version 1, source `2026-10-30.1`. Its approach is to inspect current operational evidence, identify the missing acknowledgment/outcome, assign the smallest useful next step and require an explicit outcome review. This deepens the demo Team Performance Assistant; registry readiness remains unchanged. It does not establish official company policy, expert judgment or competitive superiority.

## Acceptance and unfinished scope

Thirteen service/conversation tests cover sourced gaps, actor/office/tenant boundaries, current membership, assignment authority, acknowledgment, evidence requirements, blocked outcomes, separate resolution, replay, stale versions, source revision/withdrawal, private-task separation, and stale work/history/voice context. Two mobile client cases cover current decision authority and evidence-backed report parsing. The new 52-check isolated HTTP/worker suite covers scoped phone sessions, cross-surface manager/employee decisions, Copilot links/history, durable reviews, reassignment and revocation with unchanged investor/provider state.

A disposable copy of the prior accepted schema-024 database upgraded to 025 with all **316 prior rows across 89 tables preserved**, clean integrity and no foreign-key violations. The active database was not used. Browser/phone-width acceptance and final release-wide checks are recorded in [PROGRESS.md](PROGRESS.md). Native binaries, actual devices, notifications, role usefulness testing, external documents and company connections remain unaccepted. Workload analysis beyond current sources, flexible standing authority, broader coordination cases and measured employee effectiveness remain roadmap work.
