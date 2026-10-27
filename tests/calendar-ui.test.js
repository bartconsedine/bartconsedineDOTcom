import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarUi, nodes, button, field } from './helpers/calendar-ui.js';
import { emptyPreferences } from '../src/private-apps/calendar-companion/preferences.js';

const response = (value, status = 200) => ({ ok: status === 200, status, json: async () => value });
const snapshot = extra => ({ preferences: emptyPreferences(), updatedAt: null, connection: 'connected', calendars: [{ id: 'family@example.com', name: 'Family', role: 'owner', primary: true, color: '#c3dec0' }], selected: ['family@example.com'], writeCalendar: 'family@example.com', events: [], loadedAt: new Date().toISOString(), ...extra });
const editField = (ui, label, value) => { const node = field(ui.render(), label); assert.ok(node, label); node.props.children.props.onChange({ target: { value } }); };
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('calendar UI does not create an empty writable calendar after a preferences load fails', async () => {
  const ui = calendarUi(async () => response({}, 503));
  const tree = await ui.mount();
  assert.ok(nodes(tree).some(n => n.props?.role === 'alert')); assert.ok(button(tree, 'Retry load'));
  assert.equal(button(tree, '+ Make a plan'), undefined);
});

test('missing Google consent keeps event writes disabled and clearly asks for a real connection', async () => {
  const ui = calendarUi(async () => response(snapshot({ connection: 'required', calendars: [], events: [], error: 'Connect Google Calendar.' })));
  const tree = await ui.mount();
  assert.equal(button(tree, '+ Family birthday').props.disabled, true);
  assert.equal(button(tree, '+ Make a plan').props.disabled, true);
  assert.ok(button(tree, 'Connect Google Calendar'));
});

test('birthday form writes a recurring Google event, retains input/request identity after a failure, then confirms only a remote save', async () => {
  let fail = true; const calls = [];
  const ui = calendarUi(async (_url, options) => {
    if (!options?.method) return response(snapshot());
    const body = JSON.parse(options.body); calls.push(body);
    return fail ? response({ error: 'Google access expired. Reconnect Google Calendar.' }, 428) : response({ saved: true, supportSynced: true });
  });
  await ui.mount(); button(ui.render(), '+ Family birthday').props.onClick();
  editField(ui, 'Family member’s name', 'Grandma'); editField(ui, 'Birthday month', '12'); editField(ui, 'Birthday day', '31');
  editField(ui, 'Notes / things to remember', 'Loves chocolate cake');
  const submit = () => nodes(ui.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await submit();
  assert.equal(calls[0].op, 'event'); assert.equal(calls[0].change.event.kind, 'birthday'); assert.equal(calls[0].change.event.monthDay, '12-31');
  assert.equal(field(ui.render(), 'Family member’s name').props.children.props.value, 'Grandma');
  assert.ok(nodes(ui.render()).some(n => n.props?.role === 'alert'));
  fail = false; await submit();
  assert.equal(calls[0].change.requestId, calls[1].change.requestId);
  assert.equal(field(ui.render(), 'Family member’s name'), undefined);
  assert.ok(nodes(ui.render()).some(n => n.props?.role === 'status' && n.props.children === 'Saved in Google Calendar.'));
});

test('Google partial support failure says the plan was saved but needs repair, without a blanket success message', async () => {
  const ui = calendarUi(async (_url, options) => !options?.method ? response(snapshot()) : response({ saved: true, supportSynced: false, warning: 'Google saved the plan; repair sitter entries.' }));
  await ui.mount(); button(ui.render(), '+ Make a plan').props.onClick();
  editField(ui, 'Plan', 'Dinner'); editField(ui, 'Date', '2030-01-20'); editField(ui, 'Start time', '19:00');
  await nodes(ui.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.ok(nodes(ui.render()).some(n => n.props?.role === 'alert'));
  assert.equal(nodes(ui.render()).some(n => n.props?.children === 'Saved in Google Calendar.'), false);
});

test('fill open slots is guarded against repeated clicks and stops after an unconfirmed remote write', async () => {
  let posts = 0;
  const ui = calendarUi(async (_url, options) => {
    if (!options?.method) return response(snapshot());
    posts++; return response({ error: 'Google unavailable' }, 503);
  });
  await ui.mount(); button(ui.render(), 'Fill our calendar').props.onClick();
  const fill = button(ui.render(), 'Fill open slots in Google'); assert.equal(fill.props.disabled, false);
  fill.props.onClick(); fill.props.onClick(); await settle();
  assert.equal(posts, 1);
  assert.ok(nodes(ui.render()).some(n => n.props?.role === 'alert'));
});

test('dirty preferences disable event creation until an atomic preference save succeeds', async () => {
  let posted;
  const ui = calendarUi(async (_url, options) => {
    if (!options?.method) return response(snapshot());
    posted = JSON.parse(options.body); return response({ saved: true, updatedAt: '2030-01-01T12:00:00Z' });
  });
  await ui.mount(); button(ui.render(), 'Planning rhythm').props.onClick();
  editField(ui, 'Book sitters this many days ahead', '21');
  assert.equal(button(ui.render(), '+ Make a plan').props.disabled, true);
  await button(ui.render(), 'Save preferences').props.onClick();
  assert.equal(posted.op, 'preferences'); assert.equal(posted.value.settings.leadDays, 21); assert.equal(posted.expectedAt, null);
  assert.equal(Object.hasOwn(posted.value, 'plans'), false);
});

test('personal calendar is pinned in preferences and the event form has no alternate destination picker', async () => {
  const ui = calendarUi(async () => response(snapshot()));
  await ui.mount(); button(ui.render(), 'Planning rhythm').props.onClick();
  const destination = field(ui.render(), 'All new entries go to your personal calendar');
  assert.equal(destination.props.children.props.readOnly, true);
  assert.ok(nodes(ui.render()).some(n => n.type === 'input' && n.props.type === 'checkbox' && n.props.checked && n.props.disabled));
  button(ui.render(), '+ Family birthday').props.onClick();
  assert.equal(field(ui.render(), 'Your personal Google calendar').props.children.props.readOnly, true);
  assert.equal(field(ui.render(), 'Google calendar'), undefined);
});
