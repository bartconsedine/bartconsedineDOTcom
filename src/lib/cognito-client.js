import 'server-only';
import { dataFetch } from './aws-data';
import { createClient } from '@supabase/supabase-js';
import { idCookie, refreshCookie, secureCookie, verifyGoogleToken } from './cognito-oauth.js';

// PostgREST validates the original Cognito JWT and maps the Google subject to
// the restored owner UUID inside each transaction before RLS is evaluated.
export function cognitoClient(config, jar) {
  const token = jar.get(idCookie)?.value;
  const data = createClient(config.url, config.key, {
    accessToken: async () => token || null,
    global: { fetch: (input, init) => {
      const headers = new Headers(init.headers);
      if (!token) headers.delete('Authorization');
      return dataFetch(input, { ...init, headers });
    } },
  });
  return {
    from: data.from.bind(data), rpc: data.rpc.bind(data),
    auth: {
      async getUser() {
        if (!token) return { error: { status: 401 } };
        let identity;
        try { identity = await verifyGoogleToken(config.cognito, token); }
        catch { return { error: { status: 401 } }; }
        const owner = await data.rpc('cognito_workspace_owner');
        if (owner.error) return { error: { status: owner.status >= 500 ? 503 : 403 } };
        if (!owner.data) return { error: { status: 403 } };
        return { data: { user: { id: owner.data, email: identity.email, email_confirmed_at: true,
          identities: [{ provider: 'google', identity_data: { sub: identity.subject, email: identity.email, email_verified: true } }] } } };
      },
      async getSession() { return { data: { session: null } }; },
      async signOut() {
        const refresh = jar.get(refreshCookie)?.value;
        if (refresh) {
          const result = await fetch(new URL('/oauth2/revoke', config.cognito.domain), {
            method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
            body: new URLSearchParams({ client_id: config.cognito.clientId, token: refresh }),
          });
          if (!result.ok) return { error: { status: 503 } };
        }
        for (const name of [idCookie, refreshCookie, '__Host-bc-calendar-token', '__Host-bc-calendar-flow']) jar.set(name, '', { ...secureCookie, maxAge: 0 });
        return { error: null };
      },
    },
  };
}
