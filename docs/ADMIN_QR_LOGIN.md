# Full admin QR sign-in (prepared, disabled)

This change is a new full-admin flow at `/login/qr`, approved and managed at
`/auth/qr`. It does not widen, migrate, or upgrade existing `/tv` read-only grants.
The normal Google login and all owner isolation, membership and privileged-action
checks remain in force. A TV browser receives the approving account's full website
admin access: private apps, data writes, sharing and other ordinary admin actions.
It does not gain access to another admin's private records. Anyone using that TV
browser can act as the approving admin. Staying signed in does not run jobs.
Calendar still uses its separately acquired online Google access; this flow adds
no Calendar scopes, provider refresh token, worker, or Robot Party activation.

## Sessions and approval

1. On the target device, open `/login/qr`, name the device, and generate a request.
   Sign out of an existing session first. The server generates independent random
   256-bit target and approval identifiers and a Google PKCE challenge. The target
   verifier stays in its HttpOnly, Secure production SSR cookie. The target secret
   is HttpOnly/SameSite Strict and scoped to `/api/admin-qr`; hashes are stored in
   private Postgres. Neither credential appears in the QR.
2. Scan the QR on an already signed-in approved admin phone. It contains only the
   ten-minute approval identifier, not an admin token, verifier or reusable login
   URL. Verify the untrusted browser-supplied device name and matching eight-digit
   request code. The phone displays its verified account, full access and expiry.
   Approval requires an explicit same-origin POST. Decline or target cancel
   invalidates the request. A different account cannot finish an approved relay.
3. After approval, the phone completes the existing Google OAuth flow, choosing
   the **same account**. This does not exchange tokens on the phone or replace its
   existing session. The dedicated callback validates that signed-in phone and
   relays the one-use authorization code into the private request row.
4. The target polls its own request, atomically claims the code, and exchanges it
   with its local PKCE verifier. Code and token values never enter JavaScript
   responses. All new Auth cookies are staged server-side until the returned Auth
   user matches the approving owner and a live Google/admin check records the
   new session ID. Wrong-account or failed exchanges discard staged cookies,
   attempt local Auth sign-out and cancel the request. A lost response may require
   starting over; no phone session is copied. Concurrent claims have one winner.

Approval requests expire after ten minutes (Google authorization codes can expire
sooner). A successful device session has an absolute **30-day website grant** from
completion, independent of normal short-lived access-token rotation. It cannot
renew itself. At expiry, sign in with Google or repeat explicit phone approval.
Normal Supabase refresh rotates tokens within the same session ID. Cookie lifetimes
are bounded at issuance; the authoritative database deadline applies even if the
proxy later refreshes cookies. Supabase project inactivity/session limits may end
a session earlier. No new Auth method or service-role/signing key is required.

## Revocation, sign-out and recovery

Use **Manage admin devices** in the admin sidebar, or open `/auth/qr` from a signed-in
admin phone. Revoke the named device. Only the approving owner can list/revoke its
grants. Revocation and expiry are checked by `private.is_site_admin()` and
`private.current_google_email()`, covering route guards, grants, app RLS and the
app-specific operations built on those helpers. Checks include presence of the
registered session in `auth.sessions`. Ordinary Google sessions are unchanged.
The target's Sign out first revokes its own QR grant, then performs Supabase local
sign-out; it leaves the phone and other devices signed in. Removing enrollment or
verified Google identity also denies access immediately.

The website grant is revoked immediately for new database operations; an already
in-flight request may finish. Supabase access JWTs themselves remain cryptographically
valid until normal expiry. Remote revocation does not call an Auth admin API or
promise to invalidate tokens at external services. Refreshing a token cannot restore
website access because the revoked session ID remains denied. Preserve expired and
revoked session tombstones: deleting them would remove that deny rule. The private
rows intentionally survive site-admin membership removal; account deletion may
cascade them because the corresponding verified Auth user then no longer exists.

For a lost TV or a failed sign-out, revoke from the phone. For expired/failed/wrong
Google account flows, cancel and generate a new target request. For a phone that is
signed out, use normal approved Google sign-in and return to the approval page.
Never share screenshots or URLs containing Google callback codes, log request
bodies/cookies or copy provider tokens into chat. Existing read-only TV screens
remain managed separately at `/auth/tv`.

## Activation plan — exact action-time approval required

No hosted change or live grant is authorized by this prepared code. Keep
`ADMIN_QR_ENABLED=false` (the default) in production and previews until the parent
obtains confirmation for this exact 30-day, full-admin implementation and TV scope.

1. Review the final draft PR, migration checksum and exact-head CI. Inspect the
   current production ledger/pending set; coordinate with concurrent ticker work.
   Do not activate draft PR25 Robot Party chat.
2. After explicit hosted-schema approval, run the existing protected cloud Prisma
   workflow with the full reviewed plan and its verified encrypted pre-write
   backup/recovery prerequisites. Apply only the reviewed pending set. Never use
   direct connector SQL, bypass pins, edit applied history or skip the backup.
   The new migration adds a private RLS table, a narrowly guarded relay RPC and
   session checks to existing authorization helpers. It does not enroll admins.
3. Inspect the current Supabase redirect allowlist read-only. Verify it permits
   `https://bartconsedine.com/auth/qr/relay?request=<43-character identifier>` using
   the existing Google provider and PKCE. If a configuration change is needed,
   obtain exact approval for that callback only (for example a narrowly scoped
   `/auth/qr/relay?request=*` pattern supported by Supabase), rather than a site-wide
   wildcard. No new credentials, provider scopes or Auth methods are part of this
   rollout. The actual hosted redirect matching remains unverified.
4. Obtain confirmation to release the reviewed commit and enable
   `ADMIN_QR_ENABLED=true` for the intended production deployment. Record rollback
   commit/deployment. Configuration/release and any actual device grant remain
   gated separately; do not create a live grant as a mere smoke test.
5. With explicit approval to grant the named test device access, use real phone
   and target browser sessions for both approved admins. Verify distinct session
   IDs, unchanged phone session, matching Google identity, ten-minute expiry,
   wrong account, cancellation, repeated approvals, racing polls, reload persistence,
   owner isolation and normal privileged actions. Revoke the test device and prove
   protected routes **and direct Supabase RPC/table operations** deny the old session
   while the phone still works. Test device-only sign-out. Record actual evidence;
   local fixtures are not evidence that this hosted Google flow works.

Rollback: disable new QR issuance, revoke existing grants from `/auth/qr` (revocation
remains available when issuance is off), and retain the session-check migration and
tombstones. Do not roll back to application code that ignores those database checks
or drop the table. If a database rollback is required, coordinate the existing
protected restore workflow and stop affected access first. Normal Google login is
available for recovery. No background job or automation is created by this feature.

## Validation boundaries

`tests/admin-qr.test.js` covers API/PKCE URL validation, feature gates, CSRF, session
fixation, wrong-account exchange and withholding cookies until completion.
`tests/admin-qr-rls.test.js` runs the actual migration/relay/RLS flow with two admins
and a guest, including one-time claim, expiry, cancellation, owner-scoped writes,
remote revoke, identity/membership loss and device-only sign-out. Existing TV suites
exercise unchanged limited grants. The guarded local recovery drill now restores
an admin QR session and proves its private table denial and post-restore revocation.
Live OAuth, real device browser behavior and hosted security advisors remain required
activation checks. Official session and PKCE references:
https://supabase.com/docs/guides/auth/sessions
https://supabase.com/docs/guides/auth/sessions/pkce-flow
