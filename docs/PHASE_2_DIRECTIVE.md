# AGENTDESK — PHASE 2 DEVELOPMENT DIRECTIVE
## Integrating New Western Operational Intelligence, Investor Workflows, and Product Improvements

**Project:** AgentDesk by Tailored Agents  
**Development environment:** Existing local AgentDesk project  
**Current date:** October 29, 2026  
**Immediate milestone:** New Western office demonstration — Monday, November 2, 2026  
**Model:** GPT-6 Astra Ultra

---

# 1. IMPORTANT: CONTINUE THE EXISTING PROJECT — DO NOT RESTART

You have just completed the first working local build of AgentDesk.

Your previous completion report stated:

- Saved Copilot conversations implemented.
- Investor research jobs with evidence and scoring implemented.
- Call notes implemented.
- CRM approval and update workflows implemented.
- Tasks and notifications implemented.
- Sixteen-specialist AI Employee catalog implemented.
- 36 automated tests passed.
- 45 workflow checks passed.
- Lint, type checking, and production build passed.
- Research and Salesforce data currently use explicitly fictional demonstration records.
- OpenAI text/voice functionality still requires credentials and live validation.
- Production Salesforce connectivity and enterprise authentication remain unfinished.

**This existing work is valuable. Preserve it.**

We have since held a detailed discovery session with Alex, an actual New Western dispositions agent, who provided important information about their business processes.

We also reviewed a prior product concept he created, called DealIQ, which contains useful domain-specific ideas about managing investors, property matching, disclosures, follow-ups, and investor relationships.

We do NOT want to abandon the existing AgentDesk architecture, rename it DealIQ, or copy that concept's design.

We want to intelligently incorporate the best operational insights into AgentDesk.

This is a **targeted Phase 2 enhancement and implementation assignment**, not a new project.

## Your first action

Before changing anything:

1. Inspect the entire existing project structure.
2. Read `AGENTS.md`, `README.md`, `MASTER_PLAN.md`, and `docs/PROGRESS.md`.
3. Read the architecture, data model, AI Employee specifications, Investor Hunter specifications, and Monday demo runbook.
4. Inspect the actual implemented database schema, backend services, orchestrator, agent registry, API routes, UI, and tests.
5. Determine what is already implemented, partially implemented, or missing relative to the changes below.
6. Establish a clean source-control checkpoint if the project is using Git.
7. Avoid destructive changes or unnecessary rewrites.

Create an internal implementation plan mapped to the **actual existing codebase**, not assumptions about file names or implementation details.

Then begin implementing the changes.

Do not stop after updating Markdown documentation.

---

# 2. WHAT WE LEARNED FROM A NEW WESTERN DISPOSITIONS AGENT

These findings materially improve our understanding of the customer.

Treat them as first-hand operational observations from Alex, not as independently verified corporate policies.

## Finding A — Investor relationships are agent-owned in practice

Alex reports that each dispositions agent manages and owns their own investor relationships.

This means our system must support individual relationship ownership and permissions.

However, we do not yet know New Western's formal rules regarding record ownership, cross-office sharing, corporate visibility, transfer of relationships, or duplicate prospects.

Do not assume every Salesforce record is accessible to every AgentDesk employee.

## Finding B — Investor data is scattered

Investor information currently exists across:

- Salesforce.
- Personal notes.
- Text messages.
- Emails.
- Spreadsheets.
- Individual agents' personal knowledge and relationships.

A major purpose of AgentDesk should be capturing useful information and organizing it into structured investor profiles.

Do not assume Salesforce already contains complete or accurate investor buying criteria.

## Finding C — How New Western actually sources and sells deals

There are two primary sales divisions:

**Acquisitions**

Acquisitions agents source investment opportunities, often through relationships with other wholesalers or retail real estate agents.

Those outside sources may bring motivated sellers or properties under contract.

Some transactions involve an upstream wholesaler, a contractual position, and a coordinated or double-closing structure.

**Dispositions**

Once New Western releases a property for marketing, approximately 20 dispositions agents at Alex's office may begin contacting their own investor relationships.

The agents compete to find a qualified end buyer.

In the transactions Alex described, the intended end buyer commonly uses cash or hard-money financing, and New Western may coordinate its acquisition and resale closing on the same day.

This is NOT a conventional residential brokerage process involving only a seller, listing agent, buyer, and closing.

Our workflow model must reflect New Western's actual investment-sales structure.

Do not assume every transaction follows the same contract sequence. Build configurable stages and confirm company policy before encoding specific legal or operational rules.

## Finding D — Buyer matching is largely manual

Agents currently filter investor criteria in Salesforce to find potential buyers for properties.

This confirms the value of:

- Structured investor buy boxes.
- Automatic deal matching.
- Prioritized investor suggestions.
- Clear reasons explaining each match.
- Fast investor outreach preparation.

## Finding E — The strongest external investor research signal

Alex says that for finding NEW investors likely to purchase a property, the strongest signal is prior purchases of similar properties within comparable price ranges.

This should influence Investor Hunter's matching and ranking methodology.

Location remains important, but geographical proximity alone is insufficient.

## Finding F — Agents primarily use personal cell phones

Dispositions agents generally use personal cell phones for investor calls.

There is no regular call-recording or transcription system available to Alex.

Therefore, do not build our initial call-note workflow around assumed access to automatically recorded telephone calls.

We need an easier immediate solution.

## Finding G — Major post-call administrative headache

After speaking with investors, Alex frequently needs to:

1. Update buying criteria in Salesforce.
2. Retrieve the relevant property email or notes.
3. Copy important property information.
4. Locate the property's Google Drive photo link.
5. Compose a personal text, iMessage, or email.
6. Send the requested information to the investor.
7. Remember or manually schedule the next follow-up.

This is a major opportunity for AgentDesk.

We want the AI to eliminate as much of this repetitive preparation as possible.

## Finding H — New agents struggle with daily organization

Alex says new dispositions agents often lack efficient day-to-day organization and repeatable systems.

They also spend substantial time:

- Skip tracing.
- Researching investors.
- Scrolling through MLS information.
- Finding active flippers.
- Reverse searching for buyers.
- Manually identifying suitable matches.

They need help spending more time speaking with serious investors.

## Finding I — Daily calling priorities matter

When asked what AgentDesk should proactively do, Alex selected:

**Show me the top-priority investors I should call every morning.**

This should become a prominent capability, not a minor reminder feature.

## Finding J — Employees want substantial automation

Alex favors AI being able to:

- Create internal notes, reminders, and tasks.
- Complete approved routine Salesforce workflows.
- Potentially send authorized outreach automatically under company rules.

We should design configurable autonomy and approval policies.

Do not interpret this as authorization to send real external messages without consent, approved communication policies, or the necessary integrations.

## Finding K — Preferred communication channels

Alex favors:

- AgentDesk mobile application.
- SMS.
- Slack or another familiar communications application.

Live two-way voice remains a major product requirement.

SMS will be a paid add-on because it generates provider costs.

Given this feedback, prioritize the mobile experience and investigate Slack as the first external messaging integration.

Telegram can remain an optional future adapter.

## Finding L — Investor disclosure process

Alex reports that investors are supposed to complete New Western's disclosure before receiving property information.

He also says Marketplace access requires disclosure.

In practice, agents sometimes share preliminary property information before the disclosure has been signed.

**Important: We must design around approved company requirements, not informal exceptions.**

Until formal policy is confirmed, use a conservative default that prevents AgentDesk from externally sharing restricted property-specific information without the required disclosure.

Do not create a bypass that imitates informal noncompliant practices.

## Still unknown

Alex does not know:

- What precise business metric would convince the GM to purchase AgentDesk.
- Who can authorize a Salesforce-connected pilot.
- Who controls enterprise integrations.
- The official investor ownership and duplicate-contact rules.
- The authoritative property-release data source.
- The complete formal disclosure requirements.

These must remain documented as unknowns requiring New Western confirmation.

---

# 3. KEEP THE CORE AGENTDESK VISION INTACT

Do not change the following architectural commitments:

- One main personal AI assistant per employee.
- A master orchestrator that delegates to specialized AI Employees.
- All 16 existing AI Employee roles retained.
- No separate training versus execution modes.
- Guidance and education naturally integrated into task execution.
- Employee-specific context and persistent conversations.
- Salesforce as the primary CRM and system of record.
- Investor Hunter focused on external, net-new investor discovery.
- Live, natural, two-way voice conversations.
- Mobile-first experience.
- Optional external messaging application.
- SMS as a paid add-on.
- Proactive assistance and workflow automation.
- Role-specific controls.
- Multi-tenant platform architecture.
- Reusable foundational software beyond New Western.

These principles remain unchanged.

The improvements below make the platform more useful within those architectural decisions.

---

# 4. MAJOR ARCHITECTURAL ADDITION: INVESTOR INTELLIGENCE

We need a shared **Investor Intelligence subsystem** that connects several of our existing AI Employees.

This is one of the most important additions to the original design.

Instead of storing investor information as loosely structured notes, AgentDesk should maintain structured, searchable buying criteria and relationship context.

## Investor profiles

A profile should support the following information where available and appropriate:

### Identity and relationship

- Investor or company name.
- Associated legal entity where relevant.
- Contact information and verification status.
- Owning employee.
- Owning office.
- Relationship visibility.
- Source of relationship.
- Salesforce record reference.
- Qualification status.
- Disclosure status.
- Last contact and follow-up dates.

### Geographic buying preferences

- Preferred states.
- Preferred counties.
- Preferred cities.
- Target ZIP codes or neighborhoods.
- Excluded areas.
- Geographic flexibility.

### Financial preferences

- Minimum and maximum purchase prices.
- Target ARV range.
- Financing method.
- Typical purchase amount.
- Relevant acquisition or investment constraints.

### Property preferences

- Single-family.
- Multifamily.
- Townhomes.
- Condominiums.
- Land.
- Commercial or other categories when relevant.
- Square footage range.
- Bedroom and bathroom preferences.
- Lot characteristics when relevant.

### Investment strategy

- Fix-and-flip.
- Buy-and-hold.
- New construction.
- Teardown.
- Other permitted strategies.

### Rehabilitation preference

- Cosmetic/light rehab.
- Medium rehab.
- Heavy rehab.
- Full gut renovation.
- Teardown and rebuild.
- Ground-up construction.

### Activity and relationship intelligence

- Recent conversation summaries.
- Prior purchases where verified.
- Engagement history.
- Communication preferences.
- Outstanding commitments.
- Lost-opportunity reasons.
- Relevant relationship context.
- Current buying activity.

Do not automatically store unrelated personal or sensitive details merely because they appear in a conversation.

## Multiple buy boxes

Consider that an investor may have more than one investment strategy or buying profile.

For example:

- Light rehabs under $200,000 in Cobb County.
- Rental properties under $150,000 in Bartow County.

Do not force every investor into a single broad, contradictory set of preferences.

Implement a sensible structured model that can support multiple distinct buy boxes when necessary.

## Provenance and conflict handling

Every important extracted preference should support:

- Source.
- Date captured.
- Original statement or evidence reference where available.
- Verification status.
- Review or approval status.
- Relevant Salesforce synchronization status.

If an investor changes their price range, the system should distinguish the newer statement from outdated information.

Do not silently overwrite verified fields with low-confidence AI inferences.

## Salesforce integration

Use Salesforce as the authoritative CRM wherever appropriate.

AgentDesk may maintain supplemental intelligence, pending changes, and research metadata in its own database.

Avoid creating unnecessary duplicate CRM records.

Use a proper mapping layer between AgentDesk investor intelligence and customer-specific Salesforce fields.

---

# 5. CRITICAL CHANGE: INVESTOR OWNERSHIP AND ACCESS

We now know that agents manage their own investor relationships.

Enhance the data and permissions model accordingly.

Support:

- Organization/tenant ownership.
- Office membership.
- Individual relationship ownership.
- Explicit sharing rules.
- Manager-authorized visibility.
- Configurable company-wide visibility.
- Record assignment and transfer where authorized.
- Duplicate detection without unauthorized disclosure of private data.

For the fictional New Western demo, configure reasonable agent-level ownership behavior.

Example:

Agent A researches an investor already in Agent B's database.

AgentDesk should be able to identify a potential duplicate through an authorized service, but must not reveal Agent B's private notes, personal communications, or protected record details without permission.

Do not invent New Western corporate ownership rules.

Make the policy configurable and clearly document assumptions.

Add authorization tests that attempt cross-user and cross-office access.

**Security must be enforced in backend queries and services, not merely hidden in the UI.**

---

# 6. CRITICAL WORKFLOW: PROPERTY RELEASE INTELLIGENCE

This is one of the biggest missing operational concepts.

New Western's acquisition agents source deals, and dispositions agents begin contacting their investors once a property is released.

We need the platform to understand a **property release event**.

## Property release information

Support relevant fields such as:

- Property address.
- Property type.
- Asking price.
- Relevant deal economics.
- Available ARV and repair assumptions.
- Deal description.
- Property notes.
- Property photos or Drive links.
- Source and acquisition context.
- Release timestamp.
- Release status.
- Assigned permissions.
- Updates and revisions.
- Relevant deal or transaction records.

Do not assume all these details will be available from Salesforce automatically.

## Property release workflow

When a new property is released:

1. Create or update the authorized property record.
2. Store the release version and source.
3. Identify authorized agents who can work the deal.
4. Evaluate the property against each agent's permitted investor relationships.
5. Calculate relevant deal-to-buyer matches.
6. Generate investor calling priorities.
7. Prepare disclosure-aware deal packages.
8. Surface suggested actions to the appropriate employees.
9. Optionally allow Investor Hunter to find external, net-new prospects.
10. Track subsequent activity and changes.

A release may involve many dispositions agents working simultaneously.

The same property can be visible to numerous agents, while their investor relationships may remain individually restricted.

This distinction is essential.

## Implementation approach

Create a reusable Property Release workflow service.

Do not add a completely separate conversational AI Employee unless there is a strong architectural reason.

Use existing specialists:

- Buyer Matchmaker.
- Investor Hunter.
- Daily Coordinator.
- Deal Marketing Assistant.
- Salesforce Assistant.
- Relationship Manager.
- Transaction Coordinator.

Initially, support manually created demo releases or an approved import flow.

Build a future integration adapter for whichever internal system New Western authorizes.

Do not assume Marketplace API access exists.

---

# 7. HIGH-PRIORITY NEW WORKFLOW: DEAL PACKAGE COMPOSER

This is a particularly important feature because Alex identified it as one of his biggest repetitive administrative headaches.

Expand the existing **Deal Marketing Assistant** to include a dedicated Deal Package Composer.

## The desired experience

An agent says:

"AgentDesk, prepare the property details for Mike that I just spoke to. Include the asking price, the important notes, and the Google Drive photo link."

AgentDesk should:

1. Identify the intended investor.
2. Identify the intended property.
3. Retrieve authorized property information.
4. Retrieve the approved deal notes.
5. Locate the correct photo/media link.
6. Check the investor's disclosure eligibility.
7. Choose the appropriate approved communication template.
8. Assemble a concise personalized message.
9. Let the employee review/edit it.
10. Prepare it for an authorized communication channel.
11. Record actual delivery only if successfully sent through a supported integration.

## Required capabilities

### Property package assembly

Support:

- Property address where authorized.
- Asking price.
- Relevant highlights.
- Property condition or rehab notes.
- Square footage and other material details.
- Approved deal description.
- Photo links.
- Showing or follow-up instructions where applicable.

Do not invent details to complete a package.

If something important is missing, flag it.

### Photo Drive links

Alex frequently shares Google Drive photo folders.

The system should support storing an approved property media URL and inserting the correct link into property communications.

Do not assume automatic access to an employee's Gmail or Google Drive.

Initially, support user-entered or imported authorized links.

Build adapter interfaces for future authorized integrations.

Check whether links are accessible only to intended recipients before presenting them as ready to share.

### Communication formats

Prepare outputs for:

- Email.
- SMS.
- Copy-and-send personal text.
- iMessage handoff.
- Supported connected messaging platforms.

Do not build unreliable or unauthorized automation around Apple's personal Messages application.

If direct delivery is unsupported, provide a clear copy/compose experience rather than pretending the message was sent.

### Investor personalization

Use verified investor criteria and relevant conversation context.

Avoid generic mass-blast language when a specific investor/property match is available.

### Templates

Support configurable company-approved templates and property release formatting.

### Compliance

Apply disclosure and outreach permissions before preparing external distribution of restricted information.

Do not automatically send externally without the correct policy and authorization.

## User interface

Add a convenient "Prepare Deal Package" action to:

- Property detail views.
- Investor profile views.
- AI assistant conversations.
- Suggested calling priorities.
- Follow-up workflows.

The workflow should save time and require minimal navigation.

---

# 8. MODIFY THE CALL NOTETAKER FOR PERSONAL PHONE WORKFLOWS

Alex primarily uses his personal cell phone and does not have regular recordings or transcripts available.

Therefore, our first truly useful version should be a **Post-Call AI Debrief**.

## Experience

An agent finishes a call and opens AgentDesk.

They tap the microphone and say:

"I just talked to John about the Roswell property. He's buying cash, wants cosmetic rehabs under $250,000, asked for the photo link, and wants me to follow up tomorrow."

AgentDesk should:

1. Interpret the spoken recap.
2. Identify the relevant investor and property, asking for clarification if ambiguous.
3. Generate a structured note.
4. Extract investor buying criteria.
5. Identify commitments.
6. Prepare proposed Salesforce updates.
7. Prepare the requested property message.
8. Prepare appropriate reminders.
9. Explain what is pending approval.
10. Save the approved information.

This workflow must also accept typed notes or uploaded authorized transcripts.

## Important separation

Live conversational voice and telephone call recording are NOT the same capability.

The initial post-call debrief can use AgentDesk's own voice/chat interface.

Do not assume the application can capture audio from ordinary personal cellular calls.

Future call recording or transcription integration may be possible through an authorized compatible telephone provider, but it is not a requirement for initial usefulness.

## Investor criteria extraction

The notetaker must update the Investor Intelligence subsystem through reviewed proposed changes.

Do not just save unstructured transcripts and force the employee to manually enter every preference.

## Coaching

Add a foundation for optional, evidence-based post-call feedback.

Examples:

- Missing qualification questions.
- Incomplete buyer criteria.
- Promised follow-ups.
- Relevant unresolved objections.

Avoid making unverifiable judgments about an employee's personality or performance.

More advanced call grading can come after the flagship workflows are stable.

---

# 9. HIGH-PRIORITY FEATURE: INTELLIGENT DAILY CALLING QUEUE

Our original Daily Coordinator handled reminders and priorities.

Now it must become a more revenue-oriented assistant.

Alex explicitly wants to know **which investors to call first every morning**.

## Desired experience

The employee asks:

"AgentDesk, who should I call today?"

The assistant should produce a prioritized list based on permitted information.

Potential signals:

- Matches with current released inventory.
- Investor buying preferences.
- Active buying behavior.
- Previous engagement.
- Overdue promises.
- Recent conversations.
- Disclosure readiness.
- Time-sensitive property opportunities.
- Investor inactivity.
- Agent-scheduled follow-ups.

Each recommendation should explain its rationale.

Example:

"Call Investor A first because they are actively buying light-rehab homes in Cobb County, and the newly released property closely matches their criteria."

Do not display an unsupported claim that an investor is actively buying unless that fact has supporting data.

## Daily Calling Queue UI

Support:

- Ranked investors.
- Reason for prioritization.
- Related property.
- Relevant buy-box matches.
- Contact and disclosure readiness.
- Last conversation.
- Suggested talking points.
- Quick notes.
- Call outcome capture.
- Follow-up action.

Include a way for employees to reorder or dismiss suggestions.

## Important

Do not make this a static mock list that looks dynamic.

Implement actual ranking over the available demo records.

Make the scoring explainable and testable.

Design a path for improved ranking from real call outcomes later.

---

# 10. ADD AI PRE-CALL BRIEFINGS

Alex's earlier DealIQ concept highlighted an excellent workflow that we hadn't fully prioritized.

Before calling an investor, the employee should have a concise briefing.

Include where available:

- Investor identity.
- Company.
- Current buying criteria.
- Previous relevant purchases.
- Previous conversation summary.
- Last contact outcome.
- Outstanding commitments.
- Relevant deal match.
- Suggested call objective.
- Missing qualification details.
- Applicable disclosure status.

This should be generated from permitted stored information.

Example:

"John prefers cosmetic rehabs under $250,000 in Cobb County. He asked for similar properties last week. The new Marietta deal appears to match his criteria. His financing information is still incomplete."

The user should be able to request this by voice:

"AgentDesk, get me ready to call John."

This does not need to become a seventeenth AI Employee.

Implement it through Investor Relationship Manager, Daily Coordinator, and the master assistant.

---

# 11. IMPROVE BUYER MATCHING

Buyer Matchmaker should use the enhanced structured investor buy boxes.

Matching should account for:

- Geography.
- Property type.
- Price range.
- ARV when relevant.
- Rehab tolerance.
- Investment strategy.
- Financing suitability.
- Property size and other useful preferences.
- Investor eligibility.
- Relevant relationship activity.

## Explainable matching

Do not return an unexplained percentage alone.

Show why a property matches.

Example:

"Strong match: same target county, price within preferred range, appropriate property type, and compatible rehab level."

Also show conflicts.

Example:

"Potential mismatch: the property requires heavy renovation, but the investor prefers cosmetic rehabs."

## Scoring separation

Maintain three distinct scoring concepts:

### External Investor Fit

Used by Investor Hunter to determine which newly discovered external investors are relevant to a specific property.

### Deal-to-Buyer Match

Used by Buyer Matchmaker to evaluate existing permitted buyer profiles against inventory.

### Investor Engagement / Readiness

Used by Investor Relationship Manager and Daily Coordinator to prioritize relationship activity.

Do not combine these into one confusing opaque score.

---

# 12. REINFORCE INVESTOR HUNTER'S ORIGINAL PURPOSE

This remains our flagship research feature.

Investor Hunter starts with a subject property and researches **new investors outside the New Western database**.

Do not accidentally turn it into a query against existing Salesforce investor records.

## Improved research priorities

Based on Alex's actual experience, favor:

1. Investors with recent purchases similar to the subject property's type.
2. Investors buying in comparable price ranges.
3. Investors whose transaction history indicates a matching investment strategy.
4. Investors with geographic buying activity relevant to the property.
5. Repeat investors with credible recent activity.
6. Prospects with appropriately sourced, verified business contact information.

The research should evaluate property-specific fit.

Do not treat every nearby cash buyer as equally valuable.

## Research pipeline

Retain and improve:

- Address analysis.
- External data source access.
- Investor entity resolution.
- Relevant transaction evidence.
- Contact information research.
- Confidence and provenance.
- Scoring.
- Ranking.
- Salesforce duplicate checking.
- Export or proposed CRM import.
- Durable job tracking.
- Completion notifications.

## Existing first-build status

You reported that research jobs, evidence, and scoring currently work using fictional data.

Preserve that functionality.

Make sure the database, job pipeline, tool interfaces, and UI can accommodate real provider-backed research.

Do not misrepresent synthetic research as real.

If external search/provider credentials are missing, continue implementing the architecture, testing, and demo flow rather than inventing real investor data.

---

# 13. ADD DISCLOSURE AND INVESTOR ACTIVATION WORKFLOWS

Alex confirmed that disclosure is a significant step in the investor process.

Add structured investor activation and disclosure functionality.

## Suggested statuses

- Unknown.
- Not requested.
- Prepared.
- Sent.
- Opened, if supported by the provider.
- Signed.
- Declined.
- Expired or invalid, where applicable.

Use configurable rules rather than assuming these are New Western's exact status values.

## Core functionality

- Track disclosure status.
- Associate disclosure versions with investors.
- Store authorized document references.
- Track sent/signed timestamps from verifiable events.
- Generate reminders for incomplete disclosures.
- Display eligibility status in investor profiles.
- Restrict disclosure-dependent operations.
- Support approved e-signature providers later.

## Security rule

The user reported that disclosure is supposed to be completed before property information is shared.

Until the company confirms a precise policy, use a conservative configurable default that blocks externally sharing restricted property details with undisclosed investors.

A user request must not override backend restrictions.

Do not implement informal disclosure bypasses.

## Marketplace access

Marketplace eligibility is reportedly tied to disclosure status.

Build a model capable of representing this requirement.

Do not assume an API is available to actually grant or revoke Marketplace access.

---

# 14. MODEL THE REAL NEW WESTERN ACQUISITIONS AND TRANSACTION PROCESS

Our original real estate workflow descriptions were too generic.

Update the domain model to accommodate:

- External wholesalers.
- Referring retail agents.
- Motivated sellers.
- Properties under contract.
- Incoming acquisition opportunities.
- Contractual positions and relevant parties.
- Deal release to dispositions.
- End-investor purchase interest.
- Offer and acceptance.
- Due diligence where applicable.
- Closing coordination.
- Double-closing structures.
- Same-day acquisition/resale closings where applicable.

Do not encode legal assumptions about every transaction.

Represent configurable stages, parties, agreements, and milestones.

Distinguish upstream transaction information from the eventual end-buyer transaction.

Expand Acquisition-to-Disposition Coordinator and Transaction Coordinator appropriately.

This will be especially useful for future enterprise workflows and management reporting.

---

# 15. PROACTIVE AUTOMATION IMPROVEMENTS

Maintain the existing proactive assistance architecture.

Add support for important New Western operational events:

- New property released.
- Property release details changed.
- Research job completed.
- Investor follow-up becomes due.
- Relevant deal-to-buyer match identified.
- Investor qualification incomplete.
- Disclosure pending.
- Prepared property package awaiting approval.
- Closing milestone approaching.
- Deal stalled.
- Scheduled calling priority generated.

The assistant should recognize important events and notify the relevant employee according to permissions.

For initial implementation, prioritize:

1. Research completion notifications.
2. Follow-up reminders.
3. Daily calling priorities.
4. Property release matching.
5. Pending approval notifications.

Avoid unnecessary interruptions.

Include notification preferences and deduplication.

---

# 16. COMMUNICATION PRIORITIES

The product vision still includes:

- Web application.
- Installable mobile PWA.
- Live two-way voice.
- Optional external messaging.
- Optional paid SMS.

Alex's feedback helps us prioritize those channels.

## Updated order

### Primary — AgentDesk app

Must be convenient enough that agents genuinely want to use it daily.

Live voice remains a core feature.

### Secondary — Slack

Investigate Slack bot integration as the preferred initial external messaging channel, subject to confirming New Western's internal tools and permissions.

Do not assume New Western already uses Slack.

### Optional — SMS

Keep a separately billable SMS integration path.

Avoid introducing SMS expenses into the base product without metering.

### Additional — Telegram

Retain an extensible adapter architecture.

Telegram is no longer necessarily the first external integration to prioritize.

## Personal texting and iMessage

Agents currently use their personal phone messaging heavily.

This does NOT mean we should automatically control their personal iMessage accounts.

Provide polished, low-friction draft preparation, copy actions, and supported compose handoffs where possible.

Any direct sending capability requires an authorized supported channel and actual delivery confirmation.

---

# 17. UPDATE THE 16 EXISTING AI EMPLOYEES

Do not create a new specialist for every small workflow.

Preserve the original 16-role catalog and improve the relevant specialist implementations.

## Required enhancements

**Investor Hunter:** Better property-specific external research signals, particularly similar purchase types and prices.

**Buyer Matchmaker:** Structured investor buy boxes, explainable matches, release-triggered matching, ownership-aware searches.

**Investor Qualification:** Structured criteria extraction, missing-question identification, activation and disclosure awareness.

**Investor Relationship Manager:** Pre-call intelligence, relationship history, engagement/readiness, dropout reasons, follow-up context.

**Deal Marketing Assistant:** Deal Package Composer, photo links, approved communication templates and personalized investor outreach.

**Investment Deal Analyst:** Explainable deal analysis and a foundation for improved comparable-property research.

**Call Notetaker:** Post-call voice debriefs, criteria extraction, proposed CRM updates and relevant coaching.

**Workflow Navigator:** Actual New Western workflows, next-step guidance, property-release processes and buyer activation procedures.

**Salesforce Assistant:** Ownership-aware operations, duplicate checking, approvals, structured field mapping.

**Daily Coordinator:** Prioritized investor calling queue and property opportunity alerts.

**Transaction & Document Coordinator:** Disclosures, document status, transaction milestones and double-closing support.

**Acquisition Lead Assistant:** Relationships with wholesalers and agents, incoming deals and acquisition opportunities.

**Valuation & Due Diligence Assistant:** More structured comping criteria and verifiable estimate assumptions.

**Acquisition-to-Disposition Coordinator:** Deal release preparation and handoff between divisions.

**Team Performance Assistant:** Relevant investor engagement, calling activity, disclosure conversion, dropout trends and workflow bottlenecks.

**Onboarding & Coaching Assistant:** Stronger real-process guidance, organization, and post-call coaching when supported by evidence.

The master assistant remains the employee's primary conversational interface.

---

# 18. IMPLEMENTATION PRIORITIES

The Monday demonstration is close.

We want practical progress and working vertical slices, not an uncontrolled explosion of features.

## P0 — Architecture and schema corrections

First inspect the current implementation.

Add or refine the essential data structures:

- Structured investor buy boxes.
- Investor relationship ownership.
- Record access policies.
- Property release records.
- Investor/property matching records.
- Disclosure statuses.
- Deal package records.
- Communication and delivery states.
- Relevant transaction stages.
- Data provenance.

Use proper migrations.

Preserve existing demo data where possible.

Avoid breaking conversation history, existing tasks, research jobs, and approvals.

## P1 — High-impact functional workflows

Prioritize working implementation of:

1. Deal Package Composer.
2. Post-Call AI Debrief.
3. Structured investor-profile updates.
4. Intelligent Daily Calling Queue.
5. Pre-Call Briefings.
6. Property Release Intelligence.
7. Enhanced Buyer Matching.

Ensure these workflows can be used through the master assistant where possible.

Preserve Investor Hunter's existing operation and integrate it with the new workflows.

## P2 — Integrations and communication

Improve:

- Salesforce adapter contracts.
- Property release provider abstraction.
- Email/media URL handling.
- Approval-aware communication adapters.
- Mobile interface.
- Live voice integration readiness.
- Slack adapter foundation.
- SMS usage and entitlement architecture.

Do not block independently testable features on missing Salesforce credentials.

## P3 — Advanced intelligence

After the core experience is stable, improve:

- Investor engagement scoring.
- Dropout-reason analysis.
- Post-call coaching.
- Comping and ARV accuracy.
- Match-ranking refinement.
- Management intelligence.
- Outcome-based optimization.

Keep these on the roadmap and implement them if time and dependencies permit.

---

# 19. MONDAY DEMONSTRATION — UPDATED IDEAL EXPERIENCE

Build toward a realistic, connected demonstration.

Use fictional New Western-style records clearly labeled as demo data unless genuine authorized sources are configured.

## Demonstration 1 — A new property is released

A fictional acquisition opportunity becomes available.

AgentDesk displays the property information and makes it available to authorized dispositions agents.

It identifies relevant known investors for the logged-in agent.

## Demonstration 2 — Who should I call?

The employee asks:

"AgentDesk, who should I call first about this deal?"

AgentDesk produces a ranked list of the employee's relevant investors with explanations.

The assistant can prepare a short pre-call briefing for a selected investor.

## Demonstration 3 — Find completely new investors

The employee says:

"Find 50 new investors outside our database that would likely buy this house."

Investor Hunter launches a job using the existing research pipeline.

The interface shows status, scores, evidence, and clearly identified demonstration results.

Show the difference between existing buyer matching and net-new external discovery.

## Demonstration 4 — Capture an investor conversation

The employee says:

"I just talked to Mike. He's buying cash, wants cosmetic rehabs under $250,000, and asked me to send the property photos."

AgentDesk extracts the buying criteria, prepares the note, and presents approved updates to the demo Salesforce adapter.

## Demonstration 5 — Prepare and send property information

The employee says:

"Prepare the property details and photo link for Mike."

AgentDesk assembles a useful, personalized package and checks disclosure eligibility.

It prepares the message for review and a supported send/copy/compose action.

It should NOT claim a message was delivered unless an actual authorized integration confirms success.

## Demonstration 6 — What should I do next?

The employee asks:

"What's my next step with Mike?"

AgentDesk identifies remaining qualifications, pending disclosure requirements, the property information request, and follow-up commitments.

It recommends the next logical action based on permitted demo data and configured workflow guidance.

## Demonstration 7 — Proactive follow-through

A reminder or job-completion event appears.

AgentDesk notifies the employee and offers the next useful action.

## Demonstration 8 — Mobile and voice

Show the same user context through the mobile experience.

If live voice credentials are configured, demonstrate a genuinely functioning spoken conversation with tool use.

If credentials are unavailable, show an accurate unconfigured state and explain the remaining integration setup.

Do not fake voice AI or production Salesforce connectivity.

---

# 20. TESTING AND ACCEPTANCE CRITERIA

Preserve all existing passing tests.

Add tests covering the new functionality.

## Investor intelligence

- Multiple buy boxes per investor.
- Correct extraction of investor criteria.
- Review before consequential field updates.
- Provenance preservation.
- Conflicting or updated preferences.

## Ownership and permissions

- Employee cannot retrieve unauthorized investor details.
- Cross-office restrictions.
- Duplicate detection without leaking protected information.
- Role-based manager access.
- Tenant isolation.

## Property releases

- Create release.
- Update release.
- Retrieve latest authorized details.
- Trigger matching.
- Restrict unauthorized releases.
- Handle duplicate events idempotently.

## Buyer matching

- Matching on geography.
- Matching on price.
- Matching on property type.
- Rehab compatibility.
- Explainable match reasons.
- Separate engagement and matching scores.

## Deal Package Composer

- Correct property details.
- Correct media links.
- Missing-data handling.
- Disclosure eligibility check.
- Approval requirement.
- Accurate draft versus sent status.
- No fabricated delivery confirmations.

## Call debriefs

- Structured extraction from text.
- Proposed investor updates.
- Appropriate record linking.
- Handling ambiguity.
- Task preparation.
- Preserving confirmed versus unconfirmed information.

## Daily calling queue

- Ranking from actual available records.
- Prioritization explanations.
- Respect for ownership.
- Relevant property matching.
- Overdue commitments.
- Ability to dismiss or reprioritize.

## Investor Hunter

- Net-new discovery semantics.
- Evidence-aware ranking.
- Contact verification states.
- Existing CRM duplicate identification.
- Durable job state handling.
- Correct fictional-data labeling.

## Regression testing

Run the existing suite and relevant new tests.

Also run:

- Lint.
- Type checking.
- Production build.
- Available workflow checks.
- Browser-level smoke tests if the environment supports them.

Fix failures caused by your changes.

Do not claim tests passed unless you ran them.

---

# 21. DOCUMENTATION UPDATES

Update existing documentation rather than creating a competing collection of contradictory plans.

Review and revise relevant files, including:

- `MASTER_PLAN.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/SYSTEM_ARCHITECTURE.md`
- `docs/AI_EMPLOYEES.md`
- `docs/DATA_MODEL.md`
- `docs/INVESTOR_HUNTER.md`
- `docs/SALESFORCE_INTEGRATION.md`
- `docs/SECURITY_AND_PERMISSIONS.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/DEMO_RUNBOOK.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Use the actual existing file paths if they differ.

Add focused specifications if they materially improve clarity:

- `docs/INVESTOR_INTELLIGENCE.md`
- `docs/PROPERTY_RELEASE_WORKFLOWS.md`
- `docs/DEAL_PACKAGE_COMPOSER.md`
- `docs/NEW_WESTERN_DISCOVERY.md`

The discovery document should separate:

**Reported operational facts:** What Alex said actually happens.

**Design decisions:** What we have decided to implement.

**Assumptions:** What we are inferring but haven't verified.

**Questions for the GM:** What requires New Western authorization or confirmation.

Do not represent Alex's informal description as official corporate policy.

---

# 22. IMPORTANT PRODUCT AND BUSINESS CONSTRAINTS

This application is being created by Tailored Agents.

New Western has expressed interest through a local GM, but we do not have a signed contract or approved enterprise integration.

Preserve:

- Multi-tenant architecture.
- AgentDesk product identity.
- Configurable organization branding.
- Reusable CRM adapters.
- Role-specific AI Employees.
- Per-seat subscription and usage metering architecture.
- Optional paid SMS.
- Live voice as a core product feature.
- Full employee-context continuity.
- Future support for other real estate brokerages.

Do not hard-code the entire product exclusively around New Western.

The New Western-specific workflow configuration should be adaptable to future investment sales companies.

Do not introduce a new standalone CRM or major unnecessary architectural rewrite.

Do not automatically contact real investors, send external outreach, or update production third-party systems without appropriate authorization.

---

# 23. DEVELOPMENT AUTONOMY

Proceed independently wherever reasonable.

Do not repeatedly ask for permission on ordinary implementation decisions.

Use the existing architecture and coding conventions unless a specific technical problem justifies a change.

Favor focused, testable improvements.

Preserve existing source files where they are sound.

Create database migrations rather than destructively replacing schemas.

Do not spend the entire session rewriting plans.

Do not build a large catalog of placeholder functionality and present it as completed.

Prioritize genuine end-to-end workflows.

If an integration cannot be completed because credentials or authorizations are unavailable:

1. Preserve or create the real integration interface.
2. Build a clearly labeled functional demo adapter where appropriate.
3. Implement the surrounding application logic.
4. Document precisely what remains blocked.
5. Continue independent development.

Save meaningful checkpoints.

Update progress documentation as implementation advances.

---

# 24. FINAL DELIVERABLE AND COMPLETION REPORT

At the end of this development run, provide a clear report containing:

### A. Existing architecture preserved

Explain what components from Phase 1 were retained and reused.

### B. Completed Phase 2 functionality

List only features actually implemented and working.

### C. Changed data model

Explain the new tables, schema changes, ownership rules, and migrations.

### D. Improved AI Employees

Identify which of the 16 specialists gained genuine new functionality.

### E. UI improvements

Explain what new workflows and interfaces are available.

### F. Testing

Report actual tests, build checks, results, and any remaining failures.

### G. Integrations

Clearly distinguish:

- Live and verified.
- Implemented but requiring credentials.
- Demo adapters.
- Still planned.

### H. Monday demo readiness

Provide an updated, exact demonstration sequence and explain which workflows can be shown successfully.

### I. Remaining blockers

List credentials, permissions, technical dependencies and New Western decisions still required.

### J. Next development priorities

Recommend the next highest-value tasks based on the actual state of the project.

Update `docs/PROGRESS.md` accordingly.

---

# 25. OVERALL DIRECTIVE

We are not changing our vision.

We are improving it using real operational insight from someone who works in the target business every day.

AgentDesk remains a personalized, proactive, multi-channel AI workforce that helps each employee perform their job.

The new emphasis is on the complete investor relationship and property sales workflow.

**Discover the right investors. Identify which existing buyers match. Help agents decide who to call. Prepare them for the conversation. Capture what happened. Update investor intelligence. Assemble the deal information. Manage the follow-through. Help move the transaction toward closing.**

All coordinated through one personal master AI assistant.

The best outcome is that a New Western dispositions agent can spend more time having meaningful conversations with serious investors and less time researching, copying details, updating Salesforce, and organizing their day.

That is the experience we are building.

**Now inspect the existing AgentDesk implementation, update the architecture and documentation where necessary, and begin implementing these Phase 2 improvements immediately. Continue through as many verified, functioning milestones as your current development session allows.**
