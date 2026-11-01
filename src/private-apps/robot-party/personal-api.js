import { boundedText } from './oauth-api.js';
import { isId } from './model.js';
import { dispatchOne, unseal } from './personal/transport.js';

export function createPersonalApi({ authorize, siteOrigin, configuration = () => null, storage, deliver = dispatchOne }) {
  return async request => {
    const reply = (body, status = 200) => Response.json(body, {
      status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer' },
    });
    try {
      const actor = await authorize();
      if (!actor.ok) return reply({ error: actor.reason }, actor.status);
      if (new URL(request.url).search) return reply({ error: 'Personal chat does not accept board selectors.' }, 400);
      if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405);
      if (request.method === 'POST') {
        const origin = siteOrigin();
        if (!origin || request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'invalid_origin' }, 403);
      }
      const config = configuration();
      if (!config) {
        if (request.method === 'POST') return reply({ accepted: false, state: 'disconnected', error: 'Your dot is not connected to personal chat. Nothing was queued or sent.' }, 503);
        return reply({ state: 'disconnected', canSend: false, canQueue: false, identityVerified: false });
      }
      const snapshot = async () => {
        const value = await storage.owner('snapshot', {});
        let verified = false;
        if (value.connectionActive === true && value.channel && value.subscription) {
          try { unseal(value.subscription, value.channel, config.key); verified = true; } catch { /* Invalid/rotated ciphertext cannot enable sending. */ }
        }
        return { setupReady: true, state: verified ? 'connected' : 'disconnected', canSend: verified, canQueue: verified, identityVerified: verified,
          connectionActive: value.connectionActive === true, hasPendingDelivery: value.hasPendingDelivery === true,
          channelId: value.channel?.id ?? null, connectionId: value.channel?.robot_id ?? null,
          subscriptionExpiresAt: verified ? value.subscription.expires_at : null, messages: value.messages };
      };
      if (request.method === 'GET') return reply(await snapshot());
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({ error: 'Send JSON.' }, 415);
      let input;
      try {
        input = JSON.parse(await boundedText(request, 36000));
        const keys = { grant: ['action', 'id', 'robotId'], revoke: ['action', 'channelId'], send: ['action', 'id', 'channelId', 'body'], dispatch: ['action'] }[input?.action];
        if (!keys || Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) throw Error();
        for (const name of ['id', 'robotId', 'channelId']) if (Object.hasOwn(input, name) && !isId(input[name])) throw Error();
        if (input.action === 'send' && (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 8000 || input.body.includes('\0'))) throw Error();
      } catch { return reply({ error: 'Invalid private channel request.' }, 400); }
      const { action, ...command } = input;
      if (action === 'grant' || action === 'revoke') return reply({ saved: true, ...await storage.owner(action, command) });
      const current = await snapshot();
      if (!current.canSend) return reply({ accepted: false, state: 'disconnected', error: 'The private subscription is disconnected. Nothing new was queued.' }, 503);
      if (action === 'dispatch') return reply(await deliver(storage, config.key));
      // The RPC commits the message and outbox atomically before saved is returned.
      return reply({ ...await storage.owner('send', command), delivery: 'queued' });
    } catch (error) {
      if (error.message === 'personal_conflict' || error.message === 'personal_subscription_conflict') return reply({ error: 'This private operation conflicts with saved state. Refresh before retrying.' }, 409);
      if (error.message === 'personal_rate_limited') return reply({ error: 'Private message limit reached. Retry later.' }, 429);
      if (error.message === 'personal_access_denied') return reply({ error: 'This connection is not eligible for your private channel.' }, 403);
      return reply({ error: 'Personal chat is unavailable. Your unsent text is still here; setup or a connection may need attention.' }, 503);
    }
  };
}
