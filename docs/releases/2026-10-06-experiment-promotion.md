# Experiment promotion — 2026-10-06

Huzaifa authorized promotion of the implemented experiment changes to main.
The source baseline was main commit 1768215d62402d4f8f38282e77daabdce6d58718.

## Promoted

- Profile display-name editing for accounts and reserved guest seats, with live
  partner names and read-only owner email.
- Initial connection retries, handshake timeout, visible Retry connection and
  correct handling of invalid sessions, restrictions, unlinking and guest seats.
- Guest rooms restricted to their original two identities, including reconnects.
- HTTP URL-token rejection and login/signup JSON and same-origin checks.
- Atomic account-deletion cleanup queue, maintenance alarms and retries, both
  authors' saved pair-data removal, retained discovery and paginated room listing.

## Release boundaries

Production Worker configuration, Supabase project, app name/package, Expo config
and production channel are retained. Local demo login was removed from promoted
server/page code. Experiment deployment scripts, private test database, preview
settings and demo accounts remain in experiments. No Google login, account removal,
device-only progress, quick sessions, guest transfer or end-to-end encryption is
included. GitHub publication was authorized separately after deployment.

## Supabase

Applied to cfdeugfpwqpgmmtdodfc in order:

1. 20261006103744_durable_account_room_cleanup.sql
2. 20261006103748_profile_display_name.sql
3. 20261006103848_restrict_profile_rpc_role.sql

Local migration filenames match actual remote migration versions. The first two
SQL bodies match their reviewed experiment migrations. The third removes an
unused authenticated-role grant introduced by Supabase defaults; the same
restriction is applied to the local experiment database. Worker RPCs still use
the existing server-key and application-session guards. No user records were
edited by migration application; deletion statements are guarded function bodies.

Read-only schema checks confirmed the cleanup table has RLS, the private erase
helper has no PUBLIC/anon/authenticated execution grant, and new exposed cleanup
RPCs have no PUBLIC or authenticated-role grant. update_display_name uses the
session guard, validates length and control characters, and cannot select another
owner. Supabase advisors report expected anon SECURITY DEFINER warnings for
guarded Worker RPCs and no-policy RLS notices for tables deliberately unavailable
to direct clients; these are not evidence of unrestricted access. See
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
and https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

## Verification

- Mobile lint: passed.
- Mobile TypeScript check: passed.
- Worker and maintenance JavaScript syntax: passed.
- Website inline JavaScript syntax: passed.
- Cloudflare production build/bindings dry run: passed.
- Diff whitespace checks: passed.
- Functional suites and real-device flows were not rerun in this promotion.

Cloudflare version: 29a5165d-9210-4120-96b4-e64d460275ea.
Expo Go production update group: b8f78d77-484c-4080-bc05-04d4e0c69285,
runtime exposdk:57.0.0, Android and iOS.

Installed-app production update group: 7923eaf0-a06e-40b7-bb8f-d63a2d067309,
runtime 1.0.0, Android and iOS.

The production home page, admin page, privacy page and deletion page each matched
their local promoted source byte-for-byte after deployment. /api/config returned
accounts=true with no demo-login flag. The production Worker/app config files
were not replaced with experiment settings.
