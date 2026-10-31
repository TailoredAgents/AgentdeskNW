# AgentDesk NW mobile — local development checkpoint

**Shared transaction lifecycle and continuation verified locally October 31, 2026; actual-phone acceptance remains pending.** This slice extends shared Agent/update checkpoint `f68f2cd`. [The implementation roadmap](../docs/IMPLEMENTATION_ROADMAP.md) is the sole authority for status, build order and next work. [Mobile requirements](../docs/MOBILE_DELIVERY_PLAN.md) define acceptance scope. This README records reproducible setup and the boundary between local/browser evidence and native acceptance.

## Architecture and current source

This independent Expo/React Native project uses the existing AgentDesk NW backend and shared contracts and pure, client-safe intake form helpers in `../src/lib/`. `metro.config.cjs` watches that directory for runtime helper imports; server modules and the root application dependency graph remain excluded. It must stay inside the repository for those relative imports. It has its own package and lockfile; install dependencies in `mobile/`, not the root application. No server implementation or provider secret belongs in the native bundle.

The current source contains:

- **Agent:** the shared employee conversation, typed messages, saved-work links and reviewable on-device dictation where supported. Transcripts go through the text API only after the employee reviews them and taps Send. This is not live two-way voice.
- **Work:** Transactions now tracks private sourced parties, financing/date, independent milestone reports, issues and immutable history, with current unsent title-opening preparation. Current title preparation can save a private Inbox draft. Explicitly reviewed Team coordination shares a separate selected summary and assigned follow-ups. No automatic management access, actual delivery or confirmed outcome is implied. My updates shares chosen schedules/timezone/topics, grouped change alerts, saved updates/read state and source links. Unsaved settings are guarded. Selected-channel routing is accepted with mocks; actual push/SMS/Slack delivery remains pending. Resolved or inaccessible references are withheld. Also includes saved jobs, actual service results/history, role starter forms, pause/resume/cancel and exact simulated-cost decisions. My follow-ups shows owner-only tasks/history with reviewed complete/cancel/snooze/reschedule/remove-date actions and current Inbox source links. Inbox and Agent task artifacts open that task directly. Acquisitions/management have New opportunities for pre-inventory wholesaler submissions, reviewed possible duplicates, preserved revisions and focused question drafts. Agent links open that board. Inventory intake remains available for existing-property submissions, questions, revisions and internal handoff. Unsaved reviews are guarded, versions are rechecked and uncertain writes have explicit exact retry. Handoffs adds shared assignment, acknowledgment, evidenced outcome and separate manager resolution; employee access remains assignment/release scoped, and Agent links open the board. Saved job questions accept typed answers through Work or Agent, retain prior results and refresh cost approval. Unsaved answers are guarded, and uncertain saves use exact retry. Broader record links/document clarification remain unfinished.
- **Inbox:** Salesforce-first private fictional email/investor texts, source-aware search/list/detail, manual drafts shared with desktop, draft comparison, relationship context and provisional working methods, exact current generated-reply simulation, reviewed relationship notes and personal follow-ups. Agent Inbox artifacts open the native conversation. New email/text composition, edited replies, explicit email CC and selected saved-text revisions support exact reviewed simulation. There is no real delivery or provider attachment retrieval. Tab/thread changes guard unsaved text; source withdrawal clears protected content. Save before backgrounding/leaving: unsaved editors and pending UI state are memory-only, not an offline recovery store.
- **Settings:** the paired fictional employee, disconnect/sign-out, opt-in generic work notifications and reviewed simulated automatic top-up settings/outcomes. Funding stays separate from job approval; there is no payment method or actual purchase. Live server notification delivery defaults off.
- **Session handling:** secure native credential storage, current identity checks, late-response guards and clearing rendered private data on backgrounding. Browser preview credentials are memory-only. The connected browser preview passed pairing, continuation and revocation; native lifecycle/storage behavior still needs actual-phone acceptance.
- **Request handling:** same-origin API paths, no credential-bearing redirects or browser cookies, explicit stable-ID retry after uncertain mutation outcomes, and no automatic mutation retry.

The app is intended for dispositions, acquisitions and management. App access is included in the workforce subscription. Optional employee SMS has provisional separate pricing; this client does not activate SMS or purchase credits. Current work prices are fictional samples, and live-model usage remains separate from the whole-job simulator.

## Toolchain

The locked project uses Expo `58.0.21`, React Native `0.88.1`, React `19.3.0`, TypeScript `~6.0.3` and `expo-speech-recognition` `58.0.1`. The Node engine is:

```text
^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0
```

Checks used isolated **Node 22.23.4**. The root application's Node runtime was not changed. Node 23 does not satisfy this mobile SDK's declared engine range. From `mobile/`, an isolated supported runtime can be used without modifying global configuration:

```sh
npm exec --yes --package=node@22.23.4 -- npm ci
npm exec --yes --package=node@22.23.4 -- npm run typecheck
npm exec --yes --package=node@22.23.4 -- npm test
npm exec --yes --package=node@22.23.4 -- npx expo install --check
npm exec --yes --package=node@22.23.4 -- npm run export
```

`npm run export` emits iOS/Android JavaScript bundles. It does not compile, sign, install or test native binaries. Native speech integration requires a **development build, not Expo Go**. `npm run ios` / `npm run android` require the appropriate local native toolchain and signing/device setup. `npm start` starts the development-build server; `npm run web` is a browser preview only. Run root application verification separately; mobile tests do not validate the server's scope, billing or notification services.

## Connect to a fictional workspace

1. Run the compatible backend using an isolated fictional database and the repository's explicitly enabled demonstration authentication. For an integration rehearsal, keep live model keys unset and mobile push delivery disabled unless that test is separately authorized.
2. Sign in to the web demonstration as the intended employee. Open **Settings → AgentDesk on your phone → Create phone connection code** to generate an eight-digit, one-time pairing code, valid for ten minutes.
3. In the mobile app, enter the workspace origin, code and a device name. The resulting token is employee-scoped; the phone cannot switch roles or generate new pairing codes.
4. Verify the same ongoing employee conversation and saved work. Sign-out requests server revocation and clears local credentials. Production employee identity/SSO remains separate work.

Supported transport contracts are `POST /api/mobile/pair`, `GET /api/mobile/session`, `POST /api/mobile/logout`, existing authenticated conversation/chat/work/inbox routes, and `GET` / `POST /api/mobile/notifications`. Inbox uses the same GET/POST/PATCH services as desktop; no duplicate business implementation. Native pairing uses a Bearer token, not the browser's signed-in cookie. No API keys should be entered into this app.

HTTPS is required by default. For deliberate local development only, `AGENTDESK_MOBILE_NATIVE_DEVELOPMENT=true` in the mobile build permits development transport settings. The client additionally requires a development runtime and limits HTTP to localhost/private IPv4 origins. A phone's `localhost` is the phone, not the developer's computer. A private LAN test also requires the backend's exact `AGENTDESK_MOBILE_DEV_ORIGIN` configuration and suitable local networking. Do not enable these exceptions for a distributed build. Native transport changes require rebuilding the native application.

The mobile `.env.example` contains only the optional public `EXPO_PUBLIC_EAS_PROJECT_ID` and the development transport flag. The owner has neither store developer account; no account, EAS project, signing credentials, cloud build or store submission was created for this checkpoint.

## Notifications and speech acceptance

Notification registration requires a configured public EAS project ID, a compatible installed build, device permission and the applicable platform credentials. Server delivery is controlled separately and defaults off. Missing configuration must display an honest unavailable/disabled state while chat and work remain usable.

Notifications contain generic text and a precise `agentdesknw://work/{id}` or `agentdesknw://updates/{id}` reference. Private titles, correspondence and result details must be fetched only after current authorization. An Expo ticket or push receipt is not proof of on-device display. Registration, denial, revocation, foreground/background/closed-app delivery and exact-result opening have not been accepted on a connected phone.

Speech source requests on-device recognition, limits capture and aborts on background/unmount. Supported devices/languages, permission denial, interruption and fallback remain unverified. Typing is always the intended fallback; the phone keyboard's microphone can be used where available. Export success does not establish speech recognition or live conversational voice.

## Verified local evidence

| Check | Recorded result and limit |
| --- | --- |
| Mobile install/typecheck | Current final-source typecheck passed using Node 22.23.4; no dependency change. The prior foundation performed the fresh lockfile install. |
| Client tests | 28 passed, including exact native update-link validation, including two automatic top-up amount validation cases, two analysis form/unknown/source cases, two opportunity form/revision cases, including two shared-handoff decision/evidence cases and task review/version checks, date validation, task ordering and intake parsing, plus transport/session/link and Inbox editor/review cases: dirty polling retains the original write version, explicit comparison rebases it, source changes clear protected text, and altered/expired reviews cannot confirm. |
| Expo dependency alignment | Prior checkpoint's local SDK map reported dependencies up to date; that check ran offline. No dependency change in the Inbox slice. |
| iOS/Android JavaScript exports | Both final-source Hermes bundles exported successfully, approximately 2 MB each; these are not native binaries. |
| Web development export | Development bundle exported for the connected phone-width rehearsal; final production and development exports also passed after the opportunity revision and field-label refinements. |
| Native project generation | Prior foundation: `expo prebuild --no-install` succeeded after adding matching `expo-system-ui`. Inbox adds no native configuration; no native compilation/signing/installation. |
| Root integration | 768 tests across 42 files; typecheck, lint, production build and 1,361 HTTP/workflow checks plus twelve metered restart/adapter checks passed, including 67 new opportunity checks, 53 continuation checks, 52 shared-handoff checks, 72 follow-through checks, 75 mobile-Inbox checks and 96 mobile checks. Prior checkpoint relationship quality: 36 scenarios / 54 assertions, not rerun in this slice. |
| Migration preservation | Current migration 031 preserved all 316 rows across 104 prior tables in a disposable schema-030 copy, with clean integrity/foreign keys and no active database use. Prior migration 025: all 316 prior rows across 89 tables preserved on a disposable schema-024 copy; clean integrity and foreign keys, active data not used. Prior foundation: disposable schema-021 copy upgraded through 024, preserving all 266 prior rows across 82 tables. That dated evidence is not a new migration run. |
| Connected browser walkthrough | Current routing rehearsal: desktop update conversation → phone shared history → My updates → exact job awaiting cost approval; desktop exact saved-update URL. No approval/spend or captured application errors. Prior updates rehearsal: desktop opt-in → fictional new reply → shared phone update/preferences → dirty-navigation guard → shared read state → exact Inbox link → handled reply withheld on both surfaces. 390×844 layout inspected, no captured application errors. Prior auto top-up rehearsal: desktop opt-in/trigger → uncertain purchase → same phone status → guarded unsaved edits → reviewed success → $10 credited once on both screens; still-low trigger check creates no second purchase. Prior 390 × 844 Inbox rehearsal: pairing, company-source conversation, saved draft, dirty tab guard, exact simulated-send receipt, reviewed follow-up/note, provisional method/source display, and desktop edit → preserved phone edits → explicit comparison → shared save. Prior rehearsal: Inbox → task → reviewed reminder; desktop change disables stale phone completion; completion/history/source continuity. Intake v1 → desktop evidence v2 → stale phone save disabled → updated questions and preserved history. Prior shared-handoff rehearsal covered manager assignment, employee acknowledgment/report, guarded editing and reviewed manager resolution. Prior continuation rehearsal: desktop starts a job without a property; phone sees/answers the same question; unsaved navigation is blocked; worker completes it once. A separate desktop answer produces a fresh cost review with the selected property. Prior opportunity rehearsal: desktop submission → phone Copilot link → guarded edits → reviewed version 2 → questions reduced from six to three on both surfaces, with retained history. Prior foundation covered work/cost controls, worker completion and device revocation. |

The walkthrough also caught and corrected empty-string children in React Native views and a literal newline in pairing copy. Local Host/Origin normalization and a withheld-job reference fallback were fixed with server regressions. Screenshots and preservation evidence live under ignored `artifacts/mobile/`. [PROGRESS.md](../docs/PROGRESS.md) is the dated application-wide evidence ledger.

## Remaining device and release gates

- Compile and install development builds on both platforms. Xcode.app was absent at the inspected location and `xcode-select` pointed to Command Line Tools. `adb` was available, but no connected Android device/emulator or SDK at the checked default location was found. No OS SDK or store account was installed/created by this checkpoint.
- Test native pairing/restart/background/resume, secure credential storage, revoked access, uncertain-send recovery, keyboard/screen-reader behavior and long results. Browser and HTTP checks do not establish native lifecycle behavior.
- Test the full phone journey: speak, review/send, leave, receive a generic notification and open the exact persisted authorized result. Speech, actual push display, permission denial, interruption and fallback remain unaccepted on phones. A service ticket/receipt is not proof of device delivery.
- The bounded native Inbox, personal-task, pre-inventory opportunities and existing-property intake flows have local/browser acceptance. Editable sending/CC/files, broader clarification/plan editing, installed-phone Inbox behavior and live conversational voice remain roadmap work.
- The dependency audit still reports **eight inherited Expo CLI/config findings: three high and five low**, involving Zod/deepmerge paths. No breaking Expo downgrade or incompatible override was applied. Reassess compatible upstream resolution before native distribution; this is not a clean audit.
- `expo-system-ui` is now configured as documented by [Expo SystemUI](https://docs.expo.dev/versions/latest/sdk/system-ui/); prebuild no longer reports the missing-package theme warning. Actual platform appearance still needs phone inspection.
- `dist/`, `web-preview/`, `ios/`, `android/`, dependencies and local environment files are ignored. Generated projects/exports are local evidence, not submitted release artifacts.
- Real SMS/Slack transport, actual provider-wide spending controls, production identity, approved company connections, payments, app distribution and deployment acceptance remain outstanding.

## References

- [React Native environment setup](https://reactnative.dev/docs/environment-setup)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo speech recognition project](https://github.com/jamsch/expo-speech-recognition)

## Shared analysis checkpoint

Native Work → Deal analysis edits/reviews flip/rental/financing inputs, source references/dates and candidate comparable evidence. Saved cases include formulas, assumptions, cautions and preserved input versions; unchanged scoped read survives subscription cancellation. Source changes hide obsolete computed results. The connected 390×844 walkthrough created version 1 on desktop, opened the same scenario through phone Copilot, blocked unsaved navigation and saved a repair revision whose lower-end profit changed from $27,000 to $5,000. Two client cases and 59 new HTTP/worker checks supplement root numeric/permission tests. Work navigation now scrolls horizontally. This is local browser/native-export evidence, not physical-phone acceptance. See [DEAL_ANALYSIS](../docs/DEAL_ANALYSIS.md).

## Role guidance and private coaching checkpoint

Work → Guidance uses the shared office library with role/date applicability, sources, revisions and practice situations. Employees save private responses and compare them with source criteria; this does not certify competence. Managers can draft, review, publish and withdraw fictional guides from the same native screen. Shared client state protects unsaved changes, exact uncertain retries and stale source revisions; access loss clears unavailable content without trapping navigation. Copilot guidance links open the selected guide. Seven state tests supplement 39 isolated cross-surface HTTP checks. All 35 mobile tests and final iOS/Android/web exports pass; the connected browser rehearsal confirms a desktop publication changes the native view and withholds obsolete practice. Actual installed-phone acceptance remains deferred. See [role guidance](../docs/KNOWLEDGE_AND_COACHING.md).

## Employee-edited correspondence checkpoint

Native Inbox can save edited body/subject and explicit email CC recipients, retrieve a desktop draft, review the same complete envelope and confirm one simulated outcome. CC-only edits participate in dirty/conflict/source handling and exact-review checks. SMS rejects CC; preparing a generated reply clears CC after the replacement notice. The two added editor cases bring mobile tests to 37; the expanded Inbox HTTP suite passes 90 checks. Native/web exports and a desktop-to-native-browser rehearsal passed. Real transport, new-conversation composition is now accepted locally below; document transfer remains separate work.


### New-correspondence checkpoint — October 30, 2026

Inbox → New message starts a private email or business text from a selected account. Explicit primary recipient and email CC, guarded unsaved edits, exact uncertain-save retry and separate simulation review share server behavior with desktop. An opening draft never invents an incoming message. Desktop opening-email save → native-browser exact review → one simulated outcome passed; native-browser creation of a one-to-one text also passed. Independent typecheck, 41 mobile tests and iOS/Android/production-web/development-web exports passed. This is browser/export acceptance, not an installed phone, actual SMS or email result. Screenshots are local ignored artifacts `compose-continuity.png` and `compose-text-review.png`.


### Private source-text documents — October 30, 2026

Work → Documents reads, creates/corrects and withdraws private fictional text using the same server as desktop. It retains old revisions, linked-source permissions, unsaved-navigation protection, stale-write checks and exact uncertain retry. Desktop file import → 390×844 native-browser correction → website read/withdrawal continuity passed. Full mobile suite: 48 tests; independent typecheck and native/production-web/development-web exports passed. The phone uses pasted text; actual file picking, PDF extraction and attachment transfer remain unfinished. Screenshot: ignored `artifacts/mobile/document-phone-revision.png`. No installed-device or real-world acceptance is claimed.


### Reviewed local text attachments — October 31, 2026

Opening/reply emails select up to three current private text documents. The review displays exact contents and every recipient; a correction invalidates an open review and requires explicit current-revision selection. File-only edits participate in dirty/conflict/uncertain-retry protection. SMS rejects files; generated replies clear them with notice. Outgoing local history points to the preserved revision in Work → Documents. No native file download, binary extraction or actual delivery is claimed.

51 mobile tests, independent typecheck, iOS/Android and production/development web exports passed. Desktop draft → native-browser exact file review → desktop correction → obsolete phone review removed → explicit phone reselection/save/review → one simulated outgoing result passed, including file-only unsaved-navigation protection. Actual 390×844 evidence is in ignored `artifacts/mobile/attachments-phone-content.png`. Root and HTTP totals are in PROGRESS. Physical-device acceptance remains deferred.


### Private transaction coordination — October 31, 2026

Work → Transactions creates and updates the same private sourced records as desktop. Parties, financing, closing target, reports and issues retain original versions and exact retries. Current preparation shows explicit missing items or an unsent title message with current agreement/deposit text and conditional lender contact. Historical views never substitute for current preparation. Saving a title-opening report leaves clearance, signing, funding and closing independent.

57 mobile tests, independent typecheck and iOS/Android/production-web/development-web exports passed. Browser rehearsal continued a desktop transaction on the phone, saved a closing target and sourced title-opening report, protected unsaved navigation and displayed the same version on desktop. A separate fictional complete-source example showed the same prepared recipients/text/files across surfaces. Screenshots: ignored `artifacts/mobile/transaction-phone-report.png` and `transaction-phone-preparation.png`. The final native edit form shows only the fixed linked property/investor for an existing transaction. No physical-device acceptance or real transaction event is claimed.


Private Transactions can now save current title preparation to an owned email account and open its Inbox draft. Exact file/recipient review, source invalidation and uncertain retry use the same backend as desktop. This is local/browser and export acceptance only; physical-device and actual delivery acceptance remain deferred. See [the progress log](../docs/PROGRESS.md) for the verified checkpoint.


### Transaction conversation and saved jobs — October 31, 2026

Agent can retrieve current private transactions and prepare title email through the shared backend, including a saved review → draft job. Agent and Work results open the exact transaction or Inbox thread. A current unique “that transaction” reference can continue from desktop to phone; ambiguous or obsolete context requires a fresh choice. The same services are exercised with mock employee SMS. This does not add live voice tools, transaction report editing through chat or provider delivery. See [PROGRESS](../docs/PROGRESS.md) for verification and remaining acceptance.


### Shared transaction coordination — October 31, 2026

Work → Transactions includes a Team coordination view alongside private records. Owners review exactly which summary and reported dates go to named teammates; assigned employees acknowledge and report sourced outcomes, and the owner separately resolves follow-ups. Current content is withheld after source changes or withdrawal. Shared records never expose the owner's private Inbox, investor details or source files. The same shared controller handles stale views, protected unsaved work and exact unknown retries on both interfaces. See [DOCUMENT_WORK](../docs/DOCUMENT_WORK.md) and [PROGRESS](../docs/PROGRESS.md) for the verified scope; real device and practitioner acceptance remain deferred.


### Shared transaction Agent and update continuity — October 31, 2026

Agent opens only the explicitly shared projection, with exact shared-work links distinct from private transactions. A requested saved team review completes through the same durable worker and opens the same record from its result. My updates offers an opt-in Shared transactions topic for the assigned employee/coordination owner; resolved or changed sources are withheld. Browser rehearsal verified desktop shared lookup → exact team view, phone Agent → saved review → exact team view, and phone chosen topic → assigned follow-up. Scheduled delivery remained off in that rehearsal. Screenshot: ignored `artifacts/mobile/team-agent-phone-update.png`. Independent types, 67 mobile tests and iOS/Android/production-web/development-web exports passed. No physical device or real channel acceptance is claimed.


### Shared follow-up lifecycle — October 31, 2026

Team coordination now supports owner-reviewed reassignment, instruction/date changes, cancellation and reopening. The phone displays exact before/after decisions and current-cycle history. Changed responsibility/instructions require a fresh acknowledgment; date-only changes keep the existing report. Canceled/resolved work leaves current reminders. Sharing refresh offers explicit unfinished-task selection; selected instructions restart without prior outcomes. The same controller preserves original versions and uncertain request identity, and clears obsolete history/reviews. Independent types, 73 mobile tests and native/web exports passed. Browser rehearsal covered desktop reassignment → receiving-phone acknowledgment/blocker → owner cancellation and refreshed phone history; installed-phone acceptance remains deferred. See [PROGRESS](../docs/PROGRESS.md) for evidence.
