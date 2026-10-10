# Prisma migrations and database recovery

## Current verified state

On 9 October 2026, read-only Supabase inspection confirmed project `vgsmfbupgydafvotkold` in Pro organization `owgnktyhtvbdainnnhug`, PostgreSQL 17.11, with only Supabase migration `20261009204539_private_workspace` recorded. `private.site_owner` and `public.app_data` exist with the original RLS/policies/functions/constraints. The two-admin migration did not run. The parent confirmed both tables empty and no admin enrolled. `prisma/baseline-state.json` captures the actual schema's application catalog and client privileges; it contains no row data or credentials.

Prisma **7.10.0** is the latest non-prerelease found in the npm registry during this work. The `latest` tag pointed at `8.0.0-rc.22`, so it was deliberately not used. Node 22.23.2 satisfies Prisma 7's runtime requirements. Prisma and `pg` are development tooling only; the website still uses user-scoped Supabase sessions and RLS. No database password or Prisma Client belongs in the deployed app.

`prisma/migrations/` is now the only executable migration history. The Supabase migration files have moved, not been duplicated. Prisma's connection config forces its ledger into unexposed `private`; the pending migration enables ledger RLS and revokes client access. Keep the existing hosted `supabase_migrations` history for audit; do not delete or replay it. The schema file documents app columns; reviewed SQL is authoritative for all schema changes, including Auth foreign keys, constraints, RLS, grants and functions. Because those are not fully represented by Prisma models, do not generate an unchecked schema diff or use `db push`. We intentionally do not enroll Supabase-managed Auth/Storage schemas in Prisma's ownership.

## Secure prerequisites

- Supply `DATABASE_URL` through a secret manager or protected process environment. Use the project's direct PostgreSQL connection, or session pooler on port 5432 if direct IPv6 is unavailable. Never use transaction pooler port 6543 for migrations. Never paste a real URL/password into chat, shell command text, Git, PR descriptions, or Vercel app settings. The scripts do not print connection strings or raw database errors.
- For backup and baseline inspection, TLS certificate verification is required for hosted connections. The reviewed Supabase Root 2021 CA is bundled in `certs/supabase-prod-ca-2021.crt` and selected automatically for this hosted project. An explicitly approved replacement can use `DATABASE_CA_CERT` with one absolute CA file path. The shared connection policy forces hosted Prisma to `sslmode=require&sslaccept=strict`, libpq to `verify-full` (the same CA file), and node-postgres to `rejectUnauthorized=true`. Supplied weak TLS URL settings are normalized; relative/conflicting CA paths are rejected. Database subprocesses inherit only an allowlisted OS environment: no inherited PGHOSTADDR, service files, SSL overrides, connection URLs, Node TLS overrides, or Prisma engine overrides can redirect or weaken them. Loopback `localhost` is normalized to `127.0.0.1`.
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

## Exact reviewed migration boundary

The guarded adoption/deploy commands verify the exact two migration directories, SQL bytes and PostgreSQL lock file against the SHA-256 pins in `scripts/reviewed-migrations.mjs`. Additional directories/files, missing files, symlinks, modified SQL or another database provider fail before any database write. Applied Prisma ledger checksums must match those same pins. The current deployment permits only the base to be recorded and only `20261009203911_two_admin_membership` to be pending; it rechecks the base catalog before its fresh backup.

After the backup, the files are verified again and copied into a private 0700 staging directory. Prisma receives only that verified snapshot through an explicit config path; changes to the original checkout cannot add SQL while Prisma executes. Staged SQL/config files are read-only, the config contains no connection value, and cleanup runs after success or failure. The connection remains in the allowlisted child environment. Do not run raw `prisma migrate deploy` against the hosted database: the guarded project commands provide these additional controls.

Do not auto-regenerate pins to accept a mismatch. A future migration requires a new PR that reviews its SQL, updates the explicit allowed set and history/precondition logic, and tests the intended upgrade path. Applied migration SQL must remain unchanged.

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

Updated 10 October 2026: the user successfully completed the private baseline check and logical backup. The archive and manifest exist in the protected home directory with user ownership and mode 0600; their recorded project and SHA-256 match. No archive contents were displayed. The agent still has no database credential, by design. Completed platform backup inventory is unavailable through the connected tools, and browser access remains restricted. Prisma adoption, the two-admin migration, and hosted restoration have not been performed. Do not treat a successful local archive check as evidence of a completed platform recovery point or tested hosted restoration.

## Private password-only migration launcher

Use `bash scripts/private-database-migrate.command` from the reviewed checkout **after** the initial logical backup succeeds and recovery prerequisites are verified. This is a separate launcher; do not edit or replace the currently running backup launcher. Exit the old process with `q` and reenter the existing password privately at the new hidden prompt. No credential is transferred between launchers, saved, or sent through chat.

The suggested local backup directory is `$HOME/.local/share/bartconsedine/database-backups`, outside Documents and the repository. On Bart's machine, the dedicated directory was created and checked on 10 October 2026: owned by the user, `0700`, no symlink, no ACL entries, and no group/world-writable parent. No existing directory permissions were changed. This location is outside standard synced Documents folders; third-party backup/sync settings and disk encryption are not asserted. The launcher accepts another reviewed existing protected absolute path and never creates or changes directories itself.

1. Choose **1** to inspect actual Prisma history without writing. Only the known unadopted, baseline-only, or complete states are accepted; failed, rolled-back, unexpected or checksum-mismatched history stops for inspection.
2. If unadopted, choose **2**, type `ADOPT vgsmfbupgydafvotkold`, confirm the protected directory, and type `READY` only after verifying the completed recovery point and runbook prerequisites. This repeats the catalog baseline check, creates a fresh verified backup, and records only `0_private_workspace`. It never replays the base SQL.
3. After successful adoption, choose **3**, type `DEPLOY vgsmfbupgydafvotkold`, confirm the directory and recovery readiness again. A new backup must succeed before Prisma deploys `20261009203911_two_admin_membership`. The launcher checks completed history afterward.
4. Choose **q** to clear the credential. Perform the hosted security and private-schema checks, then coordinate OAuth and separately approved identity enrollment. The launcher cannot reset, blindly resolve failures, or enroll an administrator.

A blank or wrong confirmation cancels before any database command. Any database-operation failure exits the launcher and clears its credential; inspect state in a new private session rather than blindly rerunning adoption. Errors use fixed categories and never claim that no write occurred after an uncertain migration failure. Existing `db:baseline` and `db:deploy` CLI commands use the same guarded functions, including their backup-before-write and project interlocks. The new launcher is for this first adoption only; use the normal reviewed migration workflow for later migrations.

## Secure execution handoff

For an interactive Mac Terminal handoff, run `bash scripts/private-database.command` from this checkout. Paste only the full connection URL at its hidden prompt (no quotes or `DATABASE_URL=` prefix). The launcher disables tracing/history and clears the credential on exit. It accepts only this hosted project, offers a read-only baseline check and an optional logical backup, and has no schema-write or enrollment option. Backup creation still requires a user-selected protected directory. Do not attach an agent terminal recorder or share the URL, clipboard, raw errors, or Terminal history.

**If you have only the password**, run `bash scripts/private-database-password.command` instead. Its distinct **Database password (hidden)** prompt accepts the existing password exactly as typed, preserves spaces and percent signs, and encodes reserved characters internally. The destination is the actual Direct URI inspected in this project's Supabase Connect panel on 9 October 2026: host `db.vgsmfbupgydafvotkold.supabase.co`, port `5432`, user `postgres`, database `postgres`. The assembled URL remains in process memory and is never displayed or saved. This separate launcher leaves an in-progress full-URL prompt unchanged; do not paste a password alone into that old URL prompt. A full URL pasted into the password prompt is rejected with `PASSWORD_MODE`, before networking. For IPv4-only connectivity, use the existing full-URL launcher with the verified Session pooler URI. Both launchers have the same TLS, backup, and no-migration/no-enrollment restrictions.

An error **before the menu** is local URL validation; no DNS lookup, TLS handshake, password authentication, or backup has occurred. The initial launcher mistakenly collapsed every validation cause into one generic message mentioning password/TLS/backup. The revised helper emits fixed stage/code diagnostics (for example `input/INPUT_WRAPPER` or `input/INPUT_PASSWORD`) and loads database dependencies only after validation. Outer whitespace is trimmed; wrappers and malformed encoding are diagnosed instead of guessed. Missing runtime/dependencies, DNS, connectivity, TLS, authentication, baseline mismatch, and backup failures have separate categories. These messages never include input values or raw driver errors. Share only the bracketed stage/code if a retry fails; an input-stage error is not evidence of an incorrect password.

The silent-input flow is tested with a synthetic pseudo-terminal (Python 3 standard library on macOS/Linux, run by `npm test`); helper tests cover accepted Direct/Session URLs, invalid paste formats, no network/driver loading before the menu, no schema-action dispatch, and redaction of errors containing synthetic credentials. The public, unauthenticated TLS handshake was verified on 9 October 2026 with the bundled CA; password authentication, SQL access, and hosted backups remain unverified until the user runs the private check. TLS verification and backup requirements remain enforced.

The 9 October 2026 follow-up request to run the schema was attempted only through `npm run db:baseline:check`; it stopped with `Supply DATABASE_URL securely in the process environment.` Read-only hosted inspection still found `private.site_owner`, no `private.site_admin`, and no `private._prisma_migrations`. No schema or membership write occurred. The connector's SQL access is not a PostgreSQL credential for Prisma or `pg_dump`, and must not be used to bypass this workflow.

1. Open [this Supabase project](https://supabase.com/dashboard/project/vgsmfbupgydafvotkold), then **Connect**. Copy the direct connection, or the **Session pooler** connection on port 5432 if IPv6 is unavailable. Use the existing database password privately; percent-encode reserved characters in it. Do not reset credentials to unblock this task, and do not send the URL/password through chat. Inspect **Database → Backups** and record the actual completed backup timestamp/status/retention; do not assume a Pro entitlement means a snapshot exists. If no completed recovery point is available, stop and report that before a hosted write.
2. On the trusted local machine, select an existing protected backup directory outside Git and `/tmp` (0700, preferably on an encrypted volume). Use a trusted Bash terminal in the reviewed repository checkout, with no shell tracing or session recording. Set the connection through an existing secret manager, or enter it into the silent prompt below. This is a user-terminal handoff, not a command for an agent to collect secrets from chat. `DATABASE_URL` belongs only in this local process environment, never the deployed website. The bundled official CA is automatic; only an explicitly reviewed replacement needs `DATABASE_CA_CERT` set to an absolute path; TLS verification must remain enabled. Ensure PostgreSQL 17+ client tools are installed and on PATH, or set `PG_BIN_DIR` to their directory.

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


## Bundled hosted database trust

The Direct endpoint's chain is rooted in **Supabase Root 2021 CA**, which is not trusted by Node's default public roots. A public PostgreSQL SSLRequest probe on 9 October 2026 reproduced `SELF_SIGNED_CERT_IN_CHAIN` with default trust, succeeded with the official CA using TLS 1.3, and still rejected a deliberately wrong hostname with `ERR_TLS_CERT_ALTNAME_INVALID`. The probe sent no PostgreSQL startup/authentication message, password, or SQL. The leaf's SAN matched `db.vgsmfbupgydafvotkold.supabase.co`; its issuer was Supabase Intermediate 2021 CA. This establishes the TLS cause, not password correctness. Session pooler TLS was not separately probed.

The certificate is public trust material, not a credential. Its provenance is Supabase's [SSL enforcement documentation](https://supabase.com/docs/guides/platform/ssl-enforcement) and the [official Studio certificate URL configuration at commit 2d5768d](https://github.com/supabase/supabase/blob/2d5768d3c114b6746c730a91881483f91e99ec6f/apps/studio/hooks/custom-content/custom-content.json). The production URL is [Supabase's CA download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt); it was downloaded using verified HTTPS.

- Certificate SHA-256 fingerprint (DER): `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
- Bundled PEM SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
- CA validity: 28 April 2021 through 26 April 2031.

The shared policy checks the bundled PEM hash before networking. Missing or altered bundled trust fails closed with a fixed `CA_BUNDLE` diagnostic. node-postgres receives PEM contents with `rejectUnauthorized: true`; libpq receives the absolute path in `PGSSLROOTCERT` with `PGSSLMODE=verify-full`; Prisma receives the same absolute path in `sslcert` with `sslmode=require&sslaccept=strict`. No OS, Keychain, global Node, or libpq trust store is modified. Local loopback test databases retain their existing non-TLS policy.

To retry the private check, exit an existing launcher with `q`, start the reviewed launcher again, enter the credential only at its hidden prompt, and choose **1**. Do not loosen verification after a TLS error. If Supabase rotates its CA, verify the replacement through official sources and its live hostname-verified chain, update the certificate and pin in a reviewed PR, then rerun tests. An explicit CA override remains available for a separately reviewed trust change; relative or conflicting paths are rejected.


## Supabase-compatible recovery procedure (documented, not executed)

### Preconditions before the migration

1. Retain the successful local archive and its manifest in the protected directory. The confirmed initial archive is `2026-10-10T17-20-25-204Z-5a5ed22a-2490-4822-b1bf-f0b3501c03e4.dump`, SHA-256 `903661de4abbf90e888fccc054d39c236c1dbe848a7e4538ac320ad3aaa771ff`. Its checksum was independently recomputed without displaying contents. The guarded write commands must still create their own fresh backups.
2. In an authorized human session, inspect this project's Database → Backups. Record the completed recovery-point timestamp, status and available retention, and confirm it precedes the proposed writes. A Pro subscription is not proof a particular snapshot completed. The connected tools cannot supply this inventory; do not create a management token or bypass browser restrictions to obtain it.
3. Record the migration/app commits and current schema state. Read-only checks on 10 October found PostgreSQL 17.11, no Prisma ledger, `private.site_owner` present, no `private.site_admin`, and zero app rows, legacy memberships and Storage object records. Installed extensions were pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1 and uuid-ossp 1.1. Recheck these facts when recovery is actually needed.
4. Only confirm `READY` after these checks. If a completed platform point is unavailable, report that and coordinate a different verified recovery plan before writing. Do not silently substitute a readable archive listing for a tested hosted recovery method.

### If recovery becomes necessary

Stop further migrations and application writes, preserve the failed-state evidence privately, and choose a recovery point and allowed data-loss window. Do not run reset, alter failed ledger rows to claim success, or delete backups. Obtain separate approval naming the exact project, restore point, target and downtime before restoring.

For an in-place platform restore, use the recorded completed backup in Supabase's Database → Backups and the platform's confirmation flow. The project is unavailable during restoration. Pro normally retains seven days of daily backups; PITR is a separate optional add-on. Database backups exclude Storage object bytes and custom-role passwords. Plan any needed restoration of those separately; never send them through chat. [Official backup and restore process](https://supabase.com/docs/guides/platform/backups).

When an isolated target is preferred, Supabase's **Restore to a new project** can preserve the database, Auth records and encryption root key from an available physical backup. It creates a billable project and requires separate cost/creation approval. Auth settings/API keys, Storage, functions and other platform configuration need independent review. Extension-driven jobs can start immediately in a clone, so evaluate external side effects before creating one. This is an optional recovery approach, not a prerequisite purchase for the current migration. [Official restore-to-new-project procedure](https://supabase.com/docs/guides/platform/clone-project).

The local `.dump` is PostgreSQL custom format, not the plain SQL export used in the Supabase CLI examples. Do not feed it to `psql`, replay it blindly over live managed schemas, or bypass restore errors. Use a separately approved compatible isolated target for any logical rehearsal, with appropriate extensions and reviewed role/ownership mappings. Supabase's logical guide addresses managed Auth/Storage customizations, migration-history preservation, publications and encryption-root-key handling for Vault/encrypted columns. Our local helper creates inert role placeholders and is suitable for its disposable tests; it is not a hosted restore tool. The current archive has not been restored into a matching Supabase stack, so that route remains unverified. [Official logical recovery considerations](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### Validate before resuming service

In the selected target, compare the restored catalog and migration ledger with the chosen snapshot: a pre-adoption point should have the original base and no completed two-admin migration. Verify ledger checksums when present, RLS, grants, function security/search paths, private-schema non-exposure, row counts and each user's data isolation. Recheck Supabase security advisors and a real Google login only when provider setup is approved. A restored membership must still correspond to an approved verified identity; recovery does not authorize new enrollment.

Verify any Storage data and external settings independently. Test the public site, locked/authorized admin behavior, cookie/session handling and no-store responses against the selected app commit. Authorize any cutover/environment changes separately, then resume writes only after these checks pass. Keep the original backup and recovery record until the agreed retention period ends.

Paid PITR, additional retention, off-device replication and a production restore exercise are optional improvements. The outstanding pre-migration requirement here is evidence of the chosen completed platform recovery point, not enabling a new paid feature. No hosted restore, clone, credential change or cutover was performed for this documentation.
