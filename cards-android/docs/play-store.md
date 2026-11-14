# Closer Cards: Google Play checklist

The app is a separate Play listing from the two-player Closer app: package `com.hozaifahejaz.closercards`, Expo project `@hozaifahs-team/closer-cards`.

## What is already handled in the app
- Targets Android 16 (API 36); minimum Android 7 (API 24). Built as an AAB, signed with a key Expo keeps.
- Version code goes up by itself on every production build (`eas.json`, `autoIncrement`).
- Only permission: `VIBRATE`. Internet, network state, storage, overlay, audio and boot permissions are blocked in `app.json`, so the app cannot go online.
- No accounts, ads, analytics, tracking, in-app purchases, user-to-user content or links out of the app.
- Privacy policy inside the app (Menu > Privacy policy), 18+ note in About and in the policy.
- Android back button/gesture goes back one screen and leaves the app from the home screen.
- Works from 280 dp wide phones up to tablets in landscape.

## Play Console steps (owner only)
1. Developer account ($25 once), identity check. New personal accounts must run a closed test with 12 testers for 14 days before going public.
2. Create app: name "Closer Cards", default language English (US), type App, Free.
3. Upload `closer-cards-<version>.aab` to a closed testing track. Accept Play App Signing.
4. Privacy policy URL: Play needs a public web address even for apps that collect nothing. Host `docs/privacy-policy.md` somewhere public and paste the link.
5. App access: "All functionality is available without special access".
6. Ads: No.
7. Content rating questionnaire: category "Reference, News, or Educational" is not right; choose "All other app types". Sexual content: yes, mild references/themes in text only (the Desire & Intimacy deck), no nudity or images. No violence, drugs, gambling, user interaction, location sharing or purchases. Expect Teen/Mature 17+.
8. Target audience: 18 and over only. Not designed for children.
9. Data safety: "Does your app collect or share any of the required user data types?" No. (Nothing leaves the device.)
10. Government, financial, health, news declarations: No to all.
11. Store listing: category Lifestyle; contact email; 512x512 icon; 1024x500 feature graphic; at least 2 phone screenshots.

## Suggested listing text
**Short description (80 max):** Deep and playful question cards for real conversations. Offline, no account.

**Full description:**
Closer Cards is a deck of 1,300+ questions that get people talking: deep ones, playful ones, and a few strange ones for late at night.

Pick the decks you're in the mood for, turn a card, and talk. Use it on a date night, a long drive, with a friend, or on your own as journal prompts.

- 26 decks, from Getting Closer and Who You Are to Midnight Questions, Dilemmas and Would You Rather
- Mix any decks together; your place in every mix is saved
- Save favorites with a tap and share any question
- "Only cards I haven't seen" so nothing repeats
- Works completely offline. No account, no ads, no tracking. Nothing leaves your phone.

For adults 18+. Some decks include questions about intimacy.
