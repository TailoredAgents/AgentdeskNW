# Relationship working methods

Specification and source for the first C4 working-knowledge slice. The [canonical roadmap](IMPLEMENTATION_ROADMAP.md) controls status and sequencing. These methods are **provisional Tailored Agents demonstration design**, revision `2026-10-30.1`, effective October 30, 2026. They are not New Western policy, approved company procedures, investment advice or evidence that the specialist outperforms a generic model.

## Current methods

Each method has an ID, version, effective date, active/withdrawn state, role scope, source revision, objective, steps, required facts and limits. Runtime definitions are in `src/server/relationship-methods.ts`; their typed projection is shared by desktop, mobile and Copilot. Changes to this catalog remain reviewed source releases. The separate [role-guidance library](KNOWLEDGE_AND_COACHING.md) now supports manager-reviewed fictional publication; it does not automatically replace this catalog or ingest company documents.

| ID / version | Use | Method and useful question |
| --- | --- | --- |
| qualification / 1 | Differing or missing criteria; preliminary property fit | Identify the relevant buy box and distinguish reviewed values from employee reports. Ask the specific recorded conflict question where available. Confirm current criteria before suggesting another opportunity; never silently broaden the buy box. |
| objections / 1 | An unresolved concern or an incoming repair/operating-cost question | Identify what evidence would resolve the concern, whether it is available, and who can supply it. For repairs: “Which repair items or cost assumptions need a sourced breakdown before the next opportunity would be useful?” Do not invent a quote, contractor review or access. |
| reactivation / 1 | A recorded buying pause | Honor the pause. Ask whether to address the present question or agree a later check-in. A new message or property match does not authorize restarting marketing. |
| follow-through / 1 | An existing personal commitment | Inspect the existing task before adding a duplicate. Ask what happened and what response or next step was actually agreed. Task completion is not proof of investor agreement. |

The selection preserves the current evidence hierarchy: pause, differing criteria, unresolved concern, existing follow-up, then property eligibility/fit and qualification. A missing property-sharing prerequisite does not receive a method that purports to waive it. Methods currently apply only within the authorized dispositions/management relationship workflow; management access still does not grant someone else's mailbox or personal tasks. Acquisitions uses its own [provisional intake method](ACQUISITIONS_INTAKE.md), not a dispositions label attached to its work.

## Application and traceability

The relationship recommendation carries the selected method, a useful question, relevant permitted evidence IDs and missing facts. Its action description now includes that question. Inbox assistance uses the same catalog with the incoming question's topic, separates current correspondence from older relationship reports, and displays the method alongside its evidence. Header-only sources provide no body-derived method.

Methods do not extract new facts, resolve an objection, update CRM, schedule work or authorize sending. All such actions retain the existing employee review and service permissions. The exact send-review context and ongoing model-turn context include the method catalog fingerprint; a changed revision requires a fresh send review. Previously stored work remains historical evidence with its original method/version, not proof that old guidance remains current.

Selection first finds the newest effective revision for the method, then checks withdrawal and role. Removing permission or withdrawing version 2 must never resurrect version 1. Future revisions do not apply early. Returned snapshots are independent copies of the catalog. The fictional office library implements withdrawal, retrieval and revision audit. Managed publisher identity, organization-approved procedures and actual source ingestion remain C4/C7 work.

## Quality evidence and limits

The executable tests cover all four method families, role scope, sharing prerequisites, effective dates, withdrawal without fallback, independent snapshots, pause priority, source/version display, header-only boundaries and invalidation of a send review after a method change. A relationship case starts with an existing task, adds a sourced repair concern and checks the new objection question, then explicitly resolves it and verifies return to follow-through. Existing relationship record benchmarks remain separate evidence.

These are authored engineering cases over deterministic services, not independent employee acceptance or a model-intelligence benchmark. Deeper judgment, broader language interpretation and generic-model comparisons remain open. The source catalog is a first working-knowledge increment, not completion of all specialist depth.

## Provisional cases for the other role tracks

These cases are provisional engineering targets, not confirmed company procedures. The three acquisitions cases now have bounded existing-inventory service/HTTP coverage in [ACQUISITIONS_INTAKE.md](ACQUISITIONS_INTAKE.md), including changed evidence and obsolete results; this does not complete acquisition intake/screening. The management cases now have bounded [shared handoff](MANAGEMENT_HANDOFFS.md) service/HTTP coverage: missing acknowledgment, separate evidenced outcome and no inference from personal-task completion. The new service does not query private mailboxes. Both roles still require practitioner review before role acceptance.

| Role / case | Fictional input | Expected useful output |
| --- | --- | --- |
| Acquisitions — incomplete wholesaler submission | Address and asking price supplied; repair scope, occupancy and comparable sources missing | Separate provided facts from gaps; prepare specific questions to the wholesaler; avoid a confident valuation or invented return. |
| Acquisitions — conflicting versions | The wholesaler revises the asking price after an earlier handoff | Identify the changed source/version, preserve the earlier report and flag affected downstream work for review; never keep marketing an obsolete assumption silently. |
| Acquisitions — unsupported estimate | A repair number is supplied without a scope or date | Label the estimate as supplied and unverified; request scope, date and supporting evidence before relying on it. |
| Management — stalled handoff | A released opportunity has no recorded acknowledgment and an approaching deadline | Show the release, owner and dates that establish the gap; propose an authorized next action without inventing acceptance. |
| Management — private mailbox | A manager asks which private investor emails an employee has received | Explain available office-level operational evidence; do not reveal employee correspondence under management authority. |
| Management — apparent completion | A reminder is marked complete but no transaction outcome is recorded | Distinguish task completion from deal progress; identify the missing outcome and who needs to clarify it. |

## Relationship-aware Buyer Matchmaker

The `buyer-shortlist-v1` service supports a current single-property CRM shortlist through typed Copilot, reviewed dictation, configured employee messaging and the saved `match_existing_buyers` capability. It is deterministic sourced decision preparation, not a trained expert or an external search. Its required inputs are a permitted property/release, approved active buy boxes, current shared relationship reports/observations, disclosure state and the requesting employee's own follow-up tasks. Matching does not require purchasing Relationship Manager separately.

Each investor retains a separate fit score and one next action: review a candidate, handle an existing follow-up, clarify evidence, resolve sharing prerequisites, avoid a known mismatch, or honor a pause. Funding/timing values preserve recorded-versus-reported evidence; they are not proof of funds or current interest. Criteria conflicts apply to the selected buy box, not unrelated or inactive strategies. A box without a known conflict takes precedence over a higher numerical score with a known conflict. Unapproved boxes never establish fit.

An excellent supported result identifies the unresolved repair concern, asks for a sourced scope/breakdown, and does not invent a contractor estimate or walkthrough. Resolving that exact observation returns the recommendation to the remaining work. A pass on one property does not label every other property rejected; unresolved objections can remain relevant across opportunities. Private follow-ups remain private even when a manager can read the investor.

Source fingerprints bind saved conversation and derived work to the current employee, property/release, candidate set and recommendation evidence. Changed context withholds obsolete recommendations. An explicit saved-plan refresh can retain the original matching receipt and charge while replacing its output with a historical notice. It cannot retire a result that any unfinished direct/transitive dependency still consumes, nor waive record access. Revised research must depend on fresh matching for the same property.

Engineering cases cover pauses, prior repair concerns, resolution, property-specific passes, conflicting funding, corrected budgets, separate/unapproved buy boxes, private tasks, current references, four conversation entry points and protected saved/derived work. These authored tests are not practitioner acceptance or a generic-model comparison. Multiple-property optimization, precise state/ZIP evidence, deeper conditional language, complete outreach sequences and real provider delivery remain open in the depth matrix.


## Phase 2 — evidence-led qualification review

`qualification-review-v1` (October 31) gives Investor Qualification a separate read-only decision service. Supported work: review an authorized investor’s active approved buying strategies, rank clarification needs and return one useful next question with the exact underlying statements, dates and verification labels. It uses the shared relationship record; no private email or employee preferences are copied into qualification evidence.

The provisional method honors a buying pause first, then reconciles conflicting values, asks about explicit conditional-language cues, fills missing/placeholder criteria and reconfirms older or undated evidence. Unknown budget ceilings stay unknown. Inactive and unapproved strategies never become current fit evidence. The output preserves separate strategy labels and all relevant current sources. Conditional cues are a bounded text heuristic for asking a question, not semantic comprehension or a declaration that a condition is satisfied. Employee corrections supersede old testimony only through the existing reviewed report service.

Excellent-output example: the employee reports “cash only after my other closing.” The review retains that statement, asks what conditions remain and what evidence would establish them, and does not assert available cash or a purchase commitment. A corrected source removes the superseded statement and changes the next question. A financing conflict takes precedence over a generic missing contact preference. A recorded pause still prevents advice to restart property marketing.

Typed Copilot and the zero-charge `review_qualification` saved-work capability use the same service. Current scope, sources, method and freshness bind a qualification reference. Changed reports, active strategies, permissions, restriction or source freshness retire obsolete conversation and derived-work advice while keeping receipts. Voice context also fingerprints this evidence; changed testimony requires a fresh voice session rather than retaining stale advice. Four conversation entry points are exercised with transport disabled; this does not establish live voice/SMS acceptance.

Tests cover conditional variants, explicit correction, conflicting sources, separate/inactive strategies, unknown criteria, historical/undated reports, pause, scope/restrictions, saved work and cross-channel history. These are authored service-quality checks, not a generic-model baseline or independent language-quality evaluation. Deeper conditional/negation interpretation, task-specific question selection and representative employee acceptance remain open.
