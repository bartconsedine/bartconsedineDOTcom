import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { authConfig, cookieOptions } from './lib/auth-config';

export async function proxy(request) {
  let response = NextResponse.next({ request });
  const config = authConfig();
  if (config) {
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
  return response;
}
export const config = { matcher: ['/admin/:path*', '/api/admin/:path*', '/login', '/auth/:path*'] };
