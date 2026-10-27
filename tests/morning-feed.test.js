import test from 'node:test';
import assert from 'node:assert/strict';
import { createMorningApi } from '../src/private-apps/morning-feed/api.js';
import { emptyScreen, validateScreen, dayInZone, moveCard, SLUG, KEY, MAX_BYTES } from '../src/private-apps/morning-feed/model.js';
import { createAppApi } from '../src/lib/app-api-policy.js';
const card = (id = 'one') => ({ id, kind: 'ritual', title: 'A deliberate start', body: 'Open the curtains.', minutes: 5, url: '', enabled: true, completedOn: '' });

test('screen contract rejects unknown fields, unsafe links, duplicate IDs and invalid dates/settings', () => {
  assert.deepEqual(validateScreen(emptyScreen()), emptyScreen());
  const base = { ...emptyScreen(), cards: [card()] };
  assert.equal(validateScreen(base), base);
  for (const patch of [{ owner_id: 'other' }, { version: 2 }, { title: '' }, { timezone: 'nowhere' }, { rotationSeconds: 0 }, { rotationSeconds: 10.5 }, { cards: Array(25).fill(card()) }, { cards: [card(), card()] }, ...[{ kind: 'weather' }, { completedOn: '2026-02-30' }, { url: 'javascript:alert(1)' }, { url: 'https://user:secret@example.com' }, { body: 'x'.repeat(1601) }, { enabled: 'true' }, { minutes: -1 }, { kind: 'link' }].map(patch => ({ cards: [{ ...card(), ...patch }] }))]) assert.throws(() => validateScreen({ ...base, ...patch }));
  assert.equal(dayInZone(new Date('2026-10-27T02:00:00Z'), 'America/New_York'), '2026-10-26');
  assert.equal(dayInZone(new Date('2026-10-27T02:00:00Z'), 'Asia/Tokyo'), '2026-10-27');
  assert.deepEqual(moveCard([card('one'), card('two')], 'two', -1).map(c => c.id), ['two', 'one']);
});

test('guarded morning API saves exact owner/revision, reloads and rejects stale or invalid writes', async () => {
  let record = null, fail = false, allowed = true, role = 'owner'; const owner = '11111111-1111-4111-8111-111111111111';
  const api = createMorningApi({ readAppData: async (slug, key, id) => { assert.equal(slug, SLUG); assert.equal(key, KEY); assert.equal(id, owner); if (fail) throw new Error('secret database details'); return record; }, compareAndWriteAppData: async (slug, key, value, expected, id) => { assert.equal(id, owner); assert.equal(slug, SLUG); assert.equal(key, KEY); if (fail) throw new Error('secret'); if (expected !== (record?.updated_at ?? null)) return null; const updated_at = '2026-10-27T02:00:00.123456Z'; record = { value, updated_at }; return updated_at; } });
  const handle = createAppApi({ checkAdmin: async () => allowed ? { ok: true, user: { id: owner } } : { ok: false, status: 401, reason: 'unauthorized' }, getApp: async (slug, selected) => { assert.equal(selected, owner); return { slug, access: { ownerId: owner, role }, api }; }, siteOrigin: () => 'https://site.example' });
  const request = (method = 'GET', body, origin = 'https://site.example', type = 'application/json') => handle(new Request(`https://site.example/api/admin/apps/${SLUG}?owner=${owner}`, { method, headers: { origin, 'Content-Type': type }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), { params: Promise.resolve({ slug: SLUG }) });
  assert.equal((await (await request()).json()).screen, null);
  const screen = { ...emptyScreen(), cards: [card()] }, body = { screen, expectedAt: null };
  assert.equal((await request('POST', body)).status, 200);
  const response = await request(); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.deepEqual((await response.json()).screen, screen);
  assert.equal((await request('POST', body)).status, 409);
  for (const invalid of [{ screen }, { ...body, expectedAt: 'bad' }, { ...body, screen: { ...screen, timezone: 'bad' } }, 'null', '{']) assert.equal((await request('POST', invalid)).status, 400);
  assert.equal((await request('POST', 'x'.repeat(MAX_BYTES + 1))).status, 413);
  assert.equal((await request('POST', body, 'https://site.example', 'text/plain')).status, 415);
  assert.equal((await request('POST', body, 'https://evil.example')).status, 403);
  role = 'viewer'; assert.equal((await request('POST', body)).status, 403); assert.equal((await (await request()).json()).canEdit, false);
  allowed = false; assert.equal((await request()).status, 401);
  allowed = true; fail = true; assert.deepEqual(await (await request()).json(), { error: 'unavailable' });
});
