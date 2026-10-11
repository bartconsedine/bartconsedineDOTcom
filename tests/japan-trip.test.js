import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, validatePlan, metrics, MAX_BYTES, SLUG, KEY } from '../src/private-apps/japan-trip/model.js';
import { createTripApi } from '../src/private-apps/japan-trip/api.js';
import { startingPlan } from '../src/private-apps/japan-trip/starter.js';
import { createAppApi } from '../src/lib/app-api-policy.js';

function booking(overrides = {}) {
  return { id: 'flight-1', item: 'Flight', status: 'On request', due: '2030-01-01', provider: 'Carrier', estimate: 1000, actual: null, confirmation: '', url: '', notes: '', ...overrides };
}
function plan() { return { ...emptyPlan(), start: '2030-01-10', end: '2030-01-20', budget: 3000, bookings: [booking()] }; }
const context = { params: Promise.resolve({ slug: SLUG }) };
const request = (value, headers = {}) => new Request(`https://site.example/api/admin/apps/${SLUG}`, { method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json', ...headers }, body: typeof value === 'string' ? value : JSON.stringify(value) });

test('trip validates empty and complete plans; rejects ownership, unsafe links, invalid dates, amounts, duplicate IDs and status spoofing', () => {
  assert.deepEqual(validatePlan(emptyPlan()), emptyPlan());
  assert.deepEqual(validatePlan(plan()), plan());
  for (const changed of [
    { owner_id: 'somebody' }, { version: 2 }, { travelers: 0 }, { travelers: 1.5 }, { start: '2030-02-30' }, { end: '2029-01-01' },
    { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:pass@example.com' }, { notes: 'x'.repeat(16001) }, { budget: -1 }, { budget: 1.001 },
    { bookings: [booking(), booking()] }, { bookings: [booking({ actual: -1 })] }, { bookings: [booking({ status: 'confirmed' })] },
    { tasks: [{ id: 'task', title: '', due: '', done: false }] },
    { days: [{ id: 'day', date: '2029-01-01', location: 'Tokyo', morning: '', afternoon: '', evening: '', sleep: '', risk: '', riding: true }] },
  ]) assert.throws(() => validatePlan({ ...plan(), ...changed }));
  const missing = plan(); delete missing.notes; assert.throws(() => validatePlan(missing));
});

test('budget uses actuals including zero, excludes unneeded costs and leaves on-request bookings open', () => {
  const value = { ...plan(), travelers: 2, bookings: [booking(), booking({ id: 'hotel', status: 'Booked', estimate: 500, actual: 400 }), booking({ id: 'rental', status: 'Not needed', estimate: 300, actual: 100 }), booking({ id: 'free', status: 'Booked', estimate: 200, actual: 0 })] };
  const summary = metrics(value, '2030-01-02');
  assert.equal(summary.estimated, 1700); assert.equal(summary.actual, 400); assert.equal(summary.forecast, 1400);
  assert.equal(summary.remaining, 1600); assert.equal(summary.perTraveler, 700);
  assert.equal(summary.booked, 2); assert.equal(summary.total, 3); assert.equal(summary.overdue.length, 1); assert.equal(summary.next.status, 'On request');
});

test('unknown prices remain unpriced rather than becoming free bookings', () => {
  const summary = metrics({ ...plan(), bookings: [booking({ estimate: null }), booking({ id: 'free', estimate: null, actual: 0 })] });
  assert.equal(summary.unpriced, 1); assert.equal(summary.forecast, 0);
  assert.doesNotThrow(() => validatePlan({ ...plan(), bookings: [booking({ estimate: null })] }));
});

function harness() {
  let owner = 'admin-a', access = true, failRead = false, failWrite = false;
  const rows = new Map();
  const api = createTripApi({
    readAppData: async (slug, key) => { assert.equal(slug, SLUG); assert.equal(key, KEY); if (failRead) throw new Error('database private error'); return rows.get(owner) ?? null; },
    writeAppData: async (slug, key, value) => { assert.equal(slug, SLUG); assert.equal(key, KEY); if (failWrite) throw new Error('database private error'); rows.set(owner, { value: structuredClone(value), updated_at: '2030-01-01T00:00:00Z' }); },
  });
  const handle = createAppApi({ checkAdmin: async () => access ? ({ ok: true, user: { id: owner } }) : ({ ok: false, status: 401, reason: 'unauthenticated' }), getApp: async () => ({ slug: SLUG, api }), siteOrigin: () => 'https://site.example' });
  return { handle, rows, setOwner: value => { owner = value; }, deny: () => { access = false; }, failRead: () => { failRead = true; }, failWrite: () => { failWrite = true; } };
}
const get = h => h.handle(new Request(`https://site.example/api/admin/apps/${SLUG}`), context);

test('confirmed save survives a fresh GET and each owner sees only their own plan', async () => {
  const h = harness();
  assert.equal((await (await get(h)).json()).plan, null);
  assert.deepEqual(await (await h.handle(request(plan()), context)).json(), { saved: true });
  assert.deepEqual((await (await get(h)).json()).plan, plan());
  h.setOwner('admin-b'); assert.equal((await (await get(h)).json()).plan, null);
  await h.handle(request({ ...plan(), title: 'Other trip' }), context);
  h.setOwner('admin-a'); assert.equal((await (await get(h)).json()).plan.title, plan().title);
});

test('direct app API denies unauthenticated and cross-origin writes with no data mutation', async () => {
  const h = harness();
  for (const origin of ['https://evil.example', 'null', '']) assert.equal((await h.handle(request(plan(), { origin }), context)).status, 403);
  h.deny(); assert.equal((await h.handle(request(plan()), context)).status, 401); assert.equal((await get(h)).status, 401);
  assert.equal(h.rows.size, 0);
});

test('invalid JSON, unknown fields, wrong content type and oversized streaming body never reach storage', async () => {
  const h = harness();
  for (const value of ['{', { ...plan(), owner_id: 'admin-b' }, { ...plan(), budget: -5 }]) assert.equal((await h.handle(request(value), context)).status, 400);
  assert.equal((await h.handle(request(plan(), { 'content-type': 'text/plain' }), context)).status, 415);
  assert.equal((await h.handle(request('x'.repeat(MAX_BYTES + 1)), context)).status, 413);
  assert.equal(h.rows.size, 0);
});

test('load/save failures return generic private errors and never claim a save', async () => {
  const h = harness(); h.failRead();
  const response = await get(h);
  assert.equal(response.status, 503); assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual(await response.json(), { error: 'unavailable' });
  h.failWrite(); const saved = await h.handle(request(plan()), context);
  assert.equal(saved.status, 503); assert.deepEqual(await saved.json(), { error: 'unavailable' }); assert.equal(h.rows.size, 0);
});

test('original flight starter is scoped to Bart and never overwrites saved data or hides read failures', async () => {
  const bart = { id: 'admin-a', email: 'bartconsedine@gmail.com' };
  let record = null;
  const api = createTripApi({ readAppData: async () => record, writeAppData: async () => { throw new Error('GET must not write'); }, startingPlan });
  const initial = await (await api.GET(null, { owner: bart })).json();
  assert.equal(initial.plan.start, '2027-01-27'); assert.equal(initial.plan.end, '2027-02-05');
  assert.equal(initial.plan.bookings[0].status, 'On request'); assert.equal(initial.updatedAt, null);
  assert.equal(initial.plan.days.find(day => day.location === 'Tokyo').date, '2027-01-28');
  assert.doesNotThrow(() => validatePlan(initial.plan));
  const other = await (await api.GET(null, { owner: { id: 'admin-b', email: 'mjshah8@gmail.com' } })).json();
  assert.equal(other.plan, null);
  initial.plan.title = 'Mutated template copy'; assert.equal(startingPlan(bart).title, 'Japan / Japow');
  record = { value: { ...plan(), title: 'Saved custom trip' }, updated_at: '2030-01-01T00:00:00Z' };
  const saved = await (await api.GET(null, { owner: bart })).json();
  assert.equal(saved.plan.title, 'Saved custom trip'); assert.equal(saved.updatedAt, record.updated_at);
  const unavailable = createTripApi({ readAppData: async () => { throw new Error('read failed'); }, startingPlan });
  await assert.rejects(unavailable.GET(null, { owner: bart }), /read failed/);
});
