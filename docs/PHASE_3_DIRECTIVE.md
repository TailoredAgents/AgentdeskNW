# AGENTDESK — PHASE 3 DEVELOPMENT
## AI Employee Marketplace, Subscriptions, Bundles & Usage Billing

You have completed AgentDesk Phase 2, saved under Git checkpoint `de77fac`.

Your report stated that the application includes 16 AI Employee roles, 12 with local/demo capabilities, investor intelligence, property releases, call debriefs, CRM approvals, research jobs, and working desktop/mobile interfaces.

Your next assignment is to implement **the commercial subscription and AI Employee Marketplace system**.

We are deliberately prioritizing this BEFORE activating real OpenAI text/voice, real external Investor Hunter research, or production Salesforce integrations.

Preserve all existing functionality and architecture.

Do not restart or rebuild the application.

## 1. The business model

Every employee subscribes to AgentDesk Core for **$49/month**.

This gives them their personal AI assistant and four foundational AI Employees:

1. Conversation & Call Notetaker.
2. Workflow Navigator.
3. Salesforce Assistant.
4. Daily Coordinator.

Core also includes the master assistant, persistent conversation history, permitted CRM workflows, tasks, memory, proactive notifications, web/mobile access, and an allowance of AI and voice usage.

The other 12 specialized AI Employees are optional monthly add-ons.

An employee can purchase them individually or through discounted bundles.

**Important:** Every employee always uses the same master AI assistant. Subscribing to additional specialists expands what that assistant can do.

Do not create separate assistant personalities, separate conversations, or fragmented user experiences.

## 2. Individual AI Employee prices

Implement the following preliminary pricing configuration:

| AI Employee | Monthly price |
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

These are our proposed launch prices, not finalized customer-facing commitments.

Build them as configurable pricing records rather than scattering hardcoded prices throughout application logic.

## 3. Discounted subscription bundles

Provide these options:

### AgentDesk Core — $49/month

Includes the master assistant and four foundational AI Employees.

### Dispositions Productivity — $108/month

Includes Core plus:

- Buyer Matchmaker.
- Investor Qualification.
- Investor Relationship Manager.
- Deal Marketing & Package Composer.

### Dispositions Complete — $179/month

Includes Core plus all six dispositions specialists:

- Investor Hunter.
- Buyer Matchmaker.
- Investor Qualification.
- Investor Relationship Manager.
- Deal Marketing & Package Composer.
- Investment Deal Analyst.

### Acquisitions Suite — $98/month

Includes Core plus:

- Acquisition Lead Assistant.
- Valuation & Due Diligence Assistant.
- Acquisition-to-Disposition Coordinator.

### Management Suite — $98/month

Includes Core plus:

- Team Performance Assistant.
- Onboarding & Coaching Assistant.

Employees can subscribe to a bundle and purchase specialists outside that bundle individually.

Do not charge twice for a specialist already included in a bundle or sponsored by the organization.

The subscription calculator must always show the correct total.

## 4. Build the AI Employee Marketplace

Create an attractive, premium-quality marketplace integrated into the existing AgentDesk interface.

Employees should be able to browse the available AI Employees, understand what each does, and select the ones they want.

Each specialist's card should show:

- Name and icon.
- Simple description.
- Monthly price.
- Included capabilities.
- Whether it is already active.
- Whether it is included with Core or a bundle.
- Whether the employee's organization sponsors it.
- Whether it is technically operational or still in development.
- An option to add or remove the subscription when permitted.

Include useful role-based filtering for dispositions, acquisitions, management, and general operations.

Do not show nonfunctional specialists as production-ready.

Employees should have a **My AI Workforce** page showing their selected AI Employees and active capabilities.

Use a premium design consistent with the existing application.

Make the full experience responsive on mobile.

## 5. Build a subscription configurator

Employees should be able to choose a subscription and immediately see their monthly cost.

For example:

AgentDesk Core: $49
Investor Hunter: $79
Deal Marketing: $19

**Total: $147/month**

Support:

- Individual add-ons.
- Discounted bundles.
- Bundle switching.
- Add-on removal.
- Accurate monthly totals.
- Avoidance of duplicate charges.
- Clear descriptions of usage allowances.
- Trial status if enabled.
- Company-sponsored capabilities.

The interface should make it obvious which abilities the employee is purchasing.

## 6. Build actual entitlement enforcement

This is extremely important.

The marketplace must not be purely visual.

The application needs a functioning authorization and entitlement system.

When an employee activates an AI Employee, that capability becomes available to their master assistant.

If they do not have access, the master assistant should recognize the limitation and explain that the specialist is available as an upgrade.

Example:

Employee: "Find me 100 new investors for this property."

If Investor Hunter is not included in their subscription, AgentDesk should explain that Investor Hunter is an optional specialist and provide a convenient way to review it.

Do not silently perform premium operations without an entitlement.

Enforce access on the backend, including direct API requests, agent tool calls, worker jobs, and background tasks—not just UI controls.

However, never artificially require employees to purchase additional specialists merely because the underlying orchestrator calls shared infrastructure.

Core capabilities must remain useful independently.

Distinguish between:

- User's subscription entitlement.
- Role/company permission.
- Feature implementation status.
- Available usage allowance.
- Backend integration availability.

A paid entitlement does not override security permissions or make an unimplemented integration available.

## 7. Company-sponsored and mandatory AI Employees

New Western may eventually require certain AI Employees for certain roles.

Build support for organization-level policies.

An organization administrator should eventually be able to:

- Select required capabilities by role.
- Sponsor employee subscriptions.
- Enable approved AI Employees.
- Restrict certain specialist capabilities.
- Configure trial and subscription eligibility.
- View aggregate active seat counts.
- Review organization-level subscription costs.

Example:

New Western sponsors AgentDesk Core for all dispositions employees.

Alex personally purchases Investor Hunter and Deal Marketing.

His account should reflect the sponsored Core subscription and his personally selected add-ons.

Implement a clear separation between organization-paid and individually paid entitlements.

Do not assume New Western has already agreed to pay for any subscriptions.

## 8. Usage metering

Build a robust usage tracking foundation.

Track meaningful usage categories such as:

- Text AI inference.
- Live voice minutes.
- Investor Hunter research jobs.
- Research credits.
- External search/data provider usage.
- SMS segments.
- Other paid external operations.

Every usage event should include:

- User.
- Organization.
- Feature.
- Job or action identifier.
- Timestamp.
- Quantity.
- Unit.
- Associated allowance.
- Provider cost where known.
- Billing status.

Prevent double-counting when an operation is retried.

Do not charge for failed or canceled operations unless a clearly disclosed external cost was actually incurred and the billing policy permits it.

### Proposed included allowances

For planning purposes:

- Core includes 60 live voice minutes per month.
- Investor Hunter includes one standard research job targeting up to 25 candidates per month.
- SMS is a separately purchased add-on.

These are provisional allowances and must be configurable.

A target of 25 research candidates does NOT guarantee 25 verified investors or phone numbers.

Do not calculate actual research costs using fictional assumptions and present them as confirmed provider expenses.

Include a usage dashboard showing allowances consumed, remaining balances, and estimated charges where applicable.

## 9. Optional paid SMS

Create an optional SMS subscription priced at **$19/month**.

For the initial configurable pricing model, use a proposed allowance of 500 combined incoming and outgoing SMS segments per month, with proposed overage pricing of $0.04 per additional segment.

These figures are provisional and subject to provider economics.

SMS should not be enabled for an employee who has not purchased or been granted the feature.

Keep SMS separate from standard in-app conversations and supported external-app messaging.

The actual Twilio integration and live billing can remain disconnected for now.

Build the billing, entitlement, and usage architecture that those services will later use.

## 10. Billing infrastructure

We intend to use a service such as Stripe for payment processing.

Build a provider-independent billing abstraction with a clear path to Stripe integration.

Support the underlying concepts of:

- Customers.
- Subscriptions.
- Subscription items.
- Bundles.
- Add-ons.
- Sponsored seats.
- Usage allowances.
- Metered usage.
- Trial periods.
- Billing periods.
- Renewals.
- Upgrades.
- Downgrades.
- Cancellations.
- Failed payments.
- Invoices and payment status.

Do not store credit card information in our own database.

Do not activate actual payment collection without configured provider credentials and authorization.

For now, build a **fully functional local/demo billing simulator**.

Subscription changes in demo mode should genuinely persist to the local database, change entitlements, update calculated totals, and affect feature availability.

Clearly label simulated subscriptions and payments.

Develop the Stripe integration boundary so we can connect it later without redesigning the system.

Use secure webhook verification and idempotent event processing when implementing real billing.

## 11. Free trials

Support a configurable 14-day trial.

For demo purposes, allow an administrator to grant temporary access to selected premium specialists.

The system should know:

- Trial start date.
- Trial expiration date.
- Included specialists.
- Included usage allowance.
- What happens after expiration.

Don't silently start charging employees at trial expiration without appropriate billing consent and a configured payment mechanism.

The trial must not bypass role permissions or other business security policies.

## 12. Subscription management interface

Create a **Billing & My AI Workforce** area.

Employees should be able to see:

- Current plan.
- Active specialists.
- Monthly subscription total.
- Company-sponsored capabilities.
- Next billing date in a real billing environment.
- Trial status.
- Current usage.
- Available upgrades.
- Pending downgrades or cancellations.

In demo mode, billing dates and financial activity must be clearly identified as simulated.

Include an accessible upgrade and downgrade experience.

For local testing, a developer/admin demo control may simulate activation and cancellation, but it must be secured and impossible to expose as an unauthenticated production billing bypass.

## 13. Subscription data model

Inspect the existing database schema before making changes.

Extend it to support appropriate structures for:

- Product catalog.
- Subscription plans.
- Plan versions/prices.
- Specialist add-ons.
- Bundles.
- Bundle contents.
- User subscriptions.
- Organization-sponsored entitlements.
- Role-based required capabilities.
- Subscription lifecycle events.
- Usage allowances.
- Usage records.
- Research credits.
- Billing periods.
- Payment provider references.
- Simulated billing events.
- Audit history.

Use existing naming conventions and architecture.

Apply database migrations without deleting current records or breaking existing workflows.

Keep tenant and employee ownership boundaries intact.

## 14. Preserve the existing AgentDesk experience

The subscription system must integrate naturally with the existing master assistant.

Example:

An employee subscribes to Investor Hunter.

They can then simply say:

"Find me 50 new investors for this property."

The assistant should be able to delegate to Investor Hunter within the available permissions, implementation capabilities, and usage allowance.

They should not have to open a separate chatbot.

The same applies to Buyer Matchmaker, Deal Marketing, and the other AI Employees.

If the user removes Investor Hunter, their existing research history should not automatically disappear.

Preserve records, respect access policies, and restrict new premium execution when the entitlement ends.

## 15. Monday demo experience

We want to demonstrate the subscription concept without actually collecting payments.

Prepare this flow:

1. Open AgentDesk's AI Employee Marketplace.
2. Show the $49 Core plan.
3. Browse the specialist catalog.
4. Activate Investor Hunter.
5. Add Deal Marketing.
6. Show the resulting $147/month subscription.
7. Open the employee's AI assistant.
8. Show that the selected specialists are available.
9. Simulate removing a specialist.
10. Demonstrate that the assistant recognizes the entitlement change.
11. Show the usage dashboard and remaining allowances.
12. Show a discounted bundle and how the subscription calculation changes.

Use clearly labeled fictional/demo user accounts.

No real billing or New Western account changes should occur.

## 16. Testing requirements

Add automated tests for:

- Base subscription entitlement.
- Individual add-on activation.
- Bundle activation.
- Bundle overlap without double billing.
- Correct price calculations.
- Company-sponsored features.
- Role restrictions.
- Specialist tool authorization.
- Direct API entitlement bypass attempts.
- Trial expiration.
- Upgrade/downgrade transitions.
- Usage limits.
- Usage-event idempotency.
- Research credit consumption.
- SMS entitlement enforcement.
- Tenant isolation.
- Historical data preservation.
- Simulated billing lifecycle events.

Run all existing tests and ensure the Phase 2 features still work.

Also run lint, type checking, production build, and browser walkthroughs when supported.

Report actual results rather than assumed success.

## 17. Documentation

Update the existing project documentation.

Add or update:

- `docs/PRICING_AND_PACKAGES.md`
- `docs/BILLING_ARCHITECTURE.md`
- `docs/AI_EMPLOYEE_MARKETPLACE.md`
- `docs/USAGE_METERING.md`
- `docs/DEMO_RUNBOOK.md`
- `docs/PROGRESS.md`

Clearly distinguish pricing proposals from finalized commercial decisions.

Document which billing capabilities are simulated and which are integrated with real providers.

Update `AGENTS.md` if necessary to ensure future development respects subscription enforcement.

## 18. What NOT to work on in this phase

We will handle these in a separate development assignment:

- Activating live OpenAI text conversations.
- Connecting real-time voice to live AI.
- Connecting actual external Investor Hunter research providers.
- Production Salesforce OAuth.
- Live Slack messaging.
- Live Twilio SMS.
- Real Stripe charges.
- Production deployment.

Preserve their existing code and interfaces.

Do not remove or break anything already implemented.

You may make small compatible changes to shared interfaces when the subscription system requires them.

Avoid unnecessary scope expansion.

## 19. Final development instructions

You are authorized to continue implementation autonomously in the current project.

Start by inspecting the current codebase and identifying the safest way to integrate the billing and entitlement layers.

Then implement the marketplace, subscription configuration, role/feature entitlements, billing simulator, and usage metering.

Do not stop after writing documentation or planning.

Keep the existing application functional.

Preserve the Git history and establish a new checkpoint after successful implementation.

At completion, report:

1. What you built.
2. What changed in the database.
3. How subscription and entitlement checks work.
4. How the AI Employees become available or unavailable.
5. Which billing features are simulated.
6. Which provider integrations remain disconnected.
7. Which tests passed.
8. How to demonstrate the system locally.
9. What remains to be built.
10. The exact Git checkpoint.

**Our goal is to make AgentDesk a customizable AI workforce that employees can subscribe to and expand according to their needs.**

Every employee should have one personal AI assistant. The subscription determines which specialized AI Employees that assistant can use.

Build that commercial system now, while preserving the JARVIS-style experience that makes AgentDesk different.

Begin implementation.
