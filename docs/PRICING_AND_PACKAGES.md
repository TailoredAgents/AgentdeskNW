# Proposed pricing and packages — Phase 3

All amounts are proposed USD monthly prices, not finalized customer commitments. This application simulates billing locally. It never collects payment or stores payment-card data. No New Western sponsorship agreement is assumed.

## Catalog

| Product | Monthly price | Included specialists |
|---|---:|---|
| AgentDesk Core | $49 | Conversation & Call Notetaker, Workflow Navigator, Salesforce Assistant, Daily Coordinator |
| Dispositions Productivity | $108 total | Core + Buyer Matchmaker, Investor Qualification, Investor Relationship, Deal Marketing |
| Dispositions Complete | $179 total | Productivity + Investor Hunter + Investment Deal Analyst |
| Acquisitions Suite | $98 total | Core + Acquisition Lead, Valuation & Due Diligence, Acquisition-to-Disposition |
| Management Suite | $98 total | Core + Team Performance + Onboarding & Coaching |

| Individual add-on | Monthly price |
|---|---:|
| Investor Hunter | $79 |
| Buyer Matchmaker | $25 |
| Investor Qualification | $15 |
| Investor Relationship Manager | $19 |
| Deal Marketing & Package Composer | $19 |
| Investment Deal Analyst | $29 |
| Transaction & Document Coordinator | $19 |
| Acquisition Lead Assistant | $19 |
| Valuation & Due Diligence Assistant | $29 |
| Acquisition-to-Disposition Coordinator | $15 |
| Team Performance Assistant | $39 |
| Onboarding & Coaching Assistant | $19 |
| Optional SMS | $19 |

## Arithmetic and sponsorship

- Core + Hunter + Deal Marketing = **$147/month personal**, $0 company.
- Company-sponsored Core + personally selected Hunter and Deal Marketing = **$98/month personal**, **$49/month company**.
- Selecting Dispositions Complete with Hunter and Deal Marketing again still costs **$179**; redundant add-ons are removed from the quote.
- Productivity + Hunter + Transaction Coordinator = **$206**.
- Required capabilities are company-sponsored. Repeated required/sponsored entries are counted once.
- A bundle allocates the Core amount first, then allocates its remaining price across premium components in proportion to their standalone prices, in integer cents with the last component absorbing rounding. Sponsored components credit that allocated personal share. Organization cost is the standalone sponsored seat price; no organization volume discount has been invented.
- Role restrictions remain independent. A dispositions employee cannot activate the Acquisitions or Management bundle. Managers can select bundles for their permitted capabilities.

## Configurable versions

`src/server/billing-catalog.ts` supplies initial records; `billing_catalog` owns persisted versions. The secured `POST /api/billing/price` endpoint accepts a product ID, `monthlyCents` and its complete `allowances` map. Only the explicitly assigned platform demo administrator Taylor can version global prices. Existing subscriptions retain their price/allowance snapshots until a deliberate plan change; a new quote uses current prices. All arithmetic uses cents.

Core initially includes 60 voice minutes and a **100,000 text-token planning assumption**. The latter is a configurable implementation assumption, not a user-approved final commercial allowance. Hunter includes one research credit targeting up to 25 candidates. SMS includes 500 combined incoming/outgoing segments, with proposed 4¢ segment overage. These do not represent confirmed provider economics.

The four unfinished specialists remain labeled **In development** even when selected. Their selection is simulated; no money is taken. Real commercial launch needs explicit decisions about selling or discounting unfinished capabilities.
