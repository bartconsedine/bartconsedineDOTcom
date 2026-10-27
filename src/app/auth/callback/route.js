import { loginReturn, LOGIN_RETURN_COOKIE } from '@/lib/login-return';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth-config';
import { serverClient } from '@/lib/supabase';
import { verifyWorkspace } from '@/lib/workspace-policy';

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
  const jar=await cookies();
  const continuation=loginReturn(jar.get(LOGIN_RETURN_COOKIE)?.value);jar.delete(LOGIN_RETURN_COOKIE);
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return finish('/login?state=expired');
  try {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return finish('/login?state=expired');
    const admin = await verifyWorkspace(supabase);
    if (!admin.ok) {
      await supabase.auth.signOut({ scope: 'local' });
      return finish(`/login?state=${admin.reason}`);
    }
    return finish(continuation);
  } catch { return finish('/login?state=unavailable'); }
}
