# Product requirements

Status: implementation baseline, October 29, 2026. Verified completion is tracked separately in [PROGRESS](PROGRESS.md).

## Users and access

| Role | Primary work | Initial permission boundary |
| --- | --- | --- |
| Dispositions | Investors, research, qualification, follow-up and marketing preparation | Own office and assigned personal records |
| Acquisitions | Seller/property context, diligence and handoff preparation | Own office and assigned personal work; unavailable specialist operations stay unavailable |
| Manager | Office priorities, authorized review and operational overview | Own organization and office; no cross-tenant elevation |

A platform operator role, tenant administrators, fine-grained entitlement configuration and invitation provisioning are future features. The local role selector uses fixed fictional users; it is not an authorization model for a deployed product.

## Core acceptance requirements

### Copilot

- A single conversation surface retains messages across reloads.
- Each request runs with an authenticated employee context, permitted records, history, task/job context and guidance preference.
- Model requests dispatch typed functions, which invoke the same server services used by the UI.
- Multiple specialists can contribute to one response, but Copilot owns the response.
- Result cards link to actual jobs/actions/tasks; success requires a service result.
- A missing API key produces an explicitly local tool experience, not a fake model response.
- Ambiguous record references require selection or clarification before consequential work.

### Investor Hunter

- Accept property address, county, price, strategy and requested count.
- Start a persistent job with states queued, running, awaiting input, completed, failed and canceled.
- Separate externally sourced discovery from existing CRM buyer matching.
- Store ranking rationale, factor contributions, source provenance, synthetic flag, contact status and duplicate classification.
- A job may return fewer candidates than requested; never fill a quota with invented verified results.
- Permit cancellation, safe retry, review/filter/sort, CSV export and proposed import.
- Exclude known duplicates from unreviewed new-record creation; unresolved identities require human review.
- Fixture mode is visible at the job, evidence and export level.

### Call notes and next steps

- Accept manual notes and text transcript upload. Audio recording/transcription providers are a later integration.
- Return source excerpts, summary, parties, criteria, questions, objections, commitments, missing information and proposed follow-up.
- Employee-supplied transcript content is not independently verified fact.
- Keep suggested tasks distinct from completed tasks. A transcript promise is not proof the promise was fulfilled.
- The user selects the intended investor, reviews the proposed note and approves a specific action before the CRM mutation.
- Contextual guidance compares known qualification fields with a clearly labeled baseline checklist. It must not impersonate an approved New Western SOP.

### Daily work and notifications

- Show open tasks, pending approvals, job statuses and relevant local records.
- Create a dated reminder, complete it, and retain both changes across reloads.
- Notify on meaningful events with deduplication; respect user settings and quiet-hour policy when implemented.
- Background work must use a worker/scheduler rather than an always-running model loop.
- Browser closure does not delete jobs; execution still requires a running local server or worker.

### Live voice

- Display explicit unavailable, connecting, connected and failed states.
- Obtain microphone permission after a user gesture.
- Keep permanent credentials off the browser; create short-lived credentials on the authenticated server.
- Use full duplex audio, model turn-taking and interruption support.
- Execute tools through the same authorized backend, retaining approval boundaries.
- Preserve conversation continuity and usage records; distinguish measured usage from estimates.
- Do not claim acceptance until a real credential-backed voice interaction succeeds.

### Catalog and navigation

- All 16 employees show purpose, category, role availability and truthful status.
- Dashboard, Copilot, research, notes, queue, investors/deals, notifications and settings are navigable.
- Role-restricted management information must be restricted by the backend, not only by hidden navigation.
- Layouts support desktop and narrow mobile screens; forms have visible labels, keyboard focus, validation and error recovery.

## Nonfunctional requirements

Validate at both HTTP and tool boundaries. Keep server-only integration secrets. Scope all queries by organization and office, and personal data by actor ownership. Record mutations and approvals in an audit log. Bound model tool loops, provider request duration, input size and request frequency. Retry only recoverable operations; retain terminal failures and actionable explanations.

The initial local database is persistent and relational. Production requires stronger identity, backup/restore, encrypted token storage, retention policy, tenant database controls, observability and distributed execution. The presence of interfaces does not establish these controls.

## Data truth labels

| Label | Meaning |
| --- | --- |
| Synthetic/demo | Fictional demonstration fixture; unusable as a real lead or source |
| Employee transcript | Employee-supplied information, retained with source excerpts |
| Verified source | Data associated with an accessible source and verification process; not available merely because a model says so |
| Proposed | Prepared for human review; no action has occurred |
| Executed | Domain service confirmed the mutation and wrote an execution record |
| Planned | Catalog/design exists; operation is not available |

## Assumptions requiring validation

No actual Salesforce schema, office membership list, SOPs, provider contract, communication policy or billing agreement has been supplied. Proposed pricing and national seat estimates remain hypotheses. Product capability is not evidence of permission to use a customer system.
