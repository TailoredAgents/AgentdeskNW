# AgentDesk NW — product direction

Updated October 30, 2026. This is the stable product brief, **not a second development schedule**. Use [the roadmap](docs/IMPLEMENTATION_ROADMAP.md) for current status, next work, dependencies and completion gates; [the documentation map](docs/README.md) for specifications; [PROGRESS](docs/PROGRESS.md) for evidence.

## What we are building

AgentDesk NW is a company-wide AI workforce for New Western's dispositions, acquisitions and management employees. Each employee has one persistent master Copilot that understands their work, retrieves the right business context, coordinates permitted specialists, carries out useful tasks and follows through. Employees can describe an outcome instead of manually operating every feature.

All three roles are primary audiences. Dispositions has more investor-facing work and should receive the corresponding specialist depth. Acquisitions works with wholesalers to assess opportunities and prepare handoffs. Management needs scoped visibility, coordination and resolution. Alex is a dispositions contributor; his examples do not define official company policy or replace discovery with the other roles.

The native iPhone/Android app is the primary daily experience, with Agent, Work and Inbox as the intended core workflow and a professional desktop workspace for detailed work. Employees use mixed phones, mostly iPhone, and do not currently use Slack. App access is included in the workforce subscription. Employee-to-Copilot SMS is an optional provisional $19/month convenience channel; Slack remains available for later demand.

## What should make it valuable

- **Convenience:** one conversation and work history across app, desktop, text, dictation, eventual live voice and configured messaging. Ask, leave, receive a useful update and continue without repeating context.
- **Understanding:** inspectable employee preferences; sourced investor/wholesaler/deal journeys; separate facts, assumptions, corrections, commitments and document versions. New information must change useful decisions.
- **Expertise:** all sixteen specialist scopes have methods, appropriate knowledge/tools, excellent-output examples and realistic quality evaluation. A catalog name or a separate model call does not prove expertise.
- **Execution:** composable durable work, essential clarification, progress/results, pause/cancel/change controls, recovery and verified outcomes. Routine authorized work proceeds without unnecessary interruptions.
- **Follow-through:** chosen briefings, reply/deal/commitment monitoring and relevant reminders on the employee's preferred channel, with quiet hours and no duplicate notification noise.

The ambition is to exceed general connected agents in usefulness for this business. That remains a hypothesis to test through equivalent-task comparisons and employee use, not a demonstrated advantage.

## Confirmed boundaries and commercial direction

Company email follows the existing Salesforce workflow first. Its underlying mailbox and supported read/send route require administrator discovery. Optional external email connectors remain in scope. Investor-facing business texting/numbers belong to a separate correspondence inbox; employee SMS messages instruct Copilot and must not be mixed with investor messages.

One workforce subscription includes implemented, role-authorized specialists. Current provisional simulated offers are $50 retail or a $30 explicitly assigned company seat, with $15 monthly usage credits. Pricing, business-line allowances and payer terms require validation; no company purchase commitment exists. See [pricing](docs/PRICING_AND_PACKAGES.md).

Before an entire job exceeds $1 in customer-facing credits, request approve/deny for its scope and maximum. Include delegated work and pause before exceeding an approved maximum. Optional payer-enabled auto top-up has a balance trigger, purchase amount and monthly cap. Funding never authorizes expensive work. The verified job gate uses fictional charges; optional automatic top-up has local simulated acceptance; real usage enforcement and actual purchases are unfinished.

Action authority should be configurable, including scoped standing permission for routine work once tested. It cannot be inferred from an AI response. Preserve current identity, source, eligibility and exact-review controls until their replacements are implemented.

## Experience and delivery

Preserve the selected light professional interface, ink sidebar and restrained green accents. Design native navigation and reviews for phones and give every role a useful home. Apply visual/accessibility passes to the whole product, including empty, slow, disconnected and error states.

Build and test realistic fictional workflows until company access is approved. The owner has no Apple/Google developer accounts yet, so prepare the apps locally and distinguish exports from actual installed-phone acceptance. Salesforce approval need not block fictional specialist development or owner-account channel testing.

There is a verified web/durable-work foundation and a locally verified mobile/shared-controls foundation. Neither means the full vision is complete. Track fictional workflow completion, connected pilot readiness and company rollout readiness separately in the roadmap. Preserve the current application and records rather than rebuilding functioning services for the native client.

The owner’s current development session prioritizes completing locally developable roadmap work with fictional data and simulated connections. Real-world/provider, physical-device and practitioner testing is deferred for a later assessment; keep those acceptance items open without blocking independent development.

GitHub commit/push remains authorized. A repository update is not evidence of a Render deployment; report each separately. The owner resumed implementation after documentation reconciliation. Follow the canonical roadmap and keep acceptance evidence current.
