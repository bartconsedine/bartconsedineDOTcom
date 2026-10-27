# Supabase migrations in the cloud

Run the production database checkpoints through the **Supabase database migration** GitHub Actions workflow. The runner is GitHub-hosted Ubuntu Linux; standard Prisma connects to the existing Supabase database with strict TLS. No Mac launcher, Docker daemon, local migration execution, or Vercel database credential is needed.

## Current checkpoint — 11 October 2026

Read-only takeover inspection found no `private._prisma_migrations`, no `private.site_admin`, and no `public.is_site_admin()`. The original `private.site_owner` remains with zero memberships. Bart's confirmed matching verified Google identity exists; Meera has not signed in. No migration or enrollment ran during this takeover.

The previous Documents wrapper had a reproduced silent startup stall while files were cloud placeholders. The user's eventual silent exit is not conclusively explained. Do not reuse that wrapper. This cloud route bypasses the Mac startup boundary.

## Private configuration

After reviewing/merging the workflow and its prerequisite PR #6, create the repository environment **production-database**. Restrict deployment branches to `main`, designate Bart as required reviewer, and keep the migration workflow manual. Environment approval is separate from ordinary code validation.

Add environment secrets through GitHub's private settings UI:

- `SUPABASE_DATABASE_PASSWORD`: the existing database password, without quotes or a URL. Never paste it into chat, workflow inputs, Git, logs, or Vercel.
- `CLOUD_BACKUP_KEY`: a base64 encoding of 32 cryptographically random bytes. Keep a second copy in Bart's protected recovery storage before running writes. Generate it with a trusted secret manager or `openssl rand -base64 32` in a private terminal. It is an encryption key, not the database password. Do not regenerate it after backups exist unless the old recovery key is retained.

The fixed target is `aws-0-us-east-2.pooler.supabase.com:5432`, database `postgres`, user `postgres.vgsmfbupgydafvotkold`. No connection URL is an input. Node 22.23.2, locked dependencies, PostgreSQL 17 clients, bundled pinned CA and reviewed migration checksums are enforced. Production secrets reach only the guarded JavaScript action, after unprivileged validation steps finish.

## Run one checkpoint at a time

Open Actions → **Supabase database migration** → **Run workflow**, select `main`:

1. Run **inspect**. The actual Linux Prisma read-only preflight verifies TLS/authentication. Require `[cloud/OK] inspect: unadopted` before adoption. If baseline or complete is already recorded, skip completed writes. Any failure/unexpected history stops setup.
2. Reconfirm a completed Supabase physical restore point and recovery prerequisites in [the recovery runbook](DATABASE_MIGRATIONS_AND_BACKUPS.md). Previously verified points were 10 October 2026 10:35:05 UTC and 9 October 2026 19:59:45 UTC; recheck availability. A prior logical backup does not replace the fresh backup required by each write.
3. Run **adopt**, enter `ADOPT vgsmfbupgydafvotkold`, check the recovery confirmation and approve the environment job. It compares the existing schema, takes a fresh full logical backup and verifies the archive/checksum. Before writing history it encrypts, uploads, downloads, decrypts and compares that backup. Only then does standard Prisma record `0_private_workspace` as already applied. Its SQL is never replayed. Require `[cloud/OK] adopt: baseline` and a positive backup artifact ID.
4. Run **deploy** with `DEPLOY vgsmfbupgydafvotkold` and a fresh recovery confirmation. The same backup/retention gate runs again. Prisma deploys only `20261009203911_two_admin_membership`. Require `[cloud/OK] deploy: complete` and its own backup artifact ID.
5. Independently verify both completed ledger records/checksums, RLS, functions, grants, private-schema exclusion and security advisors. Follow [the setup checklist](SUPABASE_SETUP_CHECKLIST.md) for separately approved enrollment and live acceptance.

No reset, db push, migrate dev, raw SQL replacement, blind resolve, enrollment operation, or automatic deployment trigger exists. Writes are serialized with cancellation disabled. Do not retry a failed write until actual hosted ledger/schema state is inspected; a failed job does not prove rollback.

## Encrypted backups and recovery

Only AES-256-GCM ciphertext and a nonsecret encryption envelope are uploaded to GitHub artifacts. Auth rows, roles, manifest contents and plaintext dumps are never uploaded. Every fresh backup artifact is downloaded, authenticated/decrypted, and compared with the original dump and manifest **before** the migration write. Upload, download, tamper, wrong-key or comparison failure blocks that write. The runner cleans up plaintext scratch files on exit; a killed runner is discarded by GitHub.

Artifacts request **30 days** retention, bounded by repository policy. Keep the backup key and retrieve needed artifacts before expiry; GitHub artifacts are not permanent archival storage. This is a new encrypted recovery copy alongside Supabase physical restore points. It excludes Storage bytes, role passwords and external OAuth/environment settings. Download/decryption verification does not certify a hosted restore.

To inspect a downloaded artifact, supply `CLOUD_BACKUP_KEY` privately in your protected process environment and run:

```sh
node scripts/decrypt-cloud-backup.mjs /absolute/artifact-directory /absolute/new-protected-output-directory
```

The output directory must not exist. The command creates it with mode 0700 and files with mode 0600, verifies GCM authentication and the dump checksum, and never restores a database. Keep decrypted files outside Git and synced folders. Any hosted restore still requires separate approval naming the project, restore point, target and downtime and the Supabase-compatible procedure in the recovery runbook.

## Validation and remaining limits

`npm test` includes synthetic cloud input/authorization gates, retention ordering, encryption roundtrip, tamper and wrong-key rejection. The disposable PostgreSQL drill checks that actual adoption/deployment cannot write if the retention callback fails. PR CI runs the real GitHub artifact upload/download/decryption path with synthetic bytes only; it never receives a database credential. Real authentication, cloud migration and live admin acceptance remain unverified until the approved workflow runs.

References: [GitHub environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments), [official artifact SDK](https://github.com/actions/toolkit/tree/main/packages/artifact), [PostgreSQL Ubuntu repository](https://www.postgresql.org/download/linux/ubuntu/).

## Incremental app-sharing migration — October 26, 2026

Read-only hosted inspection verified both existing Prisma migrations completed with matching checksums. `20261026235556_app_sharing` is the next reviewed migration; it adds email-bound viewer/editor grants, shared-data RLS and revision triggers without changing existing record owners or values or enrolling anyone.

The migration runner now recognizes **pending** only when the actual completed history is an exact, checksum-matching prefix of the reviewed migration list. Unexpected, failed or modified records still stop execution. A deployment accepts baseline or pending, rechecks the same history after a fresh logical backup and verified encrypted artifact roundtrip, then lets Prisma apply the reviewed suffix. First deployment still checks the original baseline catalog; incremental deployment does not attempt to compare the post-admin schema to the obsolete original baseline.

After this code is reviewed/merged, run manual **inspect** on `main`; the current two-migration database should report **pending**. Before **deploy**, independently confirm a current completed Supabase restore point and obtain explicit authorization for this schema change. Use the existing `production-database` environment approval and exact `DEPLOY vgsmfbupgydafvotkold` input; retain the backup gate. Do not apply SQL through the connector, edit the ledger, change credentials, or bypass environment review. The deployment preference for website code does not remove these database checkpoints.

After deployment, verify the new ledger/checksum, RLS/function grants, existing owner data, and guest viewer/editor/revocation behavior with approved synthetic accounts. No actual person is invited until an owner uses the access screen. Missing migration produces a setup state rather than fake successful invitations. Rolling back website code does not roll back the schema; do not reverse the migration or delete grants as an incidental code rollback.


## Robot Party and member tokens — October 26, 2026

The reviewed suffix after app sharing includes `20261027010424_robot_party_board`
and `20261027013318_robot_party_member_tokens`. The latter lets invited members
issue app-scoped credentials within their current permission, binds guest keys
to the exact invitation revision and live verified identity, and makes key
revocation permanent. It preserves existing owner-issued keys and enrolls or
invites nobody. Run inspect and review the exact pending suffix before deploy;
keep the same recovery-point, encrypted-backup and environment approval gates.
After deployment, verify owner and guest reader/writer creation, private key
metadata, cross-member denial, guest removal/downgrade, re-invitation denial for
old keys and board persistence using approved test identities. Code deployment
alone does not certify these hosted flows.

## Robot Party activation and dot OAuth — October 26, 2026

User approval for sharing, board and member tokens plus a current restore point
was received in chat. Inspect `40434891657` passed pending; guarded deploy
`40435539864` applied exactly those three migrations from main `7dbd22a` after
verified encrypted backup artifact `12704221864`. Hosted ledger checksums match;
all three public tables have RLS, anon has no board table SELECT, and authenticated
clients cannot select robot token hashes. No invitation, credential or admin
membership was created. Authenticated live flows remain to be accepted.

The subsequent reviewed `20261027015049_robot_party_dot_oauth` migration is a
separate incremental change for the ChatGPT dot connector. It adds hashed,
five-minute single-use OAuth codes and scoped consent/exchange functions. Obtain
explicit approval for this additional migration, inspect the exact pending
suffix, reconfirm recovery availability and use the same guarded deploy. Do not
apply SQL manually or reuse the previous run's confirmation as a backup bypass.
