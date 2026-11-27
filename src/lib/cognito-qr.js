import 'server-only';
import { cognitoClient } from './cognito-client';
import { QR_COOKIE } from './admin-qr/api';
import { beginGoogle, idCookie, refreshCookie, readGoogleFlow, secureCookie, tokenRequest, verifyGoogleToken } from './cognito-oauth';

const qrFlow = '__Host-bc-device-flow';

// Only the requesting device holds the verifier. The phone relays a one-use
// code to the database after checking the signed-in approving workspace owner.
export function cognitoQrClient(config, staged) {
  const callback = config.siteUrl + '/auth/qr/relay';
  const client = () => cognitoClient(config, staged);
  return {
    auth: {
      getUser: () => client().auth.getUser(),
      signOut: () => client().auth.signOut(),
      async signInWithOAuth({ options }) {
        const approval = new URL(options.redirectTo).searchParams.get('request');
        const attempt = beginGoogle({ ...config.cognito, callback }, approval);
        staged.set(qrFlow, attempt.cookie, { ...secureCookie, maxAge: 600 });
        return { data: { url: attempt.url } };
      },
      async exchangeCodeForSession(code) {
        const approval = staged.get(QR_COOKIE)?.value.split('.')[1];
        const flow = readGoogleFlow(staged.get(qrFlow)?.value, approval);
        const tokens = await tokenRequest(config.cognito, { grant_type: 'authorization_code',
          redirect_uri: callback, code_verifier: flow.verifier, code });
        await verifyGoogleToken(config.cognito, tokens.id_token, flow.nonce);
        if (!tokens.refresh_token) throw Error('Device sign-in expired');
        staged.set(idCookie, tokens.id_token, { ...secureCookie, maxAge: tokens.expires_in });
        staged.set(refreshCookie, tokens.refresh_token, { ...secureCookie, maxAge: 30 * 86400 });
        staged.set(qrFlow, '', { ...secureCookie, maxAge: 0 });
        return { error: null };
      },
    },
    rpc(name, args) {
      if (name === 'admin_qr' && args.p_action === 'complete') {
        return client().rpc('cognito_complete_qr', { p_secret: args.p_secret });
      }
      return client().rpc(name, args);
    },
  };
}
