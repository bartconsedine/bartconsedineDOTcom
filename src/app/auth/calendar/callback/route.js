import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth';
import { authConfig } from '@/lib/auth-config';
import { completeCalendar } from '@/private-apps/calendar-companion/google-session';

export async function GET(request) {
  const config = authConfig();
  const denied = () => new Response('Calendar authorization failed. Return to Calendar Companion and reconnect.', {
    status: 403, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  });
  if (!config?.cognito) return denied();
  try {
    const actor = await checkAdmin();
    if (!actor.ok) return denied();
    await completeCalendar(config, actor.user, request.nextUrl.searchParams);
    const response = NextResponse.redirect(config.siteUrl + '/admin/apps/calendar-companion');
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch { return denied(); }
}
