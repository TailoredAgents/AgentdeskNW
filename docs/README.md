# Documentation map

Updated October 30, 2026. This index assigns each document a purpose; it is not a second roadmap.

## Authority and reading order

1. Later explicit owner decisions take precedence over earlier plans. Record accepted changes in the product brief and decisions log.
2. **[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)** is the only current delivery sequence, status board, dependency map and next-work checklist.
3. [MASTER_PLAN.md](../MASTER_PLAN.md) explains the product direction. [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) defines target behavior. Neither prescribes a separate sequence.
4. Supporting specifications below define detailed contracts and acceptance within roadmap checkpoints. Their local stages/legacy IDs are not company-wide scheduling instructions.
5. [PROGRESS.md](PROGRESS.md) is dated evidence. Old “next” paragraphs describe what was next then. They never override the current roadmap.
6. Original briefs, phase reports and earlier presentation scripts are historical/reference material. Preserve them; do not silently present their assumptions as current requirements.

[AGENTS.md](../AGENTS.md) governs engineering practice. [DECISIONS.md](DECISIONS.md) explains accepted choices and supersessions. When a direction changes, update these assigned sources instead of adding another top-level plan.

## Current product and engineering specifications

| Area | Documents | Purpose / roadmap home |
| --- | --- | --- |
| Workforce | [AI_EMPLOYEES](AI_EMPLOYEES.md), [KNOWLEDGE_AND_COACHING](KNOWLEDGE_AND_COACHING.md), [CAPABLE_WORKFORCE_PLAN](CAPABLE_WORKFORCE_PLAN.md) | Sixteen-specialist scope/evidence matrix and master-agent design; C1/C4/C5/C7 |
| Shared work | [WORK_EXECUTION](WORK_EXECUTION.md), [CONVERSATION_WORKFLOWS](CONVERSATION_WORKFLOWS.md) | Durable work and conversation contracts; local acceptance versus remaining delivery limits; C1 |
| Mobile | [MOBILE_DELIVERY_PLAN](MOBILE_DELIVERY_PLAN.md), [mobile README](../mobile/README.md) | Native client contract, local preparation and layered acceptance; C2/C3. Local foundation verified; actual-device acceptance pending |
| Architecture/data/access | [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md), [DATA_MODEL](DATA_MODEL.md), [SECURITY_AND_PERMISSIONS](SECURITY_AND_PERMISSIONS.md) | Shared server, records and authority; C1/C4/C7 |
| Communications | [COMMUNICATIONS_AND_CREDITS_PLAN](COMMUNICATIONS_AND_CREDITS_PLAN.md), [COMMUNICATIONS_INBOX](COMMUNICATIONS_INBOX.md), [COMMUNICATIONS_WORKFLOW](COMMUNICATIONS_WORKFLOW.md), [COMPANY_EMAIL_DEMO](COMPANY_EMAIL_DEMO.md) | Domain contracts and preserved local milestones; C3/C4/C6/C7. Old numbered phases are local identifiers |
| Channels | [VOICE_AND_MESSAGING](VOICE_AND_MESSAGING.md), [MESSAGING_SETUP](MESSAGING_SETUP.md) | Voice limits, employee SMS and optional Slack setup/acceptance; C1/C2/C5/C7 |
| Relationship depth | [RELATIONSHIP_SPECIALIST_PLAN](RELATIONSHIP_SPECIALIST_PLAN.md), [RELATIONSHIP_METHODS](RELATIONSHIP_METHODS.md), [RELATIONSHIP_QUALITY](RELATIONSHIP_QUALITY.md), [INTELLIGENCE_MILESTONE](INTELLIGENCE_MILESTONE.md) | Specialist depth contract, provisional versioned method source, authored other-role cases and dated representation/quality evidence; C4/C5/C7 |
| Operational domains | [INVESTOR_INTELLIGENCE](INVESTOR_INTELLIGENCE.md), [INVESTOR_HUNTER](INVESTOR_HUNTER.md), [ACQUISITIONS_INTAKE](ACQUISITIONS_INTAKE.md), [DEAL_ANALYSIS](DEAL_ANALYSIS.md), [MANAGEMENT_HANDOFFS](MANAGEMENT_HANDOFFS.md), [PROPERTY_RELEASE_WORKFLOWS](PROPERTY_RELEASE_WORKFLOWS.md), [DEAL_PACKAGE_COMPOSER](DEAL_PACKAGE_COMPOSER.md) | Scoped business workflow contracts; C4/C7 |
| Commercial | [PRICING_AND_PACKAGES](PRICING_AND_PACKAGES.md), [BILLING_ARCHITECTURE](BILLING_ARCHITECTURE.md), [USAGE_METERING](USAGE_METERING.md), [AI_EMPLOYEE_MARKETPLACE](AI_EMPLOYEE_MARKETPLACE.md) | Current provisional packages, entitlements, fictional accounting and actual-billing requirements; C6/C7 |
| Discovery/integrations | [NEW_WESTERN_DISCOVERY](NEW_WESTERN_DISCOVERY.md), [SALESFORCE_INTEGRATION](SALESFORCE_INTEGRATION.md), [OPENAI_PROVIDER_REFERENCES](OPENAI_PROVIDER_REFERENCES.md) | Reported employee facts, unresolved company questions, adapter design and dated provider references; C4/C7. Reverify APIs when implementing |

## Historical sources and operational references

| Documents | How to use them |
| --- | --- |
| [ORIGINAL_BRIEF](ORIGINAL_BRIEF.md), [PHASE_2_DIRECTIVE](PHASE_2_DIRECTIVE.md), [PHASE_3_DIRECTIVE](PHASE_3_DIRECTIVE.md), [PHASE_4_DIRECTIVE](PHASE_4_DIRECTIVE.md) | Original supplied requests, preserved verbatim below a historical banner. Later decisions supersede pricing, priorities, role assumptions and sequencing |
| [PHASE_2_REPORT](PHASE_2_REPORT.md), [PHASE_3_REPORT](PHASE_3_REPORT.md), [PHASE_4_REPORT](PHASE_4_REPORT.md), [PHASE_4_AUDIT](PHASE_4_AUDIT.md), [LIVE_PROVIDER_CHECK](LIVE_PROVIDER_CHECK.md) | Dated checkpoint evidence; not proof of the current working tree or deployed version |
| [DEMO_RUNBOOK](DEMO_RUNBOOK.md), [MONDAY_DEMO](MONDAY_DEMO.md) | Presentation recipes for earlier verified slices. Reconcile with current capabilities and rehearse the actual deployed version |
| [RENDER_DEMO](RENDER_DEMO.md) | Hosted fictional-demo configuration. It does not establish the deployed revision or production identity |
| [PROGRESS](PROGRESS.md), [DECISIONS](DECISIONS.md) | Append-only chronology; newest summary/supersession guides interpretation of older entries |

## Keeping this clean

Each implementation slice updates the canonical checkpoint status and adds actual evidence to PROGRESS. Update affected domain specifications, identifying verified, working-draft, planned and external-acceptance states explicitly. Keep historical test totals attached to their revisions. No documentation change upgrades a feature's readiness, proves a deployment or authorizes a new provider connection.

Record runtime scope, source revision, checks, remaining failures and outside inputs before calling a slice complete. For the accepted local mobile foundation and next work, consult the canonical roadmap and the mobile README; do not restart from the old A1–A3 instructions in historical logs.
