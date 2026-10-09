import 'server-only';

export function authConfig() {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, OWNER_USER_ID: ownerId, OWNER_EMAIL: ownerEmail, SITE_URL: siteUrl } = process.env;
  if (!url || !key || !ownerId || !ownerEmail || !siteUrl) return null;
  try {
    const site = new URL(siteUrl);
    const provider = new URL(url);
    if (!['http:', 'https:'].includes(site.protocol) || !['http:', 'https:'].includes(provider.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && (site.protocol !== 'https:' || provider.protocol !== 'https:')) return null;
    return { url, key, ownerId, ownerEmail, siteUrl: site.origin };
  } catch { return null; }
}

export const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };
