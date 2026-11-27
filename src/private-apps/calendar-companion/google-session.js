import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { secureCookie } from '../../lib/cognito-oauth';
import { cookies } from 'next/headers';
import { matchesGoogleOwner } from './google-identity';
import { serverClient } from '../../lib/supabase';
import { authConfig, cookieOptions } from '../../lib/auth-config';
import { CalendarError, createGoogleClient } from './google-client';

import { CALENDAR_SCOPES } from './scopes';
export { CALENDAR_SCOPES } from './scopes';
// Authorization comes from the shared dispatcher and requireAdmin, never getSession.
// The verified Google identity must also own the provider credential used here.
const calendarToken = '__Host-bc-calendar-token';
const calendarFlow = '__Host-bc-calendar-flow';
export async function googleSession(owner) {
  let token;
  if (authConfig()?.cognito) token = (await cookies()).get(calendarToken)?.value;
  else {
    const { data } = await (await serverClient()).auth.getSession();
    token = data?.session?.provider_token;
  }
  if (!token) throw new CalendarError('Connect Google Calendar to read and save events.', 428);
  let profile;
  try {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new CalendarError('Google access expired. Reconnect Google Calendar.', 428);
    profile = await response.json();
  } catch (e) { if (e instanceof CalendarError) throw e; throw new CalendarError('Unable to verify Google access. Try again.'); }
  if (!matchesGoogleOwner(owner, profile)) throw new CalendarError('Reconnect with the Google account used for this workspace.', 403);
  return createGoogleClient(token);
}
export async function connectGoogle(owner) {
  const config = authConfig();
  if (!config) throw new CalendarError('Workspace sign-in is not configured.');
  if (config.cognito) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new CalendarError('Calendar connection needs configuration.', 503);
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
    (await cookies()).set(calendarFlow, [state, verifier, owner.id].join('.'), { ...secureCookie, maxAge: 600 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, response_type: 'code',
      redirect_uri: config.siteUrl + '/auth/calendar/callback', scope: 'openid email ' + CALENDAR_SCOPES,
      state, login_hint: owner.email, access_type: 'online', prompt: 'consent select_account', code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    return url.href;
  }
  const client = await serverClient();
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { scopes: CALENDAR_SCOPES, redirectTo: `${config.siteUrl}/auth/callback`, queryParams: { prompt: 'consent select_account', login_hint: owner.email, access_type: 'online' } } });
  if (error || !data?.url) throw new CalendarError('Could not start Google Calendar connection.');
  const destination = new URL(data.url), provider = new URL(config.url);
  if (destination.origin !== provider.origin || destination.pathname !== '/auth/v1/authorize') throw new CalendarError('Invalid sign-in destination.');
  (await cookies()).set('bc-calendar-return', 'calendar', { ...cookieOptions, path: '/auth/callback', maxAge: 600 });
  return data.url;
}

export async function completeCalendar(config, owner, params) {
  const jar = await cookies();
  const [state, verifier, expectedOwner] = (jar.get(calendarFlow)?.value || '').split('.');
  jar.set(calendarFlow, '', { ...secureCookie, maxAge: 0 });
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(verifier) ||
      owner.id !== expectedOwner || state !== params.get('state') || !params.get('code')) throw new CalendarError('Calendar consent expired.', 403);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code: params.get('code'), code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: config.siteUrl + '/auth/calendar/callback' }),
  });
  if (!response.ok) throw new CalendarError('Google Calendar consent failed.', 403);
  const tokens = await response.json();
  const scopes = new Set((tokens.scope || '').split(' '));
  if (!tokens.access_token || !CALENDAR_SCOPES.split(' ').every(s => scopes.has(s))) throw new CalendarError('Calendar permissions are incomplete.', 403);
  // The same owner check also runs on every subsequent Calendar API operation.
  const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { cache: 'no-store',
    redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: 'Bearer ' + tokens.access_token } });
  if (!profile.ok || !matchesGoogleOwner(owner, await profile.json())) throw new CalendarError('Calendar account mismatch.', 403);
  jar.set(calendarToken, tokens.access_token, { ...secureCookie, maxAge: Math.min(3600, tokens.expires_in) });
}
