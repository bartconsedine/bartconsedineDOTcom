# Private Prisma migration handoff — 10 October 2026

- Added a separate password-only migration launcher with hidden input, explicit project/action and recovery-readiness confirmations, read-only state inspection, safe fixed diagnostics, and credential cleanup. It never inherits the existing private launcher's secret or exposes an enrollment/reset action.
- The launcher calls the same guarded baseline/deploy functions as the existing CLI. Both take a new verified logical backup before writing; baseline adoption records only the already executed base. Failed, rolled-back, unexpected or already-complete state prevents an inappropriate write.
- Protected backup-directory validation checks absolute real directory, exact 0700 mode, current-user ownership, no repository ancestry and no temporary tree. The prepared home directory is outside Documents; no existing permissions were changed. No production archive was read by this task.
- `npm run db:validate`, all 46 tests and `npm run build` passed. Prisma's cache update required normal local filesystem escalation; validation succeeded afterward. Synthetic PTY tests verify hidden password input, cancellation before database commands, echo restoration and cleanup.
- Disposable PostgreSQL 17 drill passed baseline validation, failed-backup write prevention for adoption and deploy, first-adoption state transitions, fresh/incremental migrations, backup, restore and restored RLS/grants/data. No hosted credential or production data was used.
- The parent reported a successful user-operated hosted baseline check. A hosted backup, Prisma adoption/deploy, completed platform recovery point, Google provider configuration and administrative enrollment remain unconfirmed here. The auth checklist documents the exact required server variable names and callback URLs without reading hosted values.

---

# Official database CA fix — 9 October 2026

- Default Node trust reproduced `SELF_SIGNED_CERT_IN_CHAIN` against the approved Direct host. An unauthenticated SSLRequest handshake using the revised shared policy succeeded with TLS 1.3 at 22:35:49 UTC; a deliberately wrong hostname failed with `ERR_TLS_CERT_ALTNAME_INVALID`. No password, PostgreSQL startup/authentication message, or SQL was sent.
- Bundled Supabase Root 2021 CA was obtained from the official Studio-configured HTTPS download and pinned by PEM SHA-256. Its provenance, certificate fingerprint, validity and rotation procedure are in the [database runbook](DATABASE_MIGRATIONS_AND_BACKUPS.md#bundled-hosted-database-trust). No global or OS trust configuration changed.
- All three clients receive the same CA with their strict verification settings. Regression tests cover absent/altered bundled trust, consistent client options, explicit overrides, unchanged loopback behavior and safe CA diagnostics.
- `npm ci` reports zero vulnerabilities. `npm run db:validate`, all 40 tests, and `npm run build` pass. The isolated PostgreSQL 17 drill passes baseline validation, fresh and incremental migrations, logical backups, restore, and restored RLS/grants/data checks.
- Hosted authentication, SQL access, backup, migration and enrollment remain unverified by this fix. Session pooler TLS was not separately probed. Public TLS verification does not establish password correctness.

---

# Database connection hardening — 9 October 2026

- Shared connection policy is used by both database tooling and direct Prisma configuration. Hosted Prisma URLs are normalized to `sslmode=require&sslaccept=strict`; `verify-full` is not passed to Prisma's native connector because it does not support libpq's mode names. All clients use the same reviewed bundled Supabase CA by default, or a consistent explicit absolute approved CA path. The bundled PEM integrity is checked before networking; strict certificate and hostname verification remains enabled.
- Subprocess environments use an OS-variable allowlist, then add only validated connection fields. Inherited PGHOSTADDR, PGSERVICE/PGSERVICEFILE, PGOPTIONS, SSL/GSS options, alternate connection URLs, Node TLS overrides and Prisma engine overrides are excluded. `localhost` is pinned to `127.0.0.1`; hosted ports are restricted to 5432.
- 26 tests pass, including weak/duplicate TLS URL parameters, direct Prisma config normalization, CA consistency, and hostile subprocess-environment regressions. Prisma validation and the production build pass.
- The real local PostgreSQL baseline/backup/restore drill also passed with poisoned PGHOSTADDR, service-file, SSL and search-path variables inherited by the test process. Restored data isolation and table/ledger restrictions still pass. No hosted connections or writes were used for these tests.
- No public UI/design or runtime authentication behavior changed in this hardening commit. Code-only deployment remains fail-closed until the hosted membership migration/configuration/enrollment is completed separately. Parent final review is required before coordinating the authorized merge/release.

---

# Prisma adoption and backup verification — 9 October 2026

This section supersedes migration-path and no-dependency-change statements in the prior two-admin verification below.

- Read-only hosted inspection confirmed PostgreSQL 17.11, Pro organization, only the original `private_workspace` migration, and matching base tables/security. Captured `prisma/baseline-state.json` from real catalog data. No hosted writes were made by this code task.
- Pinned stable Prisma 7.10.0 (npm `latest` was an 8.0 release candidate). Added migration-only tooling; no Prisma runtime client or elevated database access in the website. Patched CLI transitive dependencies with exact overrides (`deepmerge-ts` 8.0.2, `mysql2` 3.24.5); `npm audit` reports zero vulnerabilities.
- `npm test`: 22 tests pass. `npm run db:validate`: passes. Production build: passes. Existing authorization/RLS tests now consume the sole Prisma migration history.
- Real local PostgreSQL 17 recovery drill passed: exact hosted baseline comparison, intentional RLS-drift rejection, baseline-only Prisma resolve, incremental deploy, fresh deploy, status checks, three logical snapshots, corrupt-manifest rejection, occupied-target rejection, and isolated restore. Restored migration history, both admins' individual rows, membership RPC and private-table denial were checked. No production data was used.
- Prisma ledger is forced into `private._prisma_migrations`, with explicit RLS and revoked client privileges in the pending migration. Branch deployment remains disabled; no hosted schema/app release occurs from this review branch.
- Hosted connection credentials, a protected production backup destination, and completed Supabase backup inventory remain unavailable. Pro's documented seven-day daily-backup entitlement is not evidence of a completed snapshot. Hosted baseline/deploy and hosted recovery are still unexecuted and unverified.

See [migration and recovery runbook](DATABASE_MIGRATIONS_AND_BACKUPS.md) for exact commands and restrictions.

---

# Two-admin code verification — 9 October 2026

This section supersedes the historical single-owner notes below. Based on deployed commit `1a19e22`, implemented in an isolated worktree on `codex/two-admin-access` without modifying the original checkout.

- `npm test`: 20 tests, including actual PostgreSQL migrations/RLS/grant checks in PGlite, both approved Google accounts, missing/expired/forged sessions, metadata spoofing, membership failure/revocation, verified identity mismatch, per-admin CRUD isolation, legacy migration preservation, and atomic administrative enrollment.
- `npm run build`: passes on Node 22.23.2, Next.js 16.4.0. No dependency changes.
- Local production HTTP checks without credentials: `/` and `/login` return 200; `/admin` and `/admin/apps/test` redirect 307 to unconfigured login; registry and per-app APIs return 503 with only `{"error":"unconfigured"}` and private/no-store headers. No browser was used.
- Both protected page/API guards and OAuth callback use server-verified `getUser()` then the session-scoped `is_site_admin` RPC. No owner UUID environment bootstrap is required. Provider identity data, not editable user metadata, must contain a matching email and boolean verification.
- Private membership is limited to the two requested addresses, keyed by verified UUID; RLS is enabled/forced with no client table grants. The SECURITY DEFINER lookup is in unexposed `private`, has a fixed empty search path, checks `auth.uid()`, and accepts no caller-supplied identity. The public RPC is SECURITY INVOKER, authenticated-only, and returns a boolean. Per-user app data remains isolated with USING and WITH CHECK.
- `vercel.json` disables Git deployments only for this review branch, using [Vercel's documented branch switch](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled). Coordinate release with the parent task; no merge/deployment is part of this work.
- Hosted migration, hosted advisor results, Data API schema exposure, real Google OAuth/callback/cookie behavior, and both actual Auth UUIDs remain pending. No hosted configuration, credentials, membership, or browser state were changed.

---

# Verification and access, 9 October 2026

## Current framework, private app hub and responsive verification

- Official npm registry checked directly: `next@latest` is 16.4.0, `react@latest` and `react-dom@latest` are 19.3.0. Before → after versions remain 16.4.0 → 16.4.0 and 19.3.0 → 19.3.0 because the rebuild already uses the latest stable versions. Installed packages and lockfile match. Canary 16.5.0-canary.5 was not installed.
- Reviewed official guidance at https://nextjs.org/docs/app/guides/upgrading and https://nextjs.org/docs/app/guides/upgrading/version-16. Existing App Router code already awaits params/cookies and uses `proxy.js` and Turbopack. No migration or check suppression was needed.
- Next requires Node >=20.9; installed Supabase 2.117.3 requires >=22. Added `engines.node: 22.x` to manifest/lockfile and `.nvmrc` for tested Node 22.23.2. Vercel runtime was not changed. Preserved legacy favicon at the same URL by moving it to `public/static/favicon.ico`.
- Registry now validates unique safe slugs, required component/metadata and supported handlers. Both registry lookup operations independently authorize. The authenticated sidebar lists installed apps and marks the active page. The empty registry remains empty; test fixtures are not registered or shipped as apps.
- Added `/api/admin/apps/[slug]`: default GET exposes safe metadata only, registered GET/POST handlers require owner verification, POST requires the exact configured origin, and responses override public caching with private/no-store. Errors do not reveal internal details. Unknown registered-app lookups and unsupported writes are denied. Page and data helpers keep their independent checks and PostgreSQL RLS.
- 17 automated tests pass, including 8 new registry/API regression tests, existing Google owner policy tests and actual PostgreSQL RLS integration. Production build passes with the new route. `next start` smoke checks: public/login 200; admin and per-app pages 307 to unconfigured login; registry and per-app GET/POST APIs 503 with only `{"error":"unconfigured"}` and private/no-store headers.
- Production preview checked in Bart's Chrome at 320×844, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1440×900, 1920×1080 and 844×390 landscape. Public and login document widths match all nine viewports. No broken portrait images; portrait retains 1:1 natural proportions with contain sizing. Desktop/tablet/mobile/full-page screenshots inspected, including biography and work sections. No horizontal clipping observed.
- Increased public navigation, links and project disclosures to at least 44px high; login button measures 47–50px. Admin navigation wraps and marks active routes; its content column can shrink. Keyboard Tab reveals the skip link with a visible solid focus outline. Reduced-motion emulation verifies `scroll-behavior:auto` and zero-duration link transitions. Temporary viewport and media overrides reset afterward.
- Limit: these are Chrome viewport checks, not physical-device or cross-browser testing. Authenticated admin UI and live OAuth/database access remain unverified until Supabase setup. No authentication bypass was added for visual testing. Supabase sign-in approval and first custom app choice remain outstanding. Approved public design/copy are preserved.

Final production screenshots: desktop `libfile_6ab765c141b4819193e9101866ad55b4`, mobile `libfile_6d7e7186cebc8191bfb7a66cb94df8e2`. Full local QA captures are in `../screenshots/responsive/`.

## Latest editorial redesign

The public page now uses a large name masthead, a three-line role statement with the exact approved text, and a larger transparent portrait aligned to the hero's bottom rule. The biography has a larger lead paragraph with a restrained left section column. Earlier work is four aligned company/role/description rows with native expandable details; filters, card backgrounds, badge-like tags, duplicate hero labels and generic section slogans were removed. Contact uses a large email link and two direct contact methods. A scoped `portfolio.css` keeps these changes separate from login/admin styling.

Verified in Bart's Chrome browser at 1473px, 390px and 320px. No horizontal overflow; the full head is visible and the 320px portrait renders at 280 × 280 with `object-fit:contain`. Zero broken images. Project details open and close correctly. Four source-grounded work entries remain. Programmatic comparison confirms all three approved biography paragraphs are unchanged. Rendered hero text is exactly “Leading AI Engineering at Magnite”; no “Barton” remains in rendered public copy. Primary text contrast is 15.67:1 and secondary text is 8.02:1 against the public background. All nine auth/RLS tests pass, final production build passes, and `git diff --check` passes. No auth implementation or hosted settings changed.

Latest screenshots, all new Library items at version 0:

| View | Library ID |
|---|---|
| Editorial desktop hero | `libfile_d33c02553bb48191a8c441b07a9bb698` |
| Editorial mobile hero | `libfile_ce3e510aa6b88191812b07578223e1f1` |
| Editorial full desktop page | `libfile_d3bc0d78c28c81919478fa09bb9f025a` |
| Editorial full mobile page | `libfile_ec9fd296b1348191ab7da438d417130a` |

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

Portrait update: the built-in image generation edit tool removed the background into `public/images/headshot-cutout.png`; the original `headshot.jpeg` remains unchanged. PNG inspection confirms 1254 × 1254 pixels, an alpha channel, 755,337 fully transparent pixels, and 17 transparent rows above the first visible pixel. The cutout was visually compared with the source for face, hair, pose and shirt continuity; it is an AI-edited derivative, not a pixel-identical masked original.

The hero now renders at the asset's natural aspect ratio using `height:auto` and `object-fit:contain`, with no fixed crop. Actual Chrome screenshots at desktop, 390px and 320px show the complete head. Mobile image dimensions are 350 × 350 and 280 × 280, respectively, and document width equals viewport width in both cases. All nine tests and the production build pass after this update.

| Latest portrait deliverable | Library ID |
|---|---|
| Desktop with transparent cutout | `libfile_404645cf05e08191bec68bfc649f57f7` |
| Mobile with complete head | `libfile_6421aea8ea648191aed5611108a0b495` |
| Transparent PNG asset | `libfile_9a4d625afa888191aee250382f0d2677` |

Image edit prompt (built-in tool, `transparent_background: true`):

> Use case: background-extraction. Edit target: the provided photograph of Bart Consedine. Remove ONLY the plain background to genuine alpha transparency, preserving the exact photographed man, face, expression, hairstyle including every part of the top of the hair, ears, skin texture, beard, shirt pattern, body, pose, and colors. Do not beautify, redraw or reinterpret his identity. Preserve the complete original square framing and all visible torso, with clear transparent space above the entire head. Clean natural hair edges, no halo, no backdrop, no added shadows, no text. This is a faithful photographic cutout for a personal website; output transparent PNG.

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
