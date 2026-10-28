import test from 'node:test';
import assert from 'node:assert/strict';
import { createTvApi, createTvConsentApi, confirmationCode } from '../src/private-apps/morning-feed/tv/api.js';
import { loginReturn } from '../src/lib/login-return.js';
const site = 'https://bartconsedine.com';
const post = (body, origin = site) => new Request(site + '/api/tv', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const secret = 'A'.repeat(43), other = 'B'.repeat(43);
test('TV handoff keeps device credentials in HttpOnly-cookie adapter, returns a separate QR and resumes after reload', async () => {
  let cookie = '', device, approval, connected = false;
  const rpc = async (_, args) => {
    if (args.p_action === 'start') { device = args.p_secret; approval = args.p_other; return { data: { status: 'pending' } }; }
    assert.equal(args.p_secret, device);
    return { data: connected ? { status: 'connected', screen: { title: 'Private' } } : { status: 'pending', expiresAt: '2026-10-29T00:00:00Z' } };
  };
  const options = { rpc, origin: () => site, cookie: async () => cookie, setCookie: async (value, age) => { assert.equal(age, 30 * 86400); cookie = value; }, qr: async url => 'QR:' + url };
  const api = createTvApi(options);
  assert.equal((await (await api.GET()).json()).status, 'unpaired');
  const result = await (await api.POST(post({ action: 'start' }))).json();
  assert.notEqual(device, approval); assert.equal(result.code, confirmationCode(approval));
  assert.equal(result.approvalUrl, `${site}/auth/tv?code=${approval}`);
  assert.ok(!JSON.stringify(result).includes(device));
  connected = true;
  const reloaded = await (await createTvApi(options).GET()).json();
  assert.equal(reloaded.status, 'connected'); assert.equal(reloaded.approvalUrl, undefined);
});
test('TV endpoints reject CSRF and invalid bodies, fail closed on database errors and do not set cookies before confirmation', async () => {
  let calls = 0;
  const api = createTvApi({ rpc: async () => { calls++; throw Error('db credentials'); }, origin: () => site, cookie: () => `${secret}.${other}`, setCookie: () => assert.fail('no cookie on failure'), qr: () => '' });
  assert.equal((await api.POST(post({ action: 'start' }, 'https://evil.example'))).status, 403);
  assert.equal((await api.POST(post({ action: 'approve' }))).status, 400);
  assert.equal((await api.POST(post({ action: 'start', owner: 'other' }))).status, 400);
  assert.equal(calls, 0);
  const failure = await api.GET(); assert.equal(failure.status, 503); assert.match(failure.headers.get('Cache-Control'), /no-store/);
  assert.ok(!(await failure.text()).includes('db credentials'));
});
test('phone approval requires admin, correct origin, exact validated input, and acknowledges database success only', async () => {
  let actor = { ok: false, status: 401, reason: 'unauthenticated' }, calls = 0, fail = false;
  const api = createTvConsentApi({ origin: () => site, authorize: async () => actor, rpc: async (_, args) => { calls++; assert.equal(args.p_action, 'approve'); assert.equal(args.p_secret, other); return fail ? { error: { message: 'tv_expired' } } : { data: { approved: true } }; } });
  assert.equal((await api(post({ action: 'approve', code: other }))).status, 401);
  actor = { ok: false, status: 403, reason: 'forbidden' }; assert.equal((await api(post({ action: 'approve', code: other }))).status, 403);
  actor = { ok: true };
  assert.equal((await api(post({ action: 'approve', code: other }, 'https://evil.example'))).status, 403);
  assert.equal((await api(post({ action: 'approve', code: other, owner: 'victim' }))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await (await api(post({ action: 'approve', code: other }))).json()).approved, true);
  fail = true; assert.equal((await api(post({ action: 'approve', code: other }))).status, 410);
});
test('TV OAuth continuation preserves exactly the reviewed local consent route', () => {
  assert.equal(loginReturn(`/auth/tv?code=${other}`), `/auth/tv?code=${other}`);
  assert.equal(loginReturn('/auth/tv'), '/auth/tv');
  for (const bad of [`https://evil.example/auth/tv?code=${other}`, '//evil.example/auth/tv', '/api/tv', '/auth/tv?code=short', `/auth/tv?code=${other}&code=${other}`, `/auth/tv?code=${other}&next=https://evil.example`]) assert.equal(loginReturn(bad), '/admin');
});
