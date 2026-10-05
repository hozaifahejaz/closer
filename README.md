# Closer

Closer is a shared deck of questions for couples. Partners see the same card in real time on the [website](https://closer.hozaiphaa.workers.dev) or in the native app. The website and native app use the same rooms, accounts, answers, and favorites.

## Play

- **Guest room:** Create or join a room with a four-letter code. No account is needed. The room holds its cards and answers for up to six hours after it becomes idle; guest answers are not saved to an account.
- **Couple account:** Sign up with an email and password, then link once using your partner's six-letter invite code. The linked pair gets a private room. Answers and favorites are saved in Supabase.
- **Account deletion:** Signed-in users can delete their account after confirming their password. The website and mobile app link to the same deletion API; the public [deletion page](https://closer.hozaiphaa.workers.dev/delete-account) also works outside the app. Deletion revokes sessions, unlinks the partner, and removes saved data and durable room copies for the account's former couples.
- **Dashboard:** Guest and account users start on a minimalist dashboard. Invite codes appear while waiting for a partner. The header shows the Closer heart logo beside the name. The menu holds account and room actions; admins also have a visible Admin dashboard button. Opening cards brings both connected partners into cards; returning to the dashboard is individual. Returning players use **Continue cards** to resume their saved card and deck selection without an automatic deck prompt. **Cards played** shows distinct cards revealed or answered in the current shared room. Guest users are offered signup to save future progress; existing guest progress does not transfer.
- **History:** Account users can view unique used cards, remaining cards, and per-deck progress from Menu → History. Cards count when revealed or answered. History covers the current shared room; after one year of inactivity, rebuilding it restores answered-card history only.
- **Cards:** Choose any mix of the 26 decks (1,378 questions), move forward or back, and switch decks without losing your place in that selection. A couple can also choose **Only new cards**. The shared room remembers deck progress while it exists; idle couple rooms expire after one year and rebuild from saved answers and favorites.
- **Question number:** Both sides of each card show its position in the current deck selection, such as **3 / 40**. The number updates when either partner moves, even before revealing the question.
- **Modes:** Use **Just talk** or **Answer & reveal**. In Answer & reveal, each answer is hidden from the other partner until both have answered. **Tap to reveal** is off for new rooms; existing rooms keep their saved preference. Either partner can toggle **Tap to reveal**, flip a card, change decks or modes, and mark a shared favorite.

Web and native clients keep unfinished answer drafts while moving between cards or reconnecting. Draft text lives in memory and is lost after a page reload or app process restart. The native app can offer to resume a recent guest room after restarting.

## Terms and safety

Users explicitly accept [Terms of Use and Community Rules](https://closer.hozaiphaa.workers.dev/terms) before signup, guest entry, or existing-account partner interactions. Acceptance is recorded by version, and the server gates new answer submissions. Consent checkboxes appear below the form content.

**Safety & support** is available from the dashboard and cards. Users can report a partner with a reason, optional details, and an optional explicitly selected revealed answer. Account blocking unlinks both users and prevents relinking in either direction. Guest blocking ends the room and blocks the saved guest identities for up to one year; clearing storage or changing devices creates a new identity.

Admins review reports under **Safety reports**, with review notes, resolution/dismissal, guest-room closure, and account interaction restriction/restoration. Restriction keeps login and self-deletion available. Reports are retained for one year, including after account deletion for abuse review, as disclosed in the privacy policy. See [the safety runbook](docs/safety-review.md).

## Privacy and administration

The [admin dashboard](https://closer.hozaiphaa.workers.dev/admin) shows activity, account and couple details, answer and favorite counts, and open rooms. Its ordinary API does not return private answer history, passwords, or invite codes. Safety reviewers can see report details and a revealed partner answer only when the reporting user explicitly attaches it. Admins can sign accounts out, unlink partners, delete accounts or a couple's saved data, manage admins, and remove people or close rooms.

Stored answers are **not end-to-end encrypted**. The service processes answer text to sync and save it, and someone with direct database or infrastructure access can read it. The dashboard restriction does not prevent that access.

Logging out or unlinking revokes room access. Unlinking rotates both invite codes. Answers and favorites carry a card ID, command ID, and data generation so delayed or repeated saves cannot attach to another card or recreate explicitly deleted data. Acknowledged saves wait in the room's durable outbox if Supabase is temporarily unavailable.

## Run the website locally

Use Node.js 22 or newer:

```sh
npm ci
npm start                 # http://localhost:8787
```

Guest rooms work without local secrets. To try the site on another device on the same Wi-Fi, run `npm start -- --ip 0.0.0.0` and open the computer's local IP address.

Future changes are reviewed in the separate `Closer-experiments` worktree on `experiments/staging`. Hosted experiments use guest rooms; account testing uses its private local PostgreSQL database and local demo login buttons. Production is updated only after approval. The public defaults in `wrangler.jsonc` point to production Supabase; do not use production credentials or data for local testing.

## Database setup

The versioned files in `supabase/migrations/` are the database history. Apply them in timestamp order to a new Supabase project. `supabase/schema.sql` is a copy of the first migration for manual setup; do not apply both. After creating the schema, set `private.config.server_key` to the same long random value used for the Worker's `CLOSER_DB_KEY` secret (see the instructions at the top of `supabase/schema.sql`). Keep that value out of Git.

The app uses its own account and session functions, protected by the Worker secret. User data tables have row level security with no direct client policies; the private configuration schema is restricted separately. The public Supabase URL and anon key are configured in `wrangler.jsonc`; they do not replace the server secret.

## Code and checks

| Path | Purpose |
| --- | --- |
| `public/index.html`, `public/admin.html` | Web app and admin dashboard |
| `worker/index.js`, `worker/game.js` | API, WebSocket rooms, and game rules |
| `worker/room-storage.js`, `worker/db.js` | Durable room data and Supabase calls |
| `questions.json` | 26 decks; card positions are stable IDs |
| `supabase/migrations/` | Database schema and account functions |
| [`mobile/`](mobile/) | React Native / Expo Android and iOS app |

Always append questions to a deck. If a question must be retired, replace it with `null`: changing earlier positions would change saved card IDs and progress.

```sh
npm test                       # Worker, game, and browser regression checks
npm run test:db                # isolated temporary PostgreSQL database
npx wrangler deploy --dry-run  # Cloudflare build and binding check
```

The database checks need PostgreSQL with `pgcrypto` and `initdb`, `pg_ctl`, and `psql` on `PATH`. They create a temporary local cluster and never connect to production. The mobile app has its own setup and checks in [its README](mobile/README.md).

## Release

Cloudflare hosts the website, API, and WebSocket Durable Objects as the `closer` Worker. `npm run deploy` publishes the current checkout; the connected GitHub deployment also redeploys pushes to `main`. Set `CLOSER_DB_KEY` as a Cloudflare Worker secret and apply database migrations before deploying Worker code that needs them.

The website and native app source are together on `main`; `mobile-apps` mirrors the release. Android and iOS production over-the-air updates for runtime `1.0.0` have been published through Expo. Store builds and their distribution are managed separately from the website; see the [mobile README](mobile/README.md).

The dashboard, card statistics and continuation, question numbering, History, shared card opening, and reveal defaults reuse the existing database schema; their original 14 Supabase migrations remain in the history. The safety release adds versioned migrations for consent, blocking, account restrictions, and safe persistence of previously accepted outbox operations. Local demo accounts and preview configuration are not included in production.

A one-time deck purchase/unlock, a saved-answer library, account recovery, and end-to-end encryption are future features; they are not in the current release.
