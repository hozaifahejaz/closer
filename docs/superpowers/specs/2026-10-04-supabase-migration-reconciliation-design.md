# Supabase Migration History Reconciliation

**Status:** Implemented on 2026-10-04. The historical SQL gaps remain documented in four marker files.

## Goal

Make the repository's local Supabase migration version list match the ten historical migration versions recorded in the production Closer database. The later admin answer privacy migration adds an eleventh matching local and remote version. The reconciliation itself leaves the live database schema, data, migration ledger, and Cloudflare deployment unchanged.

## Current state

- Supabase recorded ten historical migrations with 14-digit version IDs before the admin answer privacy migration.
- The repository tracks five migration SQL files with date-only IDs, so their versions do not match the remote ledger.
- The five earlier applied migrations have no original SQL files in any available Git branch history.
- `supabase/schema.sql` contains the core Closer tables, account functions, and server-key checks, and predates the admin and activity changes. It is the available base-schema snapshot; its fit to the live schema must be checked read-only before using it as a migration baseline.
- The `sessions_no_expiry` migration later recreates the same `session_profile` implementation already present in `schema.sql`; this is an idempotent `CREATE OR REPLACE FUNCTION`.
- The full-version activity migration SQL is recoverable from the local Git backup and is byte-identical to the tracked date-only activity migration.

## Design

Treat the applied Supabase ledger as the version-ID source of truth. Build a versioned local migration sequence without executing SQL against production:

1. After a read-only comparison confirms the snapshot is a suitable base for the later tracked migrations, copy `supabase/schema.sql` into `supabase/migrations/20260925194909_closer_initial_schema.sql`.
2. Add explicit no-op marker files for `20260925194940_closer_account_functions`, `20260925195032_closer_own_accounts`, `20260925195051_closer_fix_sign_up`, and `20260925195608_closer_server_key_guard`. Each marker will state that its original SQL was not retained and that the combined end-state is represented by the baseline snapshot. This preserves the recorded version IDs without claiming to have recovered the original intermediate SQL.
3. Rename the five tracked migrations to the exact remote versions:

   | Current file | Reconciled file |
   | --- | --- |
   | `20260925_admin.sql` | `20260925205909_admin_dashboard.sql` |
   | `20260925_admin_by_account.sql` | `20260925210759_admin_by_account_only.sql` |
   | `20260925_admin_delete_data.sql` | `20260925211406_admin_delete_data.sql` |
   | `20260925_sessions_no_expiry.sql` | `20260925230339_sessions_no_expiry.sql` |
   | `20260929_record_room_activity.sql` | `20260929074736_record_room_activity.sql` |

4. Keep `supabase/schema.sql` as the existing human-readable/manual bootstrap snapshot. Do not include the production `private.config` value or any user data in migrations.

## Scope and constraints

- Change local repository files only.
- Do not run `supabase db push`, `supabase migration repair`, or any SQL against the production project.
- Do not modify application code, Cloudflare configuration, or deployed resources.
- The migration implementation was committed and pushed with the subsequent GitHub update request.
- Preserve existing SQL bodies for the five tracked migrations; only their filenames change.

## Verification

- Compare local migration filename prefixes with all versions returned by the Supabase migration ledger, including the later privacy migration; require exact set equality with no missing or extra IDs.
- Compare the baseline and the later migration effects to the live schema using read-only catalog queries before treating the sequence as reproducible.
- Confirm the baseline content matches `supabase/schema.sql` and the activity migration matches the recoverable full-version copy.
- Review the four marker files to ensure each clearly identifies unavailable historical SQL and the baseline representation.
- Inspect `git status` and `git diff --check`; do not run tests or mutate production.

## Known limitation

The original SQL bodies for all five foundational migrations cannot be recovered from repository history. The initial version will use the combined base-schema snapshot, and the next four versions will be explicit markers; this preserves applied version identifiers but is not a verbatim historical sequence. If the read-only schema comparison finds that `schema.sql` is not a suitable baseline, stop before editing migrations and use a reviewed remote schema dump as the baseline source instead.
