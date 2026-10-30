# AgentDesk NW mobile — local development checkpoint

**Native Inbox and shared-work foundation verified locally October 30, 2026; actual-phone acceptance remains pending.** The Inbox slice extends shared-controls/mobile checkpoint `e03e381`. [The implementation roadmap](../docs/IMPLEMENTATION_ROADMAP.md) is the sole authority for status, build order and next work. [Mobile requirements](../docs/MOBILE_DELIVERY_PLAN.md) define acceptance scope. This README records reproducible setup and the boundary between local/browser evidence and native acceptance.

## Architecture and current source

This independent Expo/React Native project uses the existing AgentDesk NW backend and type-only shared contracts in `../src/lib/`. It must stay inside the repository for those relative imports. It has its own package and lockfile; install dependencies in `mobile/`, not the root application. No server implementation or provider secret belongs in the native bundle.

The current source contains:

- **Agent:** the shared employee conversation, typed messages, saved-work links and reviewable on-device dictation where supported. Transcripts go through the text API only after the employee reviews them and taps Send. This is not live two-way voice.
- **Work:** saved jobs, actual service results/history, role starter forms, pause/resume/cancel and exact simulated-cost decisions. Native personal-task controls, broader record links and missing-information continuation remain unfinished.
- **Inbox:** Salesforce-first private fictional email/investor texts, source-aware search/list/detail, manual drafts shared with desktop, draft comparison, relationship context and provisional working methods, exact current generated-reply simulation, reviewed relationship notes and personal follow-ups. Agent Inbox artifacts open the native conversation. Custom edits remain drafts; no real delivery, CC or attachment files. Tab/thread changes guard unsaved text; source withdrawal clears protected content. Save before backgrounding/leaving: unsaved editors and pending UI state are memory-only, not an offline recovery store.
- **Settings:** the paired fictional employee, disconnect/sign-out and opt-in generic work notifications. Live server notification delivery defaults off.
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

Notifications contain generic text and a precise `agentdesknw://work/{id}` reference. Private titles, correspondence and result details must be fetched only after current authorization. An Expo ticket or push receipt is not proof of on-device display. Registration, denial, revocation, foreground/background/closed-app delivery and exact-result opening have not been accepted on a connected phone.

Speech source requests on-device recognition, limits capture and aborts on background/unmount. Supported devices/languages, permission denial, interruption and fallback remain unverified. Typing is always the intended fallback; the phone keyboard's microphone can be used where available. Export success does not establish speech recognition or live conversational voice.

## Verified local evidence

| Check | Recorded result and limit |
| --- | --- |
| Mobile install/typecheck | Inbox final-source typecheck passed using Node 22.23.4; no dependency change. The prior foundation performed the fresh lockfile install. |
| Client tests | 15 passed, including existing transport/session/link protections plus PATCH and five Inbox editor/review cases: dirty polling retains the original write version, explicit comparison rebases it, source changes clear protected text, and altered/expired reviews cannot confirm. |
| Expo dependency alignment | Prior checkpoint's local SDK map reported dependencies up to date; that check ran offline. No dependency change in the Inbox slice. |
| iOS/Android JavaScript exports | Both final-source Hermes bundles exported successfully, approximately 1.8 MB each; these are not native binaries. |
| Web development export | Final-source development bundle exported; used for the connected phone-width rehearsal. |
| Native project generation | Prior foundation: `expo prebuild --no-install` succeeded after adding matching `expo-system-ui`. Inbox adds no native configuration; no native compilation/signing/installation. |
| Root integration | 596 tests across 32 files; typecheck, lint, production build and 934 HTTP/workflow checks passed, including 75 new mobile-Inbox checks and 96 existing mobile checks. Relationship quality: 36 scenarios / 54 assertions. |
| Migration preservation | No schema change in Inbox slice. Prior foundation: disposable schema-021 copy upgraded through 024, preserving all 266 prior rows across 82 tables. That dated evidence is not a new migration run. |
| Connected browser walkthrough | New 390 × 844 Inbox rehearsal: pairing, company-source conversation, saved draft, dirty tab guard, exact simulated-send receipt, reviewed follow-up/note, provisional method/source display, and desktop edit → preserved phone edits → explicit comparison → shared save. Prior foundation covered cross-surface work/cost controls, worker completion and device revocation. |

The walkthrough also caught and corrected empty-string children in React Native views and a literal newline in pairing copy. Local Host/Origin normalization and a withheld-job reference fallback were fixed with server regressions. Screenshots and preservation evidence live under ignored `artifacts/mobile/`. [PROGRESS.md](../docs/PROGRESS.md) is the dated application-wide evidence ledger.

## Remaining device and release gates

- Compile and install development builds on both platforms. Xcode.app was absent at the inspected location and `xcode-select` pointed to Command Line Tools. `adb` was available, but no connected Android device/emulator or SDK at the checked default location was found. No OS SDK or store account was installed/created by this checkpoint.
- Test native pairing/restart/background/resume, secure credential storage, revoked access, uncertain-send recovery, keyboard/screen-reader behavior and long results. Browser and HTTP checks do not establish native lifecycle behavior.
- Test the full phone journey: speak, review/send, leave, receive a generic notification and open the exact persisted authorized result. Speech, actual push display, permission denial, interruption and fallback remain unaccepted on phones. A service ticket/receipt is not proof of device delivery.
- The bounded native Inbox flow has local/browser acceptance. Personal-task controls, editable sending/CC/files, broader clarification/plan editing, installed-phone Inbox behavior and live conversational voice remain roadmap work.
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
