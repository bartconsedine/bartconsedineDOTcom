import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanner, localInstant, deadline, suggestions, reminders } from '../src/private-apps/calendar-companion/model.js';
import { emptyPreferences, validatePreferences, MAX_BYTES, KEY, SLUG } from '../src/private-apps/calendar-companion/preferences.js';
import { CalendarError, createGoogleClient } from '../src/private-apps/calendar-companion/google-client.js';
import { eventPayload, saveGoogleEvent, repairGoogleEvent, snapshot, validateEventChange, publicEvent } from '../src/private-apps/calendar-companion/google-events.js';
import { matchesGoogleOwner } from '../src/private-apps/calendar-companion/google-identity.js';
import { busyWindow, eventOnDay, eventsByDay } from '../src/private-apps/calendar-companion/view-model.js';
import { authReturnPath } from '../src/lib/auth-return.js';
import { createCalendarApi } from '../src/private-apps/calendar-companion/api.js';
import { createAppApi } from '../src/lib/app-api-policy.js';
import { appDataSql } from '../scripts/app-data-sql.mjs';
import { fakeGoogle } from './helpers/google-calendar.js';

const now = Date.parse('2030-01-01T12:00:00Z');
const owner = { id: 'owner-a', email: 'bartconsedine@gmail.com', identities: [{ provider: 'google', identity_data: { sub: 'google-a' } }] };
const change = extra => ({ calendarId: 'family@example.com', requestId: '12345678-1234-4234-8234-123456789012', eventId: null, etag: null, event: { kind: 'plan', title: 'Dinner together', name: '', monthDay: '', start: '2030-01-18T00:00:00.000Z', end: '2030-01-18T03:00:00.000Z', coverage: 'Needed', sitter: '', notes: '', ...extra } });
const birthday = (extra = {}) => change({ kind: 'birthday', name: 'Alex', monthDay: '02-29', start: '', end: '', ...extra });

test('only preferences belong in the reviewed Supabase contract; events, birthdays and secrets cannot be smuggled into it', () => {
  assert.deepEqual(validatePreferences(emptyPreferences()), emptyPreferences());
  for (const extra of [{ owner_id: owner.id }, { plans: [] }, { birthdays: [] }, { token: 'secret' }, { version: 1 }, { readCalendars: ['a', 'a'] }, { readCalendars: Array.from({ length: 6 }, (_, i) => String(i)) }, { settings: { ...emptyPreferences().settings, timeZone: 'Unknown/Fake' } }]) assert.throws(() => validatePreferences({ ...emptyPreferences(), ...extra }));
  const query = appDataSql({ operation: 'write', slug: SLUG, email: owner.email, value: emptyPreferences(), expectedAt: null });
  assert.match(query, /google-v2/); assert.doesNotMatch(query, /planner-v1/);
});

test('Google credential identity must match the independently verified workspace Google account', () => {
  const profile = { sub: 'google-a', email: owner.email, email_verified: true };
  assert.equal(matchesGoogleOwner(owner, profile), true);
  for (const changed of [{ sub: 'google-b' }, { email: 'someone@example.com' }, { email_verified: false }, { email_verified: 'true' }]) assert.equal(matchesGoogleOwner(owner, { ...profile, ...changed }), false);
  assert.equal(matchesGoogleOwner({ ...owner, identities: [], user_metadata: { sub: 'google-a' } }, profile), false);
  for (const value of ['https://evil.example', '//evil.example', '/admin', 'calendar?next=evil', null]) assert.equal(authReturnPath(value), '/admin');
  assert.equal(authReturnPath('calendar'), '/admin/apps/calendar-companion');
});

test('birthdays are real annual all-day Google events with early reminders and a documented leap birthday policy', () => {
  validateEventChange(birthday());
  const payload = eventPayload(birthday().event, emptyPreferences().settings, 'birthday-id');
  assert.equal(payload.summary, "Alex's birthday"); assert.deepEqual(payload.start, { date: '2000-02-29' }); assert.deepEqual(payload.end, { date: '2000-03-01' });
  assert.deepEqual(payload.recurrence, ['RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1']);
  assert.equal(payload.reminders.useDefault, false); assert.equal(payload.reminders.overrides.length, 3);
  assert.deepEqual(eventPayload(birthday({ monthDay: '12-31' }).event, emptyPreferences().settings, 'id').end, { date: '2001-01-01' });
  for (const extra of [{ monthDay: '02-30' }, { name: '' }, { monthDay: '13-01' }, { notes: 'x'.repeat(2001) }]) assert.throws(() => validateEventChange(birthday(extra)));
});

test('Google creates are idempotent across uncertain retries; yearly birthdays can be edited with the current master etag', async () => {
  const google = fakeGoogle(), prefs = emptyPreferences();
  const first = await saveGoogleEvent(google, prefs, owner, birthday(), now);
  assert.equal(first.saved, true); assert.equal(google.rows.size, 1);
  const repeated = await saveGoogleEvent(google, prefs, owner, birthday(), now);
  assert.equal(repeated.event.id, first.event.id); assert.equal(google.rows.size, 1);
  await assert.rejects(saveGoogleEvent(google, prefs, owner, birthday({ name: 'Different person' }), now), /different details/);
  const update = { ...birthday({ name: 'Alexandra', monthDay: '03-02' }), eventId: first.event.id, etag: first.event.etag };
  const edited = await saveGoogleEvent(google, prefs, owner, update, now);
  assert.equal(edited.event.summary, "Alexandra's birthday");
  await assert.rejects(saveGoogleEvent(google, prefs, owner, update, now), /changed/);
});

test('plans create separate Google coverage and daily reminder events, confirmed coverage resolves nudges, reopening reuses the same IDs', async () => {
  const google = fakeGoogle(), prefs = emptyPreferences();
  const first = await saveGoogleEvent(google, prefs, owner, change(), now);
  assert.equal(first.supportSynced, true); assert.equal(google.rows.size, 3);
  const rows = [...google.rows.values()];
  assert.ok(rows.some(e => e.extendedProperties.shared.ccKind === 'sitter' && e.start.dateTime === '2030-01-17T23:30:00.000Z'));
  assert.ok(rows.some(e => e.recurrence?.[0].startsWith('RRULE:FREQ=DAILY;UNTIL=') && e.reminders.overrides[0].minutes === 0));
  const confirmed = await saveGoogleEvent(google, prefs, owner, { ...change({ coverage: 'Confirmed', sitter: 'Alex' }), eventId: first.event.id, etag: first.event.etag }, now);
  const resolved = [...google.rows.values()].find(e => e.extendedProperties.shared.ccKind === 'reminder');
  assert.deepEqual(resolved.recurrence, []); assert.deepEqual(resolved.reminders.overrides, []);
  await saveGoogleEvent(google, prefs, owner, { ...change({ coverage: 'Asked', sitter: 'Alex' }), eventId: first.event.id, etag: confirmed.event.etag }, now);
  assert.equal(google.rows.size, 3);
  assert.ok([...google.rows.values()].some(e => e.extendedProperties.shared.ccKind === 'reminder' && e.recurrence.length === 1));
});

test('partial multi-event Google failures report the saved plan and are repairable without duplicating events', async () => {
  const google = fakeGoogle(); google.fail('reminder');
  const first = await saveGoogleEvent(google, emptyPreferences(), owner, change(), now);
  assert.equal(first.saved, true); assert.equal(first.supportSynced, false); assert.match(first.warning, /repair/); assert.equal(google.rows.size, 2);
  google.fail(null);
  assert.deepEqual(await repairGoogleEvent(google, first.event.calendarId, first.event.id, first.event.etag, now), { repaired: true });
  assert.equal(google.rows.size, 3);
  const latest = await google.patch(first.event.calendarId, first.event.id, { summary: 'Edited outside the app' }, first.event.etag);
  await assert.rejects(repairGoogleEvent(google, latest.calendarId ?? first.event.calendarId, first.event.id, first.event.etag, now), /changed/);
});

test('write-time Google availability catches meetings added after suggestions; read-only calendars and external event edits are denied', async () => {
  const google = fakeGoogle();
  google.seed('read-only', { id: 'work-meeting', summary: 'Busy', start: { dateTime: '2030-01-18T00:00:00.000Z' }, end: { dateTime: '2030-01-18T01:00:00.000Z' } });
  const prefs = { ...emptyPreferences(), readCalendars: ['family@example.com', 'read-only'] };
  await assert.rejects(saveGoogleEvent(google, prefs, owner, change(), now), /conflicts/);
  assert.equal(google.log.filter(row => row[0] === 'insert').length, 0);
  await assert.rejects(saveGoogleEvent(google, prefs, owner, { ...birthday(), calendarId: 'read-only' }, now), /can edit/);
  const external = google.seed('family@example.com', { id: 'outside', summary: 'A birthday outside this app', start: { date: '2000-03-01' }, end: { date: '2000-03-02' } });
  await assert.rejects(saveGoogleEvent(google, prefs, owner, { ...birthday(), eventId: 'outside', etag: external.etag }, now), /external event/);
});

test('live snapshot reads Google calendars and events, retains Google IDs and native birthdays, and fails closed on inaccessible selections', async () => {
  const google = fakeGoogle();
  google.seed('family@example.com', { id: 'native', eventType: 'birthday', summary: 'A birthday', start: { date: '2030-03-01' }, end: { date: '2030-03-02' } });
  const result = await snapshot(google, emptyPreferences(), '2030-01', now);
  assert.equal(result.events[0].id, 'native'); assert.equal(result.events[0].calendarId, 'family@example.com'); assert.equal(result.selected[0], 'family@example.com');
  assert.equal(result.events[0].eventType, 'birthday'); assert.ok(result.loadedAt);
  await assert.rejects(snapshot(google, { ...emptyPreferences(), readCalendars: ['lost-calendar'] }, '2030-01', now), /no longer accessible/);
  await assert.rejects(snapshot(google, emptyPreferences(), '2030-13', now), /Invalid calendar month/);
  assert.equal(publicEvent({ id: 'x', htmlLink: 'javascript:alert(1)' }, 'cal').htmlLink, undefined);
});

test('local dates and suggestions respect DST, sitter lead time, external busy windows, and transparent birthdays', () => {
  assert.equal(new Date(localInstant('2030-07-10', '19:00', 'America/New_York')).toISOString(), '2030-07-10T23:00:00.000Z');
  assert.throws(() => localInstant('2030-03-10', '02:30', 'America/New_York'), /daylight/);
  assert.equal(new Date(deadline({ start: change().event.start }, emptyPlanner().settings)).toISOString(), '2030-01-03T14:00:00.000Z');
  const planner = { ...emptyPlanner(), ideas: ['Dinner', 'A walk'] };
  const first = suggestions(planner, now); assert.ok(first.length > 0); assert.ok(first.every(p => p.day >= '2030-01-15'));
  const blocked = first.map(p => ({ start: Date.parse(p.start) - 3600000, end: Date.parse(p.end) + 3600000 }));
  const replaced = suggestions(planner, now, blocked); assert.ok(replaced.every(p => !first.some(old => old.start === p.start)));
  assert.equal(busyWindow({ eventType: 'birthday', start: { date: '2030-01-01' }, end: { date: '2030-01-02' } }, 'America/New_York'), null);
  assert.deepEqual(busyWindow({ start: { date: '2030-01-01' }, end: { date: '2030-01-02' } }, 'America/New_York'), { start: Date.parse('2030-01-01T05:00:00Z'), end: Date.parse('2030-01-02T05:00:00Z') });
  const p = { id: 'p', ...change().event, cancelled: false }; planner.plans = [p];
  assert.equal(reminders(planner, Date.parse('2030-01-16T12:00:00Z'))[0].urgent, true);
  planner.plans[0].coverage = 'Confirmed'; assert.equal(reminders(planner, now).length, 0);
});

test('Google HTTP client paginates, uses private server requests and If-Match, never follows redirects, and maps expired/stale credentials', async () => {
  const calls = [];
  const client = createGoogleClient('PRIVATE-TOKEN', async (url, options) => {
    calls.push([url, options]);
    if (options.method === 'PATCH') return Response.json({ id: 'patched' });
    return Response.json(url.includes('pageToken=next') ? { items: [{ id: 'b' }] } : { items: [{ id: 'a' }], nextPageToken: 'next' });
  });
  assert.equal((await client.events('a/b', '2030-01-01T00:00:00Z', '2030-02-01T00:00:00Z')).length, 2);
  assert.match(calls[0][0], /a%2Fb/); assert.equal(calls[0][1].cache, 'no-store'); assert.equal(calls[0][1].redirect, 'error');
  await client.patch('cal', 'event', { summary: 'New' }, '"version"');
  assert.equal(calls.at(-1)[1].headers['If-Match'], '"version"');
  for (const [status, expected] of [[401, 428], [403, 403], [412, 409], [500, 503]]) {
    const denied = createGoogleClient('secret', async () => new Response(null, { status }));
    await assert.rejects(denied.get('cal', 'event'), e => e.status === expected && !e.message.includes('secret'));
  }
  const incomplete = createGoogleClient('token', async () => Response.json({ items: [], nextPageToken: 'forever' }));
  await assert.rejects(incomplete.calendars(), /too many/);
});

function harness() {
  let currentOwner = owner, denied = null, fail = false, connected = true, tick = 0;
  const rows = new Map(), google = fakeGoogle();
  const api = createCalendarApi({ now: () => now, readAppData: async (slug, key) => { assert.equal(slug, SLUG); assert.equal(key, KEY); if (fail) throw Error('private storage details'); return rows.get(currentOwner.id) ?? null; }, compareAndWriteAppData: async (_slug, _key, value, expectedAt) => {
    if (fail) throw Error('private storage details'); if ((rows.get(currentOwner.id)?.updated_at ?? null) !== expectedAt) return null;
    const updatedAt = new Date(now + ++tick).toISOString(); rows.set(currentOwner.id, { value: structuredClone(value), updated_at: updatedAt }); return updatedAt;
  }, googleSession: async () => { if (!connected) throw new CalendarError('Connect Google Calendar.', 428); return google; }, connectGoogle: async () => 'https://project.supabase.co/auth/v1/authorize' });
  const handle = createAppApi({ checkAdmin: async () => denied ? { ok: false, status: denied, reason: 'denied' } : { ok: true, user: currentOwner }, getApp: async () => ({ slug: SLUG, api }), siteOrigin: () => 'https://site.example' });
  const ctx = { params: Promise.resolve({ slug: SLUG }) };
  return { rows, google, owner(value) { currentOwner = value; }, deny(value) { denied = value; }, fail() { fail = true; }, disconnect() { connected = false; }, get: () => handle(new Request('https://site.example/api?month=2030-01'), ctx), post: (body, headers = {}) => handle(new Request('https://site.example/api', { method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx) };
}

test('calendar API stores only private preferences, protects revisions, and saves events only in Google', async () => {
  const h = harness(); const initial = await (await h.get()).json(); assert.equal(initial.connection, 'connected'); assert.deepEqual(initial.preferences, emptyPreferences());
  const value = { ...emptyPreferences(), ideas: ['A show'] };
  assert.equal((await h.post({ op: 'preferences', value, expectedAt: null })).status, 200);
  assert.equal((await h.post({ op: 'preferences', value, expectedAt: null })).status, 409);
  const saved = await (await h.post({ op: 'event', change: birthday() })).json(); assert.equal(saved.saved, true); assert.equal(h.google.rows.size, 1);
  assert.deepEqual(h.rows.get(owner.id).value, value);
  h.owner({ ...owner, id: 'owner-b' }); assert.deepEqual((await (await h.get()).json()).preferences, emptyPreferences());
});

test('calendar API fails closed for auth, CSRF, invalid payloads, storage failures and missing Google consent', async () => {
  for (const denied of [401, 403, 503]) { const h = harness(); h.deny(denied); assert.equal((await h.get()).status, denied); assert.equal((await h.post({ op: 'connect' })).status, denied); assert.equal(h.google.log.length, 0); }
  const h = harness();
  assert.equal((await h.post({ op: 'connect' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.post('{')).status, 400); assert.equal((await h.post('x'.repeat(MAX_BYTES + 1))).status, 413);
  assert.equal((await h.post({ op: 'event', change: { ...birthday(), owner_id: 'other' } })).status, 400);
  assert.equal((await h.post({ op: 'connect' }, { 'content-type': 'text/plain' })).status, 415);
  h.disconnect(); assert.equal((await (await h.get()).json()).connection, 'required');
  assert.equal((await h.post({ op: 'event', change: birthday() })).status, 428);
  h.fail(); const response = await h.get(); assert.equal(response.status, 503); assert.match(response.headers.get('cache-control'), /private, no-store/); assert.deepEqual(await response.json(), { error: 'unavailable' });
});


test('coverage can be resolved even when a new conflicting meeting exists; its Google date remains unchanged', async () => {
  const google = fakeGoogle(), prefs = { ...emptyPreferences(), readCalendars: ['family@example.com', 'read-only'] };
  const saved = await saveGoogleEvent(google, prefs, owner, change(), now);
  google.seed('read-only', { id: 'new-meeting', start: { dateTime: change().event.start }, end: { dateTime: change().event.end } });
  const result = await saveGoogleEvent(google, prefs, owner, { ...change({ coverage: 'Confirmed', sitter: 'Alex' }), eventId: saved.event.id, etag: saved.event.etag }, now);
  assert.equal(result.supportSynced, true);
  assert.equal(result.event.start.dateTime, change().event.start);
});


test('calendar day cells use exclusive end dates and correct ordering across Google calendar time zones', async () => {
  const overnight = { start: { dateTime: '2030-01-01T23:00:00-05:00' }, end: { dateTime: '2030-01-02T00:00:00-05:00' } };
  assert.equal(eventOnDay(overnight, '2030-01-01', 'America/New_York'), true);
  assert.equal(eventOnDay(overnight, '2030-01-02', 'America/New_York'), false);
  const birthday = { start: { date: '2030-01-01' }, end: { date: '2030-01-02' } };
  assert.equal(eventOnDay(birthday, '2030-01-01', 'America/New_York'), true);
  assert.equal(eventOnDay(birthday, '2030-01-02', 'America/New_York'), false);
  const cells = eventsByDay([overnight, birthday], '2029-12-31', 'America/New_York');
  assert.equal(cells['2030-01-01'].length, 2); assert.equal(cells['2030-01-02'], undefined);
  const google = fakeGoogle();
  google.seed('family@example.com', { id: 'later', start: { dateTime: '2030-01-03T09:00:00-05:00' }, end: { dateTime: '2030-01-03T10:00:00-05:00' } });
  google.seed('family@example.com', { id: 'earlier', start: { dateTime: '2030-01-03T12:00:00Z' }, end: { dateTime: '2030-01-03T13:00:00Z' } });
  const data = await snapshot(google, emptyPreferences(), '2030-01', now);
  assert.deepEqual(data.events.map(e => e.id), ['earlier', 'later']);
  const otherMonth = await snapshot(google, emptyPreferences(), '2025-01', now);
  assert.ok(otherMonth.events.some(e => e.id === 'earlier'), 'past-month navigation still loads the forward planning year');
});

test('personal primary calendar is mandatory and receives every kind of new event regardless of legacy destination preferences', async () => {
  const google = fakeGoogle(), original = google.calendars;
  google.calendars = async () => [...await original(), { id: 'other-writable', summary: 'Another calendar', accessRole: 'owner' }];
  const prefs = { ...emptyPreferences(), readCalendars: ['read-only'], writeCalendar: 'other-writable' };
  const view = await snapshot(google, prefs, '2030-01', now);
  assert.equal(view.writeCalendar, 'family@example.com');
  assert.ok(view.selected.includes('family@example.com'));
  for (const input of [birthday(), change()]) await assert.rejects(saveGoogleEvent(google, prefs, owner, { ...input, calendarId: 'other-writable' }, now), /personal Google calendar/);
  assert.equal(google.rows.size, 0);
  google.calendars = async () => [{ id: 'other-writable', summary: 'Another calendar', accessRole: 'owner' }];
  await assert.rejects(snapshot(google, prefs, '2030-01', now), /personal Google account/);
});
