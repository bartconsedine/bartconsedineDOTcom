import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { tripUi, button, field, nodes } from './helpers/trip-ui.js';
import { emptyPlan } from '../src/private-apps/japan-trip/model.js';

test('failed load blocks editing and provides a retry instead of creating an empty replacement', async () => {
  let fail = true;
  const ui = tripUi(async () => fail ? Response.json({}, { status: 503 }) : Response.json({ plan: null, updatedAt: null }));
  let tree = await ui.mount();
  assert.match(renderToStaticMarkup(tree), /Could not load/);
  assert.equal(button(tree, 'Save changes'), undefined);
  fail = false; await button(tree, 'Retry loading').props.onClick(); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /Your trip starts here/);
});

test('editing, failed save, retry and reload keep the plan and report success only after confirmation', async () => {
  let saved = null, failSave = true;
  const fetcher = async (_, options = {}) => {
    if (options.method === 'POST') {
      if (failSave) return Response.json({ error: 'unavailable' }, { status: 503 });
      const body = JSON.parse(options.body); assert.equal(body.expectedAt, null); saved = body.plan; return Response.json({ saved: true, updatedAt: '2030-01-01T00:00:00Z' });
    }
    return Response.json({ plan: saved, updatedAt: saved ? '2030-01-01T00:00:00Z' : null });
  };
  const ui = tripUi(fetcher); let tree = await ui.mount();
  button(tree, 'Trip settings').props.onClick(); tree = ui.render();
  field(tree, 'Trip name').props.onChange('Snow adventure'); tree = ui.render();
  await button(tree, 'Save changes').props.onClick(); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /Save failed.*edits are still here/);
  assert.equal(ui.states[0].title, 'Snow adventure'); assert.equal(saved, null);
  failSave = false; await button(tree, 'Retry save').props.onClick(); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /Saved to your private workspace/);
  const reloaded = tripUi(fetcher); await reloaded.mount(); assert.equal(reloaded.states[0].title, 'Snow adventure');
});

test('import is reviewed, cancel preserves edits, and accepting stays unsaved until explicit save', async () => {
  const ui = tripUi(async () => Response.json({ plan: null, updatedAt: null })); let tree = await ui.mount();
  const imported = { ...emptyPlan(), title: 'Imported adventure' };
  const file = { size: 500, text: async () => JSON.stringify(imported) };
  const input = () => nodes(ui.render()).find(node => node.type === 'input' && node.props.type === 'file');
  await input().props.onChange({ target: { files: [file], value: 'file' } }); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /Review import: Imported adventure/);
  assert.equal(ui.states[0].title, emptyPlan().title);
  button(tree, 'Cancel import').props.onClick(); assert.equal(ui.states[0].title, emptyPlan().title);
  await input().props.onChange({ target: { files: [file], value: 'file' } }); tree = ui.render();
  button(tree, 'Use this plan').props.onClick(); tree = ui.render();
  assert.equal(ui.states[0].title, imported.title); assert.match(renderToStaticMarkup(tree), /Unsaved changes/);
});

test('undo removal restores only the removed task, preserving subsequent edits', async () => {
  const value = { ...emptyPlan(), tasks: [{ id: 'one', title: 'Pack', due: '', done: false }, { id: 'two', title: 'Check ticket', due: '', done: false }] };
  const ui = tripUi(async () => Response.json({ plan: value, updatedAt: null })); let tree = await ui.mount();
  button(tree, 'Checklist').props.onClick(); tree = ui.render();
  nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === 'Remove Pack').props.onClick(); tree = ui.render();
  field(tree, 'Task').props.onChange('Check ticket confirmation'); tree = ui.render();
  button(tree, 'Undo removal').props.onClick();
  assert.equal(ui.states[0].tasks[0].title, 'Pack'); assert.equal(ui.states[0].tasks[1].title, 'Check ticket confirmation');
});

test('starting flight draft appears without import and stays marked unsaved until database confirmation', async () => {
  const draft = { ...emptyPlan(), start: '2030-01-27', end: '2030-02-05' };
  let writes = 0;
  const ui = tripUi(async (_, options = {}) => {
    if (options.method === 'POST') { writes++; return Response.json({ saved: true, updatedAt: '2030-01-01T00:00:00Z' }); }
    return Response.json({ plan: draft, updatedAt: null });
  });
  let tree = await ui.mount();
  assert.match(renderToStaticMarkup(tree), /Jan 27.*Feb 5/);
  assert.match(renderToStaticMarkup(tree), /Unsaved changes/);
  assert.equal(button(tree, 'Save changes').props.disabled, false); assert.equal(writes, 0);
  await button(tree, 'Save changes').props.onClick(); tree = ui.render();
  assert.equal(writes, 1); assert.match(renderToStaticMarkup(tree), /Saved to your private workspace/);
});


test('chat conflict keeps unsaved editor changes and sends the exact database revision', async () => {
  const revision = '2030-01-01T00:00:00.123456Z';
  const ui = tripUi(async (_, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      assert.equal(body.expectedAt, revision);
      assert.equal(body.plan.title, 'Local draft');
      return Response.json({ error: 'Your plan changed in another tab or chat. Export your edits, then reload and reconcile before saving.' }, { status: 409 });
    }
    return Response.json({ plan: emptyPlan(), updatedAt: revision });
  });
  let tree = await ui.mount();
  button(tree, 'Trip settings').props.onClick(); tree = ui.render();
  field(tree, 'Trip name').props.onChange('Local draft'); tree = ui.render();
  await button(tree, 'Save changes').props.onClick(); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /changed in another tab or chat/);
  assert.equal(ui.states[0].title, 'Local draft');
  assert.match(renderToStaticMarkup(tree), /Unsaved changes/);
  assert.ok(nodes(tree).find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.join('') === 'Export current plan (includes unsaved edits)'));
  assert.doesNotMatch(renderToStaticMarkup(tree), /Saved to your private workspace/);
});

test('booking search and status filters combine without modifying the saved plan', async () => {
  const booking = (id, item, status, provider) => ({ id, item, status, provider, due: '', estimate: null, actual: null, confirmation: '', url: '', notes: '' });
  const plan = { ...emptyPlan(), bookings: [booking('flight', 'International flight', 'Booked', 'JAL'), booking('hotel', 'Tokyo hotel', 'Not started', 'Tokyo'), booking('stay', 'Ski lodge', 'Booked', 'Niseko')] };
  const ui = tripUi(async () => Response.json({ plan, updatedAt: '2030-01-01T00:00:00Z' }));
  let tree = await ui.mount();
  button(tree, 'Bookings').props.onClick(); tree = ui.render();
  nodes(tree).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'tokyo' } }); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /Tokyo hotel/);
  assert.doesNotMatch(renderToStaticMarkup(tree), /International flight/);
  nodes(tree).find(node => node.props['aria-label'] === 'Booking status').props.onChange({ target: { value: 'Booked' } }); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /No bookings match these filters/);
  assert.equal(ui.states[0].bookings.length, 3);
  assert.equal(ui.states[3], false);
  button(tree, 'Clear filters').props.onClick(); tree = ui.render();
  assert.equal(nodes(tree).filter(node => node.type === 'details').length, 3);
});

test('checklist filtering recovers hidden tasks and a new task clears the filters', async () => {
  const plan = { ...emptyPlan(), tasks: [{ id: 'one', title: 'Pack snowboard', due: '', done: false }, { id: 'two', title: 'Check passport', due: '', done: true }] };
  const ui = tripUi(async () => Response.json({ plan, updatedAt: '2030-01-01T00:00:00Z' }));
  let tree = await ui.mount(); button(tree, 'Checklist').props.onClick(); tree = ui.render();
  nodes(tree).find(node => node.props['aria-label'] === 'Task status').props.onChange({ target: { value: 'Completed tasks' } }); tree = ui.render();
  assert.equal(field(tree, 'Task').props.value, 'Check passport');
  nodes(tree).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'missing' } }); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /No tasks match these filters/);
  button(tree, 'Add task').props.onClick(); tree = ui.render();
  assert.equal(nodes(tree).filter(node => typeof node.type === 'function' && node.props.label === 'Task').length, 3);
  assert.equal(nodes(tree).find(node => node.type === 'progress').props.value, 1);
  assert.equal(nodes(tree).find(node => node.type === 'progress').props.max, 3);
});

test('shared viewers can search and enter route comparison without enabling editing', async () => {
  const plan = { ...emptyPlan(), bookings: [{ id: 'hotel', item: 'Tokyo hotel', status: 'Booked', provider: '', due: '', estimate: null, actual: null, confirmation: '', url: '', notes: '' }] };
  const ui = tripUi(async () => Response.json({ plan, updatedAt: '2030-01-01T00:00:00Z' }), [], { permission: 'viewer' });
  let tree = await ui.mount();
  const editor = nodes(tree).find(node => node.type === 'fieldset');
  assert.equal(editor.props.disabled, true);
  assert.equal(button(editor, 'Browse 10 itineraries'), undefined);
  nodes(editor).find(node => node.type === 'a' && node.props.children === 'Review costs').props.onClick({ preventDefault() {} }); tree = ui.render();
  assert.equal(button(tree, 'Bookings').props['aria-current'], 'page');
  button(tree, 'Overview').props.onClick(); tree = ui.render();
  button(tree, 'Browse 10 itineraries').props.onClick(); tree = ui.render();
  assert.equal(button(tree, 'Explore 10 options').props['aria-current'], 'page');
  button(tree, 'Bookings').props.onClick(); tree = ui.render();
  const search = nodes(tree).find(node => node.type === 'input' && node.props.type === 'search');
  assert.ok(search);
  assert.equal(nodes(nodes(tree).find(node => node.type === 'fieldset')).includes(search), false);
  search.props.onChange({ target: { value: 'no match' } }); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /No bookings match these filters/);
  assert.equal(button(tree, 'Save changes').props.disabled, true);
});

test('editing a matching booking keeps its form mounted until focus leaves the entry', async () => {
  const plan = { ...emptyPlan(), bookings: [{ id: 'hotel', item: 'Tokyo hotel', status: 'Not started', provider: '', due: '', estimate: null, actual: null, confirmation: '', url: '', notes: '' }] };
  const ui = tripUi(async () => Response.json({ plan, updatedAt: '2030-01-01T00:00:00Z' }));
  await ui.mount(); button(ui.render(), 'Bookings').props.onClick();
  nodes(ui.render()).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'Tokyo' } });
  nodes(ui.render()).find(node => node.type === 'details').props.onFocus();
  field(ui.render(), 'Booking / cost').props.onChange('Kyoto hotel');
  assert.equal(field(ui.render(), 'Booking / cost').props.value, 'Kyoto hotel');
  let entry = nodes(ui.render()).find(node => node.type === 'details');
  entry.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} });
  assert.ok(field(ui.render(), 'Booking / cost'), 'moving between fields retains the editor');
  entry.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: {} });
  assert.equal(field(ui.render(), 'Booking / cost'), undefined);
  button(ui.render(), 'Clear filters').props.onClick();
  assert.equal(field(ui.render(), 'Booking / cost').props.value, 'Kyoto hotel');
  ui.close();
});

test('itinerary and checklist editors remain available when their matching text changes', async () => {
  const plan = { ...emptyPlan(), days: [{ id: 'arrival', date: '2030-01-27', location: 'Tokyo', morning: '', afternoon: '', evening: '', sleep: '', risk: '', riding: false }], tasks: [{ id: 'pack', title: 'Pack board', due: '', done: false }] };
  const ui = tripUi(async () => Response.json({ plan, updatedAt: '2030-01-01T00:00:00Z' }));
  await ui.mount();
  for (const [tab, query, label, next, type] of [['Itinerary', 'Tokyo', 'Location', 'Kyoto', 'details'], ['Checklist', 'Pack', 'Task', 'Check board', 'div']]) {
    button(ui.render(), tab).props.onClick();
    nodes(ui.render()).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: query } });
    nodes(ui.render()).find(node => node.type === type && node.props.onFocus).props.onFocus();
    field(ui.render(), label).props.onChange(next);
    assert.equal(field(ui.render(), label).props.value, next);
  }
  ui.close();
});

test('new itinerary days, bookings and tasks reveal and focus their first editing field once', async () => {
  const ui = tripUi(async () => Response.json({ plan: emptyPlan(), updatedAt: null }));
  await ui.mount();
  for (const [tab, action, tagName] of [['Itinerary', 'Add day', 'DETAILS'], ['Bookings', 'Add booking / cost', 'DETAILS'], ['Checklist', 'Add task', 'DIV']]) {
    button(ui.render(), tab).props.onClick(); button(ui.render(), action).props.onClick();
    const entry = nodes(ui.render()).find(node => node.type === tagName.toLowerCase() && typeof node.props.ref === 'function');
    let focused = 0, scrolled = 0;
    const node = { tagName, open: false, querySelector: () => ({ focus() { focused++; } }), scrollIntoView() { scrolled++; } };
    entry.props.ref(node);
    if (tagName === 'DETAILS') assert.equal(node.open, true);
    assert.equal(focused, 1); assert.equal(scrolled, 1);
    entry.props.ref(node);
    assert.equal(focused, 1, 'rerenders do not steal focus');
  }
  ui.close();
});

test('Ctrl/Cmd+S consumes the shortcut for a loaded plan and writes only dirty editable state', async () => {
  let writes = 0;
  const fetcher = async (_url, options) => {
    if (options?.method === 'POST') { writes++; return Response.json({ saved: true, updatedAt: '2030-01-02T00:00:00Z' }); }
    return Response.json({ plan: emptyPlan(), updatedAt: '2030-01-01T00:00:00Z' });
  };
  const ui = tripUi(fetcher); await ui.mount();
  let prevented = 0;
  await ui.dispatch('keydown', { key: 's', ctrlKey: true, preventDefault() { prevented++; } });
  assert.equal(prevented, 1); assert.equal(writes, 0);
  button(ui.render(), 'Trip settings').props.onClick(); field(ui.render(), 'Trip name').props.onChange('Winter trip'); ui.render();
  await ui.dispatch('keydown', { key: 's', metaKey: true, preventDefault() { prevented++; } });
  assert.equal(prevented, 2); assert.equal(writes, 1);
  await ui.dispatch('keydown', { key: 's', ctrlKey: true, preventDefault() { prevented++; } });
  assert.equal(prevented, 3); assert.equal(writes, 1);
  ui.close();
  const viewer = tripUi(fetcher, [], { permission: 'viewer' }); await viewer.mount();
  await viewer.dispatch('keydown', { key: 's', ctrlKey: true, preventDefault() { prevented++; } });
  assert.equal(prevented, 4); assert.equal(writes, 1); viewer.close();
});
