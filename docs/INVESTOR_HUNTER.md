# Investor Hunter

## Phase 4 verification and operating boundary

The external OpenAI Responses web-search adapter and asynchronous durable worker are **implemented in code and tested with mocked provider responses**. No OpenAI key or licensed property-data credentials were available for live verification. No real research was executed, no contacts were verified and no investors were contacted. This local concept does not represent New Western endorsement or production Salesforce access.

Two providers are explicitly separate:

- `synthetic-fixtures-v1` remains the default, with twelve fictional examples and no external provider expense.
- `openai-web-search-v1` uses actual Responses API requests when an operator explicitly enables it, supplies a server-side key and configures a conservative request-cost estimate. Each job also requires its own explicit estimate budget. It discovers public business candidates outside the CRM. Public claims are **unverified**; neither search snippets nor model output establish recorded purchases, LLC ownership, contact association or buying intent.

There is no automatic fallback from a failed external request to fictional candidates. The form, Copilot tool, voice tool and worker use the same service authorization and credit checks. Provider configuration is separate from subscription access. Alex's saved Core-only subscription is unchanged.

## Purpose and candidate targets

Investor Hunter researches potential buyers **outside the existing CRM** for a specific property. Buyer Matchmaker separately searches known authorized buyers. The initial provider, `synthetic-fixtures-v1`, contains 12 distinct explicitly fictional candidates. Requests accept counts from 1 to 100, but requests above 12 return only the 12 available fixtures. Phone numbers and source URLs are null, not fabricated. The full job and review pipeline is real; its candidates and evidence are fictional and must never be used as real leads.

A target count is a maximum requested output, not a promise of verified coverage. The system should return fewer prospects when evidence is insufficient rather than invent records. The founder’s reported research advantage is not independently validated.

## Pipeline

1. **Validate the subject.** Require address, county, price, strategy and count; accept an optional property type for similarity scoring. Identify missing location/property attributes before live research. The demo accepts employee input without pretending to have resolved the parcel.
2. **Discover external activity.** A provider retrieves licensed transactions or lawfully accessible professional sources. Store source identity, observation date, transaction date when known, source URL/record ID and limitations.
3. **Resolve entities.** Normalize entity names and addresses. Keep LLC/company attribution separate from a human contact. Do not infer an individual’s ownership solely from a matching surname or address.
4. **Assess fit.** Calculate transparent relevance factors against the subject property. Store every factor and its contribution, and keep unknowns visible.
5. **Check CRM duplicates.** Compare authorized CRM entities and contact identifiers, retaining exact, possible and uncertain outcomes. The local private duplicate service also compares protected same-organization records, returning only an opaque possible-duplicate flag with no matched ID. Production needs customer-approved identity and duplicate rules; hidden records are never disclosed.
6. **Review contacts.** Keep missing/unverified/verified status and source. The demonstration uses missing contacts; no invented phone numbers.
7. **Deliver artifacts.** Persist ranked results, evidence, filterable status and CSV. Prepare selected candidates for review as a stored CRM import action.
8. **Execute only after approval.** Recheck current duplicate and scope state before creating local records. Preserve an audit trail and safe repeated approval behavior.

## Data contract

`ResearchInput`: address, county, price, strategy, property type, target limit, optional explicit provider and `maxCostCents`. Property type and explicit budget are required for external jobs; synthetic jobs retain the prior optional-type contract. `ResearchJob`: ID, input, owner, provider, status, stage, progress, attempts, result list, error and creation/update timestamps. `Prospect`: entity/name, county, strategy, typical purchase price, transaction count, last activity, score, factor contributions, rationale, duplicate class, optional matched record, contact status, evidence and synthetic flag.

Every evidence item has an ID, title, nullable URL, observation timestamp, detail and synthetic flag; transaction evidence may include the compared property type. A missing URL or phone is explicitly missing; placeholder URLs/numbers must not imply verification. External evidence additionally includes source response ID, kind, unverified confidence, research observation time, and nullable reported transaction date/address/price/type. Candidate research timestamps remain separate from purchase dates. A missing purchase value is represented as unknown in the UI; its legacy numeric field is zero and contributes zero purchase-fit points. Actual licensed records will additionally need provider record keys, licensing/retention constraints and source revisions.

## Synthetic scoring retained for regression compatibility

`scoreProspect` in `src/server/research.ts` accepts configurable nonnegative weights with a positive total. Default weights total 100:

| Factor | Weight | Implemented baseline |
| --- | ---: | --- |
| Property type | 25 | Known normalized type equality; missing input/evidence contributes zero |
| Geography | 10 | County equality after case/space/“County” suffix normalization receives 1.0; other counties 0.25 |
| Strategy | 20 | Normalized strategy aliases match at 1.0; “both” matches either supported strategy; another strategy receives 0.25 |
| Price | 25 | `max(0, 1 - abs(typicalPrice - subjectPrice) / subjectPrice)` |
| Recency | 10 | Linear decay across 365 days; invalid or future activity dates receive zero |
| Activity | 5 | Transaction count / 8, capped at 1 |
| Evidence | 5 | Evidence item count / 2, capped at 1 |

Each factor is multiplied by its normalized weight; contributions are rounded to tenths and the total to an integer from 0 to 100. Evidence count is a simple demo signal, not an assessment of source independence or reliability. These formulas are deterministic and inspectable, not claims of empirically calibrated predictive quality.

County match is coarse geographic relevance, not measured parcel distance. Purchase-price similarity is not a financing qualification. Recency decays with age; future or invalid activity dates must not receive unwarranted confidence. Missing information must not be treated as a match. Research relevance does not imply purchase intent, investor quality, loan approval or guaranteed returns.

Before live pilot use, calibrate weights against a labeled sample of relevant and irrelevant buyers. Report missingness and review false positives. Property type now contributes when supplied, with aliases such as SFR/single-family and condo/condominium. Rehab similarity and source reliability grading remain future work. Demo transaction types are explicitly fictional. Property type plus price account for 50 points, reflecting Alex’s reported preference for comparable prior purchases; this weighting is a product choice, not a verified corporate rule.

## External evidence and scoring

The provider receives only the subject criteria and already discovered company names for deduplication. No CRM records, private notes, employee identity, credentials or internal tool definitions are sent for public search. Retrieved content is untrusted data. The provider has only hosted web search, with bounded calls and output tokens, and cannot call CRM mutation, messaging or approval tools.

Structured candidate JSON is validated independently per candidate. A malformed candidate does not discard valid siblings. Each retained evidence URL must occur in the provider's `web_search_call.action.sources` or URL citation metadata; invented JSON URLs are dropped. At least one actual search action and one retained source are required. Evidence links remain clickable. This validates provenance structure, not the factual truth of a page or its attribution to the candidate.

A reported transaction example requires both a source-stated property reference and a valid nonfuture date. Duplicate address/date examples count once across multiple sources. Price and property type are used only when present on these examples. Research time never substitutes for acquisition time. Company names are not resolved to private individuals. A public business phone is retained only with a cited contact claim containing that exact phone; it remains **unverified**, with its source. No enrichment or contact verification provider is active.

External scores deliberately discount unverified purchase assertions. Property type and purchase-price similarity receive at most 12.5 points each; recency at most 5; repeated distinct reported examples at most 2.5. Strategy receives 10 for a reported match, county 10 for equality, and distinct cited hostnames contribute up to 5 source-coverage points. Unknown factors receive zero. The maximum with the currently unverified evidence is 57.5 before integer rounding. Multiple domains indicate coverage, not proven source independence. These explainable relevance scores are not calibrated purchase probabilities. An independently verified licensed transaction pipeline must be separately validated before changing those labels or weights.

## Duplicate classes

| State | Interpretation | Import behavior |
| --- | --- | --- |
| `net_new` | No match in visible or privacy-checked same-organization records under current rules | Eligible for proposal, subject to execution-time recheck |
| `existing` | Strong match to existing allowed CRM record | Do not create another record |
| `possible_duplicate` | Similar permitted entity evidence, or opaque protected same-organization match with no ID | Review before import; never silently merge |
| `uncertain` | Identity evidence insufficient | Hold for identity review |

A `net_new` label in demo scope means no match in fictional same-organization records under the implemented rules, not proof of absence from all New Western systems. Research results refresh duplicate status when read, and import execution rechecks after any intervening local changes. The Jordan-owned Cedar & Stone fixture demonstrates an opaque private collision; Alex cannot retrieve its record details.

## Durable job lifecycle

`queued → running → completed`, with `failed`, `canceled` and synthetic `awaiting_input` states retained. Each external batch stores validated partial candidates and provider usage in migration 008's scoped `research_provider_calls` checkpoints. The existing synchronous synthetic stage runner is preserved; only the separate worker's `processExternalResearchJobs` performs external network requests. Browser polling does not trigger billable requests.

The worker claims a durable lease, rechecks the actual owner's role, current Hunter entitlement and credit reservation, then records a dispatch marker before sending a request **outside the SQLite transaction**. At most one request advances each job per worker pass. Dispatch markers and the provider-wide rate gate are serialized. A second worker cannot claim the same live lease. After a crash, an expired lease with a `started` request is marked unknown and never silently replayed.

Returned receipts are persisted separately from subsequent business-state transitions, including when subscription access changes or the employee cancels while the request is in flight. Cancellation stops further requests and releases unused research credits. Already dispatched external work may finish; its actual reported usage remains recorded and valid returned partial candidates are retained when current role/scope permits. Cancellation does not claim to undo incurred provider work.

A known HTTP failure can be explicitly retried within the **original** scope, deadline, request count and estimate budget. Completed requests and candidates are reused, never repeated. A retry cannot change provider or criteria. Interrupted/ambiguous requests, missing token usage or unresolved receipts block further spending until reconciliation; no unsupported automated reconciliation or replay is offered. Search reservations for ambiguous in-flight execution remain held, rather than presenting unknown usage as free. Failed/canceled research releases the unused target-credit reservation. A bounded successful research job settles its target credits once; a budget containing only failed requests does not consume them.

Partial results are visible on running, failed and canceled jobs and can be exported. CRM import remains a separate completed-job proposal requiring explicit approval and an execution-time duplicate check. Imported real public-source claims retain unverified provenance in the **local demo CRM**; they are not relabeled fictional or sent to Salesforce. Job completion and failures produce durable, deduplicated in-app notifications subject to preferences and quiet hours.

## Configuration and cost controls

All secrets remain server-side in the ignored local environment. Configuration status means ready to attempt a request, not a successful live verification. Set these only for an authorized, bounded live test:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENAI_API_KEY` | absent | Server-side OpenAI API project key; ChatGPT subscription is not an API credit |
| `AGENTDESK_RESEARCH_PROVIDER` | unset | Must explicitly equal `openai-web-search-v1` |
| `OPENAI_RESEARCH_MODEL` | `gpt-6-astra` | Responses model selected for public research |
| `AGENTDESK_RESEARCH_ESTIMATED_REQUEST_CENTS` | `0` | Required positive operator estimate; zero keeps external research disabled |
| `AGENTDESK_RESEARCH_MAX_COST_CENTS` | `200` | Maximum employee-selected per-job estimate budget |
| `AGENTDESK_RESEARCH_MAX_CALLS` | `2` | Maximum HTTP requests per job, including failed/ambiguous dispatches |
| `AGENTDESK_RESEARCH_MAX_SEARCH_CALLS` | `4` | Maximum hosted search calls; each request gets at most two tool calls |
| `AGENTDESK_RESEARCH_MAX_DURATION_MS` | `180000` | Elapsed deadline from first dispatch attempt; retries do not extend it |
| `AGENTDESK_RESEARCH_TIMEOUT_MS` | `45000` | Request timeout, shortened by remaining job duration |
| `AGENTDESK_RESEARCH_MAX_OUTPUT_TOKENS` | `4000` | Output/reasoning token ceiling per request |
| `AGENTDESK_RESEARCH_MIN_INTERVAL_MS` | `2000` | Minimum interval between provider dispatches across jobs |
| `AGENTDESK_RESEARCH_BATCH_SIZE` | `10` | Maximum requested candidates per request; output is still a target |

External scope is the supplied county, property type, price and strategy. No recursive geographic expansion, automatic contact enrichment or unrestricted tool loop exists. Limits are snapshotted per job; lowering server caps can stop existing work sooner. The worker stops before a new request would exceed the configured estimate budget, at the call/search caps, deadline or target, and on unknown usage.

The dollar budget governs **configured conservative estimates**, not an invoice guarantee. Model input/search context cost and provider pricing may vary; request timeout does not guarantee provider execution stopped. Use account-level provider spend controls as an additional limit. Actual known provider cost remains `null` because Responses usage is not an invoice. No money is collected. Do not infer a fixed price per research credit or verified contact from this simulator.

The central `provider_operations` ledger records scoped operation/response IDs, provider-reported input/output tokens, the count of returned `web_search_call` actions of type `search`, dispatched requests, status and separately labeled estimates. Missing usage is omitted/unknown, never invented zero. Search usage reconciles from trusted server receipts, including a reported count above the admission estimate; a provider exceeding a bound stops further work. Idempotent operation IDs prevent double counting. Research token evidence is reported separately from Core chat usage; Hunter target credits remain the provisional allowance mechanism.

## Licensed property-data boundary

`src/server/property-data.ts` defines `LicensedPropertyDataProvider` and `RecordedPurchase` with entity, parcel/reference, address, nullable transaction date/price/type, retrieval time and provenance. The current adapter deliberately throws a disconnected error. No credential, paid product, account rights or buyer/entity mapping has been validated. It does not call guessed endpoints or substitute web snippets for licensed records.

ATTOM's official documentation describes API-key authentication and `sale` / `saleshistory` resources, including property-specific sales history. This is a practical candidate for recorded transactions, subject to selected product access, Georgia coverage/freshness, buyer/entity fields and commercial retention/reuse rights. The V4 migration applies only to its specified endpoints; other sale/history endpoint paths retain their versions, and geographic searches may require `geoIdV4`. An ATTOM key alone is insufficient proof of the needed license or verified contacts. [ATTOM API documentation](https://api.developer.attomdata.com/docs), [authentication and request examples](https://api.developer.attomdata.com/docs/guides), [V4 migration scope](https://cloud-help.attomdata.com/article/613-upgrading-to-property-api-v4).

Before enabling licensed discovery, obtain a representative authorized response fixture, map exact transaction and purchasing-entity fields, validate pagination/rate/billing rules, and preserve source-specific rights and provenance. County records, corporate registries and contact providers likewise need an authorized supported access method. No prohibited scraping, paywall bypass or people-search inference is implemented.

The implemented external adapter uses the supported Responses `web_search` tool, required search, complete source inclusion and clickable URL citations. The official guide distinguishes billed search actions from page-open/find actions, and source lists from selected citations. [OpenAI output and citations](https://developers.openai.com/api/docs/guides/tools-web-search#output-and-citations), [complete source lists](https://developers.openai.com/api/docs/guides/tools-web-search#sources), [web-search limitations](https://developers.openai.com/api/docs/guides/tools-web-search#limitations).

## Pilot research quality gate

Select one authorized Georgia property and produce a human-reviewed evidence sample before outreach. Verify identity, relevant acquisition examples, business contact association, duplicate status and source rights. Track requested candidates, candidates found, supported candidates, contact availability, duplicate exclusions and review corrections. Do not claim a genuine researched example exists until it has actually been prepared and verified.

## Verification

`tests/external-research.test.ts` exercises provider parsing/provenance, unknown purchase data, unverified contact association, setup and per-job scope/budget validation, synthetic/live separation, network outside transactions, actual receipt settlement, partial failures and safe retries, in-flight cancellation, interrupted-request holds and lease recovery, budget/rate/deadline stops, missing usage, entitlement removal before/during requests, and protected CRM duplicates. These are mocked integration tests, not live investor research. The root progress log records the final complete regression/build/smoke results.
