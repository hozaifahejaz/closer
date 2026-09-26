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
   npm install
   npx expo start          # add --tunnel if the phone isn't on the same Wi-Fi
   ```
3. Scan the QR code (Camera app on iPhone, Expo Go on Android).

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

The server needs nothing app-specific: the apps send the sign-in token in the
`Authorization` header (and as `?token=` on the room socket), which the Worker
already accepts.

## Checks

```bash
npx tsc --noEmit
npx expo export --platform ios --platform android   # bundles both apps
```

## Store builds (later)

Publishing to the App Store and Google Play goes through EAS Build
(`npx eas-cli build`), which needs an Expo account, an Apple Developer account
($99/year) and a Google Play developer account ($25 once). Bundle id / package
name: `com.hozaifahejaz.closer`.
