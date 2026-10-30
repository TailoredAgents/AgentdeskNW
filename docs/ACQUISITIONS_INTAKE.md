# Acquisitions intake and missing-fact review

Updated October 30, 2026. This is the C4 domain contract supporting [the canonical roadmap](IMPLEMENTATION_ROADMAP.md), not another delivery schedule. The first bounded workflow is verified locally with fictional data. Acquisitions practitioner acceptance remains pending.

## Current outcome

An acquisitions employee or authorized manager can record a wholesaler submission for an **existing inventory property**, compare revisions, identify missing evidence and prepare an internal handoff. Desktop **Work queue → Copilot jobs → Opportunity intake** and native **Work → Intake** share the same records. The existing acquisitions Copilot job's `review_handoff` step now uses this review. No new inventory/wholesaler record, external research or provider operation is created.

The structured submission contains the wholesaler/source contact, original reference/date, supplied asking price, supplied repair estimate, repair scope and evidence, reported occupancy, and comparable references. Unknown amounts remain null; dates and numbers are validated. All supplied statements are employee-recorded and unverified. References are recorded text, not fetched documents or verified comparable sales. Current inventory pricing remains separately labeled.

## Method and useful changes

`src/server/acquisitions.ts` owns provisional method `acquisition-intake`, version 1, source revision `2026-10-30.1`. Its method is to separate supplied statements from inventory, ask for decision-changing missing facts, compare revisions and prepare an internal handoff. It is Tailored Agents design, not an approved New Western procedure.

Questions cover absent source/date/price, a price that conflicts with inventory, repairs without scope/evidence, unknown occupancy, missing comparable references, and missing closing/access information. Supplying a repair scope and source removes that missing-information question; it does **not** verify the estimate. A price conflict remains visible until reconciled. Each review includes current release status/version, supplied facts, questions, changed fields, up to twenty historical revisions and a draft internal handoff. No valuation, title clearance, reservation or permission to market is inferred.

## Preservation and authority

- Reuse the existing `property_releases` JSON record and immutable `release_events`. Optional `acquisitionSubmission` is additive; no schema migration is required. Legacy releases without the field remain readable, and older release-editor saves preserve an existing submission when they omit it.
- `GET /api/acquisitions/:propertyId` checks current organization, office, role and release scope. `POST` additionally checks current feature entitlement and release ownership/manager authority. A model can request the review but cannot record a wholesaler's testimony through a new write tool.
- An explicit employee review saves a **new draft revision**, preserves existing release metadata/audience, and invalidates earlier deal packages through the existing release service. Saving intake does not publish or notify anyone and does not alter inventory facts. A previously released opportunity returns to draft, as displayed before confirmation.
- Expected versions reject competing writes. An employee-scoped event key permits exact retry without a second revision; changed payloads conflict. Retrying an older event returns current authorized state rather than reviving its old version.
- Release publication rejects a supplied asking price that conflicts with inventory or a supplied repair estimate that conflicts with the release assumption. These need explicit reconciliation through the existing release workflow.
- The saved work review is bound to its property, release version and method version. Changed sources withhold the obsolete work result and protected conversation replay while preserving its receipt. A fresh review/job is required; this slice does not automatically rebuild a completed plan.
- Native editors retain their original version during polling, guard unsaved navigation and show stale-review conflicts. Pending writes have explicit exact retry, never automatic retry. Unsaved form/pending UI state is memory-only and does not survive backgrounding; this is not offline editing.

## Acceptance evidence and limits

Ten acquisitions tests cover missing facts, corrected evidence, preserved revisions, exact replay, stale/reused operations, invalid inputs, role/office/owner boundaries, legacy saves, withdrawal, publication conflicts and obsolete work results. The 72-check mobile follow-through HTTP/worker suite covers the same review through phone sessions and desktop/Copilot jobs, with source revisions and no provider/CRM mutation. The connected phone-width walkthrough saved version 1, revised evidence on desktop, disabled the stale phone review, preserved both versions and changed the questions from seven to four. These are engineering checks, not independent quality or valuation benchmarks.

The Acquisition-to-Disposition Coordinator gains this bounded depth. The **Acquisition Lead Assistant remains planned**. New opportunity creation, wholesaler relationships/deduplication, attachment ingestion, verified comps, supported screening/calculations, richer follow-up, company-approved methods and representative role acceptance remain required. Actual phones, provider connections and the complete C4 role journey are not accepted by this increment.
