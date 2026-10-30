# Capable workforce development plan

## Product outcome

An employee describes the result they want in ordinary language. Their persistent Copilot finds the relevant context, chooses specialists and tools, completes authorized work, follows up as events change, and explains what actually happened. Dashboard, SMS and Slack are ways to reach the same assistant and ongoing work. Employees should not have to learn a command vocabulary or manually route each step between specialists.

This is a company-wide product for dispositions, acquisitions and management. All three need complete role-specific workflows. Dispositions should have more specialists and greater depth where its work requires it, without making the other roles secondary. Alex contributes firsthand dispositions examples; acquisitions and management requirements need dedicated validation.

The owner wants high capability, useful autonomy, easy messaging and routine adoption, with Grok Bot and ChatGPT's agent/task experiences as competitive reference points. This document translates that direction into a development plan. It does not claim those capabilities are implemented or authorize live company access, sending, spending or deployment. Repository updates remain authorized. The existing relationship and communications plans provide completed building blocks and still apply to their implementation details.

## Executable roadmap

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the authoritative implementation order and detailed acceptance checklist for the A–F phases below. It defines work packages, dependencies, three release levels, the immediate A1–A3 durable execution/cost checkpoint and the mapping from existing specialist/communications phases. The [specialist delivery matrix](AI_EMPLOYEES.md#capability-depth-delivery-matrix) covers all 16 specialists. The bounded A1–A3 implementation is described in [WORK_EXECUTION.md](WORK_EXECUTION.md); broader checklist items remain planned and do not upgrade specialist readiness.

## What exists and what must change

The inspected application has persistent conversations, scoped domain records, private employee preferences, sourced investor journeys and structured corrections, a specialist registry, validated model tools, durable research jobs, messaging/task receipts, a fictional communications inbox and reviewed simulation workflows.

The current general text runner executes a bounded request/tool loop. Its default is five model rounds and eight tool calls, configurable within explicit ranges in provider-config.ts. Tool schemas and dispatch are defined in orchestrator.ts; local fallback uses narrower deterministic routing. A new durable-work layer can now compose eight local capabilities, save dependencies, resume progress and enforce a fictional whole-job budget. Its worker does not add model reasoning or real provider research. Broader planning, channel controls and missing-information continuation remain incomplete. Many specialist results are deterministic summaries or demonstrations. Four registered specialists remain planned. The current inbox simulator accepts only its generated relationship reply, attachments are metadata only, and model approvals, broad outbound delivery, recurring multi-source briefs and participant-aware title opening are not implemented.

The goal is to expand available work and make execution reliable. Removing a limit or changing a prompt does not create a missing connector, expert method or completed workflow. Convert long work into resumable jobs with adjustable task budgets rather than making a request loop run indefinitely. Keep deterministic calculations, validation and state changes reliable while using reasoning for interpretation, planning, ambiguity and synthesis.

## Shared assistant capabilities

### Plan and carry work through

Introduce a durable work record containing the employee's request, desired outcome, entities, sources, steps, dependencies, assigned specialist methods, current status, permissions used, cost budget, results and follow-up conditions. Persist progress across restarts, channels and tool boundaries. Support cancellation, changed instructions, pause for an essential answer, partial completion, retries and reconciliation when a provider outcome is uncertain. Completed mutations must not repeat when a job resumes.

Use model-generated plans that compose registered capabilities. Templates provide useful methods and checkpoints; they must not restrict every request to a fixed script. Allow independent reads/research to proceed concurrently where permissions and task dependencies allow it. Verify outputs before treating a step as complete, and present concise progress or a result rather than narrating every internal call. Unsupported work needs a specific missing capability or essential question, not a vague refusal or invented completion.

The first implementation slice should use existing local services and mock adapters. It should prove a multi-step work record can survive a restart, accept a correction through a second channel, finish without duplicating actions and show the same status in the UI. Use one small useful example for each role; do not begin by replacing every functioning workflow.

### Retrieve the right working context

Maintain distinct, linked records for employees, contacts/investors/wholesalers, properties, opportunities, deals, parties, conversations, documents, commitments and work runs. Preserve fact sources, dates, uncertainty, corrections and ownership. A role-specific model should retrieve relevant evidence on demand rather than receive a dump of every record or rely only on old chat text.

Keep personal style/preferences separate from shared relationship and deal facts. Support inspectable learning from corrections and accepted work. Suggested persistent preferences or facts must be reviewable; repeated behavior alone is not proof of a company rule. Freshness and conflicting evidence should change decisions, not just appear as badges.

### Give each specialist a working method

Every specialist needs a clear job, required context, source/versioned knowledge, reasoning method, useful tools, examples, expected outputs, failure handling and acceptance cases. Specialist methods may run in focused model contexts where that improves the result; deterministic work does not require a separate model persona. Copilot coordinates the result and remains responsible for its consistency.

Build richer methods for qualification, objections, valuation assumptions, diligence, handoff completeness, transaction dependencies and management exceptions. Do not turn one employee's account into a universal company SOP. Methods can begin with explicitly provisional assumptions and realistic fictional data; replace them with approved sources when supplied.

### Expand the tool and connection layer

Provide reusable capabilities to find/read/search, compare/calculate, work with documents, prepare updates, draft/send through supported accounts, manage tasks, schedule work and retrieve delivery/status receipts. Expand communication beyond the current generated-reply-only simulator: support employee edits, recipient/CC sets and selected document attachments through the applicable authorization and eligibility checks. The current simulator restriction is not the intended permanent product boundary. Bind each action to the actual employee, current records, connected account and authority. Discover relevant tool definitions as the capability set grows rather than exposing an unbounded tool catalog in every request.

Prefer reliable service APIs or supported connectors. Plan an isolated browser-assisted fallback for approved tasks that lack a suitable API, with employee-specific sessions, explicit action authority and result verification. This is an expansion path, not a claim that arbitrary websites will work or a substitute for missing company access. Do not run generated code with unrestricted company credentials. Share the planner and domain services between fictional and live adapters so the approved production connection changes the data/transport path rather than requiring an entirely new workflow.

## Autonomy without repeated interruptions

The employee should be able to authorize useful routine work once within company policy. Examples include a scheduled briefing, tracking replies for a particular deal, creating internal follow-ups, or a permitted follow-up sequence for selected contacts. The assistant then performs that work within the saved scope instead of asking again for every step.

Represent standing authorization as a real policy record: who granted it, applicable actions and contacts/deals/accounts, permitted content and attachments, spending/contact frequency limits, duration, revocation and exception conditions. A model-generated plan cannot grant itself authority. Recheck current records, consent/source eligibility and policy before the actual action. Current blanket approval restrictions remain in force until a tested replacement implements this proposed standing-authorization model; a prompt edit must not silently bypass them.

Use these product behaviors:

- Read, research within an authorized budget, summarize, calculate, draft and perform already authorized internal work without unnecessary approval steps.
- Execute routine external work covered by an explicit standing authorization, once the company connection and execution capability are approved and tested.
- Ask only for essential missing information or an action outside the current authorization. Present the prepared result and the specific decision needed.
- Support phone/Slack approvals where a short authenticated response can unambiguously authorize the current reviewed action. Use a linked review screen when the exact document, recipient set or attachment needs inspection. Do not force dashboard navigation for every task.
- Report actual results and reconcile uncertain delivery. “Prepared,” “sent,” “received,” “signed” and “confirmed” remain distinct outcomes.

This preserves useful autonomy while keeping employees in control of what the assistant does in their name. Authority is configurable; source truth, identity and confirmed execution are not optional.

## Job spending approval and automatic credit top-ups

The owner adds a mandatory approval point for any job costing **more than $1 in customer-facing AgentDesk Credits**. Quote the entire job across its specialist steps, show an estimate and a maximum, and ask the employee to approve or deny before paid execution. Exact $1.00 is within this threshold; other permissions and account caps still apply. A growing job must pause before crossing $1 or an already approved maximum. Standing task authorization, scheduling and splitting work into smaller calls cannot bypass this rule.

Add optional auto top-up with explicit payer opt-in, a chosen low-balance trigger, purchase amount and monthly auto-purchase cap. Buying credits never authorizes an expensive job. Settings and payment results must be visible and replay-safe. The detailed policy, implementation boundaries and required tests are in [USAGE_METERING.md](USAGE_METERING.md).

Phase A must include job-wide cost state, estimates/reservations and a waiting-for-cost-approval state using fictional accounting first. Subsequent autonomy and scheduled work reuse that service. Add simulated auto-top-up settings/outcomes to the wallet work; Phase E connects verified real usage/payment settlement. These requirements are not yet enforced by the current live provider path.

## Alex's dispositions acceptance journey

1. The employee asks for buyers for a named available property and a geographic area. Copilot identifies the exact current property and checks its availability.
2. Buyer Matchmaker searches permitted existing investor records first, considers distinct buy boxes, relevant relationship history and unresolved concerns, and returns a ranked shortlist with reasons and missing facts.
3. The assistant prepares appropriate individual messages from current eligible property facts and each relationship. It uses existing review or future standing-authority rules, avoids duplicate contact and records actual/simulated delivery accurately.
4. Investor Hunter is an optional extension for additional prospects. Show the estimated extra research cost and get the employee's choice; deduplicate against the CRM without revealing protected relationships.
5. New replies join the correct contact, property and deal. Copilot answers what changed and continues permitted follow-up work. Ambiguous associations are resolved rather than guessed.
6. The employee can request three daily briefings on selected subjects, choose times/timezone/channel and change or stop them. Scheduled updates summarize relevant changes and actions; they do not simply replay the same list. Urgent exceptions and quiet behavior are configurable.
7. Model Alex's reported signed-agreement plus confirmed-deposit condition as a proposed company-configurable reservation rule. Validate the authoritative evidence and shared marketing-state transition before claiming other agents have stopped marketing. Handle cancellations and revised documents explicitly.
8. The transaction record identifies the investor, acquisition agent, attorney, closing date and conditional lender contact. Cash and financed deals have appropriate participant sets. Source the correct agreement and deposit reference, prepare the title-opening email with its recipients/CC/attachments, and execute only within the applicable authority.
9. Track attorney acknowledgment, reported issues, clearance, signing, funding and closing as distinct events. Request missing contacts or documents once and continue when supplied. An email request does not establish title clearance or completed closing.

The present prototype does not complete this journey. Its existing pieces must be connected and extended; the demo should first exercise the entire selected slice with fictional records and truthful simulated receipts.

## Acquisitions and management tracks

Acquisitions needs a complete wholesaler/contact → submitted opportunity → property facts/comparables → repair and diligence assumptions → supported recommendation → reviewed release/handoff workflow. Extend the planned Acquisition Lead and Valuation & Due Diligence specialists and shared document/CRM/task capabilities. Identify the actual decision makers and approved sources with acquisitions practitioners; an estimate alone cannot become an authorized offer.

Management needs complete workflows for authorized workload and pipeline visibility, exceptions, handoff bottlenecks, assignments, team follow-through and decisions appropriate to the manager's scope. Validate what management actually measures and does. A summary dashboard or access to employee-private conversations is not a substitute for those requirements. Define scoped collaboration and company oversight separately from each employee's private assistant memory/mailbox.

All three tracks must have end-to-end acceptance examples and a visible readiness scorecard. Cross-role handoffs, changed assignments and access changes must work as part of the main workflow, not only in isolated screens.

## Development phases and exit conditions

| Phase | Work | Exit condition |
| --- | --- | --- |
| A Shared work execution | Durable work plans, capability discovery, resumable steps, channel continuity and clear outcomes | One useful multi-step task per role completes on fictional data, survives restart/changed instructions, avoids duplicate actions and respects whole-job cost approval |
| B Specialist knowledge and business context | Context retrieval, deal/party/document records, reviewable employee learning, versioned specialist methods and examples | Each priority specialist produces a supported result on varied cases; missing evidence changes its answer and corrections affect future work |
| C Complete role workflows and delegated actions | Build remaining specialists, expand existing tools, connect each role's journey, add tested standing authorizations and conversational reviews | Each role completes its agreed day-to-day workflows; routine authorized work proceeds without repetitive prompts and exceptions ask a precise question |
| D Proactive follow-through | Scheduled/event-driven work, reply tracking, deal watchers, configured briefings and corrective updates | Work runs with the app closed, follows changed facts, respects stop/revoke settings, and reports relevant results without duplicate noise |
| E Approved connections and company operation | Approved Salesforce/email routes, employee Slack/SMS and investor communications, documents, identity, company administration, production persistence/queues and observability | Live acceptance confirms authorized reads/writes/delivery, isolation, recoverability, costs and multi-employee operation; fake-data success alone is insufficient |
| F Comparative acceptance and rollout | Same-task product benchmarks, employee usability sessions, reliability/cost/latency evaluation and controlled rollout | Demonstrated useful performance for all three roles within the agreed task scope; publish measured results and remaining gaps |

Evaluation begins in Phase A and continues through every phase; Phase F consolidates release evidence. The relationship-specialist depth stages continue inside B/C and the communications plan supplies completed foundations plus E's connection work. Phases can overlap where dependencies permit, but no role disappears from the acceptance matrix. The executable roadmap sets the engineering dependency order now; role-specific methods and pilot acceptance still require the remaining employee/manager inputs and approved connection capabilities. No completion date or percentage is established by this plan.

## Definition of a finished specialist

A catalog label or one scripted demonstration is insufficient. A specialist is finished for its agreed scope only when it can understand varied employee requests, retrieve the needed context, reason with uncertainty, use its tools, produce useful work, recover from ordinary errors, continue across the supported channels and pass role-specific acceptance. Record its supported tasks, essential dependencies, authorization model, tests and remaining limitations.

Track separate dimensions: functional scope, knowledge/judgment quality, integration readiness, autonomy level and real employee acceptance. Include every existing specialist in the matrix, including the four currently planned ones; add or regroup roles only where discovered work warrants it. The goal is complete useful work, not maximizing the number of model calls or branded personas.

## Competitive reference and measurement

The comparison is with capable connected agents, not just text chat. Official Grok Bot documentation describes persistent work context, multi-step work with apps/computer tools, coordination between Bots, and reusable skills/routines. Official OpenAI documentation describes scheduled work that can use connected tools, skills and plugins, with supported event-triggered tasks on eligible plans. Product availability and behavior depend on account and environment. These references describe capability, not measured performance on New Western tasks.

Sources inspected October 30, 2026: [Grok Bot overview](https://docs.x.ai/grok-bot/overview), [Grok Bot skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations), [OpenAI scheduled tasks](https://learn.chatgpt.com/docs/automations).

The proposed AgentDesk advantage is lower setup effort, immediately useful role knowledge, current relationship/deal context, convenient messaging, reliable handoffs and verified outcomes on New Western work. General agents also have tools and memory; their mere presence is not differentiation. Demonstrate the advantage with the same tasks, fictional/authorized data and equivalent available access. Report setup time, successful completion, factual errors, missed commitments, employee edits, unnecessary interruptions, latency, cost and repeat usage. Score blocked/missing connections separately; do not quietly give only AgentDesk the needed information. No superiority or retention claim is established until those comparisons and employee trials are run.

## Current checkpoint

The bounded A1–A3 runtime checkpoint now uses existing services and fictional budgets, with role-specific starters and initial Work queue controls. Actual verification is recorded in PROGRESS.md. No real provider call, investor message, payment or deployment was performed for this checkpoint. Next are A4 shared conversational controls and A5 optional simulated top-up, with continued A6 quality evidence; deeper specialist methods follow the dependency order without waiting for company connections.
