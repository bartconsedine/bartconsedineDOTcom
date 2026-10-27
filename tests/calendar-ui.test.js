import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarUi, nodes, button, field } from './helpers/calendar-ui.js';
import { emptyPlanner } from '../src/private-apps/calendar-companion/model.js';

const response = (value, status = 200) => ({ ok: status === 200, status, json: async () => value });
const editField = (ui, label, value) => { const node = field(ui.render(), label); assert.ok(node, label); node.props.children.props.onChange({ target: { value } }); };
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('calendar UI keeps failed-load state and never makes an empty writable planner after database failure', async () => {
  const ui = calendarUi(async () => response({}, 503));
  const tree = await ui.mount();
  assert.ok(nodes(tree).some(n => n.props?.role === 'alert'));
  assert.ok(button(tree, 'Retry load'));
  assert.equal(button(tree, 'Save changes'), undefined);
});

test('new plan form persists coverage and preserves unsaved input on failure before retry', async () => {
  let fail = true, saved;
  const ui = calendarUi(async (_url, options) => {
    if (!options?.method) return response({ plan: emptyPlanner(), updatedAt: null });
    saved = JSON.parse(options.body);
    return fail ? response({}, 503) : response({ saved: true, updatedAt: '2030-01-01T12:00:00Z' });
  });
  await ui.mount(); button(ui.render(), '+ Make a plan').props.onClick();
  editField(ui, 'Plan', 'Dinner together'); editField(ui, 'Date', '2030-01-20'); editField(ui, 'Start time', '19:00');
  editField(ui, 'Sitter coverage', 'Confirmed'); editField(ui, 'Sitter name', 'Alex');
  const submit = () => nodes(ui.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await submit();
  assert.equal(saved.plan.plans[0].sitter, 'Alex'); assert.equal(saved.expectedAt, null);
  assert.ok(field(ui.render(), 'Plan')); assert.ok(nodes(ui.render()).some(n => n.props?.role === 'alert'));
  assert.equal(field(ui.render(), 'Plan').props.children.props.value, 'Dinner together');
  fail = false; await submit();
  assert.equal(field(ui.render(), 'Plan'), undefined);
  assert.equal(button(ui.render(), 'Save changes').props.disabled, true);
});

test('fill open slots saves real planning holds once and stale conflicts preserve those edits', async () => {
  let posts = 0, body;
  const ui = calendarUi(async (_url, options) => {
    if (!options?.method) return response({ plan: emptyPlanner(), updatedAt: '2030-01-01T12:00:00Z' });
    posts++; body = JSON.parse(options.body); return response({}, 409);
  });
  await ui.mount(); button(ui.render(), 'Fill our calendar').props.onClick();
  const fill = button(ui.render(), 'Fill open slots');
  fill.props.onClick(); fill.props.onClick(); await settle();
  assert.equal(posts, 1, 'synchronous lock stops rapid duplicate saves');
  assert.ok(body.plan.plans.length > 0); assert.ok(body.plan.plans.every(p => p.coverage === 'Needed'));
  assert.ok(nodes(ui.render()).some(n => n.props?.role === 'alert'));
  assert.equal(button(ui.render(), 'Save changes').props.disabled, false);
  assert.equal(button(ui.render(), 'Download calendar (.ics)').props.disabled, true);
});
