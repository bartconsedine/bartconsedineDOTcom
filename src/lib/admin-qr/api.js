import { randomBytes, createHash } from 'node:crypto';
export const QR_COOKIE = 'bc-admin-qr-request';
export const validRequest = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const confirmation = value => createHash('sha256').update(value).digest('hex').slice(0, 8).toUpperCase();
export const qrEnabled = () => process.env.ADMIN_QR_ENABLED === 'true';
export const response = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', Pragma: 'no-cache' } });
export const sameOrigin = (request, origin) => request.headers.get('origin') === origin && request.headers.get('sec-fetch-site') !== 'cross-site';
export async function qrCall(rpc, action, secret, data = {}) {
  const result = await rpc('admin_qr', { p_action: action, p_secret: secret, p_data: data });
  if (result.error || !result.data) throw Error('QR operation failed');
  return result.data;
}
export function providerUrl(value, config, approval) {
  try {
    const url = new URL(value), auth = new URL(config.url);
    return url.origin === auth.origin && url.pathname === '/auth/v1/authorize' &&
      url.searchParams.get('provider') === 'google' &&
      url.searchParams.get('redirect_to') === `${config.siteUrl}/auth/qr/relay?request=${approval}` &&
      /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge')) &&
      url.searchParams.get('code_challenge_method') === 's256' ? url.href : null;
  } catch { return null; }
}
export async function readInput(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw Error();
  const reader = request.body?.getReader(); if (!reader) throw Error();
  const chunks = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2048) { await reader.cancel(); throw Error(); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!result || Array.isArray(result) || typeof result !== 'object') throw Error();
  return result;
}
export function createQrDeviceApi({ enabled, config, client, rpc, cookie, setCookie, commitSession, qr }) {
  return async request => {
    if (!enabled() || !config()) return response({ error: 'Admin QR sign-in is not active.' }, 503);
    if (!sameOrigin(request, config().siteUrl)) return response({ error: 'Invalid origin.' }, 403);
    let value;
    try {
      value = await readInput(request);
      if (!['start', 'poll', 'exchange', 'cancel'].includes(value.action) || Object.keys(value).some(k => !['action','label'].includes(k)) || (value.action !== 'start' && 'label' in value)) throw Error();
      if (value.action === 'start' && (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 100)) throw Error();
    } catch { return response({ error: 'Invalid request.' }, 400); }
    let parts = (await cookie() || '').split('.');
    if (parts.length !== 2 || !parts.every(validRequest)) parts = null;
    const state = async () => {
      const data = await qrCall(rpc, 'poll', parts[0]);
      const url = `${config().siteUrl}/auth/qr?request=${parts[1]}`;
      return { ...data, confirmation: confirmation(parts[1]), approvalUrl: url, qr: await qr(url) };
    };
    try {
      if (value.action === 'cancel') {
        if (parts) await qrCall(rpc, 'cancel', parts[0]);
        await setCookie('', 0); return response({ cancelled: true });
      }
      if (value.action === 'poll') return response(parts ? await state() : { status: 'expired' });
      const supabase = await client();
      if (value.action === 'start') {
        const current = await supabase.auth.getUser();
        if (current.data?.user) return response({ error: 'Sign out on this device before starting QR sign-in.' }, 409);
        if (current.error?.status >= 500) throw Error();
        if (parts) { try { return response(await state()); } catch { /* Expired request: generate a new verifier. */ } }
        parts = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
        const result = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${config().siteUrl}/auth/qr/relay?request=${parts[1]}`, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
        if (result.error || !providerUrl(result.data?.url, config(), parts[1])) throw Error();
        await qrCall(rpc, 'start', parts[0], { approval: parts[1], label: value.label.trim(), url: result.data.url });
        const data = await state(); await commitSession(); await setCookie(parts.join('.'), 600); return response(data);
      }
      if (!parts) return response({ error: 'This sign-in request expired. Start again.' }, 410);
      // Claim is atomic. Never return an authorization code or any tokens to JS.
      const existing = await supabase.auth.getUser();
      if (existing.data?.user || existing.error?.status >= 500) throw Error();
      const claimed = await qrCall(rpc, 'claim', parts[0]);
      let completed = false;
      try {
        const result = await supabase.auth.exchangeCodeForSession(claimed.code);
        if (result.error) throw Error();
        const user = await supabase.auth.getUser();
        if (user.error || user.data?.user?.id !== claimed.owner) throw Error();
        await qrCall(supabase.rpc.bind(supabase), 'complete', parts[0]);
        completed = true;
      } finally {
        if (!completed) {
          // Cookies remain staged until successful completion. No token reaches
          // the browser on failure, even when Auth sign-out is unavailable.
          await supabase.auth.signOut({ scope: 'local' });
          await qrCall(rpc, 'cancel', parts[0]);
        }
      }
      await commitSession(); await setCookie('', 0); return response({ connected: true, destination: '/admin' });
    } catch { return response({ error: 'QR sign-in expired or could not finish. Cancel and generate a new code; Google sign-in is also available.' }, 410); }
  };
}
