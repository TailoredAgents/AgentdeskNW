# Monday demonstration runbook

**Meeting target:** Monday, November 2, 2026, New Western Georgia office.  
**Purpose:** Demonstrate a tangible workflow and earn interest in an authorized pilot.  
**Positioning:** “A concept for New Western by Tailored Agents.” No endorsement or production access claim.

## Preparation

1. Use the setup in the root README. Run the required checks, then `npm run build` and `npm run test:smoke` before the meeting. The default smoke runner uses a disposable database and automatically starts/stops its own app and worker; it does not alter meeting data.
2. Start the app on localhost; the normal launcher starts its worker too. Confirm the worker startup message before demonstrating unattended jobs/reminders.
3. Confirm the local SQLite data is present and contains only fictional records. Do not reset it during a running demonstration.
4. Check the current role and use a dispositions persona for the main story. The settings/demo switcher is not a production login screen. The fixed personas are **Alex Morgan** (dispositions), **Jordan Lee** (acquisitions) and **Taylor Reed** (manager), all in the fictional Atlanta workspace.
5. If a valid OpenAI API project is available, configure it and perform the live text/voice acceptance test ahead of time. Otherwise plan the clearly labeled local flow.
6. Check audio device, microphone permission, browser zoom and a narrow/mobile viewport. Keep the fixture flow available if network/provider access fails.
7. Open Copilot, Investor Hunter, Notes, Work Queue and Settings once to verify no broken navigation.

## Suggested 8–12 minute narrative

### 1. One assistant knows the work

Open the dashboard and describe pending work, research and review in one place. In Copilot ask:

> What should I focus on today?

Show that the answer uses stored tasks/jobs/approvals and that result links lead to actual records. Without model credentials, state that this is the local tool demonstration and that natural-language breadth is limited.

### 2. Property-specific investor discovery

Open Investor Hunter. Use the fictional **123 Example Street, Marietta, Georgia** property, county **Cobb**, price **$235,000**, strategy **Fix & flip**, requested count **12**. The sample property selector fills the matching seeded facts.

Start the job, then leave the page to show it persists. Return to the actual stage/progress. Inspect ranking, one score explanation and source evidence. Clearly say:

> These are fictional research fixtures. The research pipeline, scoring, duplicate checks and review flow are working locally; a licensed live source is the next integration.

Filter or inspect existing/possible duplicate classes. Export CSV. Select eligible net-new prospects and prepare an import. Show the pending proposal before approving. The resulting records should appear in the local investor list; never call this a production Salesforce import.

### 3. Call notes turn into reviewable work

Use this fictional transcript or the interface’s sample:

> Agent: Thanks for speaking with me, Mike. What are you looking for?  
> Mike Bennett: I am looking for fix-and-flip houses in Cobb and Cherokee counties. My budget is $200,000 to $325,000. I use cash for acquisitions and prefer cosmetic rehab.  
> Agent: When would you like to buy?  
> Mike Bennett: Within the next 60 days. I am concerned about foundation issues. Please send the property details tomorrow.  
> Agent: I will send the details and follow up on Friday.

Extract the notes. Review parties, criteria, commitment excerpts, questions/objections and missing information. Explain that extraction reflects employee-provided text and still needs review. Select the matching **Mike Bennett** sample investor, prepare the proposed CRM note and open the approval. Approve once and verify the local notes changed. Refresh to demonstrate persistence.

### 4. Guidance belongs in normal work

Ask about the next step for a selected investor. David Ortiz has unconfirmed funding in the seed data; Mike Bennett initially lacks a timeline, which may already have been added during a prior demonstration. Show known and missing qualification fields, recommended next action and why it matters. Use **Update qualification** to prepare a confirmed field change, inspect the before/after approval and apply it locally. State that the current checklist is a baseline example awaiting the office’s approved procedures.

Create a reminder or task, then mark a task complete and reload. This shows real state rather than a scripted response.

### 5. Voice, if prevalidated

Only start a live voice demonstration if the account/device test passed. Ask for the daily priorities, follow up, and request a task or research job. Verify the corresponding record in the app. End the call and confirm the microphone indicator stops.

If credentials or network access are unavailable, show the truthful setup state and explain the implemented secure connection boundary. Do not simulate an active call or describe untested voice as proven.

### 6. Workforce and pilot scope

Show all 16 employees with their actual status. Explain that Copilot routes work, so the catalog is optional navigation. If appropriate, switch to the fictional manager and show the local office work overview. Distinguish operational activity counts from real Salesforce sales-performance reporting.

## What to ask the office after the demonstration

Identify the highest-value repeatable workflows, the pilot sponsor/admin owner, approved procedures, Salesforce sandbox path, allowed communication channels, research source expectations, retention needs and evaluation criteria. Avoid discussing speculative national roll-out or pricing as an agreed deal.

## Fallbacks

| Failure | Response |
| --- | --- |
| No model credential | Use local deterministic tools and dedicated forms; identify the mode clearly |
| Voice fails | End the microphone session, show the error/setup state, continue text workflows |
| Research provider unavailable | Use synthetic provider with its visible label; no fabricated live evidence |
| Job failed | Inspect persisted error, retry safely and show actual status |
| CRM unavailable | Use the local adapter; production Salesforce is not connected |
| Unexpected existing demo state | Use a new conversation/job and explain prior persisted work; avoid destructive resets |
| Internet unavailable | Continue local forms, notes extraction, approvals and tasks |

## Success checklist

The audience sees one cohesive assistant, real persisted state, a property-specific research pipeline, a source-aware call-note flow, a genuine approval boundary, contextual next steps and honest integration status. Do not imply that the local prototype is already enterprise-ready or that synthetic results establish investment performance.
