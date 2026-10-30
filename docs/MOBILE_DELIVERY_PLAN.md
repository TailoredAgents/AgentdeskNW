# Mobile delivery requirements and evidence

Updated October 30, 2026. [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for project status, checkpoint order and the next development action. This document is a subordinate mobile specification, not a second delivery sequence. [PROGRESS.md](PROGRESS.md) records verification history; [mobile/README.md](../mobile/README.md) records local setup and technical limitations.

## Owner decisions

AgentDesk NW serves dispositions, acquisitions and management as three primary audiences. The owner reports a mix of iPhone and Android, mostly iPhone, and no current Slack use at New Western. The phone app is the intended primary everyday interface; desktop remains useful for detailed work. Employee-to-Copilot SMS is an optional **provisional $19/month** convenience channel. Preserve Slack for future use without making its adoption a rollout dependency. App access is included in the workforce subscription; usage and approval rules apply across channels. Investor-facing business numbers are a separate capability.

The native app shares the existing server, employee conversation, scoped services, relationship knowledge and saved jobs. React Native/Expo provides one mobile project with platform-specific integration where needed; the Next.js application remains intact. There is no separate mobile master agent or duplicate specialist implementation.

The owner has neither an Apple Developer nor a Google Play developer account and authorized local preparation. No store release, account creation, cloud build, real company connection, investor delivery, payment activation or deployment follows from this specification.

## Evidence boundary at the development freeze

The committed application baseline is **`2d16665`**. The mobile client, device pairing, notification transport and expanded conversational work controls are **uncommitted, frozen work in progress and unaccepted**. Existing source and earlier successful exports must not be described as a shipped or phone-tested app. Completion status and restart priorities belong only to the canonical roadmap.

Local checks before the freeze produced JavaScript exports for iOS and Android, a web development export, generated native projects, nine passing mobile client tests and an earlier passing typecheck. The final lifecycle edits still need typecheck/tests/native exports rerun. No native binary was compiled or installed, no connected-device walkthrough or browser integration walkthrough was completed, and no real push or speech acceptance was established. See the technical README for exact evidence and tooling limits.

## Mobile requirements mapped to the canonical checkpoints

These are acceptance requirements, not claims of completion or a competing schedule. C4 proceeds alongside mobile development as defined in the roadmap.

| Checkpoint | Mobile contribution and acceptance evidence |
| --- | --- |
| C1 — Shared conversation and work controls | All supported channels use the same employee conversation and saved work. Status, pause/resume/cancel and exact cost decisions address the correct job/version; ambiguous assent does not choose a job. Source and employee access are checked again on read, replay and execution. |
| C2 — First iOS/Android app | Agent opens by default, with Work and Settings. Connect to the intended fictional employee; type or review a dictated request; save a job; close/reopen the app; inspect its actual result. Verify each phone platform, credential revocation, background/resume, failed requests, notification opt-in and exact result links. Record exports, simulator checks and physical-device checks separately. |
| C3 — Essential mobile Work, Inbox and reviews | Complete the phone workflows for job progress/results, source-aware correspondence, concrete action/cost reviews and missing-information continuation. A compact mobile design should complete useful tasks without copying every desktop screen. A native Inbox and general rich review/continuation experience remain requirements. |
| C4 — Deep specialists for all three roles | Mobile presents the same tested specialist methods and role-specific outcomes as other channels. Dispositions, acquisitions and management each need a useful end-to-end journey. A mobile shell does not establish specialist expertise. |
| C5 — Proactive usefulness and SMS | Selected briefings, reply/deadline watchers and employee SMS use chosen channels, quiet preferences and deduplication. Test a real employee-channel round-trip separately from fictional work execution. A notification service receipt is not proof that a phone displayed an alert. |
| C6 — Actual spend and optional top-up | Show one assignment's estimate, approved maximum and actual settlement consistently. Approval above $1 must precede chargeable execution; optional funding never approves that job. Current fictional work prices and separate live-model usage cannot be presented as completed actual-cost enforcement. |
| C7 — Pilot, approved connections and rollout | Validate role journeys with Alex, an acquisitions representative and a manager, including both phone platforms. Company access, managed identity, operational readiness and repeat-use evidence precede broader rollout. Store/distribution setup is separate from local source preparation. |

## Shared product and privacy requirements

- Demonstration pairing uses a short-lived code from an existing signed-in employee session and revocable device credentials. It is not production SSO, employee onboarding or permission to connect company data.
- Keep private business records out of notification content. A notification opens an exact work reference, and the app retrieves currently authorized details. Denied permissions or disabled delivery must leave the core app useful.
- Native credentials use secure device storage. Changing the employee, server or token must not reveal stale work, conversation or notification data. Late responses, backgrounding and revocation require explicit acceptance cases.
- Preserve request identity across uncertain retries. Do not automatically repeat a consequential request because the phone loses connectivity. Saved server results, rather than an animation or generated answer, establish completion.
- The server worker can continue while the app is closed. Offline execution and offline business-record storage are not part of the current checkpoint.
- Reviewable speech-to-text dictation feeds the ordinary text request after the employee taps Send. It is **not live two-way voice**. Test permission denial, unsupported devices/languages, interruption, backgrounding and keyboard/typed fallback before calling it accepted.
- Use fictional data until company access is approved. Mock transport, source code, an export, a notification ticket and a physical-device result are different kinds of evidence and must be labeled separately.
