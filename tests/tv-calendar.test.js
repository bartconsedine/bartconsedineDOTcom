import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarEvents, eventsOnDay, eventTiming, eventStatus, currentEvent } from '../src/private-apps/morning-feed/tv/calendar-model.js';
import { tvUi, nodes, text } from './helpers/tv-ui.js';
const zone = 'America/New_York', now = Date.parse('2026-11-01T17:00:00Z');
const timed = (id, start, end, extra = {}) => ({ id, calendarId: 'personal', summary: id, start: { dateTime: start }, end: { dateTime: end }, ...extra });
const allDay = (id, start, end) => ({ id, calendarId: 'personal', summary: id, start: { date: start }, end: { date: end } });
const events = [allDay('Weekend away', '2026-10-31', '2026-11-02'), timed('Lunch', '2026-11-01T16:30:00Z', '2026-11-01T18:00:00Z'), timed('Dinner', '2026-11-01T23:00:00Z', '2026-11-02T01:00:00Z'), timed('Call', '2026-11-02T02:00:00Z', '2026-11-02T03:00:00Z')];
const snapshot = { connection: 'connected', preferences: { settings: { timeZone: zone } }, events, calendars: [{ id: 'personal', name: 'Personal' }], loadedAt: new Date(now).toISOString(), through: '2027-11-02' };
const response = (value = snapshot, status = 200) => ({ ok: status === 200, status, json: async () => value });
const button = (tree, name) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === name || text(node).trim() === name));
const agenda = tree => nodes(tree).find(node => node.props?.className === 'tv-calendar-agenda');
const mount = async (fetcher = async () => response(), props = {}) => { const ui = tvUi('calendar', fetcher, props); ui.setNow(now); await ui.settle(); return ui; };

test('all-day spans use exclusive end dates and do not shift with the viewer time zone', () => {
  for (const timeZone of [zone, 'Pacific/Honolulu', 'Asia/Tokyo']) {
    const { entries } = calendarEvents([events[0]], timeZone);
    assert.equal(eventsOnDay(entries, '2026-11-01').length, 1);
    assert.equal(eventsOnDay(entries, '2026-11-02').length, 0);
    assert.deepEqual(eventTiming(entries[0], '2026-11-01', timeZone), { primary: 'All day', secondary: 'Through Nov 1' });
  }
});
test('overnight and midnight-ending events occupy only the correct local dates across DST', () => {
  const { entries } = calendarEvents([
    timed('fall-back', '2026-11-01T01:00:00-04:00', '2026-11-01T02:00:00-05:00'),
    timed('overnight', '2026-10-31T23:00:00-04:00', '2026-11-01T03:00:00-05:00'),
    timed('midnight', '2026-11-01T23:00:00-05:00', '2026-11-02T00:00:00-05:00'),
    timed('spring-forward', '2026-03-08T01:00:00-05:00', '2026-03-08T03:00:00-04:00'),
  ], zone);
  assert.equal(eventsOnDay(entries, '2026-11-01').length, 3);
  assert.equal(eventsOnDay(entries, '2026-11-02').length, 0);
  assert.equal(eventsOnDay(entries, '2026-03-08').length, 1);
  assert.equal(eventTiming(entries.find(e => e.id === 'midnight'), '2026-11-01', zone).secondary, 'Until Nov 2, 12:00 AM');
  assert.deepEqual(eventTiming(entries.find(e => e.id === 'overnight'), '2026-11-01', zone), { primary: 'Continues', secondary: 'Until 3:00 AM' });
});
test('sorts agenda, keeps all-day plans visible, excludes cancelled/resolved and reports malformed events', () => {
  const { entries, skipped } = calendarEvents([...events].reverse().concat([
    { ...events[1], status: 'cancelled' }, { ...events[1], extendedProperties: { shared: { ccResolved: 'true' } } },
    timed('invalid', 'bad', 'bad'), allDay('invalid-date', '2026-02-30', '2026-03-05'), timed('reversed', '2026-11-01T18:00Z', '2026-11-01T17:00Z'),
  ]), zone);
  assert.equal(skipped, 3);
  assert.deepEqual(eventsOnDay(entries, '2026-11-01').map(e => e.id), events.map(e => e.id));
  assert.equal(currentEvent(entries, now).id, 'Lunch');
  assert.equal(eventStatus(currentEvent(entries, now), now), 'Now');
  assert.equal(currentEvent(entries, Date.parse('2026-11-01T18:00:00Z')).id, 'Dinner');
  assert.equal(eventStatus(entries.find(e => e.id === 'Dinner'), Date.parse('2026-11-01T22:30:00Z')), 'In 30 min');
});
test('paired and shared viewers never request Calendar data', async () => {
  let calls = 0; const ui = await mount(async () => { calls++; return response(); }, { locked: true });
  assert.equal(calls, 0); assert.match(text(ui.render()), /Calendar approval for paired TVs is not available yet/); ui.close();
});
test('day selection, pagination, week navigation and Today preserve the complete agenda', async () => {
  const ui = await mount();
  assert.match(text(agenda(ui.render())), /Weekend away/); assert.doesNotMatch(text(agenda(ui.render())), /Call/);
  button(ui.render(), 'Next events').props.onClick(); await ui.settle(); assert.match(text(agenda(ui.render())), /Call/);
  button(ui.render(), 'Monday, November 2, 0 events').props.onClick(); await ui.settle(); assert.match(text(ui.render()), /A little breathing room/);
  button(ui.render(), 'Next seven days').props.onClick(); await ui.settle(); assert.ok(button(ui.render(), 'Sunday, November 8, 0 events'));
  button(ui.render(), 'Today').props.onClick(); await ui.settle(); assert.match(text(agenda(ui.render())), /Weekend away/); assert.equal(button(ui.render(), 'Previous events').props.disabled, true); ui.close();
});
test('refresh denial, disconnected Google and network failure clear private events; retry recovers', async () => {
  for (const failure of [() => response({}, 401), () => response({}, 403), () => response({ connection: 'required', error: 'Reconnect Google' }), () => { throw Error('Offline'); }]) {
    let fail = false; const ui = await mount(async () => fail ? failure() : response());
    assert.ok(agenda(ui.render())); fail = true; await ui.tick(300000);
    assert.equal(agenda(ui.render()), undefined); assert.doesNotMatch(text(ui.render()), /Lunch/); assert.ok(nodes(ui.render()).find(n => n.props?.role === 'alert'));
    fail = false; button(ui.render(), 'Retry calendar').props.onClick(); await ui.settle(); assert.ok(agenda(ui.render())); ui.close();
  }
});
test('focus refresh and clock tick update now/next and roll the default day over at midnight', async () => {
  let calls = 0; const ui = await mount(async () => { calls++; return response(); });
  await ui.dispatch('focus'); assert.equal(calls, 2);
  ui.setNow(Date.parse('2026-11-01T18:00:00Z')); await ui.tick(30000); assert.match(text(ui.render()), /UP NEXT/);
  ui.setNow(Date.parse('2026-11-02T05:00:01Z')); await ui.tick(30000);
  assert.ok(button(ui.render(), 'Monday, November 2, today, 0 events')); assert.equal(agenda(ui.render()), undefined); ui.close();
});
test('late responses after locking or unmount cannot restore private events', async () => {
  let resolve; const props = { locked: false }; const ui = tvUi('calendar', () => new Promise(done => { resolve = done; }), props);
  await ui.settle(); props.locked = true; await ui.settle(); resolve(response()); await ui.settle();
  assert.equal(agenda(ui.render()), undefined); assert.doesNotMatch(text(ui.render()), /Lunch/); ui.close();
});

test('View this day jumps to the current event even after several all-day records', async () => {
  const ui = await mount(async () => response({ ...snapshot, events: [...Array.from({ length: 7 }, (_, i) => allDay('Plan ' + i, '2026-11-01', '2026-11-02')), events[1]] }));
  nodes(ui.render()).find(node => node.type === 'button' && text(node).includes('View this day')).props.onClick();
  await ui.settle(); assert.match(text(agenda(ui.render())), /Lunch/); assert.match(text(ui.render()), /7–8 of 8/); ui.close();
});
