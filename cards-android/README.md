# Closer Cards (offline, single-player, Android)

A separate app from the two-player Closer app in `../mobile`. One person, one phone, no internet: no accounts, rooms, partner sync or written answers. Every deck and question is bundled.

- `App.tsx`: screens are plain state (home, play, favorites, viewer, info), plus the deck picker, menu and reset dialog.
- `src/game.ts`: all the rules as pure functions (dealing, saved places, seen cards, favorites, restoring a save). No React, no storage. Tested in `tests/game.test.mjs`.
- `src/cards.ts` + `src/data/questions.json`: the bundled questions, a copy of `../questions.json`. Cards are `Deck:index`, retired questions stay as `null`, exactly like the website, so an update never shifts anyone's progress.
- `src/storage.ts`: saves to the phone with AsyncStorage (two entries, written shortly after the last tap and when the app goes to the background).
- `docs/play-store.md`: Play Console checklist and listing text. `docs/privacy-policy.md`: the policy for the listing.

## Commands
```bash
npm install
npm run sync-questions   # copy ../questions.json into the app (do this before a release)
npm test                 # game rules, 19 tests
npx tsc --noEmit && npx expo lint
npx expo export --platform web   # quick look in a browser; layouts were checked this way at 10 sizes
EXPO_TOKEN=... npx eas-cli build -p android --profile production --non-interactive   # AAB for Play
EXPO_TOKEN=... npx eas-cli build -p android --profile apk --non-interactive          # APK to side-load
```

## Rules
- Never delete or reorder questions; retire with `null` and append (see the repo handoff notes). A deck added to `questions.json` also needs colours and art in `src/components/DeckArt.tsx`.
- The app must stay offline: don't add anything that needs the `INTERNET` permission (it is blocked in `app.json`).
- Deck picker: 4 tall cards per screen, art + name + count only, button says "Start".
