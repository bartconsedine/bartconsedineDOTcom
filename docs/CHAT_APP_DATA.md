# Private app data from chat

Supabase is the shared source of truth. The website is a visualization and editor; Codex can read and update the same records through the connected Supabase tools without clicking through the app. Chat changes appear on the next app load. This is not a new database, synchronization service or public write endpoint.

## Trusted operator connection

Use the connected Supabase project's `execute_sql` tool. Verify project ID `vgsmfbupgydafvotkold`, name `bartconsedine-website`. No database password, service-role key, API token or new deployment configuration is needed. The connector must already be authenticated and authorized for that project; installing a repository skill does not grant connector access.

The connector runs privileged SQL, independently of the website's logged-in session. This is an explicit trusted administrative data-maintenance path: only user-requested records may be accessed, and all queries must come from `scripts/app-data-sql.mjs`. Its live guard requires an enrolled admin, matching confirmed nonanonymous Auth user and matching verified Google identity. It scopes every read/write to that owner's UUID and the reviewed app/key. RLS still protects website/API users; it does not constrain a privileged connector. An email argument selects an owner; it is not authentication. Never expose this generator as an HTTP endpoint, or let a browser invoke administrative SQL.

The supported contracts are versioned in `src/lib/app-data-contracts.js`. Japan uses `japan-trip` / `plan-v1` and the exact same `validatePlan` as the API. Calendar companion uses `calendar-companion` / `google-v2` and its shared `validatePreferences` contract for preferences and ideas only. Its events, birthdays, sitter coverage and reminder state belong in Google Calendar; use the authenticated Google Calendar tools for user-requested event changes, not connector SQL. See its [operating notes](../src/private-apps/calendar-companion/README.md). Unsupported apps fail closed until a developer adds and tests a reviewed contract. Future dedicated-table apps require their own validated operations; do not force them into whole-document JSON storage.

## Read, edit, save and verify

```sh
node scripts/app-data-sql.mjs read japan-trip bartconsedine@gmail.com
node scripts/app-data-sql.mjs write japan-trip bartconsedine@gmail.com /private/tmp/japan-change.json
```

Each command prints a structured `{ project_id, query }` argument for the connector; it never connects or writes by itself. Read returns one row containing `owner_id`, `value` and an exact UTC `updated_at`. Zero rows means denied/unavailable membership or identity. A row with null value/revision is a legitimate absent record. Do not treat query failures as absence.

The temporary change file contains exactly `value` (the complete validated document) and `expectedAt` (the exact revision from the latest read, or null only for creation). Keep private transfer files outside Git, with permissions 0600, remove them after use, and never use them as storage. Review only the requested change, preserve unrelated fields and stable record IDs, and execute the generated SQL unchanged. Quotes in record text are escaped, and owner/app/key choices are restricted.

Writes atomically compare the previous revision; creation uses insert-if-absent. Every successful write advances `updated_at`. Require `authorized: true`, `saved: true` and a database timestamp. A false authorization result stops for identity/enrollment repair. A false save indicates a conflict: reread, reconcile and generate a fresh change. Never remove the revision guard. After a tool timeout, reread before deciding whether to retry. Read back and compare the intended saved fields before reporting success.

The Japan API uses `{ plan, expectedAt }` on POST and returns `{ saved: true, updatedAt }`. Old clients that submit a bare plan receive 400; refresh the app after deployment. A stale save receives 409 and keeps the editor's input. Export those edits before reloading to reconcile them with chat changes. Website writes still use the signed-in user's session, existing exact-origin protection and owner RLS. A record replacement is atomic but is not an automatic field merge or real-time collaboration.

## Operating rules and verification

Use [the app-data skill](../.agents/skills/app-data/SKILL.md) for data-only chat requests. They do not require a code PR unless app behavior/contracts change. Implementation follows [CONTRIBUTING](../CONTRIBUTING.md). Changing a starter does not update saved data. Canonical Sheets and external bookings remain separate operations; this path does not sync them.

Tests execute generated queries and session-writer revision predicates against local PostgreSQL via PGlite, covering roundtrip, stale save/create races, injected SQL text, invalid contracts, live identity/membership denial and owner isolation. Existing API/RLS tests cover session access, CSRF, generic database errors and cross-user denial. No schema or membership changes are required. For schema or migration tooling changes, use the existing migration/backup runbooks rather than connector DDL.

On October 11, 2026, generated queries read Bart's saved plan from production, rejected a deliberately stale save, and successfully saved the existing plan unchanged with a fresh revision. A reread confirmed every trip field remained identical. This proves the production read/write path without inventing trip changes. Reloading the existing signed-in production Japan app displayed the new save time. Fresh-session roundtrip and second-admin live denial remain separate acceptance checks.

## Project board relational records

Use `scripts/project-board-sql.mjs` for owner-scoped project/task reads and guarded per-row writes, following the same verified-project, fresh-read, requested-owner, protected-transfer and readback rules above. It rejects new/changed Google references; those require the browser API's live Google verification. See [the board contract](../src/private-apps/project-board/README.md). Do not use the whole-document app-data generator for these tables.

## Morning signal

The morning feed uses `morning-feed` / `screen-v1` with the shared `validateScreen` contract. Generate reads/writes with the same commands above, substituting `morning-feed` for `japan-trip`. Start absent records from `emptyScreen()`; preserve stable card IDs, card ordering, visibility and unrelated fields. The screen includes title, focus, time zone, slide interval and up to 24 ritual/briefing/link cards. See [the app README](../src/private-apps/morning-feed/README.md) for fields and limits.

The morning API accepts `{ screen, expectedAt }`. All writers check the exact revision atomically. TV mode checks saved state every 30 seconds; ordinary editor views reload explicitly. Failed refreshes retain the previous snapshot with a visible stale notice. No external news, weather, calendar synchronization or device pairing is implied by saving a card. No new schema, enrollment or credentials are required. Local Postgres tests cover the new contract's roundtrip, stale writes, injection, identity denial and owner isolation; hosted acceptance remains unverified.
