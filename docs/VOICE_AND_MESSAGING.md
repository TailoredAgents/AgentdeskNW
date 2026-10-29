# Voice and messaging

## Initial surface

AgentDesk web is the primary surface, with responsive navigation and a prominent voice entry point. Conversations, tasks and research jobs live on the server, so changing browser views does not erase context. Installable metadata supports a mobile home-screen path where the browser allows it; this does not imply native mobile distribution or offline tool execution.

## Live voice integration

Phase 4 implements the OpenAI Realtime WebRTC flow with a server-owned control connection. The server mints a 60-second credential, keeps it in memory, and exchanges the browser's SDP with OpenAI. Neither the permanent key nor the ephemeral credential is returned by the application API. The browser carries microphone and generated audio over WebRTC. [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc).

The checked guide also describes GPT-Live. AgentDesk does not silently mix those wire protocols; its Realtime model and endpoint configuration must remain consistent. `OPENAI_REALTIME_MODEL` is configurable; a configured name does not guarantee account access.

### Connection lifecycle

1. User selects live voice; if no server credential is configured, show the precise setup requirement.
2. Request microphone permission after a user action and show connection progress.
3. `POST /api/voice/session` authenticates, checks Core entitlement and remaining voice allowance, reserves at most the configured session limit, and prepares a single-use credential. Its response contains only the session/conversation identifiers, expiry and time limit. Only one unfinished session per employee/office is allowed.
4. The browser creates a peer connection, adds microphone tracks and a data channel, then sends its SDP to `POST /api/voice/connect`. The server uses the ephemeral credential, obtains the call ID from the provider's `Location` response header and attaches an authenticated WebSocket sideband. It returns the SDP answer only after the control connection opens. A client-supplied call ID is never accepted. [OpenAI server controls](https://developers.openai.com/api/docs/guides/voice-server-controls).
5. The sideband owns tools, transcript persistence and provider usage receipts. It uses the same validated services as text; no approval or external-send tool is exposed. Duplicate response/tool/transcript events do not repeat work. A canceled response cannot execute its partial function calls. `POST /api/voice/tool` and `/api/voice/transcript` reject browser submissions.
6. The browser displays listening, thinking, speaking, muted, reconnecting, permission and playback-blocked states. Server VAD handles turns and interruption. The audio player provides an explicit fallback when a mobile browser blocks autoplay.
7. `GET /api/voice/status` is scoped to the employee and serves as a heartbeat. A server guard checks every five seconds: current Core entitlement, session cap, heartbeat age and protected context. Missing heartbeats for 20 seconds end the remote call. The client allows eight seconds for a temporary peer disconnect before offering a fresh connection to the same saved conversation.
8. End, cancel, offline, page exit, component teardown and moving the app into the background stop local tracks and close the peer/channel. `POST /api/voice/end` initiates the provider hangup; confirmed versus unconfirmed termination is persisted. The provider hangup endpoint supports WebRTC sessions. Setup canceled while awaiting a provider answer still hangs up a late successful call. [OpenAI hangup guide](https://developers.openai.com/api/docs/guides/voice-sip#hang-up-the-call).

The protocol is Realtime, not GPT-Live. No `session.close`/`session.closed` GPT-Live lifecycle events are mixed into this integration.

### Approval and trust

Voice can prepare research, tasks and CRM proposals according to the same policy as web chat. It cannot approve its own consequential changes. Model-generated or browser-submitted tool payloads are untrusted. Session credentials authorize the media session; application record access still requires the AgentDesk session.

Only the authenticated server sideband can submit provider events to the voice services. Usage events never arrive through a browser HTTP route. Tools recheck scope and entitlement before execution and protected context again before returning results to the provider. The protected snapshot covers ownership/sharing, accessible property and release state, release/media audiences, disclosure readiness/expiry, buy boxes, templates and existing package state. Changes terminate the session; ordinary task/job changes do not. New records produced by an authorized tool are included in the next protected snapshot. A server guard cannot retract speech already played; revocation is observed at the next guarded event or within the five-second heartbeat interval.

Tool execution is capped at four calls in one response and 32 calls per session by default, with a configurable 1–64 session cap. Duplicate provider responses cannot trigger another continuation. An in-progress tool receipt left by a process interruption blocks replay rather than guessing whether the action happened. The current runtime is a single Node process, consistent with the modular local monolith; a production deployment requires a durable control/reconciliation service and production identity.

### Usage and reconciliation

Core's versioned allowance still defaults to 60 voice minutes. Each session reserves no more than its remaining allowance or the configured session cap (default ten minutes). The server cap and hangup are admission controls, not a guarantee of provider billing limits during process or network failure.

Realtime conversational response receipts report input/output text/audio/image tokens. Transcription receipts may separately report tokens or actual input-audio seconds. These are persisted as scoped, idempotent child provider operations; missing usage is `unknown`, not an invented zero receipt. Late receipts can be recorded after subscription cancellation without granting any new tool access. Provider costs remain unknown unless supported billing evidence is supplied. [OpenAI Realtime usage documentation](https://developers.openai.com/api/docs/guides/voice-latency-cost).

Session elapsed seconds remain operational telemetry only. They never settle a minute charge, and audio token counts are never converted to minutes. Unused/preconnection-failure reservations are released. Once connection was attempted and may have incurred usage, the hold remains `reconciliation_required`; confirmed provider response tokens do not establish total session minutes. A definitive rejected connection releases its unused hold. The UI identifies a reservation as pending usage, not a charge. There is no client action that can declare unknown usage reconciled. The approved commercial minute definition and an administrator/provider reconciliation process remain required before real billing; repeated connected sessions can exhaust the available reserved allowance until that work exists.

### Configuration

| Setting | Default | Behavior |
|---|---|---|
| `OPENAI_API_KEY` | None | Required server secret; absent means no provider request or voice reservation |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1` | Must be available to the configured API project |
| `OPENAI_REALTIME_VOICE` | `marin` | Consistent spoken voice |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | Separately metered input transcription |
| `AGENTDESK_VOICE_MAX_SECONDS` | `600` | Integer 60–600; further reduced by remaining allowance |
| `AGENTDESK_VOICE_MAX_TOOL_CALLS` | `32` | Integer 1–64; each response allows at most four |

Realtime output is capped at 2,048 tokens per response. Secrets, raw audio and SDP are not persisted or logged. Transcripts and authorized tool results remain in the same employee-owned conversation used by Copilot. Persisted job/task identifiers allow normal dashboards and later text conversations to continue work.

### Acceptance

Automated coverage uses a mocked authenticated provider transport. It verifies secret custody, scoped connection/status/termination, trusted call IDs, single-use connection attempts, duplicate event behavior, persisted tasks/transcripts, interrupted function calls, provider token receipts, unknown usage, setup release versus uncertain holds, late receipts after cancellation, remote limits, context/template revocation, bounded tool loops, credential expiry and late setup cancellation. Original orchestration/workflow regressions remain required.

No live key was available during Phase 4 implementation, so real speech, microphone hardware, account/model access, barge-in quality, mobile audio routing and provider-side hangup were not live-verified. Use an authorized API project, HTTPS or localhost and a microphone for the acceptance run: two-way audio, interruption, contextual follow-up, a real internal task/research job, temporary disconnect, background shutdown and full microphone teardown. Until that run occurs, this is an implemented integration awaiting live validation. Background continuity is intentionally not promised; changing apps or locking the screen ends this browser session.

## Conversation/call notes

Post-call debrief accepts the employee's typed recap or a recap captured through the configured live-voice tool. The original authorized transcript entry remains available. These paths do not record personal telephone calls or prove caller consent. Extracted criteria retain the employee's source statement and require approval. A suggested tomorrow follow-up uses 10am America/New_York and remains unscheduled until explicitly requested. Audio upload, transcription vendors and telephony integrations still need an approved consent/retention process.

## Channel provider foundation — disconnected

A channel adapter converts an authenticated inbound event into a canonical conversation request: tenant, employee, channel identity, conversation reference, message, attachment references, external message ID and timestamp. It returns a delivery result and provider message ID. Core tools remain channel-independent.

No active Telegram, Slack, Teams or SMS connector is implied by this design. The organization’s allowed channel has not been established.

Current priority is AgentDesk web/PWA and live voice, then Slack if the customer uses it, then optional paid SMS; Telegram is a later alternative. `src/server/channels.ts` contains the provider boundary, raw-body Slack signature verification, a trusted local identity lookup/link foundation and disconnected delivery responses. It does not install a Slack app, expose a webhook, perform OAuth, or deliver messages. An inbound route must verify the raw request and timestamp before any parsing or dispatch, then deduplicate event IDs and resolve a verified installation/member link. Follow the official [Slack request verification guide](https://docs.slack.dev/authentication/verifying-requests-from-slack/) and [Slack OAuth installation guide](https://docs.slack.dev/authentication/installing-with-oauth/).

The package composer offers channel-specific selection and editable source-backed copy. Personal text and iMessage use a copy handoff. Slack/SMS formats also remain copy-only here; there is no claim that personal-phone/iMessage sending is supported. SMS entitlement foundation never bypasses consent, provider setup, spending limits or delivery receipts.

### Secure account linking

The signed-in employee requests an expiring, single-use linking token. The external channel proves possession through an approved callback, which is validated against provider signatures/secrets and consumed atomically. Store the verified channel account ID, tenant/employee binding, permissions and revocation status. Phone numbers or display names alone are not identity proof. Never grant an arbitrary incoming bot message access to CRM data.

### Telegram candidate

Use official bot APIs only after organizational approval. Validate webhooks with a configured secret, deduplicate update IDs and limit data exposed in chat. Provide secure links back to AgentDesk for approvals and sensitive results. Support unlink/revoke and a record of employee opt-in. Bot credentials remain server-side.

### Optional SMS

SMS is a separately entitled add-on. Implement provider consent records, opted-in number linking, sender registration, opt-out handling, spend/message limits, usage allocation and revocation before activation. Keep sensitive data out of messages and direct consequential approvals to the authenticated app. Disabling SMS must not disable core app messaging.

## Notifications and continuity

Background job completion and due work create persisted notifications. The initial policy uses America/New_York quiet hours, a user enable/disable preference, event-key deduplication and a cap of ten notifications in a rolling 24-hour period. Quiet-hour-suppressed events remain discoverable from their underlying task/job on a later processing pass. Delivery preferences, quiet hours and deduplication should apply at the notification service. A future external channel may say that a list is ready and link to it; access to the list is evaluated again on opening. Browser push, external delivery and cross-device identity are separate work from an in-app notification table.

## Remaining work

Live API/browser and physical-mobile validation; production identity; approved minute semantics and authoritative financial reconciliation; durable remote-session cleanup after a process crash; consent-aware telephone integration; organization-approved external channel; provider webhook tests; secure linking/revocation; opt-in notification delivery; SMS entitlement/billing controls.
