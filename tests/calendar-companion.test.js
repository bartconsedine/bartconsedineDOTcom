import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanner, validatePlanner, localInstant, dayInZone, deadline, suggestions, reminders, COVERAGE, MAX_BYTES, SLUG, KEY } from '../src/private-apps/calendar-companion/model.js';
import { calendarFile } from '../src/private-apps/calendar-companion/calendar.js';
import { createCalendarApi } from '../src/private-apps/calendar-companion/api.js';
import { createAppApi } from '../src/lib/app-api-policy.js';
import { appDataSql } from '../scripts/app-data-sql.mjs';

const now = Date.parse('2030-01-01T12:00:00Z');
const event = (extra = {}) => ({ id: 'night-1', title: 'Dinner', start: '2030-01-18T00:00:00.000Z', end: '2030-01-18T03:00:00.000Z', coverage: 'Needed', sitter: '', notes: '', cancelled: false, ...extra });
const planner = (extra = {}) => ({ ...emptyPlanner(), plans: [event()], ...extra });

test('planner contract rejects spoofed ownership, malformed dates, unconfirmed sitter identity, oversize and unknown fields', () => {
  assert.deepEqual(validatePlanner(emptyPlanner()), emptyPlanner());
  assert.doesNotThrow(() => validatePlanner(planner()));
  for (const p of [
    { ...planner(), owner_id: 'other' }, { ...planner(), version: 3 }, { ...planner(), plans: [event(), event()] },
    planner({ plans: [event({ coverage: 'Confirmed' })] }), planner({ plans: [event({ end: event().start })] }),
    planner({ plans: [event({ start: '2030-02-30T00:00:00.000Z' })] }), planner({ plans: [event({ id: 'a\r\nVEVENT' })] }),
    planner({ settings: { ...emptyPlanner().settings, timeZone: 'Unknown/Fake' } }), planner({ settings: { ...emptyPlanner().settings, leadDays: -1 } }),
    planner({ ideas: [''] }), planner({ plans: [event({ notes: 'x'.repeat(2001) })] }),
  ]) assert.throws(() => validatePlanner(p));
  for (const coverage of COVERAGE) assert.doesNotThrow(() => validatePlanner(planner({ plans: [event({ coverage, sitter: 'Alex' })] })));
});

test('local dates respect DST, reject nonexistent wall times and keep booking deadlines on the local morning', () => {
  assert.equal(new Date(localInstant('2030-01-10', '19:00', 'America/New_York')).toISOString(), '2030-01-11T00:00:00.000Z');
  assert.equal(new Date(localInstant('2030-07-10', '19:00', 'America/New_York')).toISOString(), '2030-07-10T23:00:00.000Z');
  assert.throws(() => localInstant('2030-03-10', '02:30', 'America/New_York'), /daylight/);
  assert.throws(() => localInstant('2030-02-30', '19:00', 'America/New_York'));
  assert.equal(new Date(deadline(event(), emptyPlanner().settings)).toISOString(), '2030-01-03T14:00:00.000Z');
});

test('queue excludes past, cancelled, confirmed and unnecessary sitters and keeps asked requests due for follow-up', () => {
  const value = planner({ plans: [event(), event({ id: 'asked', coverage: 'Asked' }), event({ id: 'booked', coverage: 'Confirmed', sitter: 'Alex' }), event({ id: 'none', coverage: 'Not needed' }), event({ id: 'cancelled', cancelled: true }), event({ id: 'past', start: '2029-01-01T00:00:00.000Z', end: '2029-01-01T03:00:00.000Z' })] });
  const queue = reminders(value, Date.parse('2030-01-16T12:00:00Z'));
  assert.equal(queue.length, 2); assert.ok(queue.every(r => r.urgent && r.overdue));
  assert.equal(queue[1].action, 'Follow up with sitter');
});

test('planning ahead fills weekly deficits, respects lead time and counts only active plans', () => {
  const value = { ...emptyPlanner(), ideas: ['Dinner', 'A walk'] };
  const proposed = suggestions(value, now);
  assert.ok(proposed.length > 0);
  for (const p of proposed) assert.ok(p.day >= '2030-01-15');
  assert.ok(new Set(proposed.map(p => p.title)).size === 2);
  const filled = { ...value, plans: proposed.map((p, i) => event({ id: `p-${i}`, title: p.title, start: p.start, end: p.end })) };
  assert.equal(suggestions(filled, now).length, 0);
  filled.plans[0].cancelled = true;
  assert.equal(suggestions(filled, now).length, 1);
  filled.settings.weeklyGoal = 3;
  const extra = suggestions(filled, now);
  assert.ok(extra.length > proposed.length);
  assert.equal(new Set(extra.map(p => p.start)).size, extra.length);
});

test('calendar has linked separate events, coverage buffers, escaped text and repeated booking reminders without confirmed reminders', () => {
  const p = planner({ plans: [event({ title: 'Dinner\nBEGIN:VEVENT,;\\' })] });
  const ics = calendarFile(p, null, now);
  assert.equal(ics.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 3);
  assert.match(ics, /UID:night-1-plan@/); assert.match(ics, /UID:night-1-sitter@/);
  assert.match(ics, /DTSTART:20300117T233000Z/); assert.match(ics, /RELATED-TO:night-1-plan@/);
  assert.match(ics, /RRULE:FREQ=DAILY;UNTIL=20300117T235959Z/);
  assert.match(ics, /BEGIN:VALARM/); assert.match(ics, /SUMMARY:Dinner\\nBEGIN:VEVENT\\,\\;\\\\/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  p.plans[0].title = '🌙'.repeat(60);
  for (const line of calendarFile(p, null, now).split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  p.plans[0] = event({ coverage: 'Confirmed', sitter: 'Alex' });
  assert.doesNotMatch(calendarFile(p, null, now), /RRULE|VALARM/);
  p.plans[0].cancelled = true;
  assert.match(calendarFile(p, null, now), /STATUS:CANCELLED/);
});

function harness() {
  let owner = 'a', status = null, fail = false, tick = 0;
  const rows = new Map();
  const api = createCalendarApi({ readAppData: async (slug, key) => { assert.equal(slug, SLUG); assert.equal(key, KEY); if (fail) throw Error('private DB failure'); return rows.get(owner) ?? null; }, compareAndWriteAppData: async (slug, key, value, expectedAt) => {
    if (fail) throw Error('private DB failure');
    if ((rows.get(owner)?.updated_at ?? null) !== expectedAt) return null;
    const revision = new Date(now + ++tick).toISOString(); rows.set(owner, { value: structuredClone(value), updated_at: revision }); return revision;
  } });
  const handle = createAppApi({ checkAdmin: async () => status ? { ok: false, status, reason: 'denied' } : { ok: true, user: { id: owner } }, getApp: async () => ({ slug: SLUG, api }), siteOrigin: () => 'https://site.example' });
  const ctx = { params: Promise.resolve({ slug: SLUG }) };
  return { rows, owner(v) { owner = v; }, deny(v) { status = v; }, fail() { fail = true; }, get: () => handle(new Request('https://site.example/api'), ctx), post: (body, headers = {}) => handle(new Request('https://site.example/api', { method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx) };
}

test('calendar API roundtrip, reload, owner isolation and stale revision rejection', async () => {
  const h = harness(); assert.deepEqual((await (await h.get()).json()).plan, emptyPlanner());
  const saved = await (await h.post({ plan: planner(), expectedAt: null })).json(); assert.equal(saved.saved, true);
  assert.deepEqual((await (await h.get()).json()).plan, planner());
  assert.equal((await h.post({ plan: emptyPlanner(), expectedAt: null })).status, 409);
  assert.equal((await h.post({ plan: emptyPlanner(), expectedAt: saved.updatedAt })).status, 200);
  h.owner('b'); assert.deepEqual((await (await h.get()).json()).plan, emptyPlanner());
  assert.equal((await h.post({ plan: planner(), expectedAt: saved.updatedAt })).status, 409);
});

test('calendar API denies direct unauthenticated/unenrolled/unconfigured, CSRF, malformed/large input and private storage errors', async () => {
  for (const denied of [401, 403, 503]) { const h = harness(); h.deny(denied); assert.equal((await h.get()).status, denied); assert.equal((await h.post({})).status, denied); assert.equal(h.rows.size, 0); }
  const h = harness();
  for (const body of ['{', {}, { plan: planner(), expectedAt: 'not-a-revision' }, { plan: { ...planner(), owner_id: 'b' }, expectedAt: null }]) assert.equal((await h.post(body)).status, 400);
  assert.equal((await h.post('x'.repeat(MAX_BYTES + 1))).status, 413);
  assert.equal((await h.post({}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.post({}, { 'content-type': 'text/plain' })).status, 415);
  assert.equal(h.rows.size, 0);
  h.fail();
  for (const response of [await h.get(), await h.post({ plan: planner(), expectedAt: null })]) {
    assert.equal(response.status, 503); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.deepEqual(await response.json(), { error: 'unavailable' });
  }
});

test('reviewed chat contract generates guarded SQL for the same calendar document', () => {
  const query = appDataSql({ operation: 'write', slug: SLUG, email: 'bartconsedine@gmail.com', value: planner(), expectedAt: null });
  assert.match(query, /calendar-companion/); assert.match(query, /planner-v1/); assert.match(query, /on conflict.*do nothing/);
  assert.throws(() => appDataSql({ operation: 'write', slug: SLUG, email: 'bartconsedine@gmail.com', value: { ...planner(), owner_id: 'x' }, expectedAt: null }));
  assert.equal(dayInZone(event().start, 'America/New_York'), '2030-01-17');
});
