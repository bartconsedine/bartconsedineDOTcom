import 'server-only';

export function authConfig() {
  if (process.env.AUTH_PROVIDER === 'cognito') {
    const { COGNITO_POOL_ID: poolId, COGNITO_CLIENT_ID: clientId, COGNITO_DOMAIN: domain,
      SITE_URL: siteUrl } = process.env;
    if (!/^[a-z0-9-]+_[A-Za-z0-9]+$/.test(poolId || '') || !/^[a-z0-9]+$/.test(clientId || '')) return null;
    try {
      const region = poolId.split('_')[0];
      const hosted = new URL(domain), site = new URL(siteUrl);
      if ([hosted, site].some(u => u.protocol !== 'https:' || u.href !== u.origin + '/')) return null;
      if (!hosted.hostname.endsWith(`.auth.${region}.amazoncognito.com`)) return null;
      return { siteUrl: site.origin, url: 'https://bart-site-data.invalid', key: 'anonymous', cognito: {
        poolId, clientId, domain: hosted.origin, callback: site.origin + '/auth/callback',
      } };
    } catch { return null; }
  }
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, SITE_URL: siteUrl } = process.env;
  if (!url || !key || !siteUrl) return null;
  try {
    const site = new URL(siteUrl);
    const provider = new URL(url);
    if (!['http:', 'https:'].includes(site.protocol) || !['http:', 'https:'].includes(provider.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && (site.protocol !== 'https:' || provider.protocol !== 'https:')) return null;
    return { url, key, siteUrl: site.origin };
  } catch { return null; }
}

export const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };
