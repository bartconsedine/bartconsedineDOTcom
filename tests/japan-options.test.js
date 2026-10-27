import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildOptions, places, routeFor } from '../src/private-apps/japan-trip/options.js';
import { explorerUi, nodes, button } from './helpers/trip-ui.js';
const plan = { start: '2027-01-27', end: '2027-02-05' };

test('ten distinct proposals cover exactly eight nights and protect the flight anchors', () => {
  const options = buildOptions(plan);
  assert.equal(options.length, 10);
  assert.equal(new Set(options.map(o => o.nights)).size, 10);
  for (const o of options) {
    assert.equal(o.days.length, 8);
    assert.equal(o.days[0].date, '2027-01-28');
    assert.equal(o.days.at(-1).date, '2027-02-04');
    assert.equal(o.days[0].place, 'T');
    assert.equal(o.days.at(-1).place, 'T');
    assert.ok(o.days.every(d => places[d.place]));
    assert.ok(o.days.every(d => !d.transfer || !d.riding));
    assert.equal(o.riding, o.days.filter(d => d.riding).length);
    assert.equal(routeFor(o)[0], 'T');
    assert.equal(routeFor(o).at(-1), 'T');
    assert.equal(o.pros.length, 2); assert.equal(o.cons.length, 2);
  }
  assert.equal(options.find(o => o.id === 'powder').riding, 5);
  assert.equal(options.find(o => o.id === 'split').riding, 4);
  assert.equal(options.find(o => o.id === 'balanced').riding, 3);
});

test('a changed trip cannot silently reuse proposals for different flight dates', () => {
  assert.deepEqual(buildOptions({ ...plan, end: '2027-02-06' }), []);
  const ui = explorerUi({ start: '', end: '' });
  assert.match(renderToStaticMarkup(ui.render()), /dates differ/);
});

test('option selection, day scrubbing, map location selection and zoom stay synchronized', () => {
  const ui = explorerUi(plan); let tree = ui.render();
  const optionButton = title => nodes(ui.render()).find(n => n.type === 'button' && n.props.className === 'jo-option' && nodes(n).some(c => c.type === 'strong' && c.props.children === title));
  optionButton('Powder first').props.onClick(); tree = ui.render();
  assert.equal(ui.states[0], 'powder');
  nodes(tree).find(n => n.type === 'input' && n.props.type === 'range').props.onChange({ target: { value: '3' } }); tree = ui.render();
  assert.match(renderToStaticMarkup(tree), /Jan 31 · Niseko/);
  const map = () => nodes(ui.render()).find(n => n.type === 'svg');
  button(tree, 'Zoom to Hokkaido').props.onClick();
  assert.equal(map().props.viewBox, '835 180 260 180');
  const location = nodes(ui.render()).find(n => n.type === 'button' && nodes(n).some(c => c.type === 'i') && n.props['aria-pressed'] === false);
  location.props.onClick(); assert.equal(ui.states[1], 0);
  optionButton('The balanced classic').props.onClick(); assert.equal(ui.states[1], 0);
});

test('riding filter selects a visible option and comparison can clear the filter', () => {
  const ui = explorerUi(plan);
  const select = nodes(ui.render()).find(n => n.type === 'select');
  select.props.onChange({ target: { value: '5' } });
  let tree = ui.render();
  assert.equal(nodes(tree).filter(n => n.type === 'button' && n.props.className === 'jo-option').length, 1);
  assert.equal(ui.states[0], 'powder');
  button(tree, 'Canal town detour').props.onClick(); tree = ui.render();
  assert.equal(ui.states[0], 'otaru'); assert.equal(ui.states[3], 0);
  assert.match(renderToStaticMarkup(tree), /ticket issuance unverified/);
});
