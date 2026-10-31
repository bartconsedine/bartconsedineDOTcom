import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as calendarModel from '../../src/private-apps/calendar-companion/model.js';
import * as layout from '../../src/private-apps/morning-feed/tldr/layout.js';
import * as model from '../../src/private-apps/morning-feed/model.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
export function tickerUi(fetcher, props = {}, reduced = false, file = 'tldr/ticker.js') {
  const states = [], effects = [], pending = [], timers = new Map(), keys = new Map(); let slot = 0, timerId = 0;
  const hooks = {
    useState(initial) { const key = slot++; if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial; return [states[key], next => { states[key] = typeof next === 'function' ? next(states[key]) : next; }]; },
    useRef(initial) { const key = slot++; if (!(key in states)) states[key] = { current: initial }; return states[key]; },
    useEffect(fn, deps) { const key = slot++, old = effects[key]; if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) { old?.cleanup?.(); effects[key] = { deps }; pending.push(() => { effects[key].cleanup = fn(); }); } },
  };
  const { code } = transformSync(readFileSync(new URL(`../../src/private-apps/morning-feed/${file}`, import.meta.url), 'utf8'), { babelrc: false, configFile: false, presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]], plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')] });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, URL, AbortController, crypto: globalThis.crypto, setInterval(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearInterval(id) { timers.delete(id); }, document: { activeElement: null }, window: { matchMedia: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }), addEventListener: (key, fn) => keys.set(key, fn), removeEventListener: key => keys.delete(key) }, require: id => {
    if (id === 'react') return hooks;
    if (id === 'qrcode') return { toDataURL: async url => 'data:image/png;base64,' + Buffer.from(url).toString('base64') };
    if (id === '../../calendar-companion/model.js') return calendarModel;
    if (id === './layout.js' || id === '../tldr/layout.js') return layout;
    if (id === './model.js') return model;
    if (id.endsWith('.css')) return {};
    if (id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unexpected import ${id}`);
  } });
  const flush = async () => { pending.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
  return { states, render() { slot = 0; return module.exports.default(props); }, async settle() { this.render(); await flush(); const tree = this.render(); await flush(); return tree; }, async tick(ms) { for (const timer of [...timers.values()]) if (timer.ms === ms) await timer.fn(); return this.settle(); }, key(key) { keys.get('keydown')?.({ key, target: { classList: { contains: () => true } }, preventDefault() {}, stopPropagation() {} }); }, close() { effects.forEach(effect => effect?.cleanup?.()); } };
}
