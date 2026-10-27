import 'server-only';
import { cookies } from 'next/headers';
import { matchesGoogleOwner } from './google-identity';
import { serverClient } from '../../lib/supabase';
import { authConfig, cookieOptions } from '../../lib/auth-config';
import { CalendarError, createGoogleClient } from './google-client';

export const CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events';
// Authorization comes from the shared dispatcher and requireAdmin, never getSession.
// The verified Google identity must also own the provider credential used here.
export async function googleSession(owner) {
  const client = await serverClient();
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.provider_token;
  if (error || !token) throw new CalendarError('Connect Google Calendar to read and save events.', 428);
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
  const client = await serverClient();
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { scopes: CALENDAR_SCOPES, redirectTo: `${config.siteUrl}/auth/callback`, queryParams: { prompt: 'consent select_account', login_hint: owner.email, access_type: 'online' } } });
  if (error || !data?.url) throw new CalendarError('Could not start Google Calendar connection.');
  const destination = new URL(data.url), provider = new URL(config.url);
  if (destination.origin !== provider.origin || destination.pathname !== '/auth/v1/authorize') throw new CalendarError('Invalid sign-in destination.');
  (await cookies()).set('bc-calendar-return', 'calendar', { ...cookieOptions, path: '/auth/callback', maxAge: 600 });
  return data.url;
}
