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
- Actual Chrome UI: dark desktop homepage and login inspected; homepage and login at 390px wide inspected with document width 390px. Homepage has zero broken images. Engineering filter shows two matching projects; details expand successfully. Temporary viewport overrides were reset after inspection.
- Re-ran all nine tests and the production build after the dark design revision; both passed. Rendered biography matches the user's approved three paragraphs, with the requested change to “AI.”
- `git diff --check` passed.

## Limits

Google OAuth against a real Supabase project and live database RLS have not been tested. The authenticated dashboard was implemented but not bypassed to produce a misleading live-auth screenshot. Current screenshots show the actual public page and actual locked sign-in screen. Runtime/project setup and live auth tests are required before publication.

## Screenshot delivery

Latest copy correction: visible names, accessibility names, page title and metadata use “Bart.” The hero role is exactly “Leading AI Engineering at Magnite” with no subtitle beneath it. The approved biography is otherwise unchanged. Desktop and 390px mobile screenshots were inspected again, with no overflow and no remaining “Barton” in rendered homepage text. All nine tests and the production build passed again. Supabase sign-in remains unapproved and was not attempted.

Latest hero screenshots (new Library items, version 0):

| Image | Library ID |
|---|---|
| Bart desktop hero | `libfile_8f57b821cc308191b6a2cf05ffb87a0e` |
| Bart mobile hero | `libfile_021ec7eaaa4c8191b1d537701ce673fa` |

Files were saved to ChatGPT Library using the Library skill:

| Image | Library ID |
|---|---|
| Dark desktop homepage | `libfile_0456af2094c48191bd4a4f0c7d61dec9` |
| Dark mobile homepage | `libfile_6eee8e98bce481919023b077c2cf594c` |
| Dark private Google sign-in | `libfile_536aeaf03ec88191839d941b62a7a683` |
| Dark full homepage with approved biography | `libfile_00f8415072688191af687603578c463a` |

These are new Library items (version 0), preserving the earlier design screenshots. Local copies are in `../screenshots/barton-dark-*.jpg` and carry Library ID/version attributes.

The approved design direction is dark and minimalist: near-black `#0c0d0f`, panels `#121316`, white `#f2f2f3`, muted `#a5a6ad`, Manrope/DM Sans, a grayscale portrait, and simple bordered work cards. Decorative geometric artwork, serif accents, and the earlier cream/green palette were removed. Existing source-grounded work history is labeled “Earlier work.”
