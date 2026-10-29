# AI employee contracts and catalog

All 16 proposed specialists share the registry in `src/server/registry.ts` and the browser/server `Specialist` contract. Catalog presence means architecture coverage; it does not prove execution capability. Runtime status is authoritative: `demo` means operational against fictional/local data, `ready` means an implemented capability within its stated boundary, and `planned` means no executable specialist yet.

## Current registry status

- **Ready, within the stated local capability:** Conversation & Call Notetaker; Daily Coordinator.
- **Demo:** Investor Hunter; Buyer Matchmaker; Investor Qualification; Investor Relationship; Deal Marketing; Workflow Navigator; Salesforce Assistant; Transaction & Document Coordinator; Acquisition-to-Disposition; Team Performance.
- **Planned:** Investment Deal Analyst; Acquisition Lead; Valuation & Due Diligence; Onboarding & Coaching.

“Ready” for the notetaker means real local excerpt extraction, not audio recording or a claim of human-level transcript understanding. Daily Coordinator uses local work records, not external calendars.

## Common contract

A definition includes unique ID, name, purpose, category, allowed roles, input/context requirements, supported tool names, output descriptions and approval policy. Execution receives a trusted `Actor` and validated inputs; returns `ToolResult` containing specialist IDs, user-safe message, structured data and actual artifact references. Usage/audit records attach actor, tenant, office, operation, timestamp and outcome outside the model’s response.

The contract permits reuse across tenants. Names and tenant terminology must not become hard-coded customer authorization assumptions. All specialists inherit record scoping, source provenance, secret handling and prompt-injection controls.

## Full workforce specification

| Employee | Required context / input | Tools and outputs | Approval and current boundary |
| --- | --- | --- | --- |
| 1. Investor Hunter | Subject address, county, price, strategy, requested count | Start/status/cancel/retry research; ranked prospects, evidence, duplicate class, job artifact | Research automatic; import proposal requires review. Synthetic provider first. |
| 2. Buyer Matchmaker | Permitted buyer buy-boxes and subject property | Match multiple reviewed boxes to authorized releases; separate fit/engagement, positive reasons, conflicts and missing criteria | Read-only matching can run automatically. Local fictional CRM first. |
| 3. Investor Qualification Assistant | Selected investor, known criteria, employee statements | Identify missing budget, financing, geography, strategy, rehab/timeframe; propose next question and reviewed qualification update | Suggestions automatic; CRM changes approved. Baseline criteria are not official SOPs. |
| 4. Investor Relationship Manager | Permitted activity, commitments, last contact, relevant inventory | Pre-call briefings, call outcome/history, dormant/overdue relationships and follow-up tasks | Internal outcomes/tasks are local; unknown buying activity is not inferred. No personal-phone recording or outbound send. |
| 5. Deal Marketing Assistant | Verified property facts and audience | Disclosure-gated property packages with current facts, approved template, media link, missing-data flags and copy/compose handoff | Draft/review/handoff states implemented locally; release/disclosure/media eligibility rechecked. Delivery remains not sent; campaigns and provider sending remain planned. |
| 6. Investment Deal Analyst | Property facts, comps, financing/repair assumptions | Transparent calculations, preliminary scenarios and source references | Human review; no binding investment decisions. Live comps/valuation planned. |
| 7. Conversation & Call Notetaker | Authorized transcript/notes and selected CRM record | Post-call debrief, source excerpts, criteria, ambiguity/linking, note/field proposals, tasks and requested package | Typed/dictated recap preparation implemented; CRM criteria/note writes require review. No ordinary cellular-call recording. |
| 8. Workflow Navigator | Actor role, permitted investor/task context, procedure version | Known/missing criteria, next action, rationale, subsequent step | Advice/preparation automatic; business changes follow tool policies. Baseline guidance first. |
| 9. Salesforce Assistant | Actor-scoped CRM request, record references, reviewed proposal | Lookup, duplicate check, note/import preparation, confirmed execution result | Consequential writes require server approval. Local adapter only until authorized sandbox. |
| 10. Daily Coordinator | Own tasks, due dates, jobs, approvals, preferences | Ranked calling queue from released inventory, due commitments, contact history and explicit priority; dismissal, briefings and task artifacts | Own relationships only in default queue; deterministic explained ranking. No external calendar claim without connector. |
| 11. Transaction & Document Coordinator | Authorized deal stage, documents, milestones and versions | Read configurable upstream/downstream stages, closing structure and timestamp on authorized releases | Limited demo transaction context is implemented. Document verification, milestone automation and contract execution remain planned. |
| 12. Acquisition Lead Assistant | Assigned seller lead and property context | Lead organization, research summary and outreach preparation | No external outreach without approval. Planned. |
| 13. Valuation & Due Diligence Assistant | Source property data, comps, explicit repair assumptions | Valuation scenarios, evidence, red flags and checklist | Estimates labeled; no unreviewed financial decisions. Planned. |
| 14. Acquisition-to-Disposition Coordinator | Deal/property/pricing facts, documents and stage | Versioned local releases with source, assigned dispositions access, media/economics and match-triggered notifications | Role-gated local demo release edits implemented, event-idempotent and audited. No Marketplace ingestion or real distribution. |
| 15. Team Performance Assistant | Manager role and office-scoped tasks/jobs/usage | Operational overview and bottlenecks | Manager-only. Local activity summary is not a verified Salesforce sales-performance report. |
| 16. Onboarding & Coaching Assistant | Role, question, approved knowledge revision | Contextual explanation, source-backed answer, conversation practice | Integrated into normal work. Approved-knowledge retrieval and deeper coaching planned. |

## Coordination rules

Copilot owns conversation and selects tools. Tool schemas expose no tenant/role override and no generic arbitrary CRM mutation. A specialist cannot expand its permissions by requesting another specialist. Composite work returns linked artifacts: for example research job → duplicate results → reviewable import. The orchestrator must retrieve completed results before describing a job as finished.

Direct catalog navigation may open an implemented workflow or explain what is missing. Planned specialists must not produce a fake completion animation. When a permitted read-only tool covers only part of a specialist’s purpose, describe that limit explicitly.

## Qualification update tool

`prepare_investor_update` coordinates Investor Qualification with Salesforce Assistant. The assistant supplies an authorized investor ID and employee-supplied changes; unconfirmed fields remain null and are excluded. The response is an approval artifact. It never mutates the record directly. The HTTP route `PATCH /api/investors/:id` follows the same proposal-only rule and the review service checks for stale before-values.

## Execution and recovery

Statuses for research and proposals are persisted separately from catalog readiness. A rejected proposal remains rejected; a failed job retains its error and supports explicit retry where safe. Model calls have bounded rounds and input size. Tool failures return structured errors; they do not become successful narrative claims.

## Evaluation

Measure each specialist on completed workflows, correct scoping, grounded output, appropriate clarification, and human correction rate. Evaluate transcript extraction with negation/ambiguity and source consistency; research with evidence freshness, entity collisions and missing contacts; workflow advice with approved revision traceability. A model’s fluency is not a correctness measure.

## Phase 2 coordination

The existing master assistant gained calling queue, pre-call briefing, property release lookup, debrief capture/proposal and deal-package composition tools. They invoke the same validated services as the UI. Sensitive approval, manager disclosure simulation and package handoff are not model approval tools. Local deterministic fallbacks expose accurate artifacts when OpenAI is unconfigured.

Investor Qualification and Salesforce Assistant share reviewed primary-buy-box mapping. A debrief proposes changes; approval preserves per-field provenance and stale-version protection. The Conversation & Call Notetaker’s evidence-based questions are ordinary workflow guidance, not a new training mode or a seventeenth specialist. No specialist status establishes live CRM, external research, Slack/SMS delivery or production authorization.
