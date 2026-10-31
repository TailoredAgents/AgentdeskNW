# Relationship working methods

Specification and source for the first C4 working-knowledge slice. The [canonical roadmap](IMPLEMENTATION_ROADMAP.md) controls status and sequencing. These methods are **provisional Tailored Agents demonstration design**, revision `2026-10-30.1`, effective October 30, 2026. They are not New Western policy, approved company procedures, investment advice or evidence that the specialist outperforms a generic model.

## Current methods

Each method has an ID, version, effective date, active/withdrawn state, role scope, source revision, objective, steps, required facts and limits. Runtime definitions are in `src/server/relationship-methods.ts`; their typed projection is shared by desktop, mobile and Copilot. Changes are reviewed source releases; there is no employee-facing knowledge publishing or company-document ingestion system yet.

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

Selection first finds the newest effective revision for the method, then checks withdrawal and role. Removing permission or withdrawing version 2 must never resurrect version 1. Future revisions do not apply early. Returned snapshots are independent copies of the catalog. A real company knowledge lifecycle—including authenticated publishers, organization-specific approval, source withdrawal, retrieval and revision audit—is still C4/C7 work.

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
