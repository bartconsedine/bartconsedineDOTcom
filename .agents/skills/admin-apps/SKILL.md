---
name: admin-apps
description: Build or change a purpose-built private app in this website's authenticated admin workspace, including Supabase persistence and access verification.
---

# Add a private workspace app

Read [AGENTS.md](../../../AGENTS.md), [app conventions](../../../docs/ADDING_APPS.md) and [CONTRIBUTING.md](../../../CONTRIBUTING.md). Use the [PR workflow](../pr/SKILL.md) for review and release. The app conventions are the maintained specification; do not duplicate or weaken them.

Before changing Next.js code, read the relevant guides from this checkout's `node_modules/next/dist/docs/`. Install dependencies from the lockfile if those guides are absent.

Implement focused tools at `src/private-apps/<slug>/`, register the real component in `src/lib/apps.js`, and use `/admin/apps/<slug>` with the shared navigation/authentication. Prefer the existing protected `/api/admin/apps/<slug>` dispatcher; it enforces exact-origin POST and private/no-store responses. Additional server entry points need independent authorization.

Use Supabase Postgres as the durable source of truth. Small self-contained documents use `readAppData` / `writeAppData`, with explicit server validation and `(owner_id, app_slug, key)` identity. The helpers replace JSON records; choose dedicated relational rows and a conflict strategy when updates need independent/concurrent behavior. Admin membership never grants another admin's data. Do not create client storage fallbacks or load demo data after a database error.

If a schema change is needed, follow [migration and backup requirements](../../../docs/DATABASE_MIGRATIONS_AND_BACKUPS.md) and [cloud execution](../../../docs/CLOUD_DATABASE_MIGRATIONS.md). Reuse Prisma's reviewed migration history. Hosted migrations, membership enrollment, and credentials are distinct operations with their own authorization; adding an app does not authorize those operations.

Support chat maintenance alongside the UI. Read [chat data operations](../../../docs/CHAT_APP_DATA.md), share the app validator in a reviewed contract, and use atomic revision checks in every writer for chat-enabled records. The connector is a trusted operator path, separate from runtime user sessions.

Provide loading, empty, saving, confirmed-save and retry states. Keep failed input recoverable. Document ownership, persistence keys, concurrency behavior, integrations, setup and actual verification in the app README.

Test the primary workflow and validation, direct API denial/CSRF, database failures, and cross-user RLS. Run the repository checks. Verify desktop/mobile and confirmed-save reload/fresh-session behavior when authenticated access is available. Label fixtures, injected storage, local policy tests and hosted checks accurately; an inaccessible hosted check remains unverified.
