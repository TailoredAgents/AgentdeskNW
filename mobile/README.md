# AgentDesk NW mobile — local development checkpoint

**Local foundation verified October 30, 2026; actual-phone acceptance remains pending.** This package is part of the shared-controls/mobile source checkpoint following `2d16665`. [The implementation roadmap](../docs/IMPLEMENTATION_ROADMAP.md) is the sole authority for status, build order and next work. [Mobile requirements](../docs/MOBILE_DELIVERY_PLAN.md) define acceptance scope. This README records reproducible setup and the boundary between local/browser evidence and native acceptance.

## Architecture and current source

This independent Expo/React Native project uses the existing AgentDesk NW backend and type-only shared contracts in `../src/lib/`. It must stay inside the repository for those relative imports. It has its own package and lockfile; install dependencies in `mobile/`, not the root application. No server implementation or provider secret belongs in the native bundle.

The current source contains:

- **Agent:** the shared employee conversation, typed messages, saved-work links and reviewable on-device dictation where supported. Transcripts go through the text API only after the employee reviews them and taps Send. This is not live two-way voice.
- **Work:** saved jobs, actual service results/history, role starter forms, pause/resume/cancel and exact simulated-cost decisions. Native Inbox, general rich review editing and missing-information continuation are not complete.
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

Supported transport contracts are `POST /api/mobile/pair`, `GET /api/mobile/session`, `POST /api/mobile/logout`, existing authenticated conversation/chat/work routes, and `GET` / `POST /api/mobile/notifications`. Native pairing uses a Bearer token, not the browser's signed-in cookie. No API keys should be entered into this app.

HTTPS is required by default. For deliberate local development only, `AGENTDESK_MOBILE_NATIVE_DEVELOPMENT=true` in the mobile build permits development transport settings. The client additionally requires a development runtime and limits HTTP to localhost/private IPv4 origins. A phone's `localhost` is the phone, not the developer's computer. A private LAN test also requires the backend's exact `AGENTDESK_MOBILE_DEV_ORIGIN` configuration and suitable local networking. Do not enable these exceptions for a distributed build. Native transport changes require rebuilding the native application.

The mobile `.env.example` contains only the optional public `EXPO_PUBLIC_EAS_PROJECT_ID` and the development transport flag. The owner has neither store developer account; no account, EAS project, signing credentials, cloud build or store submission was created for this checkpoint.

## Notifications and speech acceptance

Notification registration requires a configured public EAS project ID, a compatible installed build, device permission and the applicable platform credentials. Server delivery is controlled separately and defaults off. Missing configuration must display an honest unavailable/disabled state while chat and work remain usable.

Notifications contain generic text and a precise `agentdesknw://work/{id}` reference. Private titles, correspondence and result details must be fetched only after current authorization. An Expo ticket or push receipt is not proof of on-device display. Registration, denial, revocation, foreground/background/closed-app delivery and exact-result opening have not been accepted on a connected phone.

Speech source requests on-device recognition, limits capture and aborts on background/unmount. Supported devices/languages, permission denial, interruption and fallback remain unverified. Typing is always the intended fallback; the phone keyboard's microphone can be used where available. Export success does not establish speech recognition or live conversational voice.

## Verified local evidence

| Check | Recorded result and limit |
| --- | --- |
| Mobile install/typecheck | Fresh lockfile install and final-source typecheck passed using Node 22.23.4. |
| Client tests | Nine passed: origin validation, deliberate development HTTP, redirect/cookie handling, endpoint injection, bounded errors/no mutation retry, unreadable responses, stable retry identity, stale-session rejection and exact work links. |
| Expo dependency alignment | Local SDK dependency map reports dependencies up to date; the final check ran offline, so it did not verify the remote version service. |
| iOS/Android JavaScript exports | Both final-source Hermes bundles exported successfully, approximately 1.8 MB each; these are not native binaries. |
| Web development export | Final-source development bundle exported; used for the connected phone-width rehearsal. |
| Native project generation | `expo prebuild --no-install` succeeded after adding matching `expo-system-ui` and its config plugin. No native compilation/signing/installation. |
| Root integration | 583 tests across 31 files; typecheck, lint, production build and 858 HTTP/workflow checks passed, including the new 96-check mobile suite. Relationship quality: 36 scenarios / 54 assertions. |
| Migration preservation | Disposable schema-021 copy upgraded through 024; all 266 prior rows across 82 tables unchanged by migrations. Existing draft/wallet records preserved; active schema-009 data unchanged. |
| Connected browser walkthrough | One-use pairing, shared phone/dashboard history, exact cross-surface simulated cost approval, dashboard pause/phone resume, six-step worker completion, saved results and remote revocation passed at 390 × 844. Approval footer remains visible while details scroll. Notifications correctly explain installed-app requirements. |

The walkthrough also caught and corrected empty-string children in React Native views and a literal newline in pairing copy. Local Host/Origin normalization and a withheld-job reference fallback were fixed with server regressions. Screenshots and preservation evidence live under ignored `artifacts/mobile/`. [PROGRESS.md](../docs/PROGRESS.md) is the dated application-wide evidence ledger.

## Remaining device and release gates

- Compile and install development builds on both platforms. Xcode.app was absent at the inspected location and `xcode-select` pointed to Command Line Tools. `adb` was available, but no connected Android device/emulator or SDK at the checked default location was found. No OS SDK or store account was installed/created by this checkpoint.
- Test native pairing/restart/background/resume, secure credential storage, revoked access, uncertain-send recovery, keyboard/screen-reader behavior and long results. Browser and HTTP checks do not establish native lifecycle behavior.
- Test the full phone journey: speak, review/send, leave, receive a generic notification and open the exact persisted authorized result. Speech, actual push display, permission denial, interruption and fallback remain unaccepted on phones. A service ticket/receipt is not proof of device delivery.
- Native Inbox, rich correspondence/action reviews, broader clarification/plan editing and live conversational voice remain separate roadmap work.
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
