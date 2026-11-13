# Bart Consedine | public site and private workspace

Bart's public website and private workspace, built with Next.js App Router, JavaScript, React, Supabase Auth (Google OAuth), and Supabase Postgres. The workspace contains Morning signal, Project board, Robot Party, Japan command center, and Calendar companion. Registered apps share authentication, navigation, and protected server operations.

## Local development

```sh
nvm use # Node 22.23.2 from .nvmrc
npm ci
npm run dev
# http://127.0.0.1:3000
npm test
npm run db:validate
npm run build
```

Use the Node version in [.nvmrc](.nvmrc) and install the locked dependencies with `npm ci`. [package.json](package.json) declares the supported Node major, exact package versions, and available scripts; [package-lock.json](package-lock.json) pins the dependency tree.

The public site works without credentials. Workspace pages and APIs require a verified identity and current authorization; missing configuration or unavailable authorization checks deny access. A validated server-only registry supplies the app grid, sidebar, and per-app routes. Owners can explicitly invite viewers or editors to supported app datasets; an invitation does not grant administrator access.

## Deployment and live auth setup

Follow the [auth setup checklist](docs/SUPABASE_SETUP_CHECKLIST.md) for the project, server environment variables, Google identity verification, administrative enrollment, and live acceptance checks. The approved administrator accounts are `bartconsedine@gmail.com` and `mjshah8@gmail.com`. Google sign-in can create an Auth identity; administrator membership requires the separate reviewed [enrollment SQL](supabase/admin/enroll_two_admins.sql).

Schema changes use the reviewed Prisma migration history and backup gates described in the [migration and recovery runbook](docs/DATABASE_MIGRATIONS_AND_BACKUPS.md) and [cloud migration workflow](docs/CLOUD_DATABASE_MIGRATIONS.md). Inspect actual migration history before choosing adoption or deployment: an existing base must be verified before recording it as applied, and its SQL must not be replayed. Disposable local verification provisions the Auth fixture and roles before applying the complete migration history. Hosted schema changes, enrollment, credentials, and recovery operations require their own authorization.

The runbooks contain dated execution evidence. Check the target environment before treating a setup step as complete; this README does not certify live configuration, migration status, or successful OAuth and persistence checks. Historical rebuild and verification notes are in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Security boundaries

- Protected server entry points and data helpers enforce authorization independently of layouts and browser navigation.
- Workspace access requires server-verified `getUser()`, confirmed email, a matching verified Google identity, and either live administrator membership or a current app grant. Administrator-only operations additionally require membership bound to the exact Auth UUID and approved email. User-editable metadata cannot grant access.
- `private.site_admin` permits only the two approved email addresses, with one UUID per address. It is administratively managed and excluded from Data API exposure. No enrollment API exists.
- App data is private to its owner by default, enforced through RLS. Administrator membership alone does not grant access to another owner's records. Explicit viewer/editor grants share the owner's entire supported app dataset with the invited verified Google identity. Guests cannot manage invitations; revocation denies future access. See [invitation rules](docs/ADDING_APPS.md#inviting-people-to-an-app).
- Session refresh happens in `src/proxy.js`; protected responses are private/no-store. Cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Login is a same-origin Server Action; logout is POST with origin verification. The OAuth callback returns to `/admin`, the fixed Calendar companion route, or a validated continuation for `/auth/robot-party/authorize`, `/auth/tv`, or `/auth/qr`; failures return to `/login`. External and arbitrary redirect destinations are rejected.
- Never place private data in `/public`, public source exports, or client bundles. RLS is still required for each new table/bucket.

## Extension

Add focused tools inside `/admin/apps/<slug>` using the existing registry, authentication, navigation, and data helpers. Durable app records, settings, saved drafts, and progress belong in Supabase with private ownership by default. Calendar companion's documented integration exception keeps calendar events in Google Calendar and planning preferences in Supabase. See [adding apps](docs/ADDING_APPS.md) for persistence, sharing, structure, and completion requirements, and [chat data operations](docs/CHAT_APP_DATA.md) for maintaining the same reviewed records from chat. [AGENTS.md](AGENTS.md) makes these defaults part of future agent work. Public work content lives in `src/lib/content.js`.

For changes, use the [documented and tested PR workflow](CONTRIBUTING.md) and the project `$pr` skill.
