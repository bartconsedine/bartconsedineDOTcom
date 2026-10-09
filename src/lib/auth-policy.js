// Pure authorization policy; invoked only with a server-verified Supabase user.
export function ownerDecision(user, ownerId, ownerEmail) {
  if (!ownerId || !ownerEmail) return { ok: false, status: 503, reason: 'unconfigured' };
  if (!user) return { ok: false, status: 401, reason: 'unauthenticated' };
  if (user.id !== ownerId || !user.email_confirmed_at || user.is_anonymous || user.email?.toLowerCase() !== ownerEmail.toLowerCase() || !user.identities?.some(identity => identity.provider === 'google')) {
    return { ok: false, status: 403, reason: 'forbidden' };
  }
  return { ok: true, user };
}

export async function verifyOwner(auth, ownerId, ownerEmail) {
  if (!ownerId || !ownerEmail || !auth) return { ok: false, status: 503, reason: 'unconfigured' };
  try {
    // Never authorize using getSession(), client state, or user-editable metadata.
    const { data, error } = await auth.getUser();
    if (error) return { ok: false, status: error.status >= 500 ? 503 : 401, reason: error.status >= 500 ? 'unavailable' : 'unauthenticated' };
    return ownerDecision(data?.user, ownerId, ownerEmail);
  } catch {
    return { ok: false, status: 503, reason: 'unavailable' };
  }
}
