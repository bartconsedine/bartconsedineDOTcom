import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPersonalApi } from '../src/private-apps/robot-party/personal-api.js';
import { personalUi, partyUi, nodes, button } from './helpers/trip-ui.js';
const origin = 'https://site.example';
const endpoint = origin + '/api/admin/robot-party/personal';
const actor = { ok: true, user: { id: '11111111-1111-4111-8111-111111111111' } };
const api = (authorize = async () => actor) => createPersonalApi({ authorize, siteOrigin: () => origin });
const text = tree => nodes(tree).map(node => typeof node.props?.children === 'string' ? node.props.children : '').join(' ');

test('personal API requires independent admin authorization; board membership and robot bearer do not grant access', async () => {
  for (const status of [401, 403, 503]) {
    for (const method of ['GET', 'POST']) {
      const result = await api(async () => ({ ok: false, status, reason: 'denied' }))(new Request(endpoint, { method, headers: { Authorization: 'Bearer board-token', Origin: origin } }));
      assert.equal(result.status, status);
      assert.match(result.headers.get('cache-control'), /private, no-store/);
      assert.deepEqual(await result.json(), { error: 'denied' });
    }
  }
  const result = await api(async () => { throw Error('private detail'); })(new Request(endpoint));
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(await result.json()), /private detail/);
});

test('status cannot select another owner, expose identity, claim connected, or access storage', async () => {
  const result = await api()(new Request(endpoint));
  assert.deepEqual(await result.json(), { state: 'disconnected', canSend: false, canQueue: false, identityVerified: false });
  assert.equal((await api()(new Request(endpoint + '?owner=' + actor.user.id))).status, 400);
  assert.equal((await api()(new Request(endpoint + '?token=secret'))).status, 400);
  assert.equal((await api()(new Request(endpoint, { method: 'DELETE' }))).status, 405);
  const route = readFileSync(new URL('../src/app/api/admin/robot-party/personal/route.js', import.meta.url), 'utf8');
  assert.match(route, /authorize: checkAdmin/);
  const page = readFileSync(new URL('../src/app/admin/apps/robot-party/personal/page.js', import.meta.url), 'utf8');
  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /key=\{owner.id\}/);
});

test('send endpoint enforces exact origin and rejects identical retries without reading text or creating a queue', async () => {
  for (const supplied of ['', 'https://other.example', origin]) {
    const result = await api()(new Request(endpoint, { method: 'POST', headers: { Origin: supplied, 'Sec-Fetch-Site': 'cross-site' } }));
    assert.equal(result.status, 403);
  }
  for (let retry = 0; retry < 2; retry++) {
    const request = new Request(endpoint, { method: 'POST', headers: { Origin: origin }, body: 'private text' });
    const result = await api()(request);
    assert.equal(request.bodyUsed, false);
    assert.equal(result.status, 503);
    const data = await result.json();
    assert.equal(data.accepted, false);
    assert.equal(data.state, 'disconnected');
    assert.match(data.error, /Nothing was queued or sent/);
    assert.doesNotMatch(JSON.stringify(data), /private text/);
  }
});

test('personal composer never transmits a draft, cannot enable send, and preserves input through status failure', async () => {
  const calls = [];
  let fail = false;
  const ui = personalUi(async (url, options) => {
    calls.push({ url, options });
    if (fail) throw Error('offline');
    return Response.json({ state: 'disconnected', canSend: false });
  });
  assert.match(text(ui.render()), /Checking connection/);
  await ui.mount();
  assert.match(text(ui.render()), /not connected here yet/);
  assert.equal(button(ui.render(), 'Send to your dot').props.disabled, true);
  nodes(ui.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'A private thought' } });
  await button(ui.render(), 'Copy draft').props.onClick();
  assert.match(text(ui.render()), /Draft copied/);
  fail = true;
  await button(ui.render(), 'Check connection').props.onClick();
  assert.match(text(ui.render()), /Connection status unavailable/);
  assert.equal(nodes(ui.render()).find(node => node.type === 'textarea').props.value, 'A private thought');
  assert.ok(calls.every(call => call.url === '/api/admin/robot-party/personal' && !call.options.method && !call.options.body));
  assert.match(text(ui.render()), /not saved/);
  const forged = personalUi(async () => Response.json({ state: 'connected', canSend: true }));
  await forged.mount();
  assert.equal(button(forged.render(), 'Send to your dot').props.disabled, true);
  assert.match(text(forged.render()), /status unavailable/);
});

test('personal link remains available to the owner when board storage fails and is absent for invited members', async () => {
  for (const permission of ['owner', 'editor', 'viewer']) {
    const ui = partyUi(async () => Response.json({ error: 'Board unavailable' }, { status: 503 }), { permission });
    for (const tree of [ui.render(), await ui.mount()]) {
      assert.equal(nodes(tree).some(node => node.type === 'a' && node.props.href === '/admin/apps/robot-party/personal'), permission === 'owner');
    }
  }
});
