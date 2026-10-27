import { authReturnPath } from '@/lib/auth-return';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authConfig, cookieOptions } from '@/lib/auth-config';
import { serverClient } from '@/lib/supabase';
import { verifyAdmin } from '@/lib/auth-policy';

export async function GET(request) {
  const config = authConfig();
  const base = config?.siteUrl || request.nextUrl.origin;
  const finish = path => {
    const response = NextResponse.redirect(new URL(path, base));
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
  if (!config) return finish('/login?state=unconfigured');
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return finish('/login?state=expired');
  try {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return finish('/login?state=expired');
    const admin = await verifyAdmin(supabase);
    if (!admin.ok) {
      await supabase.auth.signOut({ scope: 'local' });
      return finish(`/login?state=${admin.reason}`);
    }
    const jar = await cookies();
    const destination = authReturnPath(jar.get('bc-calendar-return')?.value);
    jar.set('bc-calendar-return', '', { ...cookieOptions, path: '/auth/callback', maxAge: 0 });
    return finish(destination);
  } catch { return finish('/login?state=unavailable'); }
}
