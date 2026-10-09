# Verification and access, 9 October 2026

## Source and hosting

- GitHub: `bartconsedine/bartconsedineDOTcom`, main commit `d187ab5258af07cd1ab9f99decd9dc46820dca9a`. Authenticated CLI confirms admin/push/pull permissions.
- Vercel: authenticated in Barton's Chrome browser (MGNI profile) using the explicitly approved Google identity grant.
- Project: `https://vercel.com/bartconsedines-projects/bartconsedine`.
- Production deployment: `9yyBjPzZX7SNRYmvYEHR3Gemwipw`, Ready, created 17 April 2023, source main/d187ab5.
- Domains: `bartconsedine.com` and `bartconsedine.vercel.app`. Vercel DNS nameservers verified.
- Vercel project has no project environment variables configured. Its Node.js 16.x runtime is discontinued, so a supported runtime must be selected before new builds. No hosting configuration was changed.
- Supabase dashboard is signed out; no intended project or existing Google provider could be verified. No provider/project/credential/migration was created or changed.
- A Vercel email code was requested at 00:16 UTC before the approved Google flow completed. It is no longer needed. No code was exposed or used.
- Vercel displayed a separate model-improvement consent notice. It was not accepted or modified.

## Isolation

Work is in a separate clone on `codex/bio-app-hub`. Original source at `Documents/Documents - Barton’s MacBook Pro/GitHub/bartconsedineDOTcom` still has only its pre-existing deleted `.DS_Store` and `public/.DS_Store`. The other `bartconsedine` checkout's untracked files were not touched. No Git push, deployment, DNS modification, purchase, or new CLI token occurred.

## Checks

- Production build passed on Node 22.23.2 with Next.js 16.4.0 and React 19.3.0.
- Nine automated tests passed: eight auth-policy scenarios plus one real PostgreSQL RLS integration test using PGlite.
- Auth-policy tests cover valid owner, incomplete configuration, missing session, rejected expired/forged tokens, another Google user, metadata privilege spoofing, email mismatch, unverified/anonymous/non-Google identities, and provider outage.
- RLS test applies the actual migration to isolated Postgres with a minimal Supabase Auth schema. It verifies that no user can self-enroll, owner CRUD is allowed, anonymous and other Google users cannot read or write, owner-ID spoofing fails, unauthorized mutations do nothing, and Google-identity removal/email changes revoke access.
- Actual local HTTP checks: `/` and `/login` 200; `/admin` and `/admin/apps/example` redirect to unconfigured sign-in; `/api/admin/apps` returns 503 without credentials and no private data; malformed callback ignores an external `next` destination.
- Actual Chrome UI: desktop homepage and login inspected; homepage at 390px wide inspected with document width 390px and zero broken images. Growth filter shows two matching projects; details expand successfully.
- `git diff --check` passed.

## Limits

Google OAuth against a real Supabase project and live database RLS have not been tested. The authenticated dashboard was implemented but not bypassed to produce a misleading live-auth screenshot. Current screenshots show the actual public page and actual locked sign-in screen. Runtime/project setup and live auth tests are required before publication.

## Screenshot delivery

Files were saved to ChatGPT Library using the Library skill:

| Image | Library ID |
|---|---|
| Desktop homepage | `libfile_27b3d845f2108191835b672321617080` |
| Mobile homepage | `libfile_aa869e359ffc8191b80d810acee9f2e1` |
| Private Google sign-in | `libfile_0d94758d6ab881918e439a09137fd06e` |
| Full homepage with updated biography | `libfile_ba4b412ae03481918c7b016c0cf56455` (version 1) |

The public design uses cream `#f7f7ee`, forest green `#26352c`, lime `#e6ed9f`, Manrope/DM Sans, and Georgia italic accents. Work illustrations are decorative geometric CSS, not screenshots of the employers' products.
