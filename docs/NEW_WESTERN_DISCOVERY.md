# New Western discovery — October 29, 2026

Source: the founder's Phase 2 directive, recording a discovery session with Alex, a New Western dispositions agent, and insights from his earlier DealIQ concept. These are reported observations, not independently verified corporate policy. AgentDesk keeps its existing identity and architecture; no DealIQ code, design or brand is copied.

This document preserves discovery evidence and product decisions. [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for current status, development order and next steps; requirements here do not create a separate phase sequence. [PROGRESS.md](PROGRESS.md) records implementation evidence.

## October 30 owner decisions — mobile and everyday access

The owner reports that New Western employees use a mix of iPhone and Android, mostly iPhone, and **do not currently use Slack**. These are owner-reported deployment assumptions, not a corporate device inventory. The desired primary daily interface is an iPhone/Android app with an Agent section for the same personal Copilot used elsewhere. Desktop remains useful for detailed work. Preserve Slack as an optional existing channel without requiring employees to adopt it for this rollout.

App access is included in the workforce subscription. Employee-to-Copilot SMS is an optional **provisional $19/month** convenience add-on. This employee channel is distinct from an investor-facing business number and correspondence inbox. All channels share the same employee conversation, authorized knowledge, work records and cost authority. Company email remains Salesforce-first as described below; mobile access does not authorize a new connector.

The owner has neither an Apple Developer nor a Google Play developer account and asked for local app preparation. Mixed-platform support remains required. Do not infer that no phones are available: no connected-device acceptance has been completed. Reviewable dictation is the first speech-input scope; actual live two-way voice remains a separate acceptance requirement.

The owner resumed implementation after the documentation reset. The October 30 mobile/shared-controls foundation has local integrated and phone-width browser acceptance, extending `2d16665`. JavaScript exports and local tests do not establish installed-phone push/speech, onboarding, specialist expertise or production readiness. [MOBILE_DELIVERY_PLAN.md](MOBILE_DELIVERY_PLAN.md) holds mobile requirements and [mobile/README.md](../mobile/README.md) records exact evidence and limitations. Follow the canonical roadmap for subsequent work.

## October 30 clarification — one company platform for three roles

The owner's explicit product direction is company-wide rollout across **dispositions, acquisitions and management**. All three are primary audiences with their own complete workflows. Dispositions should have more specialist capabilities and greater depth where needed, but the product must not center on that role. Different staffing levels and specialist counts do not determine which roles deserve a complete experience.

The reported operating model remains useful context: the smaller acquisitions team works with wholesalers to analyze opportunities and decide whether they fit; the larger dispositions team handles selling deals and investor relationships. Management needs its own discovery and workflows for authorized visibility, coordination, oversight and decisions. These management needs must be validated, not invented from a dispositions agent's account.

Alex is a dispositions agent helping with discovery. The earlier acquisitions label and questionnaire framing were mistaken. His buyer matching, follow-up and title-opening example below belongs to dispositions. Treat his examples as firsthand evidence for that work, not a complete specification for acquisitions, management or company-wide policy.

Design a shared Copilot and platform with role-specific workspaces, knowledge, specialists, permissions and handoffs. Acquire dedicated inputs for wholesaler opportunities/evaluation/handoffs and for management responsibilities. Shared inventory must continue to respect private relationships and employee/office permissions. Clarifying product scope does not grant new runtime access.

## Copilot questionnaire response one — captured requirements

Source: the owner and Alex's first questionnaire answer, plus the owner's subsequent role and operating-model clarifications. This is discovery input, not a company-wide approved procedure. The owner describes an audience of roughly 700 employees; this is a reported scale ambition, not a verified seat count or a demonstrated capacity claim. Remaining questionnaire answers and ranked priorities are pending.

### Existing buyers before new investor research

An employee should be able to select a property for sale in the company system and ask Copilot to find buyers in a particular area. Search the employee's permitted existing investor records first. Compare actual buy boxes and relationship context to the selected property's current facts; geography alone is insufficient. Show fit reasons, missing criteria, current concerns and previous contact before preparing outreach. Respect distinct buy boxes and avoid duplicate approaches to the same person for the same opportunity.

The preferred sequence is existing-buyer matching and outreach first, then an optional Investor Hunter request for fresh prospects who buy similar properties in that area. The user prefers this sequence to minimize unnecessary research cost. Show the estimated additional research cost and require a deliberate choice before starting it; actual cost differences must be measured rather than promised. Deduplicate external findings against permitted CRM records and preserve the privacy-safe collision behavior for protected records. Do not automatically escalate to paid research because no perfect match is found.

Current role mapping already assigns Buyer Matchmaker, Investor Hunter, Investor Relationship Manager and Deal Marketing to dispositions. The requested combined workflow needs deeper coordination; it is not already an autonomous outreach feature. Real investor sending, approved company source access and delivery confirmation remain separate capabilities to build and validate.

### Replies and configurable briefings

Copilot should answer questions such as “Have any investors emailed or texted me back?” across configured, permitted correspondence sources. Associate replies with the right investor, property and deal, distinguish genuinely new replies from old or duplicated activity, and show what needs action.

The owner wants an option for three updates per day on employee-selected subjects. Plan configurable times, timezone, channels, topics, urgency and quiet preferences, with a record of what was included to avoid duplicate briefings. This is a proposed AgentDesk feature, not a request to create a Codex automation now. Existing personal reminders are not equivalent to recurring multi-source briefings. Do not describe an unconnected source as checked or a missing reply as proof of silence.

### Deal stages and opening title

Alex describes this sequence for dispositions: after the investor has signed the purchase and sale agreement and the earnest-money deposit is confirmed, the deal is reserved for that investor and other dispositions agents stop marketing it. A closing date is tracked. The employee then opens title with the closing attorney and includes the acquisition agent who acquired the deal, the investor, and a lender contact when hard-money financing is used. Cash buyers do not automatically need a lender participant.

The requested preparation includes buyer details, the closing date, the signed agreement and the relevant deposit confirmation/reference. The assistant should know the parties' roles and verified contact details so it can prepare the intended recipients and CC list. Whether “group chat” means an email thread or another channel is not yet established. Drafting a title-opening request is separate from an attorney confirming title has been opened.

Track signed-agreement evidence, deposit status, reservation/marketing status, title request, attorney acknowledgment, reported title issues, clearance, signing, funding and closing as distinct facts/events. Clearance and other consequential status changes need an identified authoritative source or authorized employee review; never infer them from silence, a draft email or a proposed date. The assistant can coordinate and track the attorney's work, not independently establish legal title or initiate financial transactions. Company-wide marketing changes require an authoritative shared status and approved propagation rules. Cancellation, failed deposits, changed closing dates, participants and documents need explicit handling.

Current transaction features only expose limited demonstration context. Participant-aware emails, document-aware title-opening packages, reservation enforcement, attachment delivery and live title correspondence are not implemented by the existing release.

### Broad requests with explicit execution capabilities

The intended user experience is one Copilot accepting a broad range of questions and tasks. Support expansion through shared records, specialist methods and reusable capabilities: retrieve, compare, draft, prepare an update, request review, execute an authorized action, schedule follow-through and verify the result. Track multi-step work durably across the dashboard and linked employee channels. Report whether work is proposed, waiting for review, running, completed or blocked; a generated answer is not evidence of execution.

Store employee preferences separately from investor relationship knowledge and deal/party state. Reusable workflow templates can be configured per approved role, office and employee assignment; neither a job title nor an incoming message grants access. A new request outside implemented capabilities should become a clear limitation or reviewed workflow proposal, not an invented success or an ad hoc permission expansion.

### Planning implications pending the remaining answers

1. Maintain three explicit discovery and delivery tracks: dispositions, acquisitions and management. For each, define useful outcomes, daily workflows, needed specialists/data, decision authority and acceptance examples.
2. Carry the Investor Relationship Manager depth requirements into the canonical roadmap's three-role specialist work. Their earlier priority does not make the product dispositions-centered or override the current checkpoint order.
3. Use Alex's response to specify dispositions buyer matching, reviewed outreach, optional costed external research, reply tracking and title-opening coordination. Validate the remaining details with him.
4. Shape acquisitions around wholesaler relationships, submitted opportunities, deal evaluation/diligence and handoffs, using dedicated role-specific input.
5. Gather management requirements for actual oversight, coordination, exceptions and decisions. The existing limited Team Performance overview does not establish a complete management experience.
6. Identify shared foundations and cross-role handoffs: identity/access, Copilot continuity, scoped records, communications, schedules, deal stages, participants and reviewed actions. Reuse capabilities where useful while preserving role-specific behavior.
7. Use the canonical roadmap's dependencies, outcomes and acceptance gates for all three roles. Dispositions should have more specialists and greater implementation depth; acquisitions and management remain first-class workstreams.

These are candidate workstreams, not a finalized phase order or authorization for new automatic actions. Remaining questionnaire answers and priorities are pending. Do not infer company procedures, automation approval or live connection readiness from one employee's account.

## October 30 update — company email through Salesforce

The founder reports that Alex said New Western agents use company-provided CRM email through Salesforce, and subsequently clarified that Alex opens this email **only inside Salesforce**. The owner wants that company workflow to be AgentDesk NW's primary email path, with optional external email connections retained. This supersedes a Gmail-first product priority for this customer. The reported user experience is established by this discovery; the company's mailbox provider, Salesforce configuration, API availability, sender permissions and approval to connect remain unverified.

Plan the employee experience around **Company email / Salesforce**. Discover separately where correspondence can be read, which company-approved system sends it, and how the resulting activity returns to the investor's CRM history. A visible email activity must not be represented as a complete mailbox or authority to send. Gmail/Google Workspace and Outlook/Microsoft 365 remain optional adapters, and could also be an underlying company-approved transport if administrator discovery establishes that setup. No personal mailbox should be required merely to use the New Western workflow.

The demonstration requirement is a clearly fictional Salesforce company-email source in the Inbox and Copilot workflow, with Gmail/Outlook examples retained as optional external accounts and every send simulated. See the canonical roadmap and progress ledger for implementation status. A fictional Salesforce source must not imply a connected org or verified New Western schema. Live implementation follows administrator-confirmed capability and permissions; see [SALESFORCE_INTEGRATION.md](SALESFORCE_INTEGRATION.md).

The three practical discovery questions are:

1. Which configured service sends and receives the company email that Alex accesses inside Salesforce, and is it available to an approved integration?
2. Which administrator can confirm the email/capture configuration, permitted email records, and an authorized sandbox or test account?
3. Which sender identities and actions may AgentDesk use: read activity, read the mailbox, save drafts, send reviewed replies, and log results back to Salesforce?

## Reported operational observations

- Agents manage their own investor relationships. Useful criteria are scattered across Salesforce, notes, spreadsheets, email, text messages and agents' knowledge.
- Acquisitions often work with external wholesalers or retail agents. Opportunities can involve an upstream contractual position and coordinated acquisition/resale or double closings. Exact contract sequences vary.
- Once a property is released, roughly twenty dispositions agents at Alex's office may contact their individual investor relationships. Shared inventory does not imply shared private relationship details.
- Existing-buyer matching uses manual Salesforce filters. For discovering entirely new investors, similar prior purchases and comparable prices are especially useful signals; proximity alone is insufficient.
- Personal cell phones are common, with no routine recording/transcription system available to Alex. A useful first capture surface is the employee's post-call recap.
- Repetitive follow-up involves updating criteria, finding property email/notes and the Google Drive photo link, preparing a personal message, and remembering the next call.
- The requested proactive priority is a ranked list of investors to call each morning. New agents particularly need repeatable daily organization.
- Mobile, speech input and SMS are desired convenient access paths. The later owner clarification establishes the app as the primary daily interface and reports no current Slack use. SMS remains an optional provisionally priced add-on; live two-way voice needs separate acceptance.
- Alex reports disclosure completion is required for receiving property information and Marketplace access. Informal exceptions are not an approved operating policy.

## Design decisions

1. Preserve Next.js, SQLite migrations, the central Copilot and all sixteen specialist identities. Add reusable investor intelligence and operational workflow services.
2. Keep multiple distinct buy boxes with provenance and versioned review. A low-confidence recap creates a proposal; it cannot silently replace a confirmed profile.
3. Treat organization/office/relationship access separately from shared property-release access. Duplicate checks may disclose a collision flag without revealing another employee's protected record.
4. Model release versions, sources and audiences. Matching and calling recommendations must use only the requesting employee's authorized investors.
5. Use a conservative disclosure gate for restricted deal packages, including copy/compose handoffs. Recheck eligibility at approval and handoff, not just initial composition.
6. Separate external-research fit, existing-buyer property match, and relationship readiness scores. Explain evidence, missing facts and conflicts.
7. Distinguish draft, approval and handoff from delivered communication. Provider delivery requires independent evidence; a fictional connector or copied text is never proof of sending. Consult the canonical status ledger for each connection's readiness.
8. Keep synthetic investor, release and disclosure fixtures visibly synthetic. A demo signature event is not a real signed New Western disclosure.

## Explicit assumptions

Demo office managers may review office relationship records and manage fictional assignments/disclosure evidence. The precise corporate policy is unknown and requires administrator confirmation. Default relationship privacy remains owner-based. Tenant policies must not become hard-coded statements about New Western.

Demo workflow stages describe upstream acquisition and downstream end-buyer coordination without asserting legal sufficiency, binding contract terms or an obligatory double closing. Property economics are source-labeled estimates and are not an appraisal.

Manual authorized media links are accepted as data. An employee's access attestation is not an automated Google Drive permissions check. No Gmail, Drive, Marketplace, Salesforce or messaging account access is inferred.

## Questions for the GM / pilot administrator

- Who sponsors the pilot and can authorize a Salesforce External Client App, sandbox and field mappings?
- What are the actual relationship ownership, sharing, transfer, cross-office and duplicate-contact rules?
- Which disclosure document/version is current, which information is restricted, and which system proves signed/expired status?
- What is the authoritative release/update/withdrawal source? Is any Marketplace integration supported and authorized?
- Which property notes and media folders may be shared, with whom, and how are recipient permissions established?
- Which outreach channels, templates, consent/opt-out policies and autonomy levels are approved? Confirm the owner-reported phone mix and no-Slack assumption with the pilot administrator; which mobile installation/distribution methods will the company support?
- Which operational outcomes would justify purchasing: preparation time, contacts, appointments, qualified matches, follow-through or another measure?
- Which transaction stages, parties and closing structures should the pilot represent, and who can change them?
- What retention, review, security, billing and support requirements apply to employee context and communications?

The original directive is retained in `PHASE_2_DIRECTIVE.md`; it is discovery input, not authorization for real investor outreach or production-system changes.
