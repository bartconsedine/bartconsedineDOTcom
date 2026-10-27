// This endpoint deliberately has no storage or transport dependency until the
// owner-to-dot binding and private channel have been approved and verified.
export function createPersonalApi({ authorize, siteOrigin }) {
  return async request => {
    const reply = (body, status = 200) => Response.json(body, {
      status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer' },
    });
    try {
      const actor = await authorize();
      if (!actor.ok) return reply({ error: actor.reason }, actor.status);
      // Never accept a shared-board owner selector, robot key, or client identity.
      if (new URL(request.url).search) return reply({ error: 'Personal chat does not accept board selectors.' }, 400);
      if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405);
      if (request.method === 'POST') {
        const origin = siteOrigin();
        if (!origin || request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'invalid_origin' }, 403);
        // Do not read, log, persist, forward, or acknowledge private message text.
        return reply({ accepted: false, state: 'disconnected', error: 'Your dot is not connected to personal chat. Nothing was queued or sent.' }, 503);
      }
      return reply({ state: 'disconnected', canSend: false, canQueue: false, identityVerified: false });
    } catch {
      return reply({ error: 'Personal chat status is unavailable.' }, 503);
    }
  };
}
