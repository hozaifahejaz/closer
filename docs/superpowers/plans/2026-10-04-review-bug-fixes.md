# Review Bug Fixes Implementation Plan

**Goal:** Fix the concrete privacy, reliability, storage, web, Android, and development-path defects identified in the read-only review.

**Architecture:** Keep the Worker authoritative. Bind answer/favorite commands to stable card keys, acknowledge accepted operations after durable storage, and synchronize Supabase through an ordered durable outbox. Store room answers and saved deck orders in separate records. Revalidate couple membership and revoke sockets when sessions or relationships end.

**Tech stack:** Cloudflare Workers/Durable Objects, Supabase Postgres RPCs, browser JavaScript, Expo/React Native.

**Spec:** The preceding code review and the user's instruction to fix its bugs and risks. Product additions (library, monetization, E2EE) are outside this repair.

## Shared interfaces

- State remains the existing object, plus `roomId` (room code), `card.id` (category:index), and `protocolVersion: 2`.
- Answer and favorite commands carry `cardKey: state.card.id` and `id: crypto.randomUUID()`, and `generation: state.generation`.
- Acknowledgments are `{ type: 'ack', id, ok, error?, cardKey? }`. Clients must branch before rendering state. Successful answer acknowledgments clear only that question's matching pending draft. Rejected commands preserve text. Retry the same ID after reconnect; the server deduplicates.
- Client connections identify `protocol=2`. Legacy commands without card context must never write against the wrong question; reject with an explicit refresh/update message.
- Database `couple_data(p_token)` adds `generation` (default 0) and the exact `couple_id` loaded.
- Database `persist_room_change(p_couple_id text,p_generation bigint,p_id text,p_user uuid,p_kind text,p_card_key text,p_question text,p_text text,p_on boolean)` is server-key guarded, idempotent, validates pair membership/continued profile existence, and returns `{applied:boolean,reason?:string}`. It serializes by couple generation, rejects stale generations, and binds writes to the accepted room rather than the user's later partner.
- Data deletion increments the couple generation so delayed saves cannot restore deleted content.

## Tasks and checks

- [x] Worker/game: regression tests for inherited guest IDs, stale card submissions, revoked sockets, duplicate commands, failed/reordered database delivery, and room values exceeding 2 MB. Implement validation, session revocation, outbox, and sharded storage; run Node tests and Wrangler build.
- [x] SQL: rotate both invitation codes on unlink (including admin unlink), lock linking consistently, clean historical favorites on deletion, and implement generation/idempotency RPCs. Verify migrations against a temporary local Postgres-compatible instance and read-only production schema checks before authorized apply.
- [x] Web/admin: preserve drafts per room/card, process acks/retry pending answers, cancel stale render timers, handle logout failure, prevent stale search results, preserve deck focus, and make reconnect a native button. Add behavior regressions.
- [x] Android: same protocol/draft handling, centralized expired-session recovery, startup font fallback, system Back/guest resume. Use matching Expo docs, run lint/typecheck and protocol regressions.
- [x] Development: make npm start use Wrangler, retire incompatible Render path, document correct startup; add repeatable test scripts and lock dependencies.
- [x] Integration/release: review the whole change, run all checks, apply SQL then deploy Worker/assets, publish compatible mobile update if available, commit/push and align local main.

## Review focus

- Logout/unlink racing with connection or pending save cannot retain unauthorized access or write to a new partner.
- An acknowledged answer survives a process restart and a transient database outage.
- Deleting data cannot be undone by a delayed retry.
- Two clients navigating while answering never attach text to another question.
- Existing rooms migrate without deleting saved answers/progress; older clients receive an understandable upgrade failure.

## Execution notes

The user authorized repairs after reviewing the findings; implementation and previously authorized service/GitHub updates proceed without another plan approval. Parallel agents own separate files/worktrees. Fresh branch review follows integration.

Verification before release: 38 Worker/browser tests, 14 isolated PostgreSQL tests, Wrangler dry-run, and two real guest WebSockets including process-restart persistence passed. Mobile checks cover 24 regressions, lint, TypeScript, and Android/iOS exports. SQL migrations applied and version IDs reconciled. Production direct RPC checks reject requests without the server secret.

## Released 2026-10-04

- Web/Worker fix commit: `cf2932938530ba84697302ff8339a26ecea43245` on `main`.
- Mobile/backend integration commit: `7a57386e50c2c9ccc3d5b3f6f050be0cbf699b98` on `mobile-apps`; includes upstream partner-answer status change `99ecd01`.
- Cloudflare live Worker version: `3fd9972e-6c30-4b56-9e3d-145e8fc88056`; its script ETag matches the independently uploaded tested build. Public index/admin files match local SHA-256 hashes.
- Supabase: all 13 migration IDs match the repository; missing foreign-key indexes addressed. Remaining advisor notices concern intentional server-secret-guarded SECURITY DEFINER RPCs, deny-by-default tables, and recently unused indexes. Anonymous requests to private persistence/read RPCs are denied.
- Expo production update group: `cf2552af-70bd-4b20-a70f-bb349cab7b49`, runtime `1.0.0`, Android + iOS. Both production manifest endpoints return the new update IDs.
- Verification: 38 web/Worker regressions, 14 real PostgreSQL regressions, 24 mobile regressions, mobile lint/typecheck, Android/iOS bundle exports, and two-client local Wrangler checks with a process restart.
- Limits: no physical-device test. Drafts survive navigation/reconnect in memory, not full process/page restarts. Two unpatched upstream Node build-tool advisories (`braces` and `node-forge`) remain; affected Node modules are absent from both exported mobile JavaScript bundles. Full advisory evidence is in `mobile/docs/dependency-audit-2026-10-04.json` on `mobile-apps`.
