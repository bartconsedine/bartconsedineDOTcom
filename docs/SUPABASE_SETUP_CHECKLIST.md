# Two-admin setup handoff

Prepared 9 October 2026 for coordinated review with the original website setup task. This code task did not change hosted settings, create credentials, enroll anyone, merge, or deploy. The parent separately applied the base migration; Prisma now manages all subsequent migrations. See [Prisma and backups](DATABASE_MIGRATIONS_AND_BACKUPS.md).

## Known target and scope

The healthy project is `vgsmfbupgydafvotkold` in Pro organization `owgnktyhtvbdainnnhug`. Read-only inspection now confirms only the original base migration is applied: `private.site_owner` and `public.app_data` exist, with no two-admin table. The parent confirms both are empty and no admin is enrolled. Do not replay the base migration or mark the second one applied.

Only `bartconsedine@gmail.com` and `mjshah8@gmail.com` can be enrolled. Both need an independently verified Auth UUID. There is no first-user admin, email-only auto-enrollment, browser enrollment endpoint, or service-role key in the application. Each admin owns separate `app_data` rows; membership does not grant access to the other admin's records.

## Coordinated setup order (not executed)

1. Follow the [Prisma adoption and pre-migration backup procedure](DATABASE_MIGRATIONS_AND_BACKUPS.md): verify the captured baseline, create a protected logical backup, record only `0_private_workspace` using Prisma's guarded baseline command, then use the guarded `db:deploy` command for the pending two-admin SQL. Never run these files directly through the Supabase connector/SQL editor. The second migration preserves any explicitly enrolled legacy owner when upgrading; it does not auto-enroll Auth users.
2. Keep `private` out of the Data API exposed schemas. The application calls only `public.is_site_admin()` and `public.app_data`. `authenticated` has schema USAGE and EXECUTE on the private lookup, but no privileges on its table. The privileged function is in `private`; its public wrapper is SECURITY INVOKER, accepts no arguments, and returns only the current session's membership boolean. `anon`/PUBLIC cannot execute either function. Both tables have RLS; app data retains SELECT/INSERT/UPDATE/DELETE grants plus per-user USING and WITH CHECK policies.
3. Coordinate provider setup separately: approved Google OAuth web client, standard `openid`, email, profile scopes only; Supabase provider callback `https://vgsmfbupgydafvotkold.supabase.co/auth/v1/callback`. Do not create credentials or grant OAuth access as part of code review. Disable unused sign-in providers and anonymous sign-in for the intended Google-only flow. If Google consent is in Testing, both intended users must be allowed test users during the separately approved provider setup.
4. Configure exact website callbacks in Supabase: `https://bartconsedine.com/auth/callback`, local `http://127.0.0.1:3000/auth/callback` only if needed, and only explicitly approved preview URLs. Set the corresponding Site URL. Avoid wildcard callbacks.
5. Configure the server environment with `SUPABASE_URL=https://vgsmfbupgydafvotkold.supabase.co`, its publishable key, and `SITE_URL` for that environment. No `OWNER_USER_ID` or `OWNER_EMAIL` is used. No dummy owner UUID is needed. Do not add service-role/secret keys or NEXT_PUBLIC authorization settings. Migration, environment changes, and deploying the reviewed code must be coordinated; the old deployment cannot authorize against the new membership schema.
6. After the reviewed code/provider setup is authorized and available, each person signs in with their Google account once. Auth can establish their identity without any enrollment, but the callback denies admin access and signs out the local session. This is expected. Their Auth record remains available for administrative review.
7. Inspect the resulting Auth records administratively using the query below. Verify the actual person/account, exact UUID, confirmed user email, provider `google`, matching identity email, and boolean `email_verified=true`. Do not use `raw_user_meta_data`, profile display names, JWT role metadata, or email lookup alone to authorize.
8. Replace both UUID placeholders in `supabase/admin/enroll_two_admins.sql` with the reviewed UUIDs, review the exact SQL, and execute only when enrollment is authorized. The script independently rechecks both identities and atomically aborts unless both match. It can be rerun with the same UUIDs. A different UUID for an already enrolled email fails the unique constraint; investigate rather than silently replacing a member.
9. Have each person sign in again. Complete the live acceptance checks below before treating the workspace as ready. No deployment or hosted migration is authorized by this checklist itself.

## Identity inspection SQL

Run as the database administrator, not through a browser session:

```sql
select u.id, u.email, u.email_confirmed_at, u.is_anonymous,
       i.provider, i.identity_data ->> 'email' as google_email,
       i.identity_data -> 'email_verified' as google_email_verified
from auth.users u
join auth.identities i on i.user_id = u.id
where lower(u.email) in ('bartconsedine@gmail.com', 'mjshah8@gmail.com')
order by u.email, i.provider;
```

Enrollment SQL is kept separately from migrations in [enroll_two_admins.sql](../supabase/admin/enroll_two_admins.sql). No real UUIDs or credentials are committed.

## Revocation

As database administrator, delete the reviewed membership row. For example, revoke the second admin with:

```sql
delete from private.site_admin where email = 'mjshah8@gmail.com';
```

The next protected server request and database operation recheck membership. App data remains under its original user UUID. Sign-out/revoking refresh sessions alone does not instantly invalidate already issued access JWTs; membership removal is the immediate authorization revocation mechanism. Auth user deletion cascades to membership and that user's app data, so do not delete users merely to revoke admin access.

## Live acceptance checks (pending)

- Both approved Google accounts reach `/admin` after enrollment and are denied beforehand. Login no longer greets every admin as Bart.
- Missing/expired/forged sessions fail on protected pages, registry/per-app APIs, and data helpers. Auth and membership lookup outages fail closed.
- A third Google user, even with edited `user_metadata`, cannot access admin, private tables, or app data or enroll themselves. Auth signup may still create an unprivileged user record.
- Through direct Data API requests, both admins can CRUD only their own disposable app-data rows. Cross-user SELECT returns none; spoofed INSERT/reassignment UPDATE fails; cross-user UPDATE/DELETE changes nothing. Anonymous users cannot call membership or access data.
- Verify the hosted private schema exposure, grants, RLS, and Supabase advisors. Private table privileges remain revoked; no exposed SECURITY DEFINER lookup is needed.
- Removing membership, changing confirmed email, removing Google identity, or mismatching/unverifying Google identity denies subsequent access. Restore only reviewed test changes.
- Validate real PKCE code exchange, malformed/reused callbacks, cookie refresh, logout, exact-origin mutation protection, no-store responses, and public-site access without login.

Local tests use PGlite PostgreSQL with a minimal Auth fixture. They exercise actual migrations, SQL privileges, policies, and enrollment SQL, but do not substitute for hosted Auth/PostgREST/advisor verification.

References checked: [Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), [server-verified getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [identities](https://supabase.com/docs/guides/auth/identities), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). The current changelog was inspected; no relevant new Auth/SSR breaking change requires a dependency update here.


## Disabled Google button: configuration check

The “Sign-in setup is pending” state means `authConfig()` rejected the deployed server environment before trying Google. Check these variable **names** in the production Vercel environment without exposing secret values:

| Server setting | Required production value |
| --- | --- |
| `SUPABASE_URL` | `https://vgsmfbupgydafvotkold.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | This project's existing publishable key; never a secret/service-role key |
| `SITE_URL` | `https://bartconsedine.com` |

At least one is absent or invalid when the button is disabled; the public page does not identify which. These are server-only names in this application, not `NEXT_PUBLIC_*`. Both URLs must use HTTPS in production. A normal redeployment is needed after an approved environment update. `OWNER_EMAIL` and `OWNER_USER_ID` are obsolete.

Once the config is valid, Google still needs an approved Web OAuth client, JavaScript origin `https://bartconsedine.com`, Google redirect URI `https://vgsmfbupgydafvotkold.supabase.co/auth/v1/callback`, and its client ID/secret configured in the Supabase Google provider. Supabase's Site URL is `https://bartconsedine.com`; the allowed application callback is `https://bartconsedine.com/auth/callback`. Use only standard `openid`, email and profile scopes. If consent remains in Testing, both intended accounts need approved test-user access. Creating persistent OAuth credentials or granting that access requires separate action-time confirmation. These checks do not create admin membership.

This assessment used source code and the official Google-provider documentation on 10 October 2026. It did not inspect or modify hosted environment values, browser state, OAuth credentials, or provider configuration.
