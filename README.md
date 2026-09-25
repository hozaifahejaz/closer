# Closer: deep questions for couples

![Closer on a phone](docs/screenshot.png) ![Answer and reveal](docs/answer-and-reveal.png)

Two partners join the same room with a 4-letter code and see the same card at the same moment.
There are two modes, and either partner can switch between them:
- **Just talk**: you only see the questions. Good for a call or sitting together.
- **Answer & reveal**: each of you writes an answer privately, and both answers appear once you've both locked in.

**Accounts (optional):** sign up with email and password, then link with your partner once using a 6-letter code. After that you both land in your own private room, and your answers and favorites are saved. Guests can still play with a room code, without saving anything.

Either partner can flip the card, go to the next or previous question, switch category, or save a favorite, and the other sees it instantly.

## Run it
```
node server.js        # Node 18+, no npm install needed
```
Open http://localhost:3000 on two devices (same Wi-Fi: use your computer's local IP instead of localhost).
Tap "Start a new room", then share the code or invite link with your partner.

## What's in it
- `server.js`: tiny Node server. Rooms (and answers) live in memory; state is pushed to both partners with Server-Sent Events, actions come in by POST. Max 2 people per room.
- `public/index.html`: the whole app (lobby, flip card, controls), mobile-first.
- `supabase.js` + `supabase/schema.sql`: accounts, partner links, saved answers and favorites, stored in Supabase.
- `questions.json`: starter deck, 50 questions across 5 categories. Edit freely.

## Roadmap
1. **Prototype (this)**: pairing by code, synced card, flip, next/back, categories, shared favorites.
2. **Real product**: accounts so a couple stays paired, saved history of answered questions, rooms that survive a server restart (database such as Supabase or Firebase), hosting on a public URL.
3. **Mobile app**: wrap as a React Native / Expo app or a PWA, push notifications ("your partner is waiting on a card"), a daily question.
4. **Depth features**: voice notes, question packs (long distance, newlyweds, spicy), streaks.

## Accounts setup
Accounts turn on when these environment variables are set (without them the app runs guest-only):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: from the Supabase project's API settings.
- `CLOSER_DB_KEY`: any long random secret. Store the same value in the database with the line at the top of `supabase/schema.sql`, after running that file in the Supabase SQL editor.

## Deploy (free)
The repo includes `render.yaml`. On render.com: New → Blueprint → pick this repo → Apply. Render sets `PORT` automatically.
Free instances sleep when idle, so the first visit after a while takes a few seconds, and open rooms reset when it sleeps.
