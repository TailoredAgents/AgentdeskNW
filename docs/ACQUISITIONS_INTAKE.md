# Acquisitions intake and missing-fact review

Updated October 31, 2026. This is the C4 domain contract supporting [the canonical roadmap](IMPLEMENTATION_ROADMAP.md), not another delivery schedule. Both bounded workflows below are verified locally with fictional data. Acquisitions practitioner acceptance remains pending.

## Existing-inventory outcome

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

## Pre-inventory wholesaler opportunities

A separate **New wholesaler opportunities** panel under desktop Work queue → Copilot jobs and native Work → New opportunities now records submissions before a property exists in inventory. Acquisition Lead is **demo**, within this boundary. The original existing-property intake/release workflow remains separate.

An opportunity records a supplied address/city/state, optional county/ZIP/type, the same structured wholesaler/source/price/repair/occupancy/comparable submission, an unconfirmed closing target, access information and an internal review note. `reviewing` and `not_pursuing` are employee review states, not deal/contract milestones. Not pursuing requires a reason and may be revised later; history is retained. No separate verified wholesaler-contact directory exists yet.

`opportunities.ts` applies provisional method `wholesaler intake v2 / 2026-10-31.1`. Missing facts become focused questions. Sources over 30 days old and past closing targets prompt reconfirmation; the window is AgentDesk guidance, not company policy. Supplying evidence removes only its corresponding question and never verifies the source. Even a complete submission still needs original-evidence review before supported screening. The service prepares an unsent follow-up draft, without choosing recipients or delivering it.

### Duplicate and revision contract

- Normalize case, whitespace, punctuation and common street suffixes; compare address/city/state against authorized opportunities and address/city against authorized inventory (whose state is unavailable). Preserve unit distinctions. These are **possible matches**, not identity verification or fuzzy/geocoded deduplication. No automatic merge. No private record names, identifiers or counts appear. No match does not establish uniqueness.
- `POST /api/opportunities/preview` validates input, current version and visible possible matches. Its review reference binds actor/scope, exact input, current saved record, method/questions and duplicate evidence. A duplicate that appears after preview invalidates a later save.
- `POST /api/opportunities` requires that current reference, expected version and employee-scoped event key. One transaction saves the opportunity, immutable revision event and audit entry. Exact retry returns current authorized state; a changed payload under the old key conflicts. An authorized manager can revise an office record while preserving its employee owner.
- `GET /api/opportunities` and `GET /api/opportunities/:id` enforce current acquisitions/manager membership and company restrictions. Historical intake remains readable after a subscription ends; new reviews/saves/assistant execution require current feature access. Acquisitions employees see their own intake; managers see office intake. Assignment or source text cannot confer access. Migration 026 adds two tables without changing inventory, releases or prior records.
- Desktop and native editors retain the original edit version during polling. Reviews cannot silently become a different submission. Unknown save outcomes offer exact retry; native navigation guards unsaved edits. Private UI state remains memory-only and is cleared on backgrounding.
- Read-only `opportunity_review` provides board/detail context to typed Copilot and configured messaging. The zero-charge deterministic `review_opportunity` durable capability composes with supported work steps. No model intake-write tool is exposed. Source/method/permission fingerprints invalidate old history/tool/work/model/voice context; receipts survive. Existing browser voice does not gain unrestricted tool parity.

## Acceptance evidence and limits

The original existing-property workflow retains its ten root cases and 72-check mobile follow-through coverage. The new pre-inventory increment adds **17 root cases, two mobile form cases and 67 HTTP/worker checks**. Cases include role/office/owner boundaries, exact retries, conflicting revisions, duplicate races, supplied-versus-verified evidence, stale source dates, employee status changes, strict input, untrusted source text, conversation continuity and obsolete worker/history context. Migration 025 → 026 preserved **316 prior rows across 91 tables**, with clean integrity/foreign keys, in a disposable copy.

The connected walkthrough saved a submission on desktop, opened it via the same employee’s phone Copilot, protected unsaved edits, saved revised evidence and showed three remaining questions instead of six on both screens. It retained both revisions and the unverified source labels. No provider, inventory, release, investor message or payment effect occurred. These are engineering checks, not independent specialist-quality or financial benchmarks.

Linked saved-scenario screening now supports bounded economics review as described below. Complete valuation judgment, verified comps, attachment ingestion, independent wholesaler relationship records, richer follow-through and reviewed promotion into inventory remain open. Company-approved methods, acquisitions practitioner acceptance and actual phone/provider testing remain deferred. Neither intake workflow completes the full C4 acquisitions journey.


## Linked acquisitions screening

`opportunity-screening.ts` combines a current authorized opportunity with the same employee’s saved diligence scenarios. It does not create assumptions or calculations automatically. Desktop and native opportunity details, typed `opportunity_review`, and saved `review_opportunity` work use this same presentation service. The employee can open the exact scenario and its evidence from either interface.

The review keeps supplied asking price and repairs separate from modeled inputs. Different purchase assumptions and repairs outside the modeled range become reconciliation questions. Each nonpositive flip-profit or rental-cash-flow case is shown with its explicit assumptions; favorable scenarios cannot hide adverse ones. Unknown results remain unknown. The existing calculator supplies all amounts. No company acceptance threshold, offer, independent valuation or verified evidence is inferred. A recorded not-pursuing decision remains in force until the employee revises it.

Private scenario access is independent of office CRM access. Managers see only their own analyses; restricted valuation access leaves authorized intake available. A changed source withholds old computed amounts and links to fresh review. Current analysis and private-board references invalidate obsolete conversation/worker output, including an earlier conclusion that no scenario exists. Base opportunity fingerprints never depend on their derived analyses, avoiding recursive source authority. No inventory promotion, release, handoff or external message occurs.

Evidence: 13 new screening cases plus 76 opportunity HTTP/worker checks cover positive/adverse/unknown outcomes, conflicting assumptions, source changes, no-scenario invalidation, ownership/role/feature boundaries and saved-work continuity. The compiled browser walkthrough showed both scenarios, retained the downside, and opened the matching analysis on desktop and native browser. These are fictional functional checks; practitioner quality and actual-device acceptance remain pending.


## Copilot preparation and pre-inventory follow-through — October 31

`prepare_opportunity_intake` prepares an exact private review of a new opportunity or revision. Unknown facts remain null/blank, current versions and duplicates are checked, and the employee applies or dismisses through Work on desktop or phone. The model cannot save its own proposed facts as employee testimony. Changed facts or duplicate evidence invalidate the pending review. Applying records the scoped opportunity and its immutable version history, not a property listing or release.

A saved opportunity can now enter reviewed internal handoff coordination before inventory entry. A manager assigns a next action to the acquisition owner, who already has access; that employee acknowledges and reports with an operational evidence reference. A separate manager resolution closes that follow-up only. All shared source labels say Opportunity/pre-inventory; no property/release row is fabricated. Opportunity correction requires refreshed assignment/acknowledgment; `not_pursuing` disables further actions. Dispositions and unrelated acquisition employees do not inherit the private source through assignment. Existing private scenario analysis remains separate and does not become shared by this handoff.

These are composable outcomes and review services, not a mandatory wholesaler script. Practitioner review, broader evidence reasoning, verified comparables and inventory promotion remain separate scope.


## Phase 2 — decision-changing screening priorities

The v2 provisional intake method prioritizes possible duplicate identity and current terms before lower-impact completeness questions. Active follow-up drafts ask at most three leading questions while preserving the complete internal checklist. A not-pursuing record retains its internal rationale without producing outward requests for more information. This prioritizes questions; it does not require a fixed work sequence or suppress legitimate alternative plans.

Screening now carries an explicit decision basis across linked scenarios. Possible duplicates, changed sources, inconsistent assumptions, modeled downside and unknown economic outcomes remain visible together. A favorable scenario cannot supply a missing resale/rent assumption for another. The first useful action identifies identity uncertainty or the relevant downside/conflict/stale/incomplete scenario before suggesting further review. Source correction changes that recommendation. Values still come exclusively from the existing deterministic calculator, and company acceptance thresholds remain unknown.

### Scenario-specific screening questions

The November 1 capability pass adds provisional screening-question method `v1 / 2026-11-01.1`. The next action now names the affected private scenario and its concrete missing input, mismatched assumption, evidence exclusion or adverse calculated case. An unknown range endpoint stays unknown even when its opposite endpoint is recorded; a deliberate zero is preserved. Cash scenarios do not ask for loan inputs, interest-only scenarios do not ask for amortization, and rental reviews ask for rental evidence separately from candidate sale prices. Missing source references/dates are distinguished from missing amounts. Older assumption evidence and excluded comparables prompt specific review questions without being declared verified or automatically included.

Each scenario leads with at most three actionable questions, followed by the complete existing missing-input/evidence/warning checklist. These are employee-private decision aids. They do not replace the source-only wholesaler follow-up draft, choose a recipient, save new assumptions, supply invented values, mandate a tool route or authorize an acquisition. Adverse-case wording quotes the existing calculator's saved case and amount; it does not infer an acceptance threshold or a forecast. Corrections change the next question through the same reviewed scenario service. Not-pursuing records retain their existing decision boundary.

The screening method version joins the private analysis board/detail access references, including an empty analysis board, so history and saved work retire prior advice after guidance changes. It does not enter base opportunity fingerprints, change the calculator version or invalidate otherwise-current stored calculations. Changed opportunity sources still withhold prior scenario numbers and questions. Employee-private scope and current entitlement checks remain in effect on every retrieval.

Eight additional authored tests cover corrected missing inputs, explicit zero, financing distinctions, price/repair reconciliation, adverse cases, comparable correction, rental source questions, method-version invalidation and private/stale/not-pursuing boundaries. These are functional service checks with providers disabled; actual-model interpretation and practitioner acceptance of the expanded questions remain open.

Excellent-output example: “One scenario is positive, but the alternate cannot calculate profit because its resale assumption is missing. Supply that input and its source before relying on the comparison.” The complete favorable arithmetic remains available; the incomplete alternative is not treated as zero or silently dropped. Authored variations also cover simultaneous downside/disagreement, duplicate submissions, a stale alternative, revised terms and withdrawn opportunities. This does not establish expert valuation or source verification.

## Connected GM journey — November 1

The presentation-only `opportunity-journey.ts` joins current intake/screening with accessible shared follow-through. It never changes base opportunity identity or derives source fingerprints from coordination, avoiding circular invalidation. The ordinary API, Copilot and saved `review_opportunity` capability carry the handoff reference, so assignment/report/source changes retire old advice. Current-source summaries distinguish employee reports from manager resolution; obsolete assignment evidence stays in history rather than appearing as current completion. Desktop/native exact links connect opportunity and handoff without granting access. Managers can act from Team overview.

Explicit presentation setup adds one fictional opportunity and an authored assignment/acknowledgment/blocker through existing services, once under its own marker. It preserves existing work, does not renew expired access and never contacts a provider. This is sample history, not evidence of a conversation with a real wholesaler. See DEMO_RUNBOOK for the cross-role rehearsal and PROGRESS for verification.
