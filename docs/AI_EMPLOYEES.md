# AI employee contracts and catalog

All 16 proposed specialists share the registry in `src/server/registry.ts` and the browser/server `Specialist` contract. Catalog presence means architecture coverage; it does not prove execution capability. Runtime status is authoritative: `demo` means operational against fictional/local data, `ready` means an implemented capability within its stated boundary, and `planned` means no executable specialist yet.

## Current registry status

- **Ready, within the stated local capability:** Conversation & Call Notetaker; Daily Coordinator.
- **Demo:** Investor Hunter; Buyer Matchmaker; Investor Qualification; Investor Relationship; Workflow Navigator; Salesforce Assistant; Team Performance.
- **Planned:** Deal Marketing; Investment Deal Analyst; Transaction & Document Coordinator; Acquisition Lead; Valuation & Due Diligence; Acquisition-to-Disposition; Onboarding & Coaching.

“Ready” for the notetaker means real local excerpt extraction, not audio recording or a claim of human-level transcript understanding. Daily Coordinator uses local work records, not external calendars.

## Common contract

A definition includes unique ID, name, purpose, category, allowed roles, input/context requirements, supported tool names, output descriptions and approval policy. Execution receives a trusted `Actor` and validated inputs; returns `ToolResult` containing specialist IDs, user-safe message, structured data and actual artifact references. Usage/audit records attach actor, tenant, office, operation, timestamp and outcome outside the model’s response.

The contract permits reuse across tenants. Names and tenant terminology must not become hard-coded customer authorization assumptions. All specialists inherit record scoping, source provenance, secret handling and prompt-injection controls.

## Full workforce specification

| Employee | Required context / input | Tools and outputs | Approval and current boundary |
| --- | --- | --- | --- |
| 1. Investor Hunter | Subject address, county, price, strategy, requested count | Start/status/cancel/retry research; ranked prospects, evidence, duplicate class, job artifact | Research automatic; import proposal requires review. Synthetic provider first. |
| 2. Buyer Matchmaker | Permitted buyer buy-boxes and subject property | Match existing authorized buyers; score/reasons and missing criteria | Read-only matching can run automatically. Local fictional CRM first. |
| 3. Investor Qualification Assistant | Selected investor, known criteria, employee statements | Identify missing budget, financing, geography, strategy, rehab/timeframe; propose next question and reviewed qualification update | Suggestions automatic; CRM changes approved. Baseline criteria are not official SOPs. |
| 4. Investor Relationship Manager | Permitted activity, commitments, last contact, relevant inventory | Dormant/overdue relationships, follow-up plan, communication drafts | Drafts/tasks by policy; outbound messages approval required. Broader execution planned. |
| 5. Deal Marketing Assistant | Verified property facts and audience | Property summary, investor email, campaign draft with fact/assumption labels | Publication/sending requires review. No unsupported ARV/condition claims. Planned. |
| 6. Investment Deal Analyst | Property facts, comps, financing/repair assumptions | Transparent calculations, preliminary scenarios and source references | Human review; no binding investment decisions. Live comps/valuation planned. |
| 7. Conversation & Call Notetaker | Authorized transcript/notes and selected CRM record | Summary, source excerpts, criteria, parties, questions, objections, commitments, proposed note/tasks | Extraction automatic; CRM note proposal requires approval. Manual/text upload first. |
| 8. Workflow Navigator | Actor role, permitted investor/task context, procedure version | Known/missing criteria, next action, rationale, subsequent step | Advice/preparation automatic; business changes follow tool policies. Baseline guidance first. |
| 9. Salesforce Assistant | Actor-scoped CRM request, record references, reviewed proposal | Lookup, duplicate check, note/import preparation, confirmed execution result | Consequential writes require server approval. Local adapter only until authorized sandbox. |
| 10. Daily Coordinator | Own tasks, due dates, jobs, approvals, preferences | Prioritized work, actual status, reminder/task artifacts | Internal task operations allowed by policy. No external calendar claim without connector. |
| 11. Transaction & Document Coordinator | Authorized deal stage, documents, milestones and versions | Missing-document list, diligence timeline, transaction next steps | Never alter contract terms or make binding offers. Planned. |
| 12. Acquisition Lead Assistant | Assigned seller lead and property context | Lead organization, research summary and outreach preparation | No external outreach without approval. Planned. |
| 13. Valuation & Due Diligence Assistant | Source property data, comps, explicit repair assumptions | Valuation scenarios, evidence, red flags and checklist | Estimates labeled; no unreviewed financial decisions. Planned. |
| 14. Acquisition-to-Disposition Coordinator | Deal/property/pricing facts, documents and stage | Structured handoff, missing inputs, investor-relevant summary and tasks | Handoff preparation permitted; record/publication changes reviewed. Planned. |
| 15. Team Performance Assistant | Manager role and office-scoped tasks/jobs/usage | Operational overview and bottlenecks | Manager-only. Local activity summary is not a verified Salesforce sales-performance report. |
| 16. Onboarding & Coaching Assistant | Role, question, approved knowledge revision | Contextual explanation, source-backed answer, conversation practice | Integrated into normal work. Approved-knowledge retrieval and deeper coaching planned. |

## Coordination rules

Copilot owns conversation and selects tools. Tool schemas expose no tenant/role override and no generic arbitrary CRM mutation. A specialist cannot expand its permissions by requesting another specialist. Composite work returns linked artifacts: for example research job → duplicate results → reviewable import. The orchestrator must retrieve completed results before describing a job as finished.

Direct catalog navigation may open an implemented workflow or explain what is missing. Planned specialists must not produce a fake completion animation. When a permitted read-only tool covers only part of a specialist’s purpose, describe that limit explicitly.

## Qualification update tool

`prepare_investor_update` coordinates Investor Qualification with Salesforce Assistant. The manager supplies a verified investor ID and employee-confirmed changes; unconfirmed fields remain null and are excluded. The response is an approval artifact. It never mutates the record directly. The HTTP route `PATCH /api/investors/:id` follows the same proposal-only rule and the review service checks for stale before-values.

## Execution and recovery

Statuses for research and proposals are persisted separately from catalog readiness. A rejected proposal remains rejected; a failed job retains its error and supports explicit retry where safe. Model calls have bounded rounds and input size. Tool failures return structured errors; they do not become successful narrative claims.

## Evaluation

Measure each specialist on completed workflows, correct scoping, grounded output, appropriate clarification, and human correction rate. Evaluate transcript extraction with negation/ambiguity and source consistency; research with evidence freshness, entity collisions and missing contacts; workflow advice with approved revision traceability. A model’s fluency is not a correctness measure.
