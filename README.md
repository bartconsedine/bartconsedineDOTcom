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

The public site works without credentials. `/admin`, `/admin/apps/<slug>`, `/api/admin/apps` and `/api/admin/apps/<slug>` fail closed until configuration is complete. There is no demo login or bypass. The workspace contains no invented apps. A validated server-only registry supplies the app grid, active sidebar navigation and per-app routes. Optional registered GET/POST API handlers run behind verified owner checks, same-origin mutation checks and private/no-store responses. Google OAuth integration and database policies need the live setup below before they can be verified end to end.

## Deployment and live auth setup

1. Vercel login is verified at `https://vercel.com/bartconsedines-projects/bartconsedine`. The existing Git integration deploys production from `main`. The manifest pins Node `22.x`, which overrides the legacy project dropdown according to Vercel documentation; the preview build succeeded. Local checks used Node 22.23.2. Keep the original production commit `d187ab5258af07cd1ab9f99decd9dc46820dca9a` and Vercel deployment `9yyBjPzZX7SNRYmvYEHR3Gemwipw` for rollback.
2. Sign into Supabase and identify or approve the intended project. The repository contains no existing Supabase project binding. No project, provider credentials, database migration, or account security setting has been changed in this task.
3. Configure the Google provider in Supabase using an approved Google Cloud OAuth web client. The Google authorized redirect URI is the exact callback shown by Supabase (`https://PROJECT.supabase.co/auth/v1/callback`). Only request standard sign-in identity scopes, not Gmail inbox access.
4. Set Supabase Site URL to the intended site origin and allow the exact `/auth/callback` URLs for local and production environments. Avoid broad preview wildcards. The app uses PKCE, server cookies, and exchanges the code on the server.
5. Apply `supabase/migrations/202610090001_private_workspace.sql` to the intended project after review. No owner is enrolled by the migration, so all rows are inaccessible initially.
6. Let Barton authenticate with `bartconsedine@gmail.com` once, verify the Google identity in Supabase Auth, and record its UUID. Set `OWNER_USER_ID` and insert the same UUID into `private.site_owner` using the SQL shown at the bottom of the migration. Never infer this UUID from email alone. For initial identity provisioning, use the Supabase/Google setup flow or a temporary nonmatching owner UUID: sign-in may create a user, but the app will deny access until the correct UUID is explicitly configured.
7. Copy `.env.example` to `.env.local`; populate the project URL, publishable key, verified owner UUID and site origin privately. Use the same environment variables in the approved Vercel environment. **No service-role key is used.** Keep `private` out of exposed API schemas.
8. Verify the owner can sign in and sign out. Test another Google account, missing/expired cookies, malformed callback codes, and direct API requests. Validate SQL RLS with an anonymous and a non-owner authenticated session before storing private data. A Google sign-in can create a Supabase Auth user; it cannot enroll an administrator or gain data access.
9. The biography uses the two paragraphs from the latest forwarded speaker bio, with the user's requested “Bart” and “AI” wording. Its professional claims are user-provided, not independently verified. EY-Parthenon’s entry is grounded in that biography; SpringServe and QuiBids come from the original site. Parsec Media and SocialFly were removed at the user’s request. The old resume assets are preserved but not promoted as current.
10. Public-site publication is authorized and can proceed with the private workspace failing closed. Google sign-in and private data access must remain unavailable until configuration and end-to-end auth/RLS verification pass. The existing Vercel domain remains attached; no DNS change is needed. Roll back using the previous production deployment above, or revert the rebuild changes on `main` and let the Git integration deploy the revert.

## Security boundaries

- Every protected page and data helper independently checks the verified Supabase user; layouts/proxy are not the sole security boundary.
- Owner requires pinned UUID, confirmed owner email, non-anonymous identity, and linked Google identity. User-editable metadata cannot grant access.
- Private database access additionally requires the separately administered owner row and ownership through RLS. No enrollment API exists.
- Session refresh happens in `src/proxy.js`; protected responses are private/no-store. Cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Login is a same-origin Server Action; logout is POST with origin verification; callback always redirects to `/admin` or `/login`, ignoring user-supplied redirect destinations.
- Never place private data in `/public`, public source exports, or client bundles. RLS is still required for each new table/bucket.

## Extension

See [adding apps](docs/ADDING_APPS.md). Public work content lives in `src/lib/content.js`.
