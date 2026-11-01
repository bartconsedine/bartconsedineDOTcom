import { createPersonalApi } from '../personal-api.js';
import { boundedText } from '../oauth-api.js';
import { isId } from '../model.js';

// TV display pairing is deliberately not an authorization dependency here.
// Only the signed-in verified website owner may use their private channel.
export function createTvCommandApi(dependencies) {
  const personal = createPersonalApi(dependencies);
  const reply = (body, status = 200) => Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer',
  } });
  const unavailable = (status, data) => reply({
    accepted: false, canSend: false,
    state: status === 401 ? 'owner_sign_in_required' : status === 403 ? 'forbidden' : 'unavailable',
    error: status === 401 ? 'TV display pairing is read-only. Command sending requires the website owner to sign in.' : data.error || 'Private command transport is unavailable.',
  }, status);
  return async request => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return reply({ accepted: false, error: 'method_not_allowed' }, 405);
      if (request.method === 'POST' && (!dependencies.siteOrigin() || request.headers.get('origin') !== dependencies.siteOrigin() || request.headers.get('sec-fetch-site') === 'cross-site')) return reply({ accepted: false, error: 'invalid_origin' }, 403);
      // Auth, owner RLS and transport configuration are rechecked by the same
      // reviewed handler as personal chat. Never forward its history to the TV.
      const currentResponse = await personal(new Request(request.url, { headers: request.headers }));
      const current = await currentResponse.json();
      if (!currentResponse.ok) return unavailable(currentResponse.status, current);
      const ready = current.canSend === true && current.identityVerified === true && isId(current.channelId) && isId(current.connectionId);
      const status = { state: ready ? 'ready' : 'disconnected', canSend: ready, recipientConnectionId: ready ? current.connectionId : null };
      if (request.method === 'GET') return reply(status);
      if (!ready) return reply({ ...status, accepted: false, error: 'Private dot transport is not ready. Nothing was queued or sent.' }, 503);
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({ accepted: false, error: 'Send JSON.' }, 415);
      let command;
      try {
        command = JSON.parse(await boundedText(request, 12000));
        const fields = command?.action === 'send' ? ['action', 'id', 'body'] : command?.action === 'dispatch' ? ['action'] : null;
        if (!fields || Object.keys(command).length !== fields.length || fields.some(field => !Object.hasOwn(command, field))) throw Error();
        if (command.action === 'send' && (!isId(command.id) || typeof command.body !== 'string' || !command.body.trim() || command.body.length > 2000 || command.body.includes('\0'))) throw Error();
      } catch { return reply({ accepted: false, error: 'Send a command of 1–2000 characters with a stable UUID. Recipient selectors are not accepted.' }, 400); }
      const action = command.action === 'send' ? { ...command, channelId: current.channelId } : command;
      const headers = new Headers(request.headers); headers.delete('content-length'); headers.delete('content-encoding');
      const resultResponse = await personal(new Request(request.url, {
        method: 'POST', headers, body: JSON.stringify(action),
      }));
      const result = await resultResponse.json();
      if (!resultResponse.ok) return unavailable(resultResponse.status, result);
      if (command.action === 'dispatch') return reply({ attempted: result.attempted === true, recorded: result.recorded === true });
      if (result.saved !== true || result.message?.id !== command.id) return reply({ accepted: false, error: 'Save was not confirmed. Keep this draft and retry the same UUID.' }, 503);
      // A database commit is a queued receipt, never proof of dot execution.
      return reply({ saved: true, accepted: true, id: command.id, delivery: 'queued', recipientConnectionId: current.connectionId });
    } catch { return reply({ accepted: false, canSend: false, state: 'unavailable', error: 'Command sending is unavailable. Keep the draft and retry with the same UUID.' }, 503); }
  };
}
