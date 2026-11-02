import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
function ui(fetcher) {
  const state = [], effects = [], pending = [], timers = new Map(); let slot = 0, timer = 0, destination;
  const root = { querySelector: () => ({ focus() {} }), closest: () => root };
  const hooks = {
    useState(initial) { const k = slot++; if (!(k in state)) state[k] = initial; return [state[k], value => { state[k] = value; }]; },
    useRef(initial) { const k = slot++; if (!(k in state)) state[k] = { current: initial === null ? root : initial }; return state[k]; },
    useEffect(fn, deps) { const k = slot++, old = effects[k]; if (!old || deps.some((v, i) => !Object.is(v, old.deps[i]))) { old?.cleanup?.(); effects[k] = { deps }; pending.push(() => { effects[k].cleanup = fn(); }); } },
  };
  const { code } = transformSync(readFileSync('src/app/login/qr/qr-device.js', 'utf8'), { babelrc: false, configFile: false, presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]], plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')] });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, AbortSignal, window: { location: { assign: url => { destination = url; } } }, setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id), require: id => id === 'react' ? hooks : id.includes('remote-navigation') ? { attachRemoteNavigation: () => () => {} } : require(id) });
  return { render() { slot = 0; const tree = module.exports.default(); pending.splice(0).forEach(fn => fn()); return tree; }, async poll() { const work = [...timers.values()]; timers.clear(); for (const fn of work) await fn(); }, get destination() { return destination; }, close() { effects.forEach(e => e.cleanup?.()); } };
}
function nodes(tree, predicate) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(t => nodes(t, predicate)); return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]; }
const button = (tree, text) => nodes(tree, n => n.type === 'button' && n.props.children === text)[0];
const pending = { status: 'pending', qr: 'data:image/png;base64,synthetic', confirmation: '1234ABCD' };
test('owner QR keeps the same code through a failed poll and resumes after retry; duplicate OK cannot start a second request', async () => {
  const calls = []; let release, fail = false;
  const fixture = ui(async (_, input) => { calls.push(JSON.parse(input.body).action); if (calls.length === 1) return new Promise(resolve => { release = () => resolve(Response.json(pending)); }); if (fail) throw new TypeError('Network unavailable'); return Response.json(pending); });
  try {
    const start = button(fixture.render(), 'Generate QR code').props.onClick();
    await button(fixture.render(), 'Creating request…').props.onClick(); assert.equal(calls.length, 1);
    release(); await start; fixture.render(); fail = true; await fixture.poll();
    let tree = fixture.render(); assert.equal(nodes(tree, n => n.type === 'img')[0].props.src, pending.qr); assert.ok(button(tree, 'Retry connection'));
    await fixture.poll(); assert.equal(calls.length, 2);
    fail = false; await button(tree, 'Retry connection').props.onClick(); tree = fixture.render(); assert.equal(nodes(tree, n => n.props?.role === 'alert').length, 0); assert.equal(nodes(tree, n => n.type === 'img')[0].props.src, pending.qr);
  } finally { fixture.close(); }
});
test('owner QR handles expiration and sends completed sign-in only to the Calendar entry', async () => {
  let result = pending;
  const fixture = ui(async () => Response.json(result));
  try {
    await button(fixture.render(), 'Generate QR code').props.onClick(); fixture.render(); result = { status: 'expired' }; await fixture.poll(); assert.ok(button(fixture.render(), 'Generate QR code'));
    result = { ...pending, status: 'ready' }; await button(fixture.render(), 'Generate QR code').props.onClick(); fixture.render(); result = { connected: true, destination: 'https://untrusted.example' }; await fixture.poll(); assert.equal(fixture.destination, '/tv?view=calendar');
  } finally { fixture.close(); }
});
