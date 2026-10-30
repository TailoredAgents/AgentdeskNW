# AgentDesk NW mobile — local development checkpoint

**Checkout note:** this documentation checkpoint includes only this README under `mobile/`. The mobile package/source and related server changes are unpublished. Commands below require the preserved local draft or a later verified source commit; they do not run from this documentation-only checkout.

**Frozen, uncommitted and unaccepted as of October 30, 2026.** The committed application baseline is `2d16665`; the files in this mobile directory and related server changes are later work in progress. [The implementation roadmap](../docs/IMPLEMENTATION_ROADMAP.md) is the sole authority for status, development order and what happens next. [Mobile requirements](../docs/MOBILE_DELIVERY_PLAN.md) define acceptance scope. This README explains the current source and earlier local evidence; its commands are reference instructions for when implementation resumes, not instructions to bypass the freeze.

## Architecture and current source

This independent Expo/React Native project uses the existing AgentDesk NW backend and type-only shared contracts in `../src/lib/`. It must stay inside the repository for those relative imports. It has its own package and lockfile; install dependencies in `mobile/`, not the root application. No server implementation or provider secret belongs in the native bundle.

The current source contains:

- **Agent:** the shared employee conversation, typed messages, saved-work links and reviewable on-device dictation where supported. Transcripts go through the text API only after the employee reviews them and taps Send. This is not live two-way voice.
- **Work:** saved jobs, actual service results/history, role starter forms, pause/resume/cancel and exact simulated-cost decisions. Native Inbox, general rich review editing and missing-information continuation are not complete.
- **Settings:** the paired fictional employee, disconnect/sign-out and opt-in generic work notifications. Live server notification delivery defaults off.
- **Session handling:** secure native credential storage, current identity checks, late-response guards and clearing rendered private data on backgrounding. Browser preview credentials are memory-only. These mechanisms still need an integrated phone walkthrough.
- **Request handling:** same-origin API paths, no credential-bearing redirects or browser cookies, explicit stable-ID retry after uncertain mutation outcomes, and no automatic mutation retry.

The app is intended for dispositions, acquisitions and management. App access is included in the workforce subscription. Optional employee SMS has provisional separate pricing; this client does not activate SMS or purchase credits. Current work prices are fictional samples, and live-model usage remains separate from the whole-job simulator.

## Toolchain

The locked project uses Expo `58.0.21`, React Native `0.88.1`, React `19.3.0`, TypeScript `~6.0.3` and `expo-speech-recognition` `58.0.1`. The Node engine is:

```text
^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0
```

Earlier checks used isolated **Node 22.23.4**. The root application's Node runtime was not changed. Node 23 does not satisfy this mobile SDK's declared engine range. From `mobile/`, an isolated supported runtime can be used without modifying global configuration:

```sh
npm exec --yes --package=node@22.23.4 -- npm ci
npm exec --yes --package=node@22.23.4 -- npm run typecheck
npm exec --yes --package=node@22.23.4 -- npm test
npm exec --yes --package=node@22.23.4 -- npx expo install --check
npm exec --yes --package=node@22.23.4 -- npm run export
```

`npm run export` emits iOS/Android JavaScript bundles. It does not compile, sign, install or test native binaries. Native speech integration requires a **development build, not Expo Go**. `npm run ios` / `npm run android` require the appropriate local native toolchain and signing/device setup. `npm start` starts the development-build server; `npm run web` is a browser preview only. Run root application verification separately when changes resume; mobile tests do not validate the server's scope, billing or notification services.

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

## Evidence recorded before the freeze

These are earlier local checks, not reruns from the documentation cleanup and not release acceptance.

| Check | Recorded result and limit |
| --- | --- |
| Mobile typecheck | Passed before the final small UI lifecycle guards; final-source rerun pending. |
| Client tests | Nine passed: origin validation, explicit development HTTP, redirect/cookie handling, endpoint injection, bounded errors/no mutation retry, unreadable responses, stable retry identity, stale-session rejection and exact work links. Final-source rerun pending. |
| Expo dependency alignment | `expo install --check` reported dependencies up to date after aligning notifications and safe-area versions. |
| iOS JavaScript export | 668 modules, approximately 1.8 MB Hermes bundle in `dist/`; preceded the last lifecycle guards. |
| Android JavaScript export | 708 modules, approximately 1.8 MB Hermes bundle in `dist/`; preceded the last lifecycle guards. |
| Web development export | Final-source export succeeded: 328 modules, approximately 857 KB JavaScript in `web-preview/`. No browser walkthrough followed. |
| Native project generation | `expo prebuild --no-install` succeeded. Generated projects were not compiled, signed or installed. |

The committed backend baseline's historical tests belong to `2d16665`; they do not verify this later mobile/auth/notification work. Check [PROGRESS.md](../docs/PROGRESS.md) for the application-wide evidence ledger.

## Outstanding checks and tooling limits

- Rerun mobile typecheck/tests and both native exports against the final source after the freeze is lifted. Complete root integration, permission, recovery and smoke checks independently; no integrated acceptance is claimed here.
- Perform a browser preview/backend walkthrough, followed by compiled iOS and Android installation and actual device tests. Browser rendering is useful layout evidence, not native acceptance.
- Verify pairing expiration/reuse, wrong employee/server, disconnect/revocation, app restart/background/resume, stale work responses, uncertain-send retry and exact cost decisions. Verify no duplicate actions and no stale private data across session changes.
- Test the complete phone journey: ask, review, save, leave the app, return to the persisted result, and use an authorized generic notification to open that exact job. Complete speech and notification cases above. Accessibility, keyboard layout, long results and small-screen review need visual/device checks.
- Xcode.app was absent at the inspected location and `xcode-select` pointed to Command Line Tools. `adb` was available, but the probe found **no connected Android device or emulator**. No Android SDK was found at the checked default location. This says nothing about whether the owner has phones. No OS SDKs were installed; the temporary ADB daemon was stopped.
- Native prebuild warned that Android `userInterfaceStyle` integration needs `expo-system-ui`; this was not resolved before the freeze. Explicit styles exist, but native theme behavior still needs review.
- The dependency audit reported **eight inherited Expo CLI/config findings: three high and five low**, involving Zod/deepmerge paths. A proposed Expo downgrade or incompatible Zod override was not applied. Track compatible upstream resolution and reassess before release; do not call the dependency audit clean.
- Generated exports/native folders are local evidence, not release artifacts. Confirm ignore/staging coverage for `dist/`, `web-preview/`, `ios/` and `android/` before a later commit; do not commit generated output accidentally.
- No Metro server, browser preview or mobile build session remained running at the freeze. Physical-device, push, live voice, production identity, approved company connections and app distribution acceptance remain outstanding.

## References

- [React Native environment setup](https://reactnative.dev/docs/environment-setup)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo speech recognition project](https://github.com/jamsch/expo-speech-recognition)
