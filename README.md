# Bart Consedine | public site and private workspace

Reversible rebuild of `bartconsedine/bartconsedineDOTcom` from commit `d187ab5`.
Next.js App Router, JavaScript, React, Supabase Auth (Google OAuth), and Supabase Postgres.
The original checkout is untouched. The rebuild branch is published on GitHub. Vercel Preview deployment `FjBRgwRwakypdd8aTm1FxhLhG3gd` succeeded for commit `3b48622`; production publication has been authorized separately from Supabase setup.

```sh
nvm use # optional: uses the tested Node 22.23.2 from .nvmrc
npm ci
npm run dev
# http://127.0.0.1:3000
npm test
npm run build
```

Runtime: Node 22.x (tested 22.23.2). Next.js itself requires Node >=20.9, but the installed Supabase client requires >=22. The package manifest and lockfile declare 22.x. On 9 October 2026 the official npm registry's stable tags matched the existing exact pins: Next.js 16.4.0, React 19.3.0 and React DOM 19.3.0. No prerelease packages were installed. The original static favicon was moved into `public/static/` with the same `/static/favicon.ico` URL, removing the legacy static-directory warning.

The public site works without credentials. `/admin`, `/admin/apps/<slug>`, `/api/admin/apps` and `/api/admin/apps/<slug>` fail closed until configuration is complete. There is no demo login or bypass. The workspace contains no invented apps. A validated server-only registry supplies the app grid, active sidebar navigation and per-app routes. Optional registered GET/POST API handlers run behind verified admin checks, same-origin mutation checks and private/no-store responses. Google OAuth integration and database policies need the live setup below before they can be verified end to end.

## Deployment and live auth setup

Follow the [two-admin setup checklist](docs/SUPABASE_SETUP_CHECKLIST.md) for the exact project, migration order, Google identity verification, administrative enrollment SQL, environment variables, and pending live checks. The approved accounts are `bartconsedine@gmail.com` and `mjshah8@gmail.com`. The code task has made no hosted writes; coordinate the authorized release and remaining setup with the parent task.

All migrations now run through [Prisma Migrate with a pre-migration backup](docs/DATABASE_MIGRATIONS_AND_BACKUPS.md). The hosted base already exists and must be verified/baselined, never replayed. Fresh local databases run both Prisma migrations in order. Membership starts empty; Google sign-in can create an Auth identity but cannot enroll an admin. An administrator reviews both real Auth UUIDs and runs the separate [enrollment SQL](supabase/admin/enroll_two_admins.sql). `OWNER_USER_ID` and `OWNER_EMAIL` are no longer required. The old production code and new database schema must not be mixed; coordinate migration and release with the original setup task.

## Security boundaries

- Every protected page and data helper independently checks the verified Supabase user; layouts/proxy are not the sole security boundary.
- Admin access requires server-verified `getUser()`, confirmed email, a matching verified Google identity, and live database membership bound to the exact Auth UUID and approved email. User-editable metadata cannot grant access.
- `private.site_admin` permits only the two approved email addresses, with one UUID per address. It is administratively managed and excluded from Data API exposure. No enrollment API exists.
- Both admins retain separate `app_data` ownership through RLS. Neither can read or change the other admin’s rows.
- Session refresh happens in `src/proxy.js`; protected responses are private/no-store. Cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Login is a same-origin Server Action; logout is POST with origin verification; callback always redirects to `/admin` or `/login`, ignoring user-supplied redirect destinations.
- Never place private data in `/public`, public source exports, or client bundles. RLS is still required for each new table/bucket.

## Extension

See [adding apps](docs/ADDING_APPS.md). Public work content lives in `src/lib/content.js`.

For changes, use the [documented and tested PR workflow](CONTRIBUTING.md) and the project `$pr` skill.
