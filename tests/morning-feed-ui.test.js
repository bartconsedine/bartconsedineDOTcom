import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { morningUi } from './helpers/morning-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { emptyScreen } from '../src/private-apps/morning-feed/model.js';
const card = id => ({ id, kind: 'ritual', title: `Ritual ${id}`, body: 'A small start', minutes: 5, url: '', enabled: true, completedOn: '' });
const view = ui => renderToStaticMarkup(ui.render());
const input = (ui, label) => nodes(ui.render()).find(n => n.type === 'input' && n.props['aria-label'] === label);

test('failed load cannot be edited; retry loads an honest empty state', async () => {
  let fail = true;
  const ui = morningUi(async () => fail ? Response.json({}, { status: 503 }) : Response.json({ screen: null, updatedAt: null }));
  await ui.settle(); assert.match(view(ui), /Could not load/); assert.equal(button(ui.render(), 'Save morning'), undefined);
  fail = false; await button(ui.render(), 'Retry loading').props.onClick(); await ui.settle(); assert.match(view(ui), /Big plans start/); ui.close();
});

test('edits survive failed save, retry confirms, and a new session recovers the same saved screen', async () => {
  let stored = null, fail = true;
  const fetcher = async (_, options = {}) => {
    if (options.method === 'POST') { if (fail) return Response.json({}, { status: 503 }); const body = JSON.parse(options.body); assert.equal(body.expectedAt, null); stored = body.screen; return Response.json({ saved: true, updatedAt: '2026-10-27T02:00:00Z' }); }
    return Response.json({ screen: stored, updatedAt: stored ? '2026-10-27T02:00:00Z' : null });
  };
  const ui = morningUi(fetcher); await ui.settle(); button(ui.render(), 'Build your morning').props.onClick(); await ui.settle();
  input(ui, 'Card 1 title').props.onChange({ target: { value: 'Morning stretch' } });
  await button(ui.render(), 'Save morning').props.onClick(); assert.match(view(ui), /Save failed.*edits are still here/); assert.equal(stored, null);
  fail = false; await button(ui.render(), 'Retry save').props.onClick(); assert.match(view(ui), /Saved to your private workspace/);
  const fresh = morningUi(fetcher); await fresh.settle(); assert.match(view(fresh), /Morning stretch/); ui.close(); fresh.close();
});

test('conflicts preserve local drafts; invalid timezone input does not crash preview', async () => {
  const revision = '2026-10-27T02:00:00.123456Z';
  const ui = morningUi(async (_, options = {}) => {
    if (options.method === 'POST') { assert.equal(JSON.parse(options.body).expectedAt, revision); return Response.json({ error: 'Your screen changed on another device or in chat.' }, { status: 409 }); }
    return Response.json({ screen: { ...emptyScreen(), cards: [card('one')] }, updatedAt: revision });
  }); await ui.settle(); button(ui.render(), 'Edit morning').props.onClick(); await ui.settle();
  const timezone = nodes(ui.render()).find(n => n.type === 'input' && n.props.value === 'America/New_York'); timezone.props.onChange({ target: { value: 'Amer' } });
  assert.doesNotThrow(() => view(ui)); await button(ui.render(), 'Save morning').props.onClick(); assert.match(view(ui), /valid time zone/);
  nodes(ui.render()).find(n => n.type === 'input' && n.props.value === 'Amer').props.onChange({ target: { value: 'America/New_York' } });
  input(ui, 'Card 1 title').props.onChange({ target: { value: 'My draft' } }); await button(ui.render(), 'Save morning').props.onClick(); assert.match(view(ui), /changed on another device/); assert.match(view(ui), /My draft/); ui.close();
});

test('TV rotates, handles remote keys, refreshes saved changes and labels stale data after a failed poll', async () => {
  let screen = { ...emptyScreen(), cards: [card('one'), card('two')] }, fail = false;
  const ui = morningUi(async () => fail ? Response.json({}, { status: 503 }) : Response.json({ screen, updatedAt: '2026-10-27T02:00:00Z' }));
  await ui.settle(); button(ui.render(), 'TV mode ↗').props.onClick(); await ui.settle(); assert.match(view(ui), /ON AIR/); assert.match(view(ui), /Ritual one/);
  await ui.tick(20000); assert.match(view(ui), /Ritual two/); ui.key('ArrowLeft'); assert.match(view(ui), /Ritual one/);
  screen = { ...screen, focus: 'A saved change from my phone' }; await ui.tick(30000); assert.match(view(ui), /A saved change from my phone/);
  fail = true; await ui.tick(30000); assert.match(view(ui), /Display is offline/); assert.match(view(ui), /A saved change from my phone/);
  ui.key('Escape'); await ui.settle(); assert.doesNotMatch(view(ui), /ON AIR/); ui.close();
});

test('completion, remove/undo and viewer controls respect editable state and explicit saves', async () => {
  const screen = { ...emptyScreen(), cards: [card('one'), card('two')] };
  const fetcher = async () => Response.json({ screen, updatedAt: null });
  const ui = morningUi(fetcher); await ui.settle(); button(ui.render(), 'Mark complete').props.onClick(); assert.match(view(ui), /Done today/); assert.equal(button(ui.render(), 'TV mode ↗').props.disabled, true);
  button(ui.render(), 'Edit morning').props.onClick(); await ui.settle(); button(ui.render(), 'Remove').props.onClick(); input(ui, 'Card 1 title').props.onChange({ target: { value: 'Keep my other edit' } }); button(ui.render(), 'Undo removal').props.onClick(); assert.match(view(ui), /Keep my other edit/); assert.equal(ui.states[0].cards.length, 2);
  const viewer = morningUi(fetcher, { permission: 'viewer' }); await viewer.settle(); assert.equal(button(viewer.render(), 'Edit morning'), undefined); assert.equal(button(viewer.render(), 'Save morning'), undefined); assert.equal(button(viewer.render(), 'Mark complete').props.disabled, true); ui.close(); viewer.close();
});
