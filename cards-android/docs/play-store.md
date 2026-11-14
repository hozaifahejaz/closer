# Stay Up With Me: Google Play checklist

Formerly "Closer Cards" (and for one build "Moth & Lamp"); renamed on 2026-11-14 because that name clashes with existing Play apps and registered CLOSER trademarks. Package `com.hozaifahejaz.stayupwithme` (permanent after the first upload), Expo project `@hozaifahs-team/closer-cards` (the slug keeps the old name and is never shown to users).

## What is already handled in the app
- Targets Android 16 (API 36); minimum Android 7 (API 24). Built as an AAB, signed with a key Expo keeps. Native libraries are 16 KB aligned.
- Version code goes up by itself on every production build (`eas.json`, `autoIncrement`).
- Only permission: `VIBRATE`. Internet, network state, storage, overlay, audio and boot permissions are blocked in `app.json`, so the app cannot go online.
- No accounts, ads, analytics, tracking, in-app purchases, user-to-user content or links out of the app.
- One-time "For adults" note on first launch; privacy policy inside the app (Menu > Privacy policy); 18+ in About and in the policy.
- Android back button/gesture goes back one screen and leaves the app from the home screen.

## Play Console steps (owner only)
1. Developer account ($25 once), identity check. Personal accounts created after November 2023 must run a closed test with 12 testers for 14 days in a row before applying for production, for each new app.
2. Create app: name "Stay Up With Me", default language English (US), type App, Free.
3. Upload `stay-up-with-me-<version>.aab` to a closed testing track. Accept Play App Signing.
4. Privacy policy URL: the public page for `docs/privacy-policy.md`. Its developer name must match the developer name on the Play listing.
5. App access: "All functionality is available without special access".
6. Ads: No.
7. Content rating questionnaire, category "All other app types":
   - Sexual content: Yes, sexual themes and references in text only (Desire & Intimacy deck and a few others). No nudity, no images, nothing explicit.
   - Alcohol, tobacco or drugs: Yes, references to alcohol only (three cards). No drugs or tobacco.
   - Violence, crude language, gambling: No.
   - Users interact or share content, location sharing, purchases: No.
   - Expect Teen to Mature 17+.
8. Target audience: 18 and over only. Not designed for children.
9. Data safety: collects no data, shares no data.
10. Dating app: No. Government, financial, health, news declarations: No to all.
11. Store listing: category Lifestyle; contact email; 512x512 icon; 1024x500 feature graphic; at least 2 phone screenshots (tablet screenshots recommended).
12. If the online two-player Closer app is ever published on the same account, keep the two listings clearly different (name, icon, text); Play's spam policy bans near-identical apps.

## Listing text
**Short description (80 max):** Deep and playful question cards for couples. Offline, no account, no ads.

**Full description:**
Stay Up With Me is a deck of 1,300+ question cards for couples: deep ones, playful ones, and a few strange ones for late at night.

Sit together with one phone, pick the decks you're in the mood for, turn a card, and take turns answering. Use it on a date night, a long drive, or a quiet evening at home.

- 26 decks, from Getting Closer and Who You Are to Midnight Questions, Dilemmas and Would You Rather
- Mix any decks together; your place in every mix is saved
- Save favorites with a tap and share any question
- "Only cards I haven't seen" so nothing repeats
- Works completely offline. No account, no ads, no tracking. Nothing leaves your phone.

For adults 18+. Some decks include questions about intimacy.
