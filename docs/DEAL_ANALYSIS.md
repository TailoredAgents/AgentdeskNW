# Shared deal economics and provisional diligence

This is a C4 domain contract under [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md), not another roadmap. The local fictional implementation serves Investment Deal Analyst (dispositions/management) and Valuation & Due Diligence (acquisitions/management). Both use one deterministic calculation engine; their summaries emphasize different questions. No verified valuation, offer, lender decision, licensed comparable data or practitioner acceptance is established.

## Assumptions and evidence

An employee selects an authorized inventory property or pre-inventory opportunity, strategy, financing and explicit numeric assumptions. Blank stays unknown; zero is deliberate. Purchase, repairs, exit/rental and financing each have a supplied reference and date. References are text, not fetched files or verified facts. Numerical scenarios may run with missing source references, but those gaps remain visible. Missing required numbers or financing prevent a complete calculation.

Method `2026-10-30.1` records its version and calculation date. Assumptions over 90 days old are flagged. Candidate sales over 180 days old are excluded under a provisional screen, retained for context. These windows are AgentDesk demonstration methods, not New Western policy. Active/pending prices, unknown price/area/date/source/type/distance, different property type, unexplained adjustment, nonpositive adjusted price, subject-self entries and repeated comparable addresses cannot contribute to the candidate range. Distance over five miles, area difference over 25% and adjustment over 20% produce review cautions. An employee can exclude an entry with a preserved reason. Three candidates do not establish an appraisal: the displayed range is only candidate adjusted sale prices, never inferred subject value. Address normalization handles case/punctuation, not all address aliases or parcel identity.

## Transparent calculations

| Scenario | Calculation and assumptions |
| --- | --- |
| Flip | Purchase + acquisition costs + repairs/contingency + loan points, non-debt holding costs, actual modeled interest and selling costs. Net sale cash pays off remaining principal. Principal payments reduce payoff rather than being counted twice as expense. Profit, cash contributed, sale proceeds, profit/resale and break-even price include formulas. |
| Flip sensitivities | Four explicit low/high resale and repair combinations, plus lower resale/higher repairs with three additional holding months. They are illustrative cases, not probabilities or forecasts. |
| Rental | Stabilized scheduled/effective rent, NOI after operations, first-year principal/interest payments, separate capital reserves, pre-tax cash flow, NOI/debt, NOI/purchase, NOI/acquisition-and-repair cost and cash-on-cash. Debt is not an operating expense. Cash-on-cash needs positive initial cash. A cash purchase has no debt-service ratio. |
| Rental sensitivities | Low/high repairs, rent 10% lower, vacancy five points higher (capped at 100%) and operating costs 10% higher. Renovation vacancy/carrying, growth, refinance, sale, depreciation and income tax are excluded, explicitly. |
| Financing | Cash, fixed interest-only or fully amortizing. Full principal advances at purchase, fixed nominal rate with monthly accrual, cent-rounded monthly payments and interest, terminal payoff correction. Origination points are separate. No draws, extension, mortgage insurance or unentered fees. |

Independent examples: $200,000 purchase + $5,000 acquisition + $40,000 repairs with 10% contingency + six $1,000 holding months, sold at $300,000 with 6% costs, produces **$27,000** cash project profit. Raising repairs to $60,000 yields **$5,000**. A $160,000 interest-only loan at 12% with two points reduces the first result to **$14,200**. A $100,000, 6%, 30-year amortizing loan pays $599.55/month; twelve cent-rounded payments leave $98,772 principal and $5,966.60 interest. These fixtures are fictional arithmetic examples, not transaction recommendations.

Definitions were checked against [CFPB's principal/interest explanation](https://www.consumerfinance.gov/ask-cfpb/how-does-paying-down-a-mortgage-work-en-1943/), [CFPB's payment-versus-escrow distinction](https://www.consumerfinance.gov/ask-cfpb/on-a-mortgage-whats-the-difference-between-my-principal-and-interest-payment-and-my-total-monthly-payment-en-1941/) and [Fannie Mae's disclosure glossary](https://www.fanniemae.com/media/document/pdf/disclosureglossarypdf). The app's NOI/debt ratio is illustrative; it does not implement a lender's underwriting definitions or qualification requirements. The local fixed-loan conventions above control reproducible results.

## Records, authority and continuity

Migration 027 adds private `deal_analyses` and immutable-by-service `deal_analysis_events`, scoped by organization/office/owner. Managers can create both methods but cannot read another employee's private scenario. Optional investor linkage rechecks current investor scope. Source ownership/role and company restrictions apply to every read; subscription cancellation preserves historical read while disabling new review/save/tool execution.

`GET /api/analyses` lists scoped records and source choices; `GET /api/analyses/:id` returns dated results and prior input versions. `POST /api/analyses/preview` binds exact employee inputs, source fingerprint, method/date and expected record version. `POST /api/analyses` accepts only that reviewed reference with a scoped idempotency key. Revision retains subject, investor and specialist; a different context requires a separate scenario. A changed reviewed input/source rejects save; exact retries return the current authorized record without another revision.

A changed source or method withholds old computed results until a fresh review/save. Old supplied inputs remain visible as version history. Explicit `analysisAccessReference` values protect conversation artifacts, cached tools, worker receipts and inherited plan context. Current model/voice context includes analysis fingerprints. Read-only `analysis_review` retrieves the board or one current saved result. `review_investment_analysis` and `review_diligence_analysis` are separate role/feature-authorized durable capabilities using the same service at zero fictional charge. Neither creates assumptions, sends, publishes or charges a provider.

Desktop Work queue → Copilot jobs → Deal analysis and native Work → Deal analysis use the same services. Phone editing guards navigation, preserves unknowns, shows formulas/evidence, supports exact retry and reviews the values before saving. Phone Work navigation scrolls horizontally to keep space for the selected work. Editors remain in memory; there is no offline draft store. Native builds/physical devices and real voice parity are separate acceptance.

## Evidence and remaining depth

The accepted local checkpoint includes 21 root analysis cases, two phone form cases and 59 isolated HTTP/worker checks, plus existing regressions, schema preservation and desktop-to-phone revision walkthrough. These establish calculation/authorization behavior, not effectiveness against a generic AI agent. Full property/repair evidence ingestion, licensed data, rent comps, jurisdiction-specific diligence, buyer-specific underwriting targets, report sharing/handoff, richer financing, market validation and practitioner quality remain open C4/C7 scope. Source strings never substitute for documents.


## Opportunity screening integration

Pre-inventory opportunity review now brings together the employee’s linked private diligence scenarios, using this engine’s existing dated metrics and sensitivity cases. It highlights supplied-versus-modeled price/repair differences and nonpositive modeled profit/cash flow without selecting only favorable scenarios. Desktop and native links open the exact saved analysis and sources. No new formulas or automatic assumptions are introduced. Changed sources withhold obsolete amounts, while private-board and exact scenario references protect Copilot and saved-work context. See [acquisitions intake](ACQUISITIONS_INTAKE.md#linked-acquisitions-screening) for the combined service and acceptance evidence. Complete valuation judgment, richer source ingestion and reviewed promotion/handoff remain open.
