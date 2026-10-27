// The owner must already be verified with Auth and live workspace membership.
export function matchesGoogleOwner(owner, profile) {
  const identity = owner.identities?.find(i => i.provider === 'google');
  const subject = identity?.identity_data?.sub ?? identity?.provider_id ?? identity?.id;
  return !!profile.sub && profile.sub === subject && profile.email_verified === true && profile.email?.toLowerCase() === owner.email?.toLowerCase();
}
