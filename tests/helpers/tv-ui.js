import * as tvHistory from '../../src/private-apps/morning-feed/tv/history.js';
import * as calendarModel from '../../src/private-apps/morning-feed/tv/calendar-model.js';
// Runs real client components with synthetic hooks/network; not a live browser.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
export function tvUi(file, fetcher, props = {}) {
  const states = [], effects = [], pending = [], timers = new Map(); let slot = 0, timerId = 0;
  const listeners = new Map(); let now = Date.now();
  const hooks = {
    useMemo(fn) { slot++; return fn(); },
    useRef(initial) { const key = slot++; if (!(key in states)) states[key] = { current: initial }; return states[key]; },
    useState(initial) { const key = slot++; if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial; return [states[key], next => { states[key] = typeof next === 'function' ? next(states[key]) : next; }]; },
    useEffect(fn, deps) { const key = slot++, old = effects[key]; if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) { old?.cleanup?.(); effects[key] = { deps }; pending.push(() => { effects[key].cleanup = fn(); }); } },
  };
  const { code } = transformSync(readFileSync(new URL(`../../src/private-apps/morning-feed/tv/${file}.js`, import.meta.url), 'utf8'), { babelrc: false, configFile: false, presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]], plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')] });
  const module = { exports: {} };
  const events = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, AbortController, setTimeout, clearTimeout, Date: class extends Date { static now() { return now; } }, setInterval(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearInterval(id) { timers.delete(id); }, document: { visibilityState: 'visible', ...events }, window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), confirm: () => true, ...events }, require: id => {
    if (id === 'react') return hooks;
    if (id === './calendar-model.js') return calendarModel;
    if (id === './paged-text') return ({ text }) => text;
    if (['./history', './tv/history', '../tv/history.js'].includes(id)) return tvHistory;
    if (id.endsWith('.css')) return {};
    if (id === './remote-navigation') return { attachRemoteNavigation: () => undefined };
    if (id === '../screen') return () => null;
    if (id === 'react/jsx-runtime') return require(id);
    throw Error(`Unexpected import ${id}`);
  } });
  const flush = async () => { pending.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
  return { setNow(value) { now = value; }, async dispatch(event) { listeners.get(event)?.(); return this.settle(); }, render() { slot = 0; return module.exports.default(props); }, async settle() { this.render(); await flush(); this.render(); await flush(); return this.render(); }, async tick(ms) { for (const timer of [...timers.values()]) if (timer.ms === ms) await timer.fn(); return this.settle(); }, close() { effects.forEach(effect => effect?.cleanup?.()); } };
}
export function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
export function text(tree) { if (tree == null || typeof tree === 'boolean') return ''; if (typeof tree !== 'object') return String(tree); if (typeof tree.type === 'function') return text(tree.type(tree.props)); return [tree.props?.children].flat(Infinity).map(text).join(' '); }
