import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as model from '../../src/private-apps/japan-trip/model.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');

// Executes the real JSX and event handlers while substituting only hooks/network.
// This is a local UI fixture, never a production authentication or storage path.
export function tripUi(fetcher, initial = []) {
  const states = [...initial]; let index = 0;
  const effects = []; const effectSlots = new Set();
  const { code } = transformSync(readFileSync(new URL('../../src/private-apps/japan-trip/command-center.js', import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  const hooks = {
    useState(value) { const slot = index++; if (!(slot in states)) states[slot] = value; return [states[slot], next => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }]; },
    useRef(value) { const slot = index++; if (!(slot in states)) states[slot] = { current: value }; return states[slot]; },
    useEffect(effect) { const slot = index++; if (!effectSlots.has(slot)) { effectSlots.add(slot); effects.push(effect); } },
  };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, TextEncoder, URL, Blob, crypto: globalThis.crypto, window: { addEventListener() {}, removeEventListener() {} }, require: id => {
    if (id === 'react') return hooks;
    if (id === './model') return model;
    if (id.endsWith('.css')) return {};
    if (id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  return { states, render() { index = 0; return module.exports.default(); }, async mount() { this.render(); effects.splice(0).forEach(effect => effect()); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); return this.render(); } };
}

export function nodes(tree) {
  if (tree === null || tree === undefined || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree.type === 'function') return [tree, ...nodes(tree.type(tree.props))];
  return [tree, ...nodes(tree.props?.children)];
}
export const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props.children === label);
export const field = (tree, label) => nodes(tree).find(node => typeof node.type === 'function' && node.props.label === label);
