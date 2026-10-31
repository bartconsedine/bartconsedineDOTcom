import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTvCommandApi } from '../src/private-apps/robot-party/personal/tv-api.js';
import { seal } from '../src/private-apps/robot-party/personal/transport.js';
const origin = 'https://site.example', endpoint = origin + '/api/tv/commands';
const owner = randomUUID(), robot = randomUUID(), channel = { id: randomUUID(), owner_id: owner, robot_id: robot };
const key = Buffer.alloc(32, 5), secret = 'whsec_' + Buffer.alloc(32, 9).toString('base64');
const subscription = { id: 'rpps_' + 'a'.repeat(64), callback_url: 'https://callback.example/synthetic', expires_at: '2026-11-01T00:00:00.000Z' };
subscription.secret_box = seal(secret, channel, subscription.id, subscription.callback_url, key);
function fixture({ denied, enabled = true } = {}) {
  let authorizeCalls = 0, delivered = 0;
  const saved = new Map(), calls = [];
  const storage = { async owner(action, input) {
    calls.push({ action, input });
    if (action === 'snapshot') return { channel, connectionActive: true, subscription, hasPendingDelivery: false, messages: [{ id: randomUUID(), body: 'PRIVATE HISTORY DO NOT RETURN', sender: 'dot' }] };
    assert.equal(action, 'send');
    const existing = saved.get(input.id);
    if (existing && existing.body !== input.body) throw Error('personal_conflict');
    const message = existing || { id: input.id, body: input.body, owner_id: owner }; saved.set(message.id, message); return { saved: true, message };
  } };
  const handle = createTvCommandApi({ authorize: async () => { authorizeCalls++; return denied || { ok: true, user: { id: owner } }; }, siteOrigin: () => origin,
    configuration: () => enabled ? { key } : null, storage, deliver: async () => { delivered++; return { attempted: true, recorded: true }; },
  });
  return { handle, saved, calls, authorizations: () => authorizeCalls, delivered: () => delivered };
}
const request = (body, extraHeaders = {}) => new Request(endpoint, body === undefined ? { headers: extraHeaders } : { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });

test('read-only TV cookie and board bearer cannot authorize command GET or POST', async () => {
  const f = fixture({ denied: { ok: false, status: 401, reason: 'unauthenticated' } });
  const headers = { Cookie: 'bc-morning-tv=' + 'A'.repeat(43) + '.' + 'B'.repeat(43), Authorization: 'Bearer rp_' + 'C'.repeat(43) };
  for (const r of [request(undefined, headers), request({ action: 'send', id: randomUUID(), body: 'Synthetic command' }, headers)]) {
    const result = await f.handle(r); assert.equal(result.status, 401);
    const data = await result.json(); assert.equal(data.canSend, false); assert.equal(data.state, 'owner_sign_in_required');
    assert.match(result.headers.get('cache-control'), /private, no-store/);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.saved.size, 0);
});

test('status and queued receipts omit private history, callback material, command text and owner identifiers', async () => {
  const f = fixture();
  const status = await (await f.handle(request())).json();
  assert.deepEqual(status, { state: 'ready', canSend: true, recipientConnectionId: robot });
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE HISTORY|whsec_|secret_box|callback_url|owner_id/);
  const command = { action: 'send', id: randomUUID(), body: 'Synthetic command text' };
  const result = await f.handle(request(command)); assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { saved: true, accepted: true, id: command.id, delivery: 'queued', recipientConnectionId: robot });
  assert.equal(f.calls.find(call => call.action === 'send').input.channelId, channel.id);
  assert.equal(f.authorizations(), 3); // status read + send read + independent mutation recheck
});

test('stable retry IDs preserve one saved command; altered retries conflict', async () => {
  const f = fixture(), command = { action: 'send', id: randomUUID(), body: 'Synthetic command' };
  assert.equal((await f.handle(request(command))).status, 200);
  assert.equal((await f.handle(request(command))).status, 200);
  assert.equal(f.saved.size, 1);
  assert.equal((await f.handle(request({ ...command, body: 'Changed command' }))).status, 409);
  assert.equal(f.saved.get(command.id).body, command.body);
});

test('CSRF, receiver selectors, oversized text, grant/revoke commands and unavailable transport fail closed', async () => {
  const f = fixture();
  assert.equal((await f.handle(request({ action: 'dispatch' }, { Origin: 'https://evil.example' }))).status, 403);
  assert.equal(f.authorizations(), 0);
  assert.equal((await f.handle(request({ action: 'send', id: randomUUID(), body: 'x', ownerId: owner }))).status, 400);
  assert.equal((await f.handle(request({ action: 'send', id: randomUUID(), body: 'x', channelId: channel.id }))).status, 400);
  assert.equal((await f.handle(request({ action: 'send', id: randomUUID(), body: 'x'.repeat(2001) }))).status, 400);
  assert.equal((await f.handle(request({ action: 'grant', id: randomUUID(), robotId: robot }))).status, 400);
  assert.equal((await f.handle(request({ action: 'revoke', channelId: channel.id }))).status, 400);
  assert.equal((await f.handle(new Request(endpoint + '?owner=' + owner))).status, 400);
  assert.equal(f.saved.size, 0);
  const off = fixture({ enabled: false });
  assert.deepEqual(await (await off.handle(request())).json(), { state: 'disconnected', canSend: false, recipientConnectionId: null });
  assert.equal((await off.handle(request({ action: 'send', id: randomUUID(), body: 'Synthetic command' }))).status, 503);
  assert.equal(off.calls.length, 0);
});

test('explicit dispatch uses the approved private transport without returning chat responses', async () => {
  const f = fixture();
  assert.deepEqual(await (await f.handle(request({ action: 'dispatch' }))).json(), { attempted: true, recorded: true });
  assert.equal(f.delivered(), 1);
});
