import test from 'node:test';
import assert from 'node:assert/strict';
import { createTldrRefreshApi } from '../src/private-apps/morning-feed/tldr/refresh-api.js';
import { readFileSync } from 'node:fs';

test('scheduled refresh fails closed and never lets callers choose URLs, owners or history', async () => {
  let calls = 0, configured;
  const run = createTldrRefreshApi({ secret: () => configured, getTldr: async page => { calls++; assert.equal(page, 0); return { articles: ['not returned'], sources: [{ edition: 'tech', status: 'current' }] }; } });
  const request = (authorization, query = '') => new Request(`https://site.test/api/cron/tldr${query}`, { headers: authorization ? { authorization } : {} });
  assert.equal((await run(request())).status, 503);
  configured = 'test-only-secret';
  for (const value of [undefined, 'Bearer undefined', 'Bearer wrong', 'Bearer test-only-secrex']) assert.equal((await run(request(value))).status, 401);
  assert.equal(calls, 0);
  assert.equal((await run(request('Bearer test-only-secret', '?history=2'))).status, 400);
  const response = await run(request('Bearer test-only-secret'));
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.deepEqual(await response.json(), { state: 'checked', sources: [{ edition: 'tech', status: 'current' }] });
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('scheduled source failures are visible without leaking internal errors', async () => {
  const request = new Request('https://site.test/api/cron/tldr', { headers: { authorization: 'Bearer fixture' } });
  const run = getTldr => createTldrRefreshApi({ secret: () => 'fixture', getTldr })(request);
  assert.equal((await run(async () => ({ sources: [{ edition: 'ai', status: 'unavailable' }] }))).status, 503);
  const failure = await run(async () => { throw Error('secret details'); });
  assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /secret details/);
  const schedule = readFileSync(new URL('../.github/workflows/tldr-refresh.yml', import.meta.url), 'utf8');
  assert.match(schedule, /cron: '7,37 \* \* \* \*'/);
  assert.match(schedule, /github.ref == 'refs\/heads\/main'/);
  assert.match(schedule, /https:\/\/bartconsedine.com\/api\/cron\/tldr/);
  assert.match(schedule, /secrets.CRON_SECRET/);
});
