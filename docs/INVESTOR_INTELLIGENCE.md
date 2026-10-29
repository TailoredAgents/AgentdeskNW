# Investor Intelligence — implemented local demonstration

Investor Intelligence extends the existing investor records and services; it does not replace Salesforce or introduce another AI Employee. The shared browser/server types are in `src/lib/intelligence-contracts.ts`. `src/server/intelligence.ts` owns reviewed buying criteria, relationship context, disclosure fixtures, matching, briefings and calling priorities. `src/server/access.ts` owns investor visibility and privacy-preserving duplicate checks.

All sample investors, property characteristics, purchase evidence and disclosure records are fictional. Alex’s discovery observations inform the workflow but are not verified New Western corporate policies.

## Profiles and access

A profile combines the existing identity, company, contact fields and CRM notes with relationship source, a nullable Salesforce reference, qualification status, visibility, explicitly shared users, buy boxes, disclosure, history, buying-activity state and last call outcome. Default qualification and buying activity remain unknown or needing confirmation. An `interested` outcome improves engagement; it does not automatically declare an investor actively buying. The current profile does not claim verified contact information or verified purchase history.

Default demo relationships are owner-only; an authenticated manager may inspect their own office. Explicit sharing and office visibility grant read access. Organization visibility and cross-office sharing must be enabled in the organization ownership policy. Only an owner or manager of the owning office may change the profile. Manager reassignment is configurable, restricted to existing members of that office, audited, and resets sharing to owner-only. Actual company transfer and sharing rules remain unconfirmed.

A same-organization duplicate service can compare protected records while returning only `possible_duplicate` and a null matched ID. It never returns hidden names, notes, contacts or record IDs. It does not search another tenant. The Jordan fixture exercises this without adding to Alex’s initial three investor records.

## Multiple buy boxes and review

An investor may have multiple independent, active or inactive buy boxes. Each supports label, states, counties, cities, ZIPs, excluded areas, geographic flexibility, price/ARV ranges, property types, size and bedroom/bathroom constraints, strategies, rehab levels and financing preferences. Unknown numeric values remain null. Ranges and bounded arrays are validated.

Existing CRM criteria are copied into a primary box on first authorized intelligence use. Original CRM records remain intact. Initial fictional profiles have explicitly seeded single-family criteria. Imported research does not turn typical purchase price into a confirmed budget.

A change creates a pending `buy_box` action. It includes the original source statement, a captured timestamp, changed-field conflict messages, and the previous version for an edit. Nothing changes until authenticated approval. Approval rechecks access and version inside the existing action transaction. Stale versions fail; repeating an approved action does not duplicate writes. Previous box versions are preserved in `buy_box_versions`.

`provenance` describes the latest revision. `fieldProvenance` retains source, statement, captured time, verification, review and synchronization state for each affected criterion. Unchanged fields keep their earlier provenance: reviewing a price update does not imply that inherited counties were reconfirmed. Seed evidence is `seeded_demo`; proposals are `extracted` and pending; approved changes are `employee_confirmed`. Employee review is not independent external verification. Synchronization remains `local_demo`; no Salesforce synchronization has occurred.

Approving the primary box updates mapped legacy CRM fields. Conversely, existing approved `crm_update` changes synchronize only the affected primary-box criteria, with review/source provenance. Additional boxes remain separate. Timeframe remains a legacy qualification field. A future customer-approved Salesforce mapping must decide how multiple boxes map to remote records.

## Three distinct scores

External Investor Fit belongs to Investor Hunter. Its weights are property type 25, comparable purchase price 25, strategy 20, geography 10, recency 10, repeat activity 5 and evidence count 5. It is not a CRM engagement score.

Deal-to-Buyer Match evaluates each active box and returns the best box for each permitted investor:

| Factor | Points | Current rule |
| --- | ---: | --- |
| Geography | 20 | Matching recorded county or city, or explicit geographic flexibility; exclusions force the final score to zero |
| Price | 25 | Asking price within supplied lower/upper bounds |
| Property type | 20 | Normalized type equality; unknown type is not a match |
| Rehab | 15 | Recorded tolerance at least the property’s required level |
| Strategy | 15 | Normalized strategy match, including supported aliases |
| Other constraints | 5 | No known size/bed/bath/ARV conflict |

The response includes positive reasons, conflicts, missing information, the selected box, disclosure readiness and a separate engagement score. State/ZIP preferences are stored, but precise matching requires property evidence not present in the baseline property model; these appear as missing evidence. ARV constraints use the latest authorized release’s explicitly sourced demo estimate. Financing is captured and missing funding is surfaced; no lender approval or property-specific financing eligibility is inferred. A 100-point result means fit under this limited demo rubric, not certainty of purchase or a validated prediction.

Engagement uses recorded recency and explicit outcomes. Recent contact contributes up to 35 points; interested adds 35, connected adds 15, an explicitly sourced active state can add 20, and paused resets engagement to zero. Unknown activity is not invented. These deterministic rules are uncalibrated demo heuristics.

## Calling queue and briefings

The default calling queue contains the employee’s own investors and considers only released inventory they may access. Relevant property details come from the latest release, and revocation removes the opportunity. Shared reads do not add someone else’s investors to the employee’s default calling list.

Priority combines half the best property-fit score, 35 points for due/overdue commitments, 15 for no contact or more than 14 days without contact, 15% of engagement, 5 for a current synthetic signed disclosure, a 30-point reduction for a recorded pause, and an employee adjustment from -100 to 100. Reasons show the available evidence, missing phone number and disclosure requirements. Dismissal and manual priority persist per employee. Ties use stable investor IDs.

Briefings combine current boxes, disclosure, permitted relationship events, actual last outcome, the employee’s outstanding tasks, authorized matches and missing qualifications. No-answer and left-message attempts are not presented as the last conversation. If no captured history exists, existing notes remain available under the explicit label “Stored CRM notes (legacy; call date unverified)”; their date is not invented. Reviewed CRM notes create reviewed history; post-call recaps may also appear with their explicit unreviewed source label. The system does not access personal phone recordings.

Call outcomes record an actual timestamp and history. A connected/interested/not-interested/paused outcome updates last contact; no-answer or left-message does not fabricate a conversation timestamp. An optional explicit follow-up instant creates an internal task. Outcome capture does not send a message or approve CRM buying-criteria changes.

## Disclosure boundary

The conservative local policy requires `demo-disclosure-v1` before restricted property packages. Mike has a synthetic signed fixture with a `demo:` reference; Sarah and other profiles begin unknown. Only managers can modify demo disclosure evidence, only for synthetic records. A signed fixture needs the current version and a `demo:` document reference. Expiry is evaluated when read, and readiness requires a valid nonfuture signing timestamp, the current version, the evidence reference and a valid unexpired expiry value. These are not executed legal documents, e-signature verification or a way to self-attest a real investor’s signature. Production needs an approved policy, document and verified signing provider.

## Verification and remaining setup

`tests/intelligence.test.ts` exercises ownership/tenant/office boundaries, sharing and revocation, opaque duplicates, manager assignment, multiple boxes, stale approvals, field provenance, legacy CRM synchronization, match explanations, separate engagement, release visibility, queue ordering/dismissal, real call timestamps, commitments and synthetic disclosure controls. Existing Phase 1 domain tests remain part of the regression suite.

Remaining work includes real identity, company-approved sharing/assignment rules, verified Salesforce field mapping and synchronization, verified contacts and purchase evidence, authoritative release ingestion, a signed-disclosure integration, property state/ZIP evidence, explicit funding requirements and calibrated scoring. SQLite remains a local single-instance store and must move to PostgreSQL before multi-instance production.
