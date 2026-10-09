# Prisma migrations and database recovery

## Current verified state

On 9 October 2026, read-only Supabase inspection confirmed project `vgsmfbupgydafvotkold` in Pro organization `owgnktyhtvbdainnnhug`, PostgreSQL 17.11, with only Supabase migration `20261009204539_private_workspace` recorded. `private.site_owner` and `public.app_data` exist with the original RLS/policies/functions/constraints. The two-admin migration did not run. The parent confirmed both tables empty and no admin enrolled. `prisma/baseline-state.json` captures the actual schema's application catalog and client privileges; it contains no row data or credentials.

Prisma **7.10.0** is the latest non-prerelease found in the npm registry during this work. The `latest` tag pointed at `8.0.0-rc.22`, so it was deliberately not used. Node 22.23.2 satisfies Prisma 7's runtime requirements. Prisma and `pg` are development tooling only; the website still uses user-scoped Supabase sessions and RLS. No database password or Prisma Client belongs in the deployed app.

`prisma/migrations/` is now the only executable migration history. The Supabase migration files have moved, not been duplicated. Prisma's connection config forces its ledger into unexposed `private`; the pending migration enables ledger RLS and revokes client access. Keep the existing hosted `supabase_migrations` history for audit; do not delete or replay it. The schema file documents app columns; reviewed SQL is authoritative for all schema changes, including Auth foreign keys, constraints, RLS, grants and functions. Because those are not fully represented by Prisma models, do not generate an unchecked schema diff or use `db push`. We intentionally do not enroll Supabase-managed Auth/Storage schemas in Prisma's ownership.

## Secure prerequisites

- Supply `DATABASE_URL` through a secret manager or protected process environment. Use the project's direct PostgreSQL connection, or session pooler on port 5432 if direct IPv6 is unavailable. Never use transaction pooler port 6543 for migrations. Never paste a real URL/password into chat, shell command text, Git, PR descriptions, or Vercel app settings. The scripts do not print connection strings or raw database errors.
- For backup and baseline inspection, TLS certificate verification is required for hosted connections. Set `DATABASE_CA_CERT` to one absolute approved CA file path if needed. The shared connection policy forces hosted Prisma to `sslmode=require&sslaccept=strict`, libpq to `verify-full` (system trust or the same explicit CA), and node-postgres to `rejectUnauthorized=true`. Supplied weak TLS URL settings are normalized; relative/conflicting CA paths are rejected. Database subprocesses inherit only an allowlisted OS environment: no inherited PGHOSTADDR, service files, SSL overrides, connection URLs, Node TLS overrides, or Prisma engine overrides can redirect or weaken them. Loopback `localhost` is normalized to `127.0.0.1`.
- Install PostgreSQL client tools of the server's major version or newer (`pg_dump` and `pg_restore`); optionally set `PG_BIN_DIR`. Local verification used PostgreSQL 17 clients. PostgreSQL client tools were installed locally, not on a hosted service.
- Select an **existing protected local backup location**, outside the repository, preferably on an encrypted volume with an existing approved backup policy. Set `BACKUP_DIR` to its absolute path and require directory permissions 0700. Files are written with 0600 permissions. The tool does not provide encryption itself or upload to any external service. Do not use `/tmp` for real production backups. Test fixture backups may use `/tmp`.
- Coordinate the exact schema write with the original task. For an approved hosted write, set `CONFIRM_HOSTED_MIGRATION=vgsmfbupgydafvotkold` in that process environment. This is an execution interlock, not a substitute for review.

## First adoption on this existing hosted project

1. Review the two migration SQL files and the captured baseline. Inspect Supabase Database → Backups for an actual completed recovery point and record its timestamp/status/retention. The read-only connector confirms Pro, but does not expose backup inventory; no completed hosted backup or PITR recovery window has been verified here.
2. Run `npm ci` and `npm run db:validate`.
3. Run `npm run db:baseline:check`. It compares tables, columns/defaults, constraints, policies, function bodies/security, and client grants against the captured base. A mismatch stops; investigate it instead of regenerating the expected file to silence the guard.
4. With connection, backup directory and approved-write interlock supplied privately, run `npm run db:baseline`. It rechecks the base, takes a full logical backup, verifies archive readability and checksum, then runs **only** `prisma migrate resolve --applied 0_private_workspace`. This records the already executed base without replaying SQL. It refuses nonempty existing Prisma history. It does not mark the two-admin migration applied.
5. Run `npm run db:deploy`. It requires the recorded base, takes a new pre-migration backup, and runs `prisma migrate deploy` followed by `prisma migrate status`. Only the pending two-admin migration should execute. If any step fails, subsequent steps do not run. Do not use Supabase apply_migration, SQL-editor schema changes, db push, migrate reset, or migrate dev against this project.
6. Recheck actual hosted tables, RLS, grants, function permissions, private schema exposure, advisors, and Prisma migration history. Follow [admin setup](SUPABASE_SETUP_CHECKLIST.md) for separately coordinated verified-UUID enrollment and live auth/data acceptance tests.
7. A reviewed code-only release can ship before hosted setup: missing configuration or membership RPC keeps admin access denied. Coordinate the release with the parent final review, and do not treat admin setup as complete until the migration/enrollment checks pass. The previous app still calls the old owner RPC, so avoid a period where it is expected to provide admin access against the new schema. Public pages do not depend on these credentials and remain available. Do not run migrations during `next build` or app startup.

On a fresh **local** test database, first provision the test-only Auth fixture and roles, then `prisma migrate deploy` runs both migrations. Fresh hosted Supabase provisioning is a separate reviewed workflow; never baseline an empty database as though the base already exists.

## Subsequent migrations

Run `npm run db:migration:new -- descriptive_name` to create a Prisma migration SQL file. Write/review the SQL and update the column models when relevant. Keep explicit transactions, RLS, USING/WITH CHECK predicates, grants, function search paths, and foreign keys intact. Do not edit applied migration files. Test both fresh installation and incremental upgrade against disposable local databases. Run tests, `db:validate`, the build, and the restore drill before release. Use `npm run db:deploy` for an approved hosted application; it always performs a new backup first.

If a migration fails, inspect the cause and `private._prisma_migrations` privately. Do not blindly use `migrate resolve` to claim success. Prove what actually executed and coordinate any forward repair in another reviewed migration.

## Backups and restore

`npm run db:backup` creates a PostgreSQL custom-format logical archive and a JSON manifest containing SHA-256, timestamp, server version, non-secret role names, and local migration file checksums. It fails if dump or archive validation fails. It does not prune old backups; retention and off-device copies need an approved storage policy. Archives include sensitive Auth/application data. File permissions are not encryption.

Supabase documents daily backups for Pro and seven days of daily-backup retention. **Plan entitlement is verified; actual completed snapshots for this newly created project are not verified.** No paid PITR, additional storage, or external upload was enabled. Inspect the project's backup inventory before claiming a recovery point exists. A database backup does not contain Supabase Storage object bytes, OAuth provider secrets, role passwords, environment variables or all platform settings. Keep approved recovery procedures for those separately.

For a rehearsal, use a **dedicated disposable local cluster**, create an empty database named `restore_test_<suffix>`, supply `RESTORE_DATABASE_URL` privately, and run:

```sh
npm run db:restore:local -- /absolute/protected/path/snapshot.dump
```

The restore tool rejects remote targets, non-test names, occupied databases, and checksum mismatches. It does not drop/reset anything. It restores in one transaction, retains grants, maps ownership to the local restoring role, and creates missing source role names as inert NOLOGIN placeholders in that disposable cluster. It must never be pointed at a shared local cluster. Supabase-specific extensions or platform dependencies may require a matching local Supabase stack; a failed rehearsal stops and does not certify recovery. Only restore trusted archives: PostgreSQL backups contain executable SQL.

After restore, check migration history, row counts, both admins' own data, denied cross-user reads/writes, denied private-table access, RLS and function security. `npm run db:verify:local` automates this drill on synthetic data when `TEST_DATABASE_URL` points to a dedicated local cluster and PostgreSQL client tools are available. It creates and deletes only randomly named disposable databases; fixture backups are retained under a temporary directory.

**Hosted recovery remains untested.** Do not restore into production using this local helper. An actual recovery requires selecting a verified backup/recovery point, preparing an approved isolated target compatible with Supabase, validating Auth/Storage/platform requirements and security, testing the site, and coordinating cutover. A backup file's existence or readable archive listing alone is not evidence that hosted recovery succeeds.

## Remaining execution blockers

No secure hosted PostgreSQL connection is available to this code task. No production backup destination has been selected. Completed hosted backup inventory is not available through these connector tools, and this task has no browser authorization. Therefore no hosted logical snapshot, Prisma baseline marker, two-admin migration, or hosted restoration has been executed by this task.

## Secure execution handoff

For an interactive Mac Terminal handoff, run `bash scripts/private-database.command` from this checkout. Paste only the full connection URL at its hidden prompt (no quotes or `DATABASE_URL=` prefix). The launcher disables tracing/history and clears the credential on exit. It accepts only this hosted project, offers a read-only baseline check and an optional logical backup, and has no schema-write or enrollment option. Backup creation still requires a user-selected protected directory. Do not attach an agent terminal recorder or share the URL, clipboard, raw errors, or Terminal history.

An error **before the menu** is local URL validation; no DNS lookup, TLS handshake, password authentication, or backup has occurred. The initial launcher mistakenly collapsed every validation cause into one generic message mentioning password/TLS/backup. The revised helper emits fixed stage/code diagnostics (for example `input/INPUT_WRAPPER` or `input/INPUT_PASSWORD`) and loads database dependencies only after validation. Outer whitespace is trimmed; wrappers and malformed encoding are diagnosed instead of guessed. Missing runtime/dependencies, DNS, connectivity, TLS, authentication, baseline mismatch, and backup failures have separate categories. These messages never include input values or raw driver errors. Share only the bracketed stage/code if a retry fails; an input-stage error is not evidence of an incorrect password.

The silent-input flow is tested with a synthetic pseudo-terminal (Python 3 standard library on macOS/Linux, run by `npm test`); helper tests cover accepted Direct/Session URLs, invalid paste formats, no network/driver loading before the menu, no schema-action dispatch, and redaction of errors containing synthetic credentials. Actual hosted connectivity remains unverified until the user runs the private read-only check. Existing TLS verification and backup requirements are unchanged.

The 9 October 2026 follow-up request to run the schema was attempted only through `npm run db:baseline:check`; it stopped with `Supply DATABASE_URL securely in the process environment.` Read-only hosted inspection still found `private.site_owner`, no `private.site_admin`, and no `private._prisma_migrations`. No schema or membership write occurred. The connector's SQL access is not a PostgreSQL credential for Prisma or `pg_dump`, and must not be used to bypass this workflow.

1. Open [this Supabase project](https://supabase.com/dashboard/project/vgsmfbupgydafvotkold), then **Connect**. Copy the direct connection, or the **Session pooler** connection on port 5432 if IPv6 is unavailable. Use the existing database password privately; percent-encode reserved characters in it. Do not reset credentials to unblock this task, and do not send the URL/password through chat. Inspect **Database → Backups** and record the actual completed backup timestamp/status/retention; do not assume a Pro entitlement means a snapshot exists. If no completed recovery point is available, stop and report that before a hosted write.
2. On the trusted local machine, select an existing protected backup directory outside Git and `/tmp` (0700, preferably on an encrypted volume). Use a trusted Bash terminal in the reviewed repository checkout, with no shell tracing or session recording. Set the connection through an existing secret manager, or enter it into the silent prompt below. This is a user-terminal handoff, not a command for an agent to collect secrets from chat. `DATABASE_URL` belongs only in this local process environment, never the deployed website. If required, privately set `DATABASE_CA_CERT` to an absolute approved CA path; TLS verification must remain enabled. Ensure PostgreSQL 17+ client tools are installed and on PATH, or set `PG_BIN_DIR` to their directory.

   ```bash
   set +x
   read -r -s -p 'PostgreSQL connection URL (hidden): ' DATABASE_URL
   printf '\n'
   export DATABASE_URL
   read -r -p 'Existing protected backup directory: ' BACKUP_DIR
   export BACKUP_DIR
   export CONFIRM_HOSTED_MIGRATION=vgsmfbupgydafvotkold
   ```

3. Run the following in order, stopping on any failure. The `&&` chain prevents later steps from running after a failure. Both write commands create and verify their own fresh logical backup first; the baseline never replays the existing base SQL. If a command fails after recording history, inspect that state before any retry; do not rerun the whole chain blindly.

   ```bash
   npm ci &&
   npm run db:validate &&
   npm run db:baseline:check &&
   npm run db:baseline &&
   npm run db:deploy &&
   npm run db:status
   unset DATABASE_URL CONFIRM_HOSTED_MIGRATION
   ```

Record the backup filenames/checksums and the two completed Prisma migration names, then perform step 6 of **First adoption** above to verify actual hosted security. Do not send archive contents or credentials in the report. Stop before `supabase/admin/enroll_two_admins.sql`: authorization to run schema migrations does not enroll either account. If secure access cannot be supplied, leave the schema pending and share only the missing prerequisite, not secrets.

Connection source: [Supabase connection methods and Connect dialog](https://supabase.com/docs/guides/database/connecting-to-postgres).

References: [Prisma baselining](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining), [custom SQL features](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features), [Prisma config](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [Supabase backups and limits](https://supabase.com/docs/guides/platform/backups).

TLS implementation reference: [Prisma PostgreSQL SSL parameters](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql#configuring-an-ssl-connection), checked against the installed Prisma 7.10 native engine source, and [libpq environment overrides](https://www.postgresql.org/docs/current/libpq-envars.html).
