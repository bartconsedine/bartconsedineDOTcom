# Supabase setup handoff

Prepared 9 October 2026. This is a review checklist, not authorization to change a live account.

## Confirmed access state

- Supabase dashboard is signed out in Barton's Chrome browser, MGNI profile.
- Login page offers GitHub (marked **LAST USED**), ChatGPT, SSO, and email/password. No Google dashboard-login option is displayed. Dashboard login is distinct from this website's Google sign-in provider.
- GitHub browser sign-in previously showed an empty username/password form. The authenticated `gh` CLI does not prove the browser is signed in, and its token must not be copied into browser login.
- No Supabase CLI, project binding, `supabase/config.toml`, or `.env.local` was found in the new site workspace. Only the newly prepared migration and blank configuration template exist.
- The existing Vercel project has no project environment variables. Supabase organization, project, plan, Google provider, and free-project capacity remain unknown.

## Smallest next approval

Ask permission to use the **last-used GitHub option to sign into the existing Supabase account and inspect projects**. The login page displays Supabase Terms of Service and Privacy Policy agreement language. Do not treat the earlier Vercel Google grant as authorization for Supabase. Stop at any new OAuth permission screen to quote its actual requested permissions before approval, or hand off an unavailable password/MFA step. Do not create another Supabase account.

Sign-in page: https://supabase.com/dashboard/sign-in

## Read-only inventory after sign-in

Record only non-secret metadata:

1. Account/organization identity, plan, role, active project count, available Free-plan capacity.
2. Any project clearly intended for bartconsedine.com; project reference, region, status, and current usage by other apps.
3. Authentication Google provider enabled/disabled, configured redirect origins, and owner Google user presence. Never reveal provider secret fields.
4. Existing schemas/tables, RLS status, owner-related records, and migration history for collisions with `private.site_owner`, `public.is_site_owner()`, and `public.app_data`.
5. Whether an existing Google Cloud web OAuth client is dedicated to this project. Do not modify an unrelated application's OAuth client, provider settings, tables, or policies.

Reuse only a project confirmed as intended for this site. Do not apply this migration blindly to a shared project.

## Concrete configuration to review together

Once the actual project and organization are identified, present one bounded setup plan with the following named actions and exact destinations. Later consent screens and new credential creation still need their required action-time approval.

| Change | Exact intended scope |
|---|---|
| Project | Reuse the confirmed site project, or create one dedicated project only if the UI confirms Free plan and $0 incremental recurring cost. Record organization, region and name first. Stop if payment, plan upgrade, or added compute charges are shown. |
| Google OAuth | Reuse the dedicated web client if appropriate; otherwise create a dedicated web OAuth client after approval. Scopes only `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`. These identify the user; no Gmail messages, Drive files, or Calendar access. |
| Google callback | Copy the selected Supabase project's exact Google-provider callback, normally `https://<verified-project-ref>.supabase.co/auth/v1/callback`. Do not confuse it with the website callback. |
| Supabase redirects | Local callback `http://127.0.0.1:3000/auth/callback`; production callback `https://bartconsedine.com/auth/callback` only when production configuration is approved. Add the exact Vercel preview callback only after a preview hostname exists and is approved. No wildcard allowlist. |
| Provider secret | Google Client ID and Client Secret belong in the selected Supabase Google-provider configuration. Use an approved secure credential handoff; never paste secrets into chat, reports, shell command arguments, Git, or screenshots. No service-role or personal-access token is needed by the site. |
| Database | Apply `supabase/migrations/202610090001_private_workspace.sql` after confirming no naming collisions. It adds owner enrollment and generic private app data, enables RLS, and seeds no records. Keep `private` outside the exposed API schemas. |
| Owner enrollment | After Barton's Google sign-in, verify `bartconsedine@gmail.com`, confirmed email, Google identity, and exact Auth UUID. Administratively insert that UUID in `private.site_owner`, and set the same UUID in `OWNER_USER_ID`. Another Google account must never self-enroll. |
| Local configuration | Privately populate `.env.local` with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OWNER_USER_ID`, `OWNER_EMAIL=bartconsedine@gmail.com`, and `SITE_URL=http://127.0.0.1:3000`. |
| Vercel configuration | Separate later approval: supported Node runtime for this project only, appropriate environment variables and HTTPS `SITE_URL`. No DNS change is expected. No deployment is authorized by account sign-in or backend setup alone. |

If owner provisioning requires an initial website login, configure a nonmatching UUID temporarily so authorization remains denied. Complete one Google authentication, inspect the resulting identity, then enroll the verified UUID. There is no first-user-becomes-admin behavior.

## Cost boundaries

Supabase publicly lists Free at $0/month with two active free projects, 500 MB database storage, and Google/social OAuth included. Free projects can pause after one week of inactivity. Eligibility is not yet verified for this account. The two-project limit spans organizations where the user is owner/admin. A paid organization cannot contain a Free-plan project; adding a project there may add compute charges. Do not promise a free project before inspecting the actual organization and creation screen.

Sources checked 9 October 2026:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/auth/social-login/auth-google

## Live acceptance checks before publication

1. Barton's approved Google identity reaches `/admin`; sign-out invalidates browser access.
2. Direct visits to `/admin`, `/admin/apps/<slug>`, and `/api/admin/apps` reject missing, invalid, expired, and non-owner sessions.
3. A non-owner Google sign-in may create an ordinary Auth record but gains no admin access or private rows.
4. Anonymous and non-owner requests directly to Supabase cannot read, insert, update, delete, spoof owner IDs, or enroll an owner. Test the actual hosted policies with disposable records, with permission, then remove only those test records.
5. Callback rejects bad/reused codes and does not honor external redirect destinations. Local and preview cookies remain private; production cookies are Secure.
6. Check live session refresh and logout; inspect logs without printing tokens or authorization codes.
7. Confirm public pages remain usable without sign-in and contain no private app data.

The current nine local tests and production build already pass. Hosted Google OAuth and hosted RLS are still unverified until this setup is approved and completed.
