# Adding a private app

## Product contract

The admin section is Bart's personal workspace for an evolving collection of small apps: trackers, planners, calculators, dashboards, and other tools requested as needed. Each app should solve its specific task, fit the existing workspace, and reuse its authentication and navigation. Build the smallest complete tool that satisfies the request. Do not introduce a general app-building framework, separate deployment, or second data store without a concrete need and an explicit change to this direction.

These are required defaults for every new or changed app. Read them alongside [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

## Supabase is the source of truth

All durable application state belongs in the existing project's Supabase Postgres database. This includes business records, user-editable settings, saved drafts, workflow progress, custom ordering, saved calculation inputs/results, and any history, integration sync state, or background-job status that the app needs to retain. Load saved state from Supabase on entry and after reload; it must be available on another authenticated device.

| Kind of state | Required location and behavior |
|---|---|
| Small settings or self-contained JSON records | `public.app_data` through the guarded shared helpers, scoped by owner, app slug, and key |
| Collections with filtering, relationships, constraints, or concurrent per-record updates | Dedicated Supabase tables with appropriate indexes, ownership, grants, and RLS |
| Private attachments | Private Supabase Storage objects; ownership, object paths, and app metadata in Postgres |
| Temporary input, open dialogs, selection, and loading indicators | React state; it is disposable unless the feature promises to save it |
| Executable app registration and static presentation defaults | Versioned code; user-editable overrides live in Postgres |
| Credentials and deployment configuration | Existing approved server environment/secret handling; never ordinary app records or client bundles |

Do not use localStorage, sessionStorage, IndexedDB, cookies, local JSON/CSV files, server memory, or a second database as authoritative app storage. Existing authentication cookies remain part of session handling. Imports and exports are transfers of data; an export file does not become the app's database. Test fixtures stay in tests, and production empty states must not contain invented records.

A stateless calculation does not need to write every keystroke to the database. If the app promises saved inputs, results, drafts, or preferences, persist them in Supabase. A cache or optimistic UI may reflect database state but must be disposable and reconciled with it; never serve one user's private data from a shared cache.

Calendar companion has an explicit user-approved exception: Google Calendar is the source of truth for its events, birthdays, sitter coverage and booking reminders. Supabase stores only owner-scoped planning preferences and ideas; live Google reads produce disposable views. Google calendar ACLs control event sharing. See its [integration contract](../src/private-apps/calendar-companion/README.md). This exception does not change storage requirements for other apps.

For external integrations, store the app's imported snapshot, external identifiers, sync status, and last successful sync in Supabase. Show when data is stale. The external service still controls its own resources; do not imply a remote action succeeded merely because a local database row was written.

## Data and save behavior

- Establish each app's data model before wiring its UI. Use stable slugs and keys. The existing `app_data` identity is `(owner_id, app_slug, key)`; never use a display name as ownership or trust an owner ID supplied by the browser.
- Use `readAppData` and `writeAppData` for small, self-contained JSON values. They provide authentication, registry checks, owner scoping, and database access. Each app must validate its own value shape, lengths, allowed fields, and request sizes on the server.
- `readAppData` returns `{ value, updated_at }` or `null` for an absent record. Treat absence as a legitimate empty/default state. Treat a thrown database error as a failure, not as an empty dataset to overwrite.
- `writeAppData` replaces the value for a key and returns no saved row. Await it before showing success; reread when the UI needs the persisted result. It does not merge JSON or prevent concurrent edits from overwriting each other. Use dedicated rows and an explicit conflict strategy when the app requires those guarantees.
- Default records to private ownership by the signed-in admin. The two admins have separate data. If an app needs shared records, document the intended readers/writers and implement that model explicitly in both server authorization and RLS.
- Give relational tables appropriate types, required fields, foreign keys, uniqueness constraints, and timestamps. Use transactions for changes that must succeed together. Make retryable imports or remote operations idempotent where duplicate execution would cause harm.
- Show loading, empty, saving, saved, and error states where applicable. Failed saves must preserve recoverable input in the current UI and offer a retry. If using optimistic updates, reconcile success and roll back or clearly mark failures. Do not promise durable drafts until they have been saved.
- For destructive actions, make the affected record and result clear and use confirmation or undo appropriate to the impact. Do not add permanent history or soft deletion unless the app needs it.
- Database unavailability must produce an actionable failure state. Never silently switch to browser-only persistence, fabricated data, or an authentication bypass.

## Chat is another editor

Design apps so the UI visualizes and edits the same Supabase records that can be maintained from chat. For reviewed JSON apps, register a shared validator/key/size contract in `src/lib/app-data-contracts.js` and follow [chat data operations](CHAT_APP_DATA.md). Keep validation reusable outside React and server-only modules. App creation must include a documented agent read/write path; dedicated-table apps need equivalent scoped operations.

Runtime data access still requires the signed-in user's session and owner RLS. The authenticated Supabase connector is a separate trusted administrative operator path, with explicit requested-owner scope, live identity/enrollment checks and guarded generated SQL. Do not expose its privileges in the website. Chat maintenance must preserve unrelated state, reject stale writes and reread confirmed changes. Browser writers for chat-enabled documents must also check the revision atomically; a read-then-blind-write is insufficient.

## Schema changes

Reuse the existing Supabase project. Runtime data access uses user-scoped Supabase sessions; Prisma is the repository's migration tooling. Follow [the migration and backup runbook](DATABASE_MIGRATIONS_AND_BACKUPS.md) and [the cloud migration workflow](CLOUD_DATABASE_MIGRATIONS.md). Create migrations with `npm run db:migration:new -- descriptive_name`, keep applied migrations unchanged, and review the migration guards and upgrade tests required by the runbooks. Do not introduce a parallel Supabase migration history or bypass the guarded deployment with dashboard SQL or `db push`.

Include RLS, grants, constraints, and any Storage policies in the reviewed change. Keep service-role keys and database credentials out of app clients. Missing schema, membership, or hosted setup is a reported prerequisite, never a reason to weaken authorization. Preparing an app or migration does not itself apply a hosted schema change.

## Implementation steps

1. Implement a component under `src/private-apps/<slug>/`. Keep secret/data access in server-only modules.
2. Import the component and add `{ slug, name, description, Component }` to the array passed to `createAppRegistry` in the server-only `src/lib/apps.js`. Slugs use lowercase words/numbers separated by hyphens, at most 80 characters. Invalid/duplicate slugs, missing components and unsupported API methods fail at registration. Only register working apps.
3. The workspace lists registered apps in its homepage and authenticated sidebar, with active-page navigation, and renders them at `/admin/apps/<slug>`. Both route and registry helpers call `requireAdmin()` independently. Unknown apps return 404 after authentication. Registry listings expose only name, description and slug, never components or server configuration.
4. Use `readAppData(slug, key)` and `writeAppData(slug, key, value)` from `src/lib/app-data.js` for small JSON records. These helpers reject unregistered apps, verify the admin, and use the signed-in admin's session with RLS. Define more specific tables/policies when an app needs them.
5. Prefer the shared API entry point `/api/admin/apps/<slug>`: GET returns the app's safe metadata by default. An optional `api: { GET, POST }` registration dispatches custom handlers only after admin verification and app lookup. POST requires the exact configured `SITE_URL` origin and rejects cross-site requests. Handlers receive `(request, { owner, slug })`, must return a Web `Response`, validate their own body/query schema and size, and use guarded data helpers. Do not perform writes in GET. Every response is private/no-store, denied access returns 401/403/503, unknown apps return 404 and unsupported methods return 405. Exceptions return a generic 503 without internal details.
6. Every additional Route Handler outside that shared entry point must call `checkAdmin()` before reading or mutating data and return 401/403/503 on denied access. Every Server Action must call `requireAdmin()` and validate inputs. Add exact-origin/CSRF protection for mutation APIs. Do not rely only on the admin layout, proxy or browser navigation.
7. Test unauthorized requests directly against APIs and Supabase, not just the hidden UI. Add app-specific validation and data-isolation tests. Keep private attachments in private Storage buckets with owner policies and short-lived signed URLs. Existing tests exercise registry authorization, per-app API denial/CSRF/metadata/error behavior, Google admin policy, and actual PostgreSQL RLS.

## Route conventions

| Path | Purpose |
|---|---|
| `/admin` | Installed apps and empty state |
| `/admin/apps/<slug>` | Registered app component with admin checks |
| `/api/admin/apps` | Authenticated metadata list |
| `/api/admin/apps/<slug>` | Guarded metadata GET or registered GET/POST handlers |
| `src/private-apps/<slug>/` | App component, validation, actions and server modules |

For larger apps that need nested routes, add explicit App Router routes under `src/app/admin/apps/<slug>/` and guard each server entry point. Keep its registry entry so it remains discoverable in the workspace. A client component must fetch protected APIs or invoke guarded Server Actions; it cannot import the server-only registry/data modules. Never use shared caches for private responses.

The initial registry is intentionally empty. There is no upload-and-execute-code feature, fake app, or browser-side authentication bypass.

The handler context property `owner` refers to the signed-in admin as the owner of their own app data. Keep `owner_id` filtering; admin membership does not imply shared records.

## Definition of done

Before considering an app complete:

1. Its real component is registered, reachable from the admin grid/sidebar, and usable within the existing layout on desktop and mobile.
2. Its primary workflow reads and writes real Supabase data. Verify that a confirmed save survives reload and is available in a fresh authenticated session. For explicitly stateless tools, document why persistence does not apply.
3. Server inputs are validated. Direct unauthenticated requests fail, and one admin cannot read or modify another admin's records through either the app API or Supabase. Cover the intended exceptions only when sharing is explicitly designed.
4. Relevant tests cover the happy path, invalid input, database/save failures, and access boundaries. Exercise retry or conflict handling when the feature requires it. Follow the repository checks and migration verification appropriate to the change.
5. Add a short README beside the app describing its purpose, route, data model/keys, ownership, save behavior, setup or migration requirements, and actual verification. Identify any external integration and its failure/retry behavior.
6. Report what was checked locally versus against the hosted service. Passing mocked tests or a build does not establish real persistence, live authorization, or a deployed migration. If setup blocks a live check, keep that check explicitly unverified.

For example, a simple checklist can use one owner-scoped JSON record when replacing the whole checklist is acceptable. A tracker with independently edited entries, reporting queries, or simultaneous users should use dedicated rows. In both cases, confirmed records and editable settings come from Supabase after reload.
