# Private app data from chat

The morning screen is editable from chat as well as the browser. Supabase remains the source of truth. The reviewed contract is `morning-feed` / `screen-v1` in `src/lib/app-data-contracts.js`, using the same `validateScreen` as the app API. Other apps fail closed until their contract is reviewed.

Use the connected Supabase `execute_sql` tool for project `vgsmfbupgydafvotkold` (`bartconsedine-website`). This is a trusted administrative operator path, separate from the website session. Access only the owner and records requested by the user. Generate every query using the script below; execute its output unchanged. Never expose this generator or privileged connector through an HTTP endpoint.

```sh
node scripts/app-data-sql.mjs read morning-feed bartconsedine@gmail.com
node scripts/app-data-sql.mjs write morning-feed bartconsedine@gmail.com /private/tmp/morning-change.json
```

The script prints `{ project_id, query }`; it does not connect or save. The read guard checks live admin enrollment, matching confirmed nonanonymous Auth user and a matching verified Google identity. It scopes reads to the selected owner, app and key. Zero rows means unavailable/denied identity; a row with null value/revision means no screen has been saved. Query errors are not absence. This operator workflow supports the two approved administrator owners, not guest-owned records.

The change file must have exactly `{ "value": <complete screen>, "expectedAt": <exact updated_at from read, or null for creation> }`. Preserve unrelated fields and stable card IDs. Store temporary private files outside Git with mode 0600; delete them after use. Never use transfer files as authoritative storage.

Writes atomically compare the revision or insert if absent. Require `authorized: true`, `saved: true` and a new database timestamp, then read back the intended fields. A false authorization result stops for identity repair. A false save means reread and reconcile; never remove the revision check. After an uncertain timeout, reread before retrying. The TV display polls saved state every 30 seconds; an editor keeps unsaved input and rejects stale saves with 409.

Local Postgres tests cover generated queries, injection, owner isolation, stale writes and identity denial. Local checks do not prove hosted access, fresh-session persistence or physical TV compatibility. No schema, enrollment, invitation or credential changes are required by this feature.
