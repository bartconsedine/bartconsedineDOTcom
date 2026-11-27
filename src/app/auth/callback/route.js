import { authReturnPath } from '@/lib/auth-return';
import { loginReturn, LOGIN_RETURN_COOKIE } from '@/lib/login-return';
import { flowCookie, idCookie, refreshCookie, secureCookie, readGoogleFlow, tokenRequest, verifyGoogleToken } from '@/lib/cognito-oauth';
import { cognitoClient } from '@/lib/cognito-client';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authConfig, cookieOptions } from '@/lib/auth-config';
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
    let client, tokens;
    if (config.cognito) {
      const cookie = jar.get(flowCookie)?.value;
      jar.set(flowCookie, '', { ...secureCookie, maxAge: 0 });
      const flow = readGoogleFlow(cookie, request.nextUrl.searchParams.get('state'));
      tokens = await tokenRequest(config.cognito, {
        grant_type: 'authorization_code', redirect_uri: config.cognito.callback, code_verifier: flow.verifier, code,
      });
      await verifyGoogleToken(config.cognito, tokens.id_token, flow.nonce);
      if (!tokens.refresh_token) return finish('/login?state=expired');
      client = cognitoClient(config, { get: name => name === idCookie ? { value: tokens.id_token } : undefined });
    } else {
      client = await serverClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) return finish('/login?state=expired');
    }
    const admin = await verifyWorkspace(client);
    if (!admin.ok) {
      if (!config.cognito) await client.auth.signOut({ scope: 'local' });
      return finish(`/login?state=${admin.reason}`);
    }
    if (tokens) {
      jar.set(idCookie, tokens.id_token, { ...secureCookie, maxAge: tokens.expires_in });
      jar.set(refreshCookie, tokens.refresh_token, { ...secureCookie, maxAge: 30 * 86400 });
    }
    const destination = jar.get('bc-calendar-return')?.value === 'calendar' ? authReturnPath('calendar') : continuation;
    jar.set('bc-calendar-return', '', { ...cookieOptions, path: '/auth/callback', maxAge: 0 });
    return finish(destination);
  } catch { return finish('/login?state=unavailable'); }
}
