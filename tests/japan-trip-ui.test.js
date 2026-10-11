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
