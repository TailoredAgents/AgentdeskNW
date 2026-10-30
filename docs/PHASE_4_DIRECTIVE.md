> **Historical reference.** Preserved from an earlier request or checkpoint. Later owner decisions and [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) govern current scope, status and ordering. Claims, prices, test results and “next” instructions below belong to their original context and do not verify the current working tree or deployed version.

# AGENTDESK — PHASE 4 DEVELOPMENT
## Activate Real AI Intelligence, Live Voice Conversations, and External Investor Research

**Company:** Tailored Agents
**Project:** AgentDesk AI Workforce
**Development environment:** Existing local Codex Work project
**Model:** GPT-6 Astra Ultra
**Date:** October 29, 2026
**Target demonstration:** Monday, November 2, 2026

---

# 1. MISSION

You have completed three development phases of AgentDesk.

The latest Phase 3 Git checkpoint is:

`2701e3ad70bbd10e20a97f6fe0692ad3e1161ef3`

Your reported implementation includes:

- Personal Copilot with persistent conversations.
- Sixteen AI Employee definitions.
- Twelve specialists with local/demo capabilities.
- Research jobs, evidence tracking, and scoring.
- Investor profiles and multiple buy boxes.
- Property releases and buyer matching.
- Call debriefs, follow-ups, tasks, and approvals.
- Daily calling priorities.
- Deal Package Composer.
- Desktop and mobile experiences.
- Subscription Marketplace.
- Subscription bundles and individual specialist selection.
- Backend entitlements and usage metering.
- Billing simulator.
- Organization sponsorship and access policies.
- 117 passing automated tests and 93 API checks.

**Phase 4 is about making AgentDesk genuinely intelligent and useful with live AI.**

We have already built the foundation and commercial infrastructure.

Now we need to connect real AI services, enable natural voice conversations, and make Investor Hunter capable of performing actual external research.

Do not start a new project.

Do not redesign the application unnecessarily.

Do not discard working features.

Preserve the existing Git history, data, migrations, subscriptions, and entitlements.

Start by auditing the actual codebase and documentation, then implement the improvements below.

**This is an implementation assignment. Do not stop after planning.**

---

# 2. OUR CORE PRODUCT VISION

AgentDesk should feel like a personal, JARVIS-style AI assistant for every real estate employee.

Each employee has one intelligent assistant that understands their work, maintains context, delegates to specialized AI Employees, and helps complete authorized tasks.

Users should not need to know which AI Employee handles which task.

They should simply communicate with their assistant.

Example:

"Hey AgentDesk, who should I be calling today?"

The assistant should retrieve actual authorized investor and property data, use the relevant services, and provide useful recommendations.

Another example:

"Find me 50 new investors for this property."

The assistant should invoke Investor Hunter, create a real research job, track its status, and return findings when available.

Another example:

"I just spoke with Mike. He wants light rehabs under $250,000 in Cobb County. Update his information and remind me to follow up tomorrow."

The assistant should understand the conversation, resolve the appropriate CRM/demo records, prepare proposed updates, create a reminder, and accurately communicate what was completed versus what awaits approval.

**The defining feature is that the AI performs real software operations, not merely describes what it could do.**

---

# 3. FIRST: INSPECT THE EXISTING IMPLEMENTATION

Before modifying anything:

1. Read the repository's `AGENTS.md`.
2. Read `README.md` and `MASTER_PLAN.md`.
3. Read `docs/PROGRESS.md`.
4. Read the Phase 2 and Phase 3 completion reports.
5. Inspect the master assistant implementation.
6. Inspect the specialist registry.
7. Inspect the agent and tool dispatch system.
8. Inspect the subscription entitlement middleware.
9. Inspect the usage metering implementation.
10. Inspect the current voice interface and its backend.
11. Inspect Investor Hunter's research-worker implementation.
12. Inspect the investor research database schema.
13. Review existing tests and demo workflows.

Determine which integrations are placeholders, partially implemented, or production-capable.

Create a clean Git checkpoint before making risky changes.

Keep existing local data intact.

Then proceed with implementation.

---

# 4. PRIORITY ONE: ACTIVATE REAL AI CONVERSATIONS

Connect AgentDesk's master assistant to an actual supported OpenAI API model.

Research the current OpenAI API and Agents SDK documentation.

Use the current Responses API and supported SDK patterns where appropriate. Do not introduce the retired Assistants API.

## Requirements

The personal assistant must:

- Conduct natural conversations.
- Understand multi-turn context.
- Remember relevant previous work.
- Know the employee's identity and role.
- Retrieve permitted business information.
- Ask intelligent clarifying questions.
- Delegate to specialized AI Employees.
- Execute authorized tools.
- Interpret structured tool outputs.
- Maintain conversation continuity.
- Explain completed versus pending work.
- Handle errors and unavailable integrations gracefully.

Keep the same assistant personality across the application.

Do not create separate chat interfaces for every specialist.

## Master orchestrator

Use a manager-and-specialists architecture.

The master assistant remains responsible for communicating with the user.

Specialized AI Employees perform bounded work through tools or delegated tasks and return results.

For instance:

Employee:

"Find matching investors for the new Marietta property, then prepare a call list."

The assistant should:

1. Resolve the property.
2. Retrieve permitted investor profiles.
3. Invoke Buyer Matchmaker.
4. Obtain the actual matching results.
5. Invoke the relevant calling-priority workflow.
6. Return an actionable list with explanations.

Do not generate a fictional call list when real records are available.

## Important

Use existing application services whenever possible.

Do not unnecessarily wrap every database lookup in another expensive LLM call.

Simple tasks should use direct service functions.

Complex interpretation and research should use AI where valuable.

Implement structured tool schemas, input validation, execution timeouts, error handling, and reliable result parsing.

---

# 5. CONNECT THE EXISTING AI EMPLOYEES

We currently have sixteen specialist definitions and twelve with local/demo capabilities.

Phase 4 should make the functioning specialists usable through the real master assistant.

Each relevant specialist must have:

- Clear tool descriptions.
- Validated input schemas.
- Structured output.
- Correct authorization.
- Entitlement enforcement.
- Consistent error reporting.
- Usage recording.
- Appropriate approval requirements.

Examples of working requests:

"Prepare a briefing for my next investor call."

"Which investors match the new property?"

"Take these notes and update Mike's buying criteria."

"Prepare a property package for this investor."

"What should I do next on this deal?"

"Show me my top five calling priorities."

"Start researching new buyers for this address."

Each request should route to the relevant implemented workflow.

If a specialist is still unfinished, it should not pretend to operate.

Keep all sixteen AI Employees in the catalog and preserve the four currently unfinished specialist statuses.

Implementing these existing capabilities correctly takes priority over inventing new specialists.

---

# 6. PRESERVE SUBSCRIPTION AND ACCESS ENFORCEMENT

Phase 3 introduced an important commercial system.

Do not bypass it when enabling real AI.

Every specialist invocation must pass the existing entitlement and authorization checks.

For example:

An employee subscribes to AgentDesk Core but not Investor Hunter.

If they ask for new external investor research, the assistant should explain that Investor Hunter is a premium capability and offer the existing upgrade path.

If Investor Hunter is included in their subscription, the system may invoke it subject to permissions and usage limits.

## Important for local demonstration

Codex reported that Alex's demonstration account currently has only the $49 Core subscription.

Do not silently grant Investor Hunter access or bypass the entitlement system.

If the Monday demonstration needs Investor Hunter, use the existing authorized local demo billing mechanism to activate it or grant an explicitly labeled temporary trial entitlement.

The same policy must apply to text, voice, direct API requests, and worker jobs.

**A voice conversation must never become a way to bypass subscription or business permissions.**

---

# 7. PRIORITY TWO: FULL LIVE TWO-WAY VOICE CONVERSATIONS

This is one of our most important product differentiators.

We want real spoken conversations, not simple voice dictation.

An employee should open AgentDesk on their phone or computer, tap the microphone, and speak naturally to their personal assistant.

The assistant should respond verbally.

The user should be able to interrupt, ask follow-up questions, and issue new instructions without restarting the session.

## Target experience

Employee:

"Hey AgentDesk, what should I focus on today?"

Assistant:

"You have three investor follow-ups and a new property release that appears to match two investors you work with. Would you like to review the strongest opportunity first?"

Employee:

"Yeah, tell me about that property."

Assistant:

[Retrieves the actual available property data and responds.]

Employee:

"Prepare the buyer information for me."

Assistant:

[Invokes the appropriate authorized workflow.]

The spoken exchange should remain naturally conversational while supported tools operate behind the scenes.

## Technical implementation

Investigate the current OpenAI Realtime API and OpenAI Agents SDK realtime capabilities.

Prefer a WebRTC-based browser implementation where supported.

Requirements:

- Real microphone input.
- Actual model-generated speech output.
- Interruption and turn-taking.
- Natural follow-up questions.
- Reliable audio session lifecycle.
- Connection and permission states.
- Reconnection behavior.
- Error handling.
- Transcript or conversation record where appropriate.
- Tool calls through the existing secured backend.
- Synchronization with the employee's assistant context.
- Subscription and usage enforcement.

Use short-lived credentials issued securely by the backend.

Never expose permanent OpenAI API keys in the browser.

## Voice and text coordination

The voice experience and text experience must share underlying employee identity, relevant context, tasks, and persisted work records.

If the employee creates a task during voice, that task should appear in the normal task interface.

If Investor Hunter starts during voice, the research job should appear in the existing research dashboard.

A user should be able to return later and ask about that task or job.

Do not create an isolated voice chatbot disconnected from the main assistant.

## Voice behavior

Keep a consistent voice and assistant identity.

Avoid exposing unnecessary internal orchestration details to users.

Use brief spoken confirmations for completed actions.

When a task will take time, the assistant should explain that the job has started and provide an appropriate completion notification when the actual job finishes.

Do not have the assistant claim an action is completed when only the request was queued.

## Usage limits

Respect the current Core allowance of 60 live voice minutes per month, unless the configurable pricing data specifies otherwise.

Implement actual usage reconciliation using supported session/provider data.

Do not bill based on guessed or fabricated usage.

Support configurable limits, alerts, and clean session termination when applicable.

## Phone compatibility

Optimize the experience for mobile browsers and the existing PWA.

Consider microphone permissions, audio output, reconnecting, screen locking, and app lifecycle behavior.

Do not promise uninterrupted voice operation in the background on mobile platforms unless the environment actually supports it.

---

# 8. PRIORITY THREE: MAKE INVESTOR HUNTER PERFORM REAL EXTERNAL RESEARCH

Investor Hunter is probably the most valuable specialist for New Western's dispositions agents.

Right now, Codex reports a working research pipeline using fictional records.

We want to connect that pipeline to actual external research providers.

## Critical definition

Investor Hunter does **not** simply search existing Salesforce buyer records.

It takes a subject property's address and researches external investors who may be likely to purchase that specific property.

The goal is to discover genuinely new investors not already in New Western's database.

Salesforce is used afterward for duplicate checking, existing relationship detection, and permitted import.

Do not confuse this with Buyer Matchmaker.

## Example request

"Find 50 new investors for 123 Example Street, Marietta, Georgia who have recently purchased similar houses in similar price ranges."

The system should:

1. Analyze the subject property.
2. Gather available property characteristics.
3. Research relevant external buying activity.
4. Identify investors and purchasing entities.
5. Compare actual purchases against the subject property.
6. Attempt to resolve business/company identity.
7. Find appropriately sourced contact information.
8. Rank relevant prospects.
9. Check permitted existing CRM records for duplicates.
10. Save evidence and return actionable research results.

## Research methodology

Prioritize actual evidence of relevant property purchases.

Alex, an experienced New Western dispositions agent, reports that the strongest research signal is an investor's history of buying similar property types at similar price ranges.

Evaluate:

- Recent investor acquisitions.
- Similar property types.
- Comparable transaction prices.
- Geographic buying patterns.
- Fix-and-flip versus rental strategies.
- Repeat purchase behavior.
- Evidence of current market activity.
- Verified investor company identity.
- Available professional contact information.

Avoid assuming every nearby cash buyer is a good prospect.

Do not fabricate investment activity or contact information.

## External research integration

Research the current supported OpenAI Responses API web-search capabilities and practical third-party property-data APIs.

Design a provider-based architecture.

Potential source categories:

- Publicly accessible property transactions.
- Authorized county deed and assessor records.
- Licensed property data providers.
- Public corporate records.
- Company websites.
- Other lawful public business sources.
- Authorized contact enrichment APIs.

Real property purchase history may require paid or licensed data. General web search alone may not establish reliable recorded buying activity or ownership identity.

Do not treat a web search snippet as verified ownership evidence.

If a provider requires credentials or a license, create a proper integration boundary and document what is missing.

Do not bypass provider restrictions, scrape prohibited sources, or invent substitute data.

## Research evidence

Each investor result should preserve the supporting evidence.

Where available:

- Investor or company name.
- Associated purchasing entity.
- Related transactions.
- Property addresses or transaction references.
- Dates.
- Purchase prices.
- Property characteristics.
- Investor strategy indicators.
- Relevant source links.
- Contact details.
- Contact verification status.
- Confidence level.
- Research timestamp.

Do not label unverified information as verified.

Support multiple sources for important conclusions.

## Contact information

Research legitimate and appropriately sourced business contact channels.

Record the source and confidence for each phone number or email.

Do not guess contact details.

Do not rely on an unsupported assumption that a person with a similar name is the owner of a purchasing LLC.

If no verifiable contact can be found, preserve the prospect and label contact information unavailable.

Any future outbound prospecting should respect applicable contact, privacy, consent, and do-not-call requirements.

This phase is research only. Do not contact investors.

## Ranking

Improve the existing scoring methodology based on:

- Transaction recency.
- Similarity of purchase price.
- Similarity of property type.
- Geographic activity.
- Investment strategy.
- Repeat acquisition behavior.
- Supporting evidence quality.

Return an explainable score and ranking.

Do not describe scores as verified purchase probabilities without appropriate statistical validation.

## Important: candidate counts are targets

If an employee asks for 50 investors, that is a search target.

It is not a requirement to manufacture 50 results.

Returning 18 credible investors is better than generating 50 questionable entries.

Clearly distinguish researched candidates, qualified candidates, and candidates with verified contact information.

---

# 9. INVESTOR HUNTER MUST REMAIN A DURABLE BACKGROUND JOB

Preserve the Phase 1–3 worker and job architecture.

Research operations may take significantly longer than normal conversations.

The system should support:

- Queued jobs.
- Running jobs.
- Progress checkpoints.
- Partial validated results.
- Completed jobs.
- Failed jobs.
- Canceled jobs.
- Retries.
- User notifications.

An employee should be able to start a job and continue working.

When the job finishes, it should be available through their personal assistant and the research dashboard.

Example:

Employee:

"Did you finish finding those investors for the Roswell property?"

AgentDesk:

[Checks the actual persisted job status.]

If complete, return real saved results.

If running, return accurate status.

If failed, explain the failure and available recovery action.

Do not use model-generated guesses as job status.

## Cost and research scope controls

Investor Hunter can generate significant external research and enrichment costs.

Preserve the Phase 3 credit and usage system.

Add:

- Configurable research scope.
- Job-level cost budgets.
- Tool-call limits.
- Provider rate limits.
- Maximum research duration.
- Cost and usage logging.
- Safe retry behavior.
- Idempotent usage accounting.
- Stopping conditions when the approved budget is reached.

The included Investor Hunter allowance is provisional.

Do not assume that one research credit is financially equivalent to a fixed number of search calls or verified phone numbers.

Capture real cost evidence before recommending final pricing.

Avoid expensive unrestricted recursive research.

---

# 10. PRIORITY FOUR: REAL AI ACROSS EXISTING WORKFLOWS

Once live text AI is operational, connect it to the high-value functions Codex already built.

## Post-call debriefs

Employee says:

"I just spoke with John. He's buying cash, prefers cosmetic rehabs under $250,000 in Cobb County, and wants me to send him the photo link."

The assistant should:

- Resolve the correct investor.
- Resolve the relevant property.
- Extract actual stated buy-box criteria.
- Prepare a structured note.
- Prepare reviewed investor-profile updates.
- Identify the requested deal package.
- Prepare the next action.
- Save appropriate task or reminder information.

Do not treat conversational statements as verified CRM data without the required confirmation.

## Daily calling priorities

Employee says:

"Who should I call first today?"

Use the actual permitted records and existing ranking service.

Return the top opportunities and explain why each is relevant.

Do not fabricate investor activity.

## Deal packages

Employee says:

"Prepare the Marietta property information for Mike."

Use the existing package workflow.

Retrieve authorized property details and media links, evaluate disclosure eligibility, and prepare a real draft.

Do not send the message externally unless a properly authorized delivery integration is available.

## Next-step guidance

Employee says:

"What should I do next with this buyer?"

Use available context and approved workflow rules.

Ask targeted questions when information is missing.

Explain relevant next steps and offer to complete permitted tasks.

Do not create a separate training mode.

## Approvals

When the assistant prepares a consequential action, the existing review mechanism should still work.

The assistant must know the difference between:

- Prepared.
- Awaiting approval.
- Approved.
- Executing.
- Completed.
- Failed.

It must communicate those states accurately.

---

# 11. KEEP LIVE AI AND DEMO DATA CLEARLY SEPARATED

An application can have a real OpenAI connection while still using fictional Salesforce records.

That is acceptable for our Monday demonstration.

However, the software must not misrepresent its data sources.

Distinguish:

**Live AI + fictional CRM**

Actual model reasoning and tool use operating on demo records.

**Live AI + live external research**

Actual external research performed through configured providers.

**Demo research**

Synthetic or prerecorded examples explicitly labeled as demonstration material.

**Production Salesforce**

Not yet authorized or connected.

Do not label the entire application as fully production-integrated merely because the master assistant uses a real model.

---

# 12. AUTHENTICATION, PERMISSIONS AND SECURITY

Preserve all existing backend authorization and subscription enforcement.

For every live AI tool call:

1. Identify the authenticated user.
2. Resolve the organization and office.
3. Check role and record permissions.
4. Check specialist entitlement.
5. Check usage allowance.
6. Validate tool inputs.
7. Apply approval requirements.
8. Execute through authorized application services.
9. Record actual outcomes.
10. Record usage and audit metadata.

Never trust the AI model to enforce security solely through instructions.

Do not allow voice tools or background workers to bypass restrictions.

Treat external research material as untrusted content.

Protect against prompt-injection attempts in web pages, property descriptions, and other retrieved material.

Do not allow a retrieved page to alter the assistant's instructions, disclose sensitive information, or initiate unauthorized actions.

No real outbound investor calls, SMS campaigns, email campaigns, or production Salesforce changes are authorized in this phase.

---

# 13. API CREDENTIALS AND CONFIGURATION

We need a secure, straightforward setup experience for OpenAI credentials and external provider credentials.

Inspect the existing `.env.example` and configuration.

Document the exact required environment variables.

Requirements:

- Keep secrets server-side.
- Never commit credentials.
- Never expose permanent keys in frontend bundles.
- Use current supported models and API endpoints.
- Fail gracefully when credentials are missing.
- Display clear connection status.
- Support local development without requiring production Salesforce access.

Do not invent API keys.

Do not assume a ChatGPT Pro subscription automatically provides OpenAI API credits.

If credentials are missing, complete the integration code and document the configuration process.

Do not claim a provider has been live-tested without actual successful API responses.

## Cost protection during development

Use small, bounded live test requests when authorized credentials are configured.

Do not launch extensive billable research tests without explicit approval of the intended scope and cost cap.

Avoid repeated uncontrolled requests.

Create configuration for model selection, research budgets, and voice session limits.

---

# 14. ACTUAL PROVIDER USAGE TRACKING

We now have a subscription and usage infrastructure.

Connect actual API activity to that infrastructure.

For text AI, capture provider-reported token usage when available.

For voice, capture supported audio/session usage.

For research, record:

- Research jobs.
- Web-search calls.
- External data-provider operations.
- Enrichment usage.
- Token usage.
- Actual known costs.
- Estimated costs only when clearly labeled.

Keep usage events idempotent.

Do not double-count retries.

Do not charge for simulated operations.

Build reports that help us determine whether the proposed $49 Core plan and $79 Investor Hunter add-on are economically sustainable.

---

# 15. MONDAY DEMONSTRATION — UPDATED OBJECTIVE

The main goal for Monday is to make the local GM understand what it feels like to have a personal AI workforce.

Show a functioning conversation rather than merely navigating dashboards.

## Ideal demonstration

### Scene 1 — Start a conversation

Employee opens AgentDesk.

"AgentDesk, what should I focus on today?"

The assistant uses actual fictional demo records and gives relevant priorities.

### Scene 2 — Ask for investor research

"Find new investors who would be likely to buy this property."

Investor Hunter starts a real research job if authorized providers are configured, or accurately identifies the research as a demo if not.

### Scene 3 — Prepare for an investor call

"Get me ready to call Mike."

The assistant retrieves the stored investor context and produces a useful briefing.

### Scene 4 — Capture a completed conversation

"I just spoke with Mike. He wants cash deals under $250,000, and he asked for the property photos."

The assistant prepares the appropriate updates and tasks.

### Scene 5 — Prepare a property package

"Get Mike the property information."

The assistant prepares the package, checks eligibility, and presents an accurate approval or compose state.

### Scene 6 — Switch to voice

Open the live voice experience.

"AgentDesk, what else should I be doing with this buyer?"

The assistant responds verbally using relevant context.

### Scene 7 — Demonstrate follow-through

Show the persistent task, pending action, or research job created earlier.

The employee should see that AgentDesk remembers what happened and continues to help.

### Scene 8 — Demonstrate subscription controls

Show that Investor Hunter is accessible only when Alex has the appropriate subscription or explicitly granted demo trial.

The commercial system must remain functional during the demonstration.

---

# 16. TESTING REQUIREMENTS

Maintain all existing passing tests.

Add meaningful integration and regression tests.

## Live assistant

- Actual model response when configured.
- Persistent conversation context.
- Correct tool selection.
- Correct structured tool execution.
- Tool failure recovery.
- No false completion claims.
- Entitlement enforcement.
- Unauthorized record access attempts.

## Voice

- Session creation and cleanup.
- Short-lived credential handling.
- No permanent API key exposure.
- Subscription checking.
- Usage-limit enforcement.
- Tool invocation.
- Reconnection and termination.
- Graceful microphone permission failure.
- Text/voice work-context continuity.

## Investor Hunter

- Provider response parsing.
- Evidence requirements.
- Candidate scoring.
- Contact verification status.
- Duplicate checking.
- Job status.
- Cancellation.
- Retry.
- Cost-budget enforcement.
- No synthetic prospect leakage into live results.
- Proper treatment of unavailable sources.

## Regression

Verify:

- Marketplace.
- Bundles.
- Subscriptions.
- Trials.
- Sponsored specialists.
- Usage accounting.
- Research jobs.
- Tasks.
- Approvals.
- Investor profiles.
- Property releases.
- Deal packages.
- Demo CRM updates.
- Tenant isolation.

Run lint, type checking, the test suite, API checks, production build, and browser walkthroughs where supported.

Do not report a live provider as verified when it was tested only with mocks.

---

# 17. IMPLEMENTATION PRIORITY ORDER

Work in this order unless the actual codebase reveals a better dependency sequence.

**P0 — Live text AI**

Connect the master assistant to OpenAI, preserve conversation context, and make tool calling work reliably.

**P1 — Existing workflow execution**

Make the real assistant use existing AgentDesk services through secure, permission-aware tools.

**P2 — Live voice**

Implement genuine two-way spoken conversation, with interruptions, tool use, and shared work context.

**P3 — External Investor Hunter research**

Connect the research-worker architecture to real, lawful external research sources, with source-backed evidence and transparent cost controls.

**P4 — Integration polish**

Improve mobile behavior, research status, assistant notifications, failure handling, provider configuration, and demo quality.

Parallelize independent engineering work if supported and if it does not endanger architectural consistency.

Do not neglect Investor Hunter, but do not allow missing research-provider credentials to block completing the live text and voice experiences.

---

# 18. WHAT NOT TO WORK ON

The following belong to later phases unless a minimal change is essential for Phase 4:

- Production Salesforce OAuth.
- Real customer data migration.
- Stripe payment collection.
- Twilio production SMS.
- Live Slack deployment.
- Mass investor outreach.
- Automatic real investor calling.
- Native App Store submissions.
- Enterprise-wide deployment.
- New AI Employee concepts unrelated to the existing roster.

Preserve existing interfaces and future integration paths.

Focus on making the intelligence and interaction layers work.

---

# 19. DOCUMENTATION AND CHECKPOINTS

Update the appropriate existing documentation.

At minimum, document:

- Live model integration.
- Master assistant orchestration.
- Text and voice session behavior.
- Tool schemas.
- Provider configuration.
- Investor Hunter research sources.
- Evidence and scoring methodology.
- Usage metering and cost assumptions.
- Security boundaries.
- Demo limitations.
- Remaining integration blockers.

Update:

- `docs/PROGRESS.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/DEMO_RUNBOOK.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/INVESTOR_HUNTER.md`
- `docs/VOICE_AND_MESSAGING.md`

Use actual project paths if they differ.

Create a new Git checkpoint after verified implementation.

Preserve database backups and migration compatibility.

---

# 20. FINAL COMPLETION REPORT

At the end of the development run, report:

1. Which AI model and API were used.
2. Whether live text conversations were successfully tested.
3. Which existing AI Employees can be invoked through live conversations.
4. Whether true two-way voice conversations work.
5. Whether voice can invoke actual AgentDesk tools.
6. Whether Investor Hunter performed actual external research.
7. Exactly which sources and providers were used.
8. Whether any real investor contacts were verified.
9. Whether credits, entitlements, and usage limits were enforced.
10. Which features still use fictional records.
11. Actual tests and checks performed.
12. Any credentials or integrations still missing.
13. Current blockers.
14. Updated Monday demo procedure.
15. New Git checkpoint.
16. Highest-priority next development steps.

Clearly label the verification level for each major integration:

- **Implemented in code**
- **Tested with mocks**
- **Verified against live provider**
- **Verified through browser/user interaction**
- **Production-ready**

Do not describe something as production-ready merely because it passed mocked tests.

---

# 21. THE FINAL GOAL

When this phase is complete, AgentDesk should be substantially closer to our original JARVIS-style vision.

An employee should be able to speak naturally to one intelligent assistant that understands their role, remembers relevant work, delegates to authorized specialists, and helps complete useful tasks.

Investor Hunter should be capable of researching actual prospective buyers outside the CRM, with evidence and appropriate contact verification.

Voice should be a real two-way conversation, not just a microphone icon or a transcription feature.

The master assistant should genuinely coordinate the capabilities employees purchased through the subscription marketplace.

**Preserve everything built in Phases 1–3, connect real intelligence, test it carefully, and continue implementation autonomously through as many functional milestones as the development environment and available credentials permit.**

Begin Phase 4 development now.
