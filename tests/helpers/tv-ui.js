import * as tvHistory from '../../src/private-apps/morning-feed/tv/history.js';
// Runs real client components with synthetic hooks/network; not a live browser.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
export function tvUi(file, fetcher, props = {}) {
  const states = [], effects = [], pending = [], timers = new Map(); let slot = 0, timerId = 0;
  const hooks = {
    useRef(initial) { const key = slot++; if (!(key in states)) states[key] = { current: initial }; return states[key]; },
    useState(initial) { const key = slot++; if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial; return [states[key], next => { states[key] = typeof next === 'function' ? next(states[key]) : next; }]; },
    useEffect(fn, deps) { const key = slot++, old = effects[key]; if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) { old?.cleanup?.(); effects[key] = { deps }; pending.push(() => { effects[key].cleanup = fn(); }); } },
  };
  const { code } = transformSync(readFileSync(new URL(`../../src/private-apps/morning-feed/tv/${file}.js`, import.meta.url), 'utf8'), { babelrc: false, configFile: false, presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]], plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')] });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, setInterval(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearInterval(id) { timers.delete(id); }, window: { confirm: () => true }, require: id => {
    if (id === 'react') return hooks;
    if (['./history', './tv/history', '../tv/history.js'].includes(id)) return tvHistory;
    if (id.endsWith('.css')) return {};
    if (id === './remote-navigation') return { attachRemoteNavigation: () => undefined };
    if (id === '../screen') return () => null;
    if (id === 'react/jsx-runtime') return require(id);
    throw Error(`Unexpected import ${id}`);
  } });
  const flush = async () => { pending.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
  return { render() { slot = 0; return module.exports.default(props); }, async settle() { this.render(); await flush(); const result = this.render(); await flush(); return result; }, async tick(ms) { for (const timer of [...timers.values()]) if (timer.ms === ms) await timer.fn(); return this.settle(); }, close() { effects.forEach(effect => effect?.cleanup?.()); } };
}
export function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
export function text(tree) { if (tree == null || typeof tree === 'boolean') return ''; if (typeof tree !== 'object') return String(tree); return [tree.props?.children].flat(Infinity).map(text).join(' '); }
