> **Operational reference, not the development roadmap.** Use [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) for current scope/status and [PROGRESS.md](PROGRESS.md) for dated evidence. Rehearse only accepted capabilities on the actual deployed revision; old presentation steps do not establish live connections, mobile readiness or production identity. The latest Render revision is unverified by this documentation reset.

# AgentDesk NW — detailed demonstration reference

Use the [Monday walkthrough](MONDAY_DEMO.md), [communications/credits plan](COMMUNICATIONS_AND_CREDITS_PLAN.md), and [progress log](PROGRESS.md) for current scope. All seeded accounts and records are fictional. Subscription and wallet actions are demonstrations, with no payment collection or investor delivery. The new workforce offer supersedes historical per-specialist purchase examples.

## Start

1. Double-click `Start AgentDesk.command`, or run `npm run start` after `npm run build`.
2. Open `http://127.0.0.1:3000`. Select Alex Morgan / Dispositions in Settings if needed.
3. Preserve the active database and saved history. Forward migrations retain prior records, original subscription snapshots and invoices; do not restore an old backup over current work for a presentation.
4. Open **AI workforce**. Show the $50 retail offer, role-available capabilities and four planned specialists. All available specialists coordinate through the same Copilot.

## Workforce and wallet story

1. Open **Credits & billing**. Explain the separate included, purchased and reserved credit balances; the base allowance is $15 retail value per period.
2. Choose a sample-work scenario and review its maximum before confirming. All costs on this control are fictional examples and no provider is called.
3. Simulate success and show that the unused portion of the reservation returns to available credit. Optionally reserve/mark unknown, then resolve the saved operation to illustrate uncertainty and replay-safe accounting.
4. Add a simulated $10 top-up. Show purchased credit separately and inspect the recorded activity. No card or payment is involved.
5. Change the monthly sample-spending limit and show that a new estimate cannot exceed the remaining limit. This limit applies to the wallet simulator; live provider usage remains in the operational-usage section.
6. Show that ordinary task completion and navigation do not consume the wallet. Current real AI/provider usage is not yet debited from it.
7. Show the fictional company-email preview and planned Business Line card. They do not imply a connected company mailbox, purchased number or live investor sending capability.

## Company-email demonstration story — Phase 4A

Open **Inbox** as Alex. The default **Company email · Salesforce** account contains fictional correspondence and shows its source capabilities. Open Mike’s repair-cost question, inspect its source and permitted relationship context, and prepare a grounded reply in the saved writing style. Review sender, recipient and exact text before confirming **simulated sending**. Use **Explore examples → Company-email follow-up**, then separately review and save a journey observation and personal follow-up. No provider delivery, automatic CRM approval or wallet charge occurs. Custom edits remain saved drafts; only current generated relationship replies use this simulator.

Expand **Other inboxes & source examples** to inspect captured activity with local drafts but no sending route, and headers-only records without subject/body analysis or sourced actions. Optional Gmail, Outlook and investor-text accounts retain their prior identities, messages and drafts. In **Explore examples**, choose **Same email, second source** and expand the message’s source details: two references belong to one message. Pause company-email access to demonstrate redacted content and blocked actions, then restore access and obtain a fresh review before continuing.

Typed Copilot supports “Show my company email,” “Find Mike company email,” and “Draft reply to Mike company email.” Exact thread links open the proper account even when it is not the primary source. Unqualified inbox requests may include optional accounts and require clarification when a correspondent has multiple conversations. Linked employee Slack/SMS use the same service; actual channel setup and delivery acceptance remain separate. Follow [COMPANY_EMAIL_DEMO.md](COMPANY_EMAIL_DEMO.md) and [COMMUNICATIONS_WORKFLOW.md](COMMUNICATIONS_WORKFLOW.md) for the sequence and boundaries.

## Company-seat story

Select Taylor Reed / Manager. Taylor is the explicitly assigned fictional billing administrator. In Credits & billing, assign Alex a company seat under a clear demonstration agreement label. Return to Alex and show $0 personal base / $30 company base, with the same $15 included credit period and no duplicate grant. An employee cannot self-select that discount.

An optional employee Copilot SMS add-on remains separate and requires actual channel setup. The future investor-facing Business Line is a different planned service. Company-seat removal leaves a canceled retail selection, requiring explicit employee resumption before personal billing. An explicitly removed company seat also prevents fallback to an older base-sponsorship rule; independent SMS sponsorship remains separate.

The administrator can review organization policy, temporary operational allowances and simulated billing lifecycle. No role switch in this fictional presentation is production identity or a customer agreement.

## Replaying the established workflows

The workforce plan includes available role-authorized matching, briefing, packaging, research and acquisition capabilities. Their record/role/sharing gates still apply. Temporary presentation allowances may support repeated synthetic research; wallet top-ups do not change those operational allowances. The detailed workflow examples below remain useful with this current access model.

## Verification

`npm run test:smoke`, `npm run test:wallet`, `npm run test:inbox`, `npm run test:communications` and `npm run test:company-email` use disposable local servers and databases. Do not set `SMOKE_BASE_URL` unless intentionally testing and mutating that instance. All checks use authenticated service routes; there is no runtime entitlement bypass. See PROGRESS for final counts and browser evidence.

---

# Phase 2 workflow demonstration (preserved)

**Meeting target:** Monday, November 2, 2026, prospective New Western Georgia office pilot.

**Purpose:** Show a working investor-to-property workflow and identify the requirements for an authorized pilot.

**Positioning:** “A concept for New Western by Tailored Agents.” No endorsement, corporate-policy, real-investor or production-access claim.

## Prepare the existing workspace

1. Follow the [README](../README.md). Double-click **Start AgentDesk.command**, keep its Terminal window open, and open [the local workspace](http://127.0.0.1:3000) after Ready appears. The launcher starts the app and worker together; keep both running for research and reminders.
2. Check [PROGRESS](PROGRESS.md) for the final verification checkpoint. Before the meeting, run the documented type, lint, test, build and smoke checks if the source has changed. The default smoke runner uses a disposable database and does not alter meeting records. Do not set `SMOKE_BASE_URL` for this preparation unless intentionally adding fixtures to the active workspace.
3. Preserve the active `data/agentdesk.sqlite` database. Phase 1 is checkpointed at `cded4cd`; `data/phase1-checkpoint.sqlite` is a recovery backup, not a file to restore before the demo. Do not reset the database or erase earlier work.
4. Confirm the fixed fictional identities under **Settings → Demonstration personas → Demo user role**: **Alex Morgan** (dispositions), **Jordan Lee** (acquisitions), and **Taylor Reed** (manager). Use the manager briefly for release management, then Alex for the main relationship story. This switcher is a local demo feature, not production sign-in.
5. Open **Calling queue**, **Property releases**, **Post-call debrief**, **Deal packages**, **Investor Hunter**, **Work queue**, and **Deals & investors** once. On a narrow screen, the navigation menu opens the full workspace; Calls and Debrief also appear in the bottom navigation.
6. Optional voice: set the authorized API key only in the ignored `.env.local`, restart the server, and test the actual account, selected model, audio device and browser microphone permission in advance. The key stays server-side. A ChatGPT subscription does not supply an API key. Without validated credentials, demonstrate typed workflows and the honest voice setup state.

### Persisted examples already available

These records were created or updated during local browser QA and are deliberately retained. Inspect the current UI before presenting; later demonstrations may have added versions or changed values.

| Example | Expected starting state |
| --- | --- |
| Alex’s investors | Four visible fictional records, including Avery Collins from the Phase 1 import; do not describe the imported record as a newly discovered real person |
| 123 Example Street, Marietta | Released version 1; asking price **$235,000**, supplied ARV assumption **$320,000**, supplied repair assumption **$35,000**; all synthetic |
| Sample photo URL | `https://example.com/agentdesk-demo-photos` is a **placeholder, not live photos and not a Google Drive folder**. Any stored access confirmation is synthetic employee attestation, not a live permission check |
| Mike Bennett | Synthetic signed-disclosure fixture; reviewed maximum purchase price **$250,000** and cosmetic rehab preference; approved note and follow-up reminder already exist |
| Mike’s prior package | Manual handoff prepared during QA; **not sent** |
| Sarah Chen | A saved package is blocked by missing disclosure eligibility; restricted message content/copy remain unavailable |

## Eight-part demonstration, approximately 12–15 minutes

### 1. A property release creates relevant work

Begin with the existing **123 Example Street** release. Show **Released**, its version, source, permitted audience and the distinction between upstream acquisition and downstream investor-sale context. The ARV and repair figures are supplied fictional assumptions, not verified valuations or comparable-sales analysis.

For a live release-management step, switch to Taylor Reed through Settings and open **Property releases**:

- For an existing property, use **Revise release**. Do not try to create a second release for the same property.
- For an available property without a release, use **Create demo release**, choose **Property**, set **Release status** to **Released to authorized team**, and enter the actual fictional **Source**, **Approved deal description** and **Property notes** you intend to show.
- Review **Dispositions teammates who can work this release** and select Alex. Optional economics belong in **ARV assumption**, **Repair assumption** and **Source for economics**.
- A genuine authorized media URL is not supplied for this demo. Keep a new release’s media field empty, or identify the existing example.com value explicitly as a nonfunctional placeholder. Do not present it as real photos or verified Drive access. Recipient-confirmed media requires selecting the intended investors; that records employee attestation only.
- Select **Save & release to permitted team**. A revision increments the version and makes earlier packages require a fresh composition/review. Use the existing version without editing if you want to preserve the saved QA package example.

Return to Alex. Show that the shared property release can surface Alex’s permitted buyer matches while investor relationships retain separate access rules. No Marketplace connection is implied.

### 2. “Who should I call?” leads to a real briefing

Open the dashboard’s **Who should I call today?** suggestion and **Open calling queue**, or ask Copilot:

> Who should I call today?

Show the current rank and the reasons actually displayed. Distinguish **Call priority**, **Property fit** and **Engagement**; none is a prediction that someone will buy. Point out the related property, disclosure state, contact limitations, due commitments and last recorded outcome.

Use **Move up** and **Clear priority boost**, or dismiss a suggestion and restore it through **Show dismissed suggestions**, to demonstrate persisted employee control. Do not invent current buying activity when the evidence says unknown.

Select Mike’s **Get ready to call**, or ask:

> Get me ready to call Mike.

Review the current buy boxes, previous conversation, outstanding commitment, relevant match, missing qualification information and call objective. This is a briefing built from permitted records. Do not place a real call.

### 3. A personal-phone recap captures the useful details

Choose Mike’s **Quick debrief**, or open **Post-call debrief → Post-call recap**. Explain that the employee uses this after a normal personal phone call; AgentDesk does not record the cellular call.

Because Mike’s current maximum may already be $250,000, use $245,000 below to make the proposed change visible. If the record has changed again, choose another clearly fictional, intentional revision and explain it.

> I just spoke to Mike Bennett about 123 Example Street. He buys in Cobb and Cherokee counties, uses cash, and wants fix-and-flip single-family houses under $245,000 with cosmetic rehab. He asked for the property details and photo link, and I promised to call him tomorrow.

Select **Turn recap into next steps**. Inspect the summary, proposed structured criteria, source excerpts, commitments and useful questions for next time. Confirm Mike and the intended property under **Confirm the right records**. If the parser flags an ambiguous name or property, resolve the link explicitly instead of claiming certainty.

The **Authorized transcript** tab retains text upload, permission confirmation, extraction and reviewed-note preparation. It is a separate input path; a transcript is not required for the post-call recap.

### 4. Reviewed criteria and notes improve the relationship record

Keep **Create the suggested follow-up reminder** selected if you want a new local reminder. Select **Prepare changes for review**, then **Review proposed CRM changes**. A selected reminder is created locally at preparation; CRM note and criteria changes remain pending until separately approved.

In **Work queue → Approvals**, review each proposal’s exact target and content. For criteria, show the current/proposed values or proposed buy-box version, conflicts and source statement. Select **Approve & apply to sample CRM** only after reading the intended change. Approve the note separately as applicable.

Return to **Deals & investors → Mike Bennett**. Verify the new maximum, rehab preference, source/history and note; refresh once to demonstrate persistence. Multiple distinct purchase strategies can be stored as separate buy boxes. Approval changes only this local sample CRM—Salesforce remains unconnected.

### 5. A package is ready to copy only when the recipient is eligible

From Mike’s profile, calling card or property release, choose **Prepare deal package**. In **Deal packages**, select Mike, the released property, and **Email draft** or **Personal text · copy**. Select **Check eligibility & prepare**.

Read the resulting facts, missing-information notices and source. Keep the example.com photo URL visibly identified as a placeholder if it is present. It is not evidence of actual media access. The package uses a local demo template, not corporate-approved New Western language.

You may remove or reorder complete sourced lines. To change property facts, revise the release and prepare a fresh package. After any edits, use **Save edited draft**, review again, then **Approve reviewed package**. Choose **Copy for manual handoff** and show **Copied. Nothing sent.** If the browser denies clipboard access, the UI prepares a manual handoff and tells you to select/copy the reviewed text instead; do not claim it copied successfully.

Do not paste into a real recipient’s messaging app or send anything. The recorded delivery status remains **not sent**, even when handoff has been prepared.

Repeat with Sarah Chen and the same release, or open her existing blocked package. Show the eligibility reasons and absence of restricted message/copy controls. Do not manufacture a signed disclosure to bypass this demonstration. Mike’s ready state comes from an explicitly synthetic fixture; a real process requires approved documents and verifiable evidence.

### 6. Investor Hunter looks for net-new external prospects

Open **Investor Hunter → New research**. Choose **123 Example Street**, **Cobb**, **$235,000**, **Fix and flip**, **Single-family**, and **Target prospects: 12**. The finite sample provider contains **12 distinct fictional candidates**, not 100; requesting more does not create more evidence.

Start research, leave the page, and return to its actual saved stage/result. Explain that the worker continues while the browser is closed as long as the launcher is running. Open one candidate’s evidence and score explanation.

Show that **External investor fit** uses similarity of fictional purchases, property type, price, strategy and evidence. It is separate from an existing CRM buyer’s property fit and engagement. A same-county match alone is not proof of buying intent. Contact details remain unavailable/unverified.

Inspect duplicate classifications. A private relationship may produce an opaque duplicate warning without exposing its identity. Export CSV if useful. For an import demonstration, select only eligible **New prospect** records, choose **Prepare CRM import**, inspect the pending action, and approve it explicitly. Previously imported fixtures can already be duplicates; use another eligible candidate or show the existing Avery record instead of resetting the database.

### 7. The next step stays connected to a promise

In Copilot ask:

> What should I do next with Mike Bennett?

Review the recommendation against the actual updated record, disclosure status and pending packages. Guidance is part of normal work and reflects a local baseline awaiting company-approved procedures.

Open **Work queue → Tasks** and locate the follow-up created from the recap. Show its due date and relationship link. If appropriate, complete an expendable fictional reminder and reload to demonstrate persisted status; leave the meeting’s next follow-up open if it will be used later. **Log outcome** on a calling card can capture an explicit fictional call outcome and follow-up time, but it does not mean the app placed a call.

Briefly show **AI employees**: all 16 specialists remain registered with truthful local/demo/planned status. Users work through one Copilot; they do not need to choose an employee before each task. Manager activity counts are local operational records, not real sales-performance reporting.

### 8. The same context works on a narrow screen; live voice is optional

Use the verified narrow browser view to show Calls, the briefing, a debrief and package review without horizontal page overflow. Browser viewport testing is not certification on a physical phone. The normal server binds to loopback, so do not promise another phone can connect over office Wi-Fi without a separately approved deployment setup.

If live voice was successfully validated ahead of time, use **Talk to Copilot** or **Debrief with Copilot**, grant microphone access, ask for a briefing or dictate the recap, and verify the resulting record/tool artifact in the app. End the session and confirm the microphone indicator stops. Live two-way conversation is distinct from telephone recording.

Otherwise show the truthful configuration state and continue with typed input. Do not simulate a live conversation or describe untested model/audio behavior as proven. Employee Slack/SMS adapters are implemented but real account setup and delivery acceptance remain pending; investor-facing business texting and Telegram remain later work. No external channel is sending demo messages.

## Recovery without losing the demonstration

| Situation | Response |
| --- | --- |
| No model credentials or network | Use the dedicated forms and deterministic local Copilot commands; identify the mode clearly |
| Voice unavailable | End the microphone session, show its setup/error state and continue typed debriefs |
| Existing release or reviewed criteria | Inspect the persisted record; revise its current version or use a different available property. Do not reset the database |
| Old package is blocked after a release/template/disclosure change | Explain the recheck, prepare a new package and review it again |
| Sarah’s package is blocked | This is the intended disclosure demonstration; show the reason and withheld copy |
| Research job fails | Inspect the persisted error and use Retry research; never replace missing results with invented evidence |
| No eligible new research fixtures remain | Show prior imports and duplicate checks, or use the disposable smoke suite later; do not claim another 100 investors exist |
| Placeholder photo link is questioned | State that it is not live media and no real Drive-access test has occurred |
| Clipboard denied | Show the manual selection/copy fallback and retain not-sent delivery status |
| Unexpected reminder timing | Check the visible due date and America/New_York display; keep the worker running and account for quiet hours |

## Questions for the prospective office

Confirm the pilot sponsor and Salesforce administrator; relationship ownership/sharing rules; authoritative property-release source; required disclosure document/version and evidence; approved templates/media-sharing rules; permitted research sources and communication channels; retention and access requirements; and the outcomes the pilot should measure. Alex’s reported workflow is discovery input, not proof of national corporate policy.

The demonstration succeeds when the audience sees connected work, real persisted state, sourced investor changes, meaningful approval and disclosure boundaries, and honest integration status. It does not establish investment performance, customer endorsement, production readiness or authorization for actual investor outreach.


## Phase 4 conversation demonstration

This section supersedes earlier provider/voice statements. No OpenAI key was configured during Phase 4 implementation. The code and mocked provider tests do not establish a successful live conversation, actual microphone/audio operation, real external findings or production readiness.

### Prepare without changing saved work

1. Keep `data/agentdesk.sqlite` and existing backups. Use the launcher as before; it starts the web app and worker together. Do not run the smoke suite against the meeting database: its default temporary-database mode is safer.
2. For real text/voice, configure `OPENAI_API_KEY` only in ignored `.env.local`, using an API project with approved billing and model access. A ChatGPT subscription does not supply API credits. Keep `OPENAI_MODEL=gpt-6-astra`, `OPENAI_REASONING_EFFORT=high`, and `OPENAI_REALTIME_MODEL=gpt-realtime-2.1` initially. Supported Astra effort values are low/medium/high/xhigh/max; Ultra is not an API value.
3. Restart both application and worker. Open Settings → Provider verification. “Configured unverified” means credentials exist, not that a call succeeded. A saved provider receipt confirms only that operation; it does not prove research claims or microphone quality.
4. Alex has the included workforce for his role. Show that planned or role-restricted capabilities remain unavailable. Grant additional operational research allowance through the administrator controls if repeated demonstration jobs require it; a wallet top-up is separate.
5. To enable external web research, select `AGENTDESK_RESEARCH_PROVIDER=openai-web-search-v1`, set a conservative positive `AGENTDESK_RESEARCH_ESTIMATED_REQUEST_CENTS` approved by the operator, and keep small request/search/duration limits from `.env.example`. This value is an estimate, not a quoted API price. Licensed property/ownership/contact enrichment is still disconnected. Do not use a fictional example address as if it were an actual property.

### Small live preflight, only after credentials are configured

- Ask one short text question, then “Create a task to review the demonstration.” Confirm the saved task and provider receipt. Repeat/follow up in the same conversation. Review the actual result; do not claim success solely because the model says so.
- Tap Talk to Copilot, grant microphone permission, and ask for today's work. Confirm audible model speech, interrupt once, and ask it to create one internal review task. End the session. Confirm the normal task list and saved transcript. Reconnect to the same conversation. Test the intended phone separately; screen locking/backgrounding deliberately ends the session. Connected voice holds remain reserved pending minute reconciliation, so plan a short test.
- For one approved external test, use a genuine subject address, county, price, type and strategy, a target of 3–5, and an explicit small estimate budget sufficient for one configured request. Set maximum requests to 1 for that test. Inspect every returned source, reject unsupported assertions, and expect fewer than the target. No outreach is authorized. A missing key/license or uncertain receipt is a blocker to verify, not a reason to manufacture results.

### Meeting sequence

1. “What should I focus on today?” Show priorities sourced from the fictional CRM and saved tasks. Without a key, identify this as the deterministic local command assistant.
2. “Find new investors for this property.” Resolve the property and essential facts. Choose fictional demo research or explicitly authorized external public-source research. Confirm the actual queued job; candidate counts are targets.
3. “Get me ready to call Mike.” Use an active workforce subscription with the permitted role and inspect the actual briefing. No real investor call is placed.
4. “I just spoke with Mike. He wants cosmetic flips under $245,000 in Cobb County using cash. Prepare his updates and create a reminder for tomorrow at 10 AM Eastern.” Resolve identities, review extracted facts, confirm the task deadline, and distinguish pending CRM changes from the created task. Offline mode uses the existing exact-selection debrief/task screens.
5. “Prepare the Marietta property information for Mike.” Resolve the exact release, inspect disclosure/media blockers, and review the saved draft. Approval/copy handoff stays in the existing UI. Nothing is sent.
6. Switch to voice for a follow-up only if the live preflight passed on that device. Otherwise show the honest setup state and use text; do not portray it as a spoken demonstration.
7. Return to tasks, approvals and research to show persisted outcomes. Inspect sources, duplicate warnings and unverified contact labels. Failed/canceled external jobs retain saved partial evidence; their unknown requests are not blindly retried.
8. Show subscription controls and provider usage. Actual provider costs are unresolved unless supported by billing evidence; no economic sustainability claim is justified yet.

The current external adapter uses public OpenAI web-search sources. It is not a licensed transaction database, a verified LLC ownership resolver, or a contact verification service. Production Salesforce and all investor outreach remain disconnected.
