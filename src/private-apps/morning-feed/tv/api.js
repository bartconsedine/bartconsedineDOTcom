import { randomBytes, createHash } from 'node:crypto';
import { boundedText } from '../../robot-party/oauth-api.js';
export const TV_COOKIE = 'bc-morning-tv';
export const validSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const confirmationCode = secret => createHash('sha256').update(secret).digest('hex').slice(0, 8).toUpperCase();
const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'Pragma': 'no-cache' } });
const sameOrigin = (request, origin) => Boolean(origin) && request.headers.get('origin') === origin && request.headers.get('sec-fetch-site') !== 'cross-site';
async function input(request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw Error();
  const value = JSON.parse(await boundedText(request, 2048));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
  return value;
}
async function call(rpc, action, secret, other = null) {
  const { data, error } = await rpc('morning_tv', { p_action: action, p_secret: secret, p_other: other });
  if (error) throw error;
  if (!data || typeof data !== 'object') throw Error();
  return data;
}
export function createTvApi({ rpc, origin, cookie, setCookie, qr }) {
  const credentials = async () => {
    const parts = (await cookie() || '').split('.');
    return parts.length === 2 && parts.every(validSecret) ? parts : null;
  };
  async function state(parts) {
    const data = await call(rpc, 'read', parts[0]);
    if (data.status !== 'pending') return data;
    const url = `${origin()}/auth/tv?code=${parts[1]}`;
    return { ...data, code: confirmationCode(parts[1]), approvalUrl: url, qr: await qr(url) };
  }
  return {
    async GET() {
      try { const parts = await credentials(); return reply(parts ? await state(parts) : { status: 'unpaired' }); }
      catch { return reply({ error: 'TV connection unavailable. Retry; pairing setup may still be pending.' }, 503); }
    },
    async POST(request) {
      if (!sameOrigin(request, origin())) return reply({ error: 'Invalid origin.' }, 403);
      let value;
      try { value = await input(request); if (Object.keys(value).join(',') !== 'action' || !['start', 'forget'].includes(value.action)) throw Error(); }
      catch { return reply({ error: 'Invalid TV request.' }, 400); }
      try {
        const old = await credentials();
        if (value.action === 'forget') {
          if (old) await call(rpc, 'forget', old[0]);
          await setCookie('', 0);
          return reply({ disconnected: true });
        }
        if (old) {
          const current = await state(old);
          if (['pending', 'connected'].includes(current.status)) return reply(current);
        }
        const parts = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
        await call(rpc, 'start', ...parts);
        // Generate the QR before committing the browser credential.
        const data = await state(parts);
        await setCookie(parts.join('.'), 30 * 86400);
        return reply(data);
      } catch { return reply({ error: 'Could not connect the TV. Retry; pairing setup may still be pending.' }, 503); }
    },
  };
}
export function createTvConsentApi({ rpc, authorize, origin }) {
  return async request => {
    if (!sameOrigin(request, origin())) return reply({ error: 'Invalid origin.' }, 403);
    const actor = await authorize();
    if (!actor.ok) return reply({ error: actor.reason }, actor.status);
    let value;
    try {
      value = await input(request);
      const expected = value.action === 'revoke' ? 'action,id' : 'action,code';
      if (Object.keys(value).sort().join(',') !== expected || !['approve', 'revoke'].includes(value.action) ||
        (value.action === 'approve' ? !validSecret(value.code) : !/^[a-f0-9]{64}$/.test(value.id))) throw Error();
    } catch { return reply({ error: 'Invalid approval.' }, 400); }
    try { return reply(await call(rpc, value.action, value.code || value.id)); }
    catch (error) { return reply({ error: error.message === 'tv_expired' ? 'This code expired or was already used. Generate a new code on your TV.' : 'Could not update the TV connection. Retry.' }, error.message === 'tv_expired' ? 410 : 503); }
  };
}
