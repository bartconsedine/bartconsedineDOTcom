import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { callbackUrl, publicAddress, safeWebhook, seal, unseal, subscriptionId, signedHeaders, verifyCallback, signingKey, encryptionKey } from '../src/private-apps/robot-party/personal/transport.js';
const key = Buffer.alloc(32, 9), secret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
const channel = { id: '11111111-1111-4111-8111-111111111111', owner_id: '22222222-2222-4222-8222-222222222222', robot_id: '33333333-3333-4333-8333-333333333333' }, url = 'https://callback.example/mcp/events';
test('subscription secrets are encrypted and authenticated to exact owner, channel, connection, subscription and callback', () => {
  const id = subscriptionId(channel, url), secret_box = seal(secret, channel, id, url, key), subscription = { id, callback_url: url, secret_box };
  assert.equal(unseal(subscription, channel, key).current, secret);
  assert.doesNotMatch(secret_box, /whsec_/);
  for (const field of ['id', 'owner_id', 'robot_id']) assert.throws(() => unseal(subscription, { ...channel, [field]: 'changed' }, key));
  assert.throws(() => unseal({ ...subscription, callback_url: url + '/other' }, channel, key));
  assert.throws(() => unseal({ ...subscription, id: id + '0' }, channel, key));
  assert.throws(() => unseal(subscription, channel, Buffer.alloc(32, 2)));
  assert.throws(() => signingKey('whsec_weak'));
  assert.throws(() => encryptionKey('missing'));
});
test('webhook HMAC signs exact bytes; secret rotation includes both keys only during its bounded window', () => {
  const previous = 'whsec_' + Buffer.alloc(32, 2).toString('base64');
  const body = '{"eventId":"same-id"}', time = 1000000;
  const headers = signedHeaders('same-id', body, { current: secret, previous: { secret: previous, until: time + 1000 } }, 'sub', time);
  for (const value of [secret, previous]) {
    const expected = 'v1,' + createHmac('sha256', Buffer.from(value.slice(6), 'base64')).update(`same-id.1000.${body}`).digest('base64');
    assert.ok(headers['webhook-signature'].split(' ').includes(expected));
  }
  assert.equal(signedHeaders('same-id', body, { current: secret, previous: { secret: previous, until: time - 1 } }, 'sub', time)['webhook-signature'].split(' ').length, 1);
});
test('callback challenge never activates a failed, redirected or mismatching receiver', async () => {
  for (const response of [{ status: 302, text: '{}' }, { status: 200, text: '{}' }, { status: 200, text: '{"challenge":"forged"}' }]) {
    await assert.rejects(verifyCallback(url, secret, 'sub', async () => response), /verification failed/);
  }
  await verifyCallback(url, secret, 'sub', async (_url, body, headers) => {
    const data = JSON.parse(body); assert.equal(data.type, 'verification'); assert.ok(headers['webhook-id'].startsWith('verify_'));
    return { status: 200, text: JSON.stringify({ challenge: data.challenge }) };
  });
});
test('callback URL and connection-time DNS checks reject local, mixed, mapped, documentation and special-use destinations', async () => {
  for (const value of ['http://callback.example', 'https://user:pass@callback.example', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://callback.example:444/a', 'https://callback.example/#fragment']) assert.throws(() => callbackUrl(value));
  for (const address of ['0.0.0.0','10.0.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.0.1','100.64.0.1','198.18.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','::1','::ffff:8.8.8.8','fc00::1','fe80::1','64:ff9b::808:808','2001:db8::1','2002:0808:0808::1','3fff::1']) assert.equal(publicAddress(address), false, address);
  for (const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111']) assert.equal(publicAddress(address), true, address);
  let requests = 0;
  await assert.rejects(safeWebhook(url, '{}', {}, { resolve: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], request: () => requests++ }), /verification failed/);
  assert.equal(requests, 0);
});
test('HTTPS connects to the validated address, preserves TLS hostname, rejects oversized responses, and does not follow redirects', async () => {
  let resolves = 0, requests = 0;
  const response = await safeWebhook(url, '{}', {}, {
    resolve: async () => { resolves++; return [{ address: '8.8.8.8', family: 4 }]; },
    request: (target, options, done) => {
      requests++; assert.equal(target.hostname, 'callback.example'); assert.equal(options.servername, 'callback.example'); assert.equal(options.agent, false);
      options.lookup('callback.example', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
      const outgoing = new EventEmitter(); outgoing.setTimeout = () => {}; outgoing.end = () => { const incoming = new EventEmitter(); incoming.statusCode = 302; done(incoming); incoming.emit('data', Buffer.from('{}')); incoming.emit('end'); }; return outgoing;
    },
  });
  assert.equal(response.status, 302); assert.equal(resolves, 1); assert.equal(requests, 1);
  await assert.rejects(safeWebhook(url, '{}', {}, {
    resolve: async () => [{ address: '8.8.8.8', family: 4 }],
    request: (_target, _options, done) => {
      const outgoing = new EventEmitter(); outgoing.setTimeout = () => {}; outgoing.end = () => { const incoming = new EventEmitter(); incoming.statusCode = 200; incoming.destroy = error => incoming.emit('error', error); done(incoming); incoming.emit('data', Buffer.alloc(8193)); }; return outgoing;
    },
  }), /verification failed/);
});
