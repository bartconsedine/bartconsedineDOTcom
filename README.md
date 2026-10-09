# Bart Consedine | public site and private workspace

Reversible rebuild of `bartconsedine/bartconsedineDOTcom` from commit `d187ab5`.
Next.js App Router, JavaScript, React, Supabase Auth (Google OAuth), and Supabase Postgres.
The original checkout is untouched. This branch has not been pushed or deployed.

```sh
npm ci
npm run dev
# http://127.0.0.1:3000
npm test
npm run build
```

The public site works without credentials. `/admin` and `/api/admin/apps` fail closed until configuration is complete. There is no demo login or bypass. The workspace contains no invented apps. Google OAuth integration and database policies need the live setup below before they can be verified end to end.

## Live setup, after approval

1. Vercel login is verified at `https://vercel.com/bartconsedines-projects/bartconsedine`. It points to the existing repository, domain, and commit `d187ab5`. The project still uses discontinued Node.js 16.x: select a supported Node runtime before any new build, with approval. Local checks used Node 22.23.2. Do not bulk-upgrade unrelated projects.
2. Sign into Supabase and identify or approve the intended project. The repository contains no existing Supabase project binding. No project, provider credentials, database migration, or account security setting has been changed in this task.
3. Configure the Google provider in Supabase using an approved Google Cloud OAuth web client. The Google authorized redirect URI is the exact callback shown by Supabase (`https://PROJECT.supabase.co/auth/v1/callback`). Only request standard sign-in identity scopes, not Gmail inbox access.
4. Set Supabase Site URL to the intended site origin and allow the exact `/auth/callback` URLs for local and production environments. Avoid broad preview wildcards. The app uses PKCE, server cookies, and exchanges the code on the server.
5. Apply `supabase/migrations/202610090001_private_workspace.sql` to the intended project after review. No owner is enrolled by the migration, so all rows are inaccessible initially.
6. Let Barton authenticate with `bartconsedine@gmail.com` once, verify the Google identity in Supabase Auth, and record its UUID. Set `OWNER_USER_ID` and insert the same UUID into `private.site_owner` using the SQL shown at the bottom of the migration. Never infer this UUID from email alone. For initial identity provisioning, use the Supabase/Google setup flow or a temporary nonmatching owner UUID: sign-in may create a user, but the app will deny access until the correct UUID is explicitly configured.
7. Copy `.env.example` to `.env.local`; populate the project URL, publishable key, verified owner UUID and site origin privately. Use the same environment variables in the approved Vercel environment. **No service-role key is used.** Keep `private` out of exposed API schemas.
8. Verify the owner can sign in and sign out. Test another Google account, missing/expired cookies, malformed callback codes, and direct API requests. Validate SQL RLS with an anonymous and a non-owner authenticated session before storing private data. A Google sign-in can create a Supabase Auth user; it cannot enroll an administrator or gain data access.
9. Review public biography and showcase copy, especially anything that may have changed since the original 2023 source. The updated MBA, EY-Parthenon Software Strategy Group, and Magnite biography came from the user’s draft context and should receive editorial approval; it is not independently verified. The old resume assets are preserved but not promoted as current.
10. After publication approval, push this branch and review a Vercel Preview deployment with its exact callback URL configured. Merge/promote only after auth and RLS pass. The existing Vercel domain can remain attached; no DNS change should be necessary. Keep the current production deployment for rollback.

## Security boundaries

- Every protected page and data helper independently checks the verified Supabase user; layouts/proxy are not the sole security boundary.
- Owner requires pinned UUID, confirmed owner email, non-anonymous identity, and linked Google identity. User-editable metadata cannot grant access.
- Private database access additionally requires the separately administered owner row and ownership through RLS. No enrollment API exists.
- Session refresh happens in `src/proxy.js`; protected responses are private/no-store. Cookies are HttpOnly, SameSite=Lax, and Secure in production.
- Login is a same-origin Server Action; logout is POST with origin verification; callback always redirects to `/admin` or `/login`, ignoring user-supplied redirect destinations.
- Never place private data in `/public`, public source exports, or client bundles. RLS is still required for each new table/bucket.

## Extension

See [adding apps](docs/ADDING_APPS.md). Public work content lives in `src/lib/content.js`.
