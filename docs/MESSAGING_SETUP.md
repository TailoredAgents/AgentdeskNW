# Employee messaging — AgentDesk NW

[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for completion status, development order and the next checkpoint. This file preserves provider setup and acceptance instructions, primarily for C5 employee SMS and retained optional Slack. C1 owns shared job commands, C2/C3 native surfaces, C6 actual spending/top-up and C7 approved company connections/rollout. Provider setup and live acceptance are separate from local software checks.

The native app is the confirmed primary daily experience for the mixed iPhone/Android workforce, mostly iPhone. App access is included in the workforce subscription. Employee SMS is an optional provisional $19/month convenience channel; desktop supports detailed work. New Western does not currently use Slack, so its retained integration is lower priority and is not required for the mobile/SMS experience.

The fictional investor **Inbox** is a separate correspondence domain. Its demo business-text account does not use the employee Copilot SMS number, consume channel segments or receive these webhooks. Dedicated live investor numbers and delivery remain separate; see [COMMUNICATIONS_INBOX.md](COMMUNICATIONS_INBOX.md).

The adapters were implemented locally on October 29, 2026 and are included in the verified committed baseline through `2d16665`. The last recorded account check found setup incomplete; actual Slack/SMS round-trip acceptance remains pending and current account configuration must be checked when connecting. The October 30 shared-controls/mobile foundation adds locally verified native transport, mock notifications and conversational job controls. The owner previously reported a Render deployment; verify its actual revision/origin before any acceptance run. Owner-account tests with fictional data do not establish approval for company Salesforce access. This documentation change connects no accounts and sends no messages.

## What the employee gets

- Once configured and linked, a private SMS or optional Slack DM reaches the same Copilot and guarded specialist tools used in the dashboard.
- An employee pairs their own external identity using a single-use, ten-minute linking message from Settings. Unlinked contacts cannot access CRM data or operate tools.
- Slack, SMS and the **Your ongoing Copilot** dashboard conversation share saved history. Other dashboard conversations remain separate.
- Tasks created by messages appear in Work queue. Due-task and completed/failed-research reminders are optional per connection and respect notification settings and quiet hours (America/New_York).
- CRM changes still need review in the dashboard. Investor outreach, deal-package distribution, group channels, attachments and voice notes are not enabled by this integration.
- SMS uses the existing optional SMS entitlement and combined inbound/outbound segment allowance. Demo administrators can explicitly grant an SMS trial using the existing billing controls; normal presentation preparation does not grant it automatically.

The shared dispatcher supports exact reviewed job-cost commands to this shared dispatcher; it does not enable CRM approvals or actual provider spending. Short cost decisions must identify the immutable reviewed scope/version/maximum and satisfy delivery ordering; long reviews require full app review. General plan editing remains incomplete. Withheld-work references now request a fresh selection, with a regression proving they cannot act on an older personal task. See [WORK_EXECUTION.md](WORK_EXECUTION.md).

## Optional Slack: start locally without a public server

1. Create an app in your chosen Slack workspace using `integrations/slack-app-manifest.json`. The app is named **AgentDesk NW** and subscribes only to private `message.im` events, with `chat:write` and `im:history` bot scopes.
2. Install it in that workspace. Enable the Messages tab and allow users to message the app (the manifest already requests this).
3. Create an app-level token with `connections:write` for Socket Mode. Configure these server environment values in ignored `.env.local`:

   - `SLACK_TRANSPORT=socket`
   - `SLACK_TEAM_ID` — the installed workspace ID
   - `SLACK_APP_ID` — the app's ID
   - `SLACK_BOT_TOKEN` — installed bot token
   - `SLACK_APP_TOKEN` — app-level Socket Mode token
   - `AGENTDESK_CHANNELS_ENABLED=true`
   - `AGENTDESK_CHANNEL_SEND_ENABLED=true`

4. Run `npm run channels:check` for a read-only bot/workspace/scope probe. Start the application normally with `npm run dev` (which also starts its worker).
5. In Settings, select **Get linking code** under Slack and send the entire `LINK …` command as a private DM to the app. Return to Settings to see **Linked**, then enable reminders if desired.
6. Send “Create a task to rehearse the Monday demo.” Confirm the reply in Slack, the task in Work queue, and the same conversation under **Open ongoing Copilot conversation**.

Socket Mode works locally and on the prepared single-instance Render service. Keep exactly one AgentDesk worker for the configured app/database; do not run a local worker against the same Slack app as a deployed demonstration. One app/workspace is configured per deployment. A general multi-workspace OAuth installation flow is future work.

Alternative HTTP Events transport: set `SLACK_TRANSPORT=http`, configure `SLACK_SIGNING_SECRET`, disable Socket Mode in Slack, and set the Events Request URL to `https://YOUR-ORIGIN/api/webhooks/slack`. Slack's verification challenge and events use the signed public endpoint. The app verifies the signature/timestamp, app ID and workspace ID before accepting work.

## Twilio SMS

1. Use a Twilio account and SMS-capable number that can deliver to your test phone. For US numbers, check the account's applicable number registration/verification status before promising a Monday live SMS demonstration. Trial accounts restrict messaging to verified recipients. Provider approvals and carrier delivery timing are external dependencies.
2. Configure:

   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER` — full E.164 number, including `+`
   - `AGENTDESK_CHANNEL_PUBLIC_ORIGIN=https://YOUR-ORIGIN` — HTTPS origin only, no path/query. When omitted, the app uses `AGENTDESK_APP_ORIGIN` or Render's `RENDER_EXTERNAL_URL`.
   - `AGENTDESK_CHANNELS_ENABLED=true`
   - `AGENTDESK_CHANNEL_SEND_ENABLED=true`

3. Point the number's **A message comes in** webhook to `https://YOUR-ORIGIN/api/webhooks/twilio`, using HTTP POST. If a Messaging Service overrides that number's incoming-message settings, configure the same callback there. Advanced Opt-Out's signed `OptOutType` is supported when enabled by the service.
4. Run `npm run channels:check`. It only verifies credentials and that the number belongs to the account and supports SMS; it cannot establish carrier acceptance or recipient eligibility.
5. Give the demonstration employee SMS access through the existing billing UI (an explicit temporary SMS trial is sufficient). Request a linking code in Settings and text it from that employee's own test phone to the configured Twilio number.
6. Outbound requests automatically include the signed status-callback URL `/api/webhooks/twilio/status?delivery=...`; no manually created delivery ID is needed. Settings distinguishes queued, accepted, delivered, failed and unconfirmed delivery.
7. Test a question and a task, then enable reminders and create a task due shortly. Confirm actual handset delivery. Text **STOP** and verify that replies/reminders stop; **START** resumes eligibility but does not re-enable reminders automatically.

Twilio needs a reachable HTTPS callback URL. During local testing, an explicitly configured HTTPS tunnel can forward to the local server. If the same public origin should also open the dashboard from a phone, enable the existing private hosted-demo invitation mode and configure its canonical origin, access code and signing secret. Normal loopback-only local demo authentication intentionally does not expose the dashboard through arbitrary public hosts. Socket Mode Slack does not need a tunnel.

## Delivery behavior and operating limits

Provider ingress verifies authentication before recording work and acknowledges before invoking the AI. A durable inbox deduplicates provider event IDs. The worker routes messages into the existing idempotent Copilot dispatcher. A durable outbox rechecks employee membership, entitlement, link consent and current record visibility immediately before dispatch. The model does not choose recipients or grant permissions.

Replies are concise; responses that exceed channel limits point to their full saved conversation rather than silently truncating important details. With no configured public origin, Slack asks the employee to open that conversation in the dashboard. Slack acceptance does not mean delivery/read confirmation. Twilio delivery status comes only from authenticated provider responses or callbacks.

Default limits: 12 accepted AI requests per linked identity per minute, 50 outbound messages per provider account per rolling 24 hours (configurable `AGENTDESK_CHANNEL_DAILY_LIMIT`, maximum 200), and 10 reminder notices per connection per rolling 24 hours. SMS allowance is enforced separately; Unicode-safe conservative segment reservations precede sending. Verified actual inbound and outbound segments settle the ledger without inventing provider dollar costs. An inbound SMS may already have incurred provider usage even when its AI request is refused.

Interrupted/ambiguous outbound requests are not automatically resent. They show **Unknown** until a trusted receipt resolves them. Never blindly replay an unconfirmed message. Known Twilio message IDs are periodically reconciled; unresolved usage stays reserved. Interrupted AI work requires checking the saved conversation before requesting another action. A busy dashboard conversation defers channel work until its current turn finishes.

STOP disables all queued outgoing messages for that SMS identity, disables reminders and cancels queued AI work. Disconnect cancels queued work too; reconnecting requires another linking code. Reminders are not backfilled from notifications created before the connection's reminder preference was enabled. A currently overdue task can still generate a new notice after enabling reminders. Completed tasks, read notices and newly inaccessible records are checked again before delivery. Other notification kinds (such as property-release/package-review notices) remain in-app for this version.

The app does not implement multi-instance dispatch leases, multi-workspace OAuth, automatic retry of ambiguous sends, or production employee SSO. The invitation demo shares fictional personas; it is not production identity. Run web and worker together using the existing start scripts and persistent disk. Keep messaging flags off in any environment that should not receive or send real messages.

## Local verification and live acceptance

Automated: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:smoke`, `npm run test:hosted`, and `npm run test:messaging`. The messaging HTTP suite boots a disposable compiled server with fictional provider credentials, signed events, shared-task checks, delivery callbacks, STOP and restart persistence. Outbound provider requests are mocked. It does not prove Slack installation, Socket Mode connectivity, carrier delivery or live conversational quality.

SMS acceptance requires the chosen owner account and test recipient: read-only credential probe, real SMS question/task round-trip, due reminder, STOP, reconnect, a task visible in the ongoing desktop conversation, and an approval that remains pending until correctly reviewed. Check the actual deployed Render origin and revision before testing. Exercise exact conversational cost review/decisions, stale/replayed decisions and cross-channel continuation separately. Native continuation and push/dictation acceptance belong to C2/C3, not to a successful Twilio webhook test.

Slack's DM round-trip, reminder and reconnect checks remain available when that optional channel is exercised; they are not a prerequisite for New Western's mobile/SMS rollout. Automated tests and local drafts do not establish live provider or physical-device acceptance. Current completion status and dependencies remain in the canonical roadmap.

## Official references

- [Slack Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/)
- [Slack app manifest](https://docs.slack.dev/reference/app-manifest/)
- [Slack App Home and messages](https://docs.slack.dev/surfaces/app-home/)
- [Slack message posting](https://docs.slack.dev/reference/methods/chat.postMessage/)
- [Twilio webhook verification](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Twilio incoming messaging webhooks](https://www.twilio.com/docs/usage/webhooks/messaging-webhooks)
- [Twilio message records and statuses](https://www.twilio.com/docs/messaging/api/message-resource)
- [Twilio trial recipient restrictions](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account)
- [Twilio US A2P 10DLC registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- [OpenAI tools and application-owned function execution](https://developers.openai.com/api/docs/guides/tools)

## Assignment spending through messaging

The optional admitted-text development mode supports “Show my spending”, “Review spending S…” and exact “Approve R…” / “Deny R…” decisions. Complete short reviews can be decided in SMS/Slack after their reply receipt; long reviews open the full app scope without an approval code. These are separate from W/A fictional job reviews. The resumed original request produces one reply to its captured connection and one saved conversation result. Changed destination, STOP/disconnect and lost access prevent that send; uncertain delivery is not retried automatically. This flow is accepted with mocked provider transports only. No live connection is enabled by these commands. See [usage metering](USAGE_METERING.md).
