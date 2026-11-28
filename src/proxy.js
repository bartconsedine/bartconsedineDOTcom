import { createServerClient } from '@supabase/ssr';
import { idCookie, refreshCookie, secureCookie, tokenRequest, verifyGoogleToken } from './lib/cognito-oauth';
import { NextResponse } from 'next/server';
import { authConfig, cookieOptions } from './lib/auth-config';

export async function proxy(request) {
  let response = NextResponse.next({ request });
  const config = authConfig();
  if (config?.cognito) {
    const refresh = request.cookies.get(refreshCookie)?.value;
    if (refresh && !request.cookies.has(idCookie)) {
      try {
        const tokens = await tokenRequest(config.cognito, { grant_type: 'refresh_token', refresh_token: refresh });
        await verifyGoogleToken(config.cognito, tokens.id_token);
        request.cookies.set(idCookie, tokens.id_token);
        response = NextResponse.next({ request });
        response.cookies.set(idCookie, tokens.id_token, { ...secureCookie, maxAge: tokens.expires_in });
      } catch { /* Route authorization will require sign-in. */ }
    }
  } else if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // Refresh only here. Each protected page/data operation verifies again.
    try { await supabase.auth.getUser(); } catch { /* The route guard fails closed. */ }
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  // Native login form submissions need their same-origin Origin header.
  response.headers.set('Referrer-Policy', request.nextUrl.pathname === '/login' ? 'same-origin' : 'no-referrer');
  return response;
}
export const config = { matcher: ['/tv', '/admin/:path*', '/api/admin/:path*', '/login', '/auth/:path*'] };
