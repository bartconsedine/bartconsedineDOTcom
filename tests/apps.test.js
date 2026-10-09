import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppRegistry } from '../src/lib/app-registry.js';
import { createAppApi } from '../src/lib/app-api-policy.js';

const app = { slug: 'test-tool', name: 'Test tool', description: 'Test fixture only', Component: () => null, privateConfig: 'must-not-leak' };
const owner = { id: 'verified-owner' };
const context = slug => ({ params: Promise.resolve({ slug }) });
const request = (method = 'GET', origin = 'https://example.com') => new Request('https://example.com/api/admin/apps/test-tool', { method, headers: origin ? { origin } : {} });
const dependencies = { checkOwner: async () => ({ ok: true, user: owner }), getApp: async slug => slug === app.slug ? app : null, siteOrigin: () => 'https://example.com' };

test('registry validates slugs, duplicate routes and API definitions', () => {
  for (const entries of [[{ ...app, slug: '../admin' }], [app, app], [{ ...app, Component: undefined }], [{ ...app, api: { DELETE() {} } }]]) {
    assert.throws(() => createAppRegistry(entries, async () => owner));
  }
});
test('registry independently authorizes every lookup, including missing apps', async () => {
  let calls = 0;
  const registry = createAppRegistry([app], async () => { calls++; throw new Error('denied'); });
  await assert.rejects(registry.list(), /denied/);
  await assert.rejects(registry.get(app.slug), /denied/);
  await assert.rejects(registry.get('missing'), /denied/);
  assert.equal(calls, 3);
});
test('app listings expose only metadata, and empty registries stay empty', async () => {
  const registry = createAppRegistry([app], async () => owner);
  assert.deepEqual(await registry.list(), [{ slug: app.slug, name: app.name, description: app.description }]);
  assert.equal(await registry.get('missing'), null);
  assert.deepEqual(await createAppRegistry([], async () => owner).list(), []);
});
test('per-app APIs deny unauthenticated, non-owner and unconfigured access before looking up apps', async () => {
  for (const status of [401, 403, 503]) {
    let touched = false;
    const handle = createAppApi({ ...dependencies, checkOwner: async () => ({ ok: false, status, reason: 'denied' }), getApp: async () => { touched = true; } });
    const response = await handle(request(), context(app.slug));
    assert.equal(response.status, status);
    assert.equal(touched, false);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
  }
});
test('default GET returns only metadata; unknown apps and unsupported writes fail', async () => {
  const handle = createAppApi(dependencies);
  assert.deepEqual(await (await handle(request(), context(app.slug))).json(), { app: { slug: app.slug, name: app.name, description: app.description } });
  assert.equal((await handle(request(), context('missing'))).status, 404);
  assert.equal((await handle(request('POST'), context(app.slug))).status, 405);
  assert.equal((await handle(request('DELETE'), context(app.slug))).status, 405);
});
test('mutation API rejects missing, foreign and cross-site origins before dispatch', async () => {
  let dispatched = false;
  const handle = createAppApi({ ...dependencies, getApp: async () => { dispatched = true; return app; } });
  for (const origin of [null, 'https://evil.example', 'null']) assert.equal((await handle(request('POST', origin), context(app.slug))).status, 403);
  const crossSite = request('POST');
  crossSite.headers.set('sec-fetch-site', 'cross-site');
  assert.equal((await handle(crossSite, context(app.slug))).status, 403);
  assert.equal(dispatched, false);
});
test('registered handlers receive verified owner and canonical slug with no-store enforced', async () => {
  let received;
  const handle = createAppApi({ ...dependencies, getApp: async () => ({ ...app, api: { POST: async (_, ctx) => { received = ctx; return Response.json({ saved: true }, { headers: { 'Cache-Control': 'public, max-age=3600' } }); } } }) });
  const response = await handle(request('POST'), context(app.slug));
  assert.deepEqual(received, { owner, slug: app.slug });
  assert.deepEqual(await response.json(), { saved: true });
  assert.match(response.headers.get('cache-control'), /private, no-store/);
});
test('authorization or app failures return a generic error without exposing internals', async () => {
  for (const override of [{ checkOwner: async () => { throw new Error('secret'); } }, { getApp: async () => { throw new Error('secret'); } }, { getApp: async () => ({ ...app, api: { GET: async () => { throw new Error('secret'); } } }) }]) {
    const response = await createAppApi({ ...dependencies, ...override })(request(), context(app.slug));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'unavailable' });
  }
});
