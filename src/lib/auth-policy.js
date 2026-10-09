// Only call with a user returned by the Auth server, never cookie/client metadata.
export function googleIdentityDecision(user) {
  if (!user) return { ok: false, status: 401, reason: 'unauthenticated' };
  const email = user.email?.toLowerCase();
  if (!user.id || !email || !user.email_confirmed_at || user.is_anonymous ||
      !user.identities?.some(identity => identity.provider === 'google' &&
        identity.identity_data?.email_verified === true &&
        identity.identity_data?.email?.toLowerCase() === email)) {
    return { ok: false, status: 403, reason: 'forbidden' };
  }
  return { ok: true, user };
}

export async function verifyAdmin(client) {
  if (!client) return { ok: false, status: 503, reason: 'unconfigured' };
  try {
    // getUser validates with Auth; getSession and user_metadata cannot authorize.
    const { data, error } = await client.auth.getUser();
    if (error) return { ok: false, status: error.status >= 500 ? 503 : 401, reason: error.status >= 500 ? 'unavailable' : 'unauthenticated' };
    const identity = googleIdentityDecision(data?.user);
    if (!identity.ok) return identity;
    // Uses this user's session. The RPC accepts no UUID/email from the caller.
    const membership = await client.rpc('is_site_admin');
    if (membership.error) return { ok: false, status: 503, reason: 'unavailable' };
    if (membership.data !== true) return { ok: false, status: 403, reason: 'forbidden' };
    return identity;
  } catch {
    return { ok: false, status: 503, reason: 'unavailable' };
  }
}
