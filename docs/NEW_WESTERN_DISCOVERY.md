# New Western discovery — October 29, 2026

Source: the founder's Phase 2 directive, recording a discovery session with Alex, a New Western dispositions agent, and insights from his earlier DealIQ concept. These are reported observations, not independently verified corporate policy. AgentDesk keeps its existing identity and architecture; no DealIQ code, design or brand is copied.

## October 30 update — company email through Salesforce

The founder reports that Alex said New Western agents use company-provided CRM email through Salesforce, and subsequently clarified that Alex opens this email **only inside Salesforce**. The owner wants that company workflow to be AgentDesk NW's primary email path, with optional external email connections retained. This supersedes a Gmail-first product priority for this customer. The reported user experience is established by this discovery; the company's mailbox provider, Salesforce configuration, API availability, sender permissions and approval to connect remain unverified.

Plan the employee experience around **Company email / Salesforce**. Discover separately where correspondence can be read, which company-approved system sends it, and how the resulting activity returns to the investor's CRM history. A visible email activity must not be represented as a complete mailbox or authority to send. Gmail/Google Workspace and Outlook/Microsoft 365 remain optional adapters, and could also be an underlying company-approved transport if administrator discovery establishes that setup. No personal mailbox should be required merely to use the New Western workflow.

Before customer access, add a clearly fictional Salesforce company-email demonstration to the existing Inbox and Copilot workflow. Preserve the current Gmail/Outlook examples as optional external accounts and keep every send simulated. A fictional Salesforce source must not imply a connected org or verified New Western schema. Live implementation follows administrator-confirmed capability and permissions; see [SALESFORCE_INTEGRATION.md](SALESFORCE_INTEGRATION.md).

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
- Mobile, live voice, SMS and a familiar messaging app are desirable. Slack is a candidate, not a confirmed New Western system. SMS remains a separately metered add-on.
- Alex reports disclosure completion is required for receiving property information and Marketplace access. Informal exceptions are not an approved operating policy.

## Design decisions

1. Preserve Next.js, SQLite migrations, the central Copilot and all sixteen specialist identities. Add reusable investor intelligence and operational workflow services.
2. Keep multiple distinct buy boxes with provenance and versioned review. A low-confidence recap creates a proposal; it cannot silently replace a confirmed profile.
3. Treat organization/office/relationship access separately from shared property-release access. Duplicate checks may disclose a collision flag without revealing another employee's protected record.
4. Model release versions, sources and audiences. Matching and calling recommendations must use only the requesting employee's authorized investors.
5. Use a conservative disclosure gate for restricted deal packages, including copy/compose handoffs. Recheck eligibility at approval and handoff, not just initial composition.
6. Separate external-research fit, existing-buyer property match, and relationship readiness scores. Explain evidence, missing facts and conflicts.
7. Distinguish draft, approval and handoff from delivered communication. No supported delivery provider is active; copying is never proof of sending.
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
- Which outreach channels, templates, consent/opt-out policies and autonomy levels are approved? Is Slack actually used?
- Which operational outcomes would justify purchasing: preparation time, contacts, appointments, qualified matches, follow-through or another measure?
- Which transaction stages, parties and closing structures should the pilot represent, and who can change them?
- What retention, review, security, billing and support requirements apply to employee context and communications?

The original directive is retained in `PHASE_2_DIRECTIVE.md`; it is discovery input, not authorization for real investor outreach or production-system changes.
