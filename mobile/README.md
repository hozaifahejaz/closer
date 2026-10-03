# Closer for iPhone and Android

The native apps for Closer, built with React Native and Expo. One codebase
renders real native iOS and Android views (no web page inside an app).

They use the same server as the website (`https://closer.hozaiphaa.workers.dev`),
so accounts, partner links, rooms, answers, favorites and deck progress are all
shared: one partner can be on the website and the other in the app, in the same room.

## What's in it

- Sign up / log in; the sign-in is kept in the phone's keychain until you log out
- Link with your partner by their 6-letter code (the screen notices when they link)
- Guest rooms by 4-letter code, with a share sheet invite
- The card: tap to reveal together, swipe left/right for next/previous, favorite with the heart
- Just talk / Answer & reveal, and the tap-to-reveal switch
- The deck picker (any mix of decks, saved place in each, "only cards we haven't seen" for couples)
- Reconnects on its own after the phone sleeps or changes network
- Phone, small phone, and tablet/landscape layouts; haptics; dark theme matching the site

The admin dashboard stays on the website.

## Try it on your phone

1. Install **Expo Go** from the App Store or Google Play.
2. On a computer with Node 20+:
   ```bash
   cd mobile
   npm ci
   cp .env.example .env.local  # set your computer's reachable server URL
   npx expo start          # add --tunnel if the phone isn't on the same Wi-Fi
   ```
3. Scan the QR code (Camera app on iPhone, Expo Go on Android).

Local development requires an explicit `EXPO_PUBLIC_CLOSER_SERVER`; this avoids
sending test accounts and room changes to production. Start the current Worker
from the main branch and use its reachable origin. For a physical Android device,
an HTTPS staging or tunnel URL avoids cleartext networking restrictions. Never
put secrets in an `EXPO_PUBLIC_` variable.

Set `EXPO_PUBLIC_CLOSER_ENVIRONMENT=preview` and `EXPO_PUBLIC_CLOSER_SERVER` in the
EAS **preview** environment to use staging. The `preview` build profile uses its
own update channel. `production` and the compatible existing `apk` profile use
the production channel; their default origin is the live Closer Worker. Publish
with the matching EAS environment, and do not publish a staging bundle to production.
Sign-in tokens are stored separately for each server; existing production logins
keep their original storage key.

### Without a computer (EAS Update)

The app is linked to the Expo project `@hozaifahs-team/closer`. Expo Go only
loads updates whose runtime version is `exposdk:<SDK>`, while `app.json` keeps
the `appVersion` policy for real builds, so publish an Expo Go preview with a
temporary override:

```bash
cd mobile
node -e 'const f="app.json",j=require("./"+f);j.expo.runtimeVersion="exposdk:57.0.0";require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
EXPO_TOKEN=... npx eas-cli@latest update --channel expo-go --environment preview --message "..." --non-interactive
git checkout app.json
```

Expo Go always loads the newest update on that channel from this link:
`exp://u.expo.dev/f9f9c491-5905-4341-ad96-c1d9b85d48bf?runtime-version=exposdk%3A57.0.0&channel-name=expo-go`

## Code

- `App.tsx`: loading fonts, restoring the sign-in, switching between lobby and room
- `src/screens/Lobby.tsx`: sign up / log in, guest rooms, partner linking
- `src/screens/Game.tsx`: the room; `src/useRoom.ts` is its WebSocket connection
- `src/components/`: the card, deck picker, answer panel and shared controls
- `src/api.ts`: the `/api` calls and the room state the server sends
- `src/roomSession.ts`: per-room/player drafts and acknowledged actions; retries reuse the same action id

The server needs nothing app-specific: the apps send the sign-in token in the
`Authorization` header (and as `?token=` on the room socket), which the Worker
already accepts. The app requests room protocol 2. Deploy the matching current
Worker before publishing this update. Answer/favorite actions include the stable
card id; only a matching successful acknowledgement clears a draft.
Commands also keep the room's original data generation when retried, so a retry
cannot restore an answer that an admin deleted in the meantime.

Unfinished drafts and pending actions survive changing modes, cards, and leaving
and reopening a room while the app process is alive. Signing out clears them.
Guest room connection details are saved securely so a restarted app can offer
**Resume room** for up to six hours; the server checks whether the room still exists.
Draft text itself is not persisted across force quit or OS process termination.

This repair keeps SDK/native dependencies and `runtimeVersion` unchanged for the
existing 1.0.0 Android runtime. Android Back now returns to the lobby. A migration
to Expo Router is deferred to a future native build because it adds native
navigation dependencies. Whenever native dependencies change, bump the app/runtime
version and build a new binary before publishing matching updates.

## Checks

```bash
npm test                 # Node 22.18+; built-in test runner, no device/backend needed
npm run typecheck
npm run lint
npx expo export --platform ios --platform android   # bundles both apps
```

The [dependency audit](docs/dependency-audit-2026-10-04.json) records the fixed
Xcode-tooling UUID advisory and two remaining upstream build/signing advisories
with no patched release. Their Node packages are absent from both production
JavaScript source maps. `npm audit` therefore still exits nonzero; do not apply
its suggested incompatible Expo/React Native major downgrades.

## Store builds (later)

Publishing to the App Store and Google Play goes through EAS Build
(`npx eas-cli build`), which needs an Expo account, an Apple Developer account
($99/year) and a Google Play developer account ($25 once). Bundle id / package
name: `com.hozaifahejaz.closer`.
