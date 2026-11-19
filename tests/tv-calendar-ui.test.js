import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { tickerUi } from './helpers/ticker-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { addDays, dayInZone } from '../src/private-apps/calendar-companion/model.js';
const today = dayInZone(Date.now(), 'UTC'), tomorrow = addDays(today, 1);
const snapshot = events => ({ connection: 'connected', preferences: { settings: { timeZone: 'UTC' } }, loadedAt: new Date().toISOString(), events });
const timed = (id, day, hour) => ({ id, calendarId: 'primary', summary: id, start: { dateTime: `${day}T${hour}:00:00Z` }, end: { dateTime: `${day}T${hour}:30:00Z` } });
const allDay = (id, start, end) => ({ id, calendarId: 'primary', summary: id, start: { date: start }, end: { date: end } });
const markup = ui => renderToStaticMarkup(ui.render());
const chooseDay = (ui, day) => nodes(ui.render()).find(node => node.type === 'button' && node.key === day).props.onClick();
const stepEvents = (ui, label) => nodes(ui.render()).find(node => node.type === 'button' && node.props['aria-label'] === label);

test('TV agenda sorts events, selects days and paginates every original title without writes', async () => {
  const longTitle = 'A very long original event title '.repeat(40);
  const events = [timed('Late appointment', tomorrow, '18'), timed(longTitle, tomorrow, '12'), timed('Early appointment', tomorrow, '08')];
  const calls = [];
  const ui = tickerUi(async (url, options) => { calls.push([url, options]); return Response.json(snapshot(events)); }, { locked: false }, false, 'tv/calendar.js');
  try {
    await ui.settle(); chooseDay(ui, tomorrow); await ui.settle();
    let text = markup(ui);
    assert.match(text, /Early appointment/); assert.ok(text.includes(longTitle)); assert.doesNotMatch(text, /Late appointment/);
    assert.equal(stepEvents(ui, 'Earlier events').props.disabled, true);
    stepEvents(ui, 'Later events').props.onClick(); await ui.settle();
    text = markup(ui); assert.match(text, /Late appointment/); assert.doesNotMatch(text, /Early appointment/);
    assert.equal(stepEvents(ui, 'Later events').props.disabled, true);
    chooseDay(ui, today); await ui.settle(); chooseDay(ui, tomorrow); await ui.settle();
    assert.match(markup(ui), /Early appointment/);
    assert.equal(calls.length, 1); assert.equal(calls[0][1].method, undefined);
  } finally { ui.close(); }
});

test('all-day events use exclusive end dates, past/cancelled events are omitted, and later weeks remain reachable', async () => {
  const end = addDays(tomorrow, 2), later = addDays(today, 9);
  const events = [allDay('Multi-day trip', tomorrow, end), allDay('Already finished', addDays(today, -1), today), { ...allDay('Cancelled plan', tomorrow, end), status: 'cancelled' }, timed('Following week', later, '10')];
  const ui = tickerUi(async () => Response.json(snapshot(events)), { locked: false }, false, 'tv/calendar.js');
  try {
    await ui.settle(); chooseDay(ui, tomorrow); await ui.settle(); assert.match(markup(ui), /Multi-day trip/);
    assert.doesNotMatch(markup(ui), /Already finished|Cancelled plan/);
    chooseDay(ui, addDays(tomorrow, 1)); await ui.settle(); assert.match(markup(ui), /Multi-day trip/);
    chooseDay(ui, end); await ui.settle(); assert.doesNotMatch(markup(ui), /Multi-day trip/);
    button(ui.render(), 'Later days').props.onClick(); await ui.settle(); chooseDay(ui, later); await ui.settle(); assert.match(markup(ui), /Following week/);
    assert.equal(button(ui.render(), 'Later days').props.disabled, true);
    button(ui.render(), 'Today').props.onClick(); await ui.settle(); assert.match(markup(ui), /Today, at a glance/);
  } finally { ui.close(); }
});

test('a refresh failure labels the retained snapshot and owner denial clears private events', async () => {
  let status = 200;
  const ui = tickerUi(async () => status === 200 ? Response.json(snapshot([allDay('Private appointment', today, tomorrow)])) : Response.json({ error: 'unavailable' }, { status }), { locked: false }, false, 'tv/calendar.js');
  try {
    await ui.settle(); assert.match(markup(ui), /Private appointment/);
    status = 503; button(ui.render(), 'Refresh calendar').props.onClick(); await ui.settle();
    assert.match(markup(ui), /Showing your last loaded calendar/); assert.match(markup(ui), /Private appointment/);
    status = 401; button(ui.render(), 'Refresh calendar').props.onClick(); await ui.settle();
    assert.doesNotMatch(markup(ui), /Private appointment/); assert.match(markup(ui), /Calendar needs attention/);
  } finally { ui.close(); }
});

test('limited paired TV requests no calendar data and retains full owner phone-approval disclosure', async () => {
  let requests = 0;
  const ui = tickerUi(async () => { requests++; throw Error('Unexpected calendar access'); }, { locked: true, ownerLoginEnabled: true }, false, 'tv/calendar.js');
  try {
    await ui.settle(); const text = markup(ui);
    assert.equal(requests, 0); assert.match(text, /full owner access for up to 30 days/); assert.match(text, /Anyone using this screen can act as you/);
    assert.ok(nodes(ui.render()).some(node => node.props['data-qr-auto-start'] === true));
  } finally { ui.close(); }
});

test('owner Calendar refreshes periodically and on return, updates midnight, and cancels work when locked', async () => {
  let instant = Date.parse('2026-11-18T23:59:50Z'), calls = 0;
  class Clock extends Date { static now() { return instant; } }
  const props = { locked: false };
  const ui = tickerUi(async () => { calls++; return Response.json(snapshot([allDay('Tomorrow plan', '2026-11-19', '2026-11-20')])); }, props, false, 'tv/calendar.js', { Date: Clock });
  try {
    await ui.settle(); assert.equal(calls, 1); assert.doesNotMatch(markup(ui), /tv-agenda-title[^>]*>Tomorrow plan/);
    instant += 30000; await ui.tick(30000);
    assert.match(markup(ui), /tv-agenda-title[^>]*>Tomorrow plan/);
    await ui.tick(300000); assert.equal(calls, 2);
    ui.event('focus'); await ui.settle(); assert.equal(calls, 3);
    ui.event('pageshow'); await ui.settle(); assert.equal(calls, 4);
    props.locked = true; await ui.settle();
    await ui.tick(300000); ui.event('focus'); await ui.settle(); assert.equal(calls, 4);
    assert.doesNotMatch(markup(ui), /Tomorrow plan/);
  } finally { ui.close(); }
});
