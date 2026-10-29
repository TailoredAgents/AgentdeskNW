# Voice and messaging

## Initial surface

AgentDesk web is the primary surface, with responsive navigation and a prominent voice entry point. Conversations, tasks and research jobs live on the server, so changing browser views does not erase context. Installable metadata supports a mobile home-screen path where the browser allows it; this does not imply native mobile distribution or offline tool execution.

## Live voice integration

The implementation targets the supported OpenAI Realtime WebRTC flow. The server creates a short-lived credential using its permanent project key. The browser negotiates microphone/audio media with OpenAI and exchanges events over a data channel. The permanent key never enters the browser bundle or HTTP response. [OpenAI WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc).

The checked guide also describes GPT-Live. AgentDesk does not silently mix those wire protocols; its Realtime model and endpoint configuration must remain consistent. `OPENAI_REALTIME_MODEL` is configurable; a configured name does not guarantee account access.

### Connection lifecycle

1. User selects live voice; if no server credential is configured, show the precise setup requirement.
2. Request microphone permission after a user action and show connection progress.
3. Authenticate and rate-limit credential creation; bind the request to the employee’s permitted context.
4. Create the peer connection and data channel, add local audio tracks, exchange SDP and attach remote audio.
5. Receive transcript/tool events. Tool calls go to authenticated application services using the same typed dispatch as text.
6. Persist conversation content and service artifacts; do not mark an action executed until the server confirms it.
7. Handle interruption/turn detection through the Realtime protocol. Surface disconnect and provider errors.
8. Stop microphone tracks, close the channel and peer connection, and finalize usage when the call ends or the component unmounts.

### Approval and trust

Voice can prepare research, tasks and CRM proposals according to the same policy as web chat. It cannot approve its own consequential changes. Model-generated or browser-submitted tool payloads are untrusted. Session credentials authorize the media session; application record access still requires the AgentDesk session.

Browser-reported transcript/usage is not sufficient for trusted production billing or proof of provider-side events. Production hardening should add server-side event observation/attestation, authoritative metering and a robust reconciliation path before charging for voice usage.

### Acceptance

Use a real API project, HTTPS or localhost, an available Realtime model and a microphone. Verify two-way audio, interruption, a contextual follow-up, a real task or research job, reconnect/error handling and complete microphone teardown. Until this test occurs, describe the feature as an implemented integration path awaiting live validation. Never present dictation or simulated responses as live voice.

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

Live API/browser validation; production identity; authoritative voice usage; robust long-call/reconnect tests; consent-aware telephone integration; organization-approved external channel; provider webhook tests; secure linking/revocation; opt-in notification delivery; SMS entitlement/billing controls.
