# AgentDesk NW — detailed demonstration reference

**Current presentation:** use [the concise Monday walkthrough](MONDAY_DEMO.md). The latest local workspace has explicit 14-day presentation trials, a light interface, and Settings → Demonstration personas. Earlier checkpoint-specific examples below are preserved for reference. Repository creation, commits/pushes and Render launch are deferred until the owner requests them.

All accounts, subscriptions and activity below are local fictional demonstrations. No New Western payment, investor message or external account change occurs.

## Start

1. Double-click `Start AgentDesk.command` in the project folder, or run `npm run start` after `npm run build`.
2. Open `http://127.0.0.1:3000`. The existing worker starts with the app. Use Settings to select **Alex Morgan / Dispositions** if needed.
3. Preserve `data/agentdesk.sqlite`. Backups `data/phase1-checkpoint.sqlite` and `data/phase2-checkpoint.sqlite` are recovery copies, not files to restore during setup. Phase 2 source is checkpoint `de77fac`.
4. Open Marketplace. If practicing repeatedly, select Core, remove personally selected add-ons, and save the simulated subscription. Do not delete research/history. Verify no trial or company sponsorship is active if demonstrating the exact personal prices below.

## Twelve-step subscription story

1. Open **AI Employee Marketplace** and show the **$49 Core** foundation, its four employees and included allowances.
2. Browse role filters and cards. Explain **local/demo**, **active**, **included** and **in development** separately.
3. Click **Add to plan** on Investor Hunter. The quote becomes **$128**.
4. Add Deal Marketing. The quote becomes **$147**. Save the simulated subscription; the sidebar increases from four to six capabilities.
5. Open **My AI Workforce** to show both selected premium capabilities. All return to the same Copilot/workflows.
6. In Copilot, say “Find 25 new investors for 123 Example Street.” This uses the one research credit, runs the synthetic worker and returns at most 12 fictional candidates. Do not promise 25 verified contacts. A second run requires a new-period allowance or demo credit grant.
7. Return to Marketplace, remove Investor Hunter and save. The personal total becomes **$68**, with Deal Marketing still selected.
8. In the same Copilot, say “Find me 100 new investors for this property.” It explains the upgrade and provides **Review AI Employee Marketplace**. Existing research remains readable in Investor Hunter/Work queue.
9. Open **Usage & billing**. Explain consumed/reserved/remaining balances and simulated invoices. An old $49 period-start invoice is not a new $147 charge: immediate changes update the future monthly rate without simulated proration.
10. In Marketplace choose **Dispositions Complete**: **$179**, with no separate charge for included Hunter or Deal Marketing. Investment Deal Analyst still says **In development**.
11. Optionally save a next-period downgrade or cancellation and show its pending status and simulated renewal date.
12. Finish with the desired demo selection, or return Alex to Core only. No money was collected.

## Organization story

In Settings choose **Taylor Reed / Manager**, then **Usage & billing**. Taylor is the explicitly assigned local billing administrator. Expand Dispositions in the organization policy area, sponsor Core and save. Return to Alex: his selected Hunter + Deal Marketing configuration shows **$98 personal + $49 company**. Revert sponsorship after the demonstration unless intentionally keeping that fixture.

Taylor can grant one or multiple selected specialists for the configurable 14-day trial, grant extra research credits, simulate usage success/failure/cancellation, and simulate payment failure/recovery or advance renewal for a selected organization employee. A new trial grant replaces the prior trial; expiration never silently buys add-ons. Do not confuse this local role switch with production identity/security.

## Replaying the Phase 2 workflow

Core can still extract recaps, propose reviewed CRM changes and create reminders. To demonstrate the full older workflow, grant or activate Buyer Matchmaker, Investor Relationship and Deal Marketing for Alex, and Acquisition-to-Disposition for Jordan/Taylor. Hunter also needs available credits. No live provider is required. The detailed Phase 2 walkthrough below remains applicable after that access preparation.

## Verification

`npm run test:smoke` creates a disposable database and local server. Do not set `SMOKE_BASE_URL` unless intentionally testing and mutating that target. The Phase 3 suite activates/grants access through authenticated billing APIs; it has no runtime test bypass. See PROGRESS for the final recorded counts and browser evidence.

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

Otherwise show the truthful configuration state and continue with typed input. Do not simulate a live conversation or describe untested model/audio behavior as proven. Slack is the next external messaging candidate and remains unconfigured; connected SMS is a planned optional metered add-on; Telegram comes later. No external channel is sending demo messages.

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
4. Alex remains Core-only. Show a denied premium request first. If demonstrating Hunter/briefings/packages, use Taylor's existing Usage & billing administration to grant an explicitly labeled temporary trial for the required implemented specialists, or use the existing subscription simulator. Do not bypass access checks. Grant adequate demo research credits through the same admin controls if the target needs them.
5. To enable external web research, select `AGENTDESK_RESEARCH_PROVIDER=openai-web-search-v1`, set a conservative positive `AGENTDESK_RESEARCH_ESTIMATED_REQUEST_CENTS` approved by the operator, and keep small request/search/duration limits from `.env.example`. This value is an estimate, not a quoted API price. Licensed property/ownership/contact enrichment is still disconnected. Do not use a fictional example address as if it were an actual property.

### Small live preflight, only after credentials are configured

- Ask one short text question, then “Create a task to review the demonstration.” Confirm the saved task and provider receipt. Repeat/follow up in the same conversation. Review the actual result; do not claim success solely because the model says so.
- Tap Talk to Copilot, grant microphone permission, and ask for today's work. Confirm audible model speech, interrupt once, and ask it to create one internal review task. End the session. Confirm the normal task list and saved transcript. Reconnect to the same conversation. Test the intended phone separately; screen locking/backgrounding deliberately ends the session. Connected voice holds remain reserved pending minute reconciliation, so plan a short test.
- For one approved external test, use a genuine subject address, county, price, type and strategy, a target of 3–5, and an explicit small estimate budget sufficient for one configured request. Set maximum requests to 1 for that test. Inspect every returned source, reject unsupported assertions, and expect fewer than the target. No outreach is authorized. A missing key/license or uncertain receipt is a blocker to verify, not a reason to manufacture results.

### Meeting sequence

1. “What should I focus on today?” Show priorities sourced from the fictional CRM and saved tasks. Without a key, identify this as the deterministic local command assistant.
2. “Find new investors for this property.” Resolve the property and essential facts. Choose fictional demo research or explicitly authorized external public-source research. Confirm the actual queued job; candidate counts are targets.
3. “Get me ready to call Mike.” Use an eligible premium trial/subscription and inspect the actual briefing. No real investor call is placed.
4. “I just spoke with Mike. He wants cosmetic flips under $245,000 in Cobb County using cash. Prepare his updates and create a reminder for tomorrow at 10 AM Eastern.” Resolve identities, review extracted facts, confirm the task deadline, and distinguish pending CRM changes from the created task. Offline mode uses the existing exact-selection debrief/task screens.
5. “Prepare the Marietta property information for Mike.” Resolve the exact release, inspect disclosure/media blockers, and review the saved draft. Approval/copy handoff stays in the existing UI. Nothing is sent.
6. Switch to voice for a follow-up only if the live preflight passed on that device. Otherwise show the honest setup state and use text; do not portray it as a spoken demonstration.
7. Return to tasks, approvals and research to show persisted outcomes. Inspect sources, duplicate warnings and unverified contact labels. Failed/canceled external jobs retain saved partial evidence; their unknown requests are not blindly retried.
8. Show subscription controls and provider usage. Actual provider costs are unresolved unless supported by billing evidence; no economic sustainability claim is justified yet.

The current external adapter uses public OpenAI web-search sources. It is not a licensed transaction database, a verified LLC ownership resolver, or a contact verification service. Production Salesforce and all investor outreach remain disconnected.
