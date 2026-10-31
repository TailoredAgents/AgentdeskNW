# Mobile delivery requirements and evidence

Updated October 30, 2026. [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) is the sole authority for project status, checkpoint order and the next development action. This document is a subordinate mobile specification, not a second delivery sequence. [PROGRESS.md](PROGRESS.md) records verification history; [mobile/README.md](../mobile/README.md) records local setup and technical limitations.

## Owner decisions

AgentDesk NW serves dispositions, acquisitions and management as three primary audiences. The owner reports a mix of iPhone and Android, mostly iPhone, and no current Slack use at New Western. The phone app is the intended primary everyday interface; desktop remains useful for detailed work. Employee-to-Copilot SMS is an optional **provisional $19/month** convenience channel. Preserve Slack for future use without making its adoption a rollout dependency. App access is included in the workforce subscription; usage and approval rules apply across channels. Investor-facing business numbers are a separate capability.

The native app shares the existing server, employee conversation, scoped services, relationship knowledge and saved jobs. React Native/Expo provides one mobile project with platform-specific integration where needed; the Next.js application remains intact. There is no separate mobile master agent or duplicate specialist implementation.

The owner has neither an Apple Developer nor a Google Play developer account and authorized local preparation. No store release, account creation, cloud build, real company connection, investor delivery, payment activation or deployment follows from this specification.

## Local checkpoint and remaining device acceptance

The October 30 shared-analysis slice extends opportunity checkpoint `11a2123`. Native Work → Deal analysis reviews saved flip/rental/financing scenarios, supplied evidence and preserved revisions. Native Work → New opportunities records/revises sourced wholesaler submissions, reviews possible duplicates and shows current questions and an unsent follow-up draft. Agent links open that same board. Native Work can answer current saved-job questions, guard unsaved answers and retry uncertain outcomes; Agent supports the same conversation continuation. Native Work now also supports shared assignments, acknowledgment, evidenced outcome reports and separate manager resolution; Agent links open that board. Native Work now includes personal-task controls/history and source links; Inbox and Agent can open a saved task. Acquisitions/management also have versioned existing-property intake, missing-fact questions and internal handoff, using the same service as desktop and Copilot jobs. The shared correspondence, drafts, reviewed simulations, relationship methods and job/cost controls remain intact. C1–C4 remain partial.

Automatic top-up settings and simulated outcomes now share the desktop wallet, with exact reviews, guarded edits, uncertain retry and one-time credit. No real payment method or purchase is connected.

Final-source checks passed: independent mobile typecheck, 27 client tests, iOS/Android and web JavaScript exports, plus root typecheck/lint/build, 696 tests and 1,303 HTTP/workflow checks. The prior shared handoff walkthrough covered manager assignment, employee acknowledgment/report, stale manager review rejection and separate resolution. The prior continuation walkthrough covers desktop start → phone question/answer → worker completion and desktop answer → separate cost review. The prior opportunity walkthrough covers desktop creation → phone Copilot link → guarded phone revision → updated questions and history on both screens. Prior checkpoints cover task reminder/completion/history/source continuity, revised intake evidence and changed questions, Inbox drafts/simulation and native project generation. No native binary was compiled/installed or actual push/speech accepted. See the technical README for tooling and device limits.

## Mobile requirements mapped to the canonical checkpoints

These are acceptance requirements, not claims of completion or a competing schedule. C4 proceeds alongside mobile development as defined in the roadmap.

| Checkpoint | Mobile contribution and acceptance evidence |
| --- | --- |
| C1 — Shared conversation and work controls | All supported channels use the same employee conversation and saved work. Status, pause/resume/cancel and exact cost decisions address the correct job/version; ambiguous assent does not choose a job. Source and employee access are checked again on read, replay and execution. |
| C2 — First iOS/Android app | Agent opens by default, with Work, Inbox and Settings. Connect to the intended fictional employee; type or review a dictated request; save a job; close/reopen the app; inspect its actual result. Verify each phone platform, credential revocation, background/resume, failed requests, notification opt-in and exact result links. Record exports, simulator checks and physical-device checks separately. |
| C3 — Essential mobile Work, Inbox and reviews | Bounded Inbox/draft/exact simulated reply/note/follow-up, personal-task controls and existing-property intake accepted locally. Complete richer record/result links, correspondence/recipient/file reviews and richer clarification beyond the implemented typed answers. Guarded in-memory drafts must be saved before leaving/backgrounding; offline editing/recovery is not implemented. Installed-phone acceptance remains required. |
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

## Shared analysis checkpoint

Native Work → Deal analysis edits/reviews flip/rental/financing inputs, source references/dates and candidate comparable evidence. Saved cases include formulas, assumptions, cautions and preserved input versions; unchanged scoped read survives subscription cancellation. Source changes hide obsolete computed results. The connected 390×844 walkthrough created version 1 on desktop, opened the same scenario through phone Copilot, blocked unsaved navigation and saved a repair revision whose lower-end profit changed from $27,000 to $5,000. Two client cases and 59 new HTTP/worker checks supplement root numeric/permission tests. Work navigation now scrolls horizontally. This is local browser/native-export evidence, not physical-phone acceptance. See [DEAL_ANALYSIS](DEAL_ANALYSIS.md).
