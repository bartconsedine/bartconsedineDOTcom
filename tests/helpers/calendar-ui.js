import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createUiRuntime, manualIntervals, tick } from './ui-runtime.js';
import * as model from '../../src/private-apps/calendar-companion/model.js';
import * as preferences from '../../src/private-apps/calendar-companion/preferences.js';
import * as outings from '../../src/private-apps/calendar-companion/outings.js';
import * as viewModel from '../../src/private-apps/calendar-companion/view-model.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');

// Executes the real JSX and event handlers while substituting only hooks/network.
// This is a local UI fixture, never a production authentication or storage path.
export function calendarUi(fetcher, initial = [], now = Date.now()) {
  const runtime = createUiRuntime(initial), timers = manualIntervals();
  const { code } = transformSync(readFileSync(new URL('../../src/private-apps/calendar-companion/planner.js', import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, Date: class extends Date { static now() { return now; } }, TextEncoder, URL, Blob, crypto: globalThis.crypto, setInterval: timers.setInterval, clearInterval: timers.clearInterval, setTimeout, Intl, window: { addEventListener() {}, removeEventListener() {}, confirm: () => true }, require: id => {
    if (id === 'react') return runtime.hooks;
    if (id === './model') return model;
    if (id === './preferences') return preferences;
    if (id === './outings') return outings;
    if (id === './view-model') return viewModel;
    if (id.endsWith('.css')) return {};
    if (id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  const component = () => module.exports.default();
  return {
    states: runtime.states,
    render() { return runtime.render(component); },
    mount() { return runtime.mount(component); },
    async tick(delay) { await timers.tick(delay); await tick(); return this.render(); },
    unmount: runtime.unmount,
    close: runtime.unmount,
  };
}

export function nodes(tree) {
  if (tree === null || tree === undefined || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree.type === 'function') return [tree, ...nodes(tree.type(tree.props))];
  return [tree, ...nodes(tree.props?.children)];
}
export const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props.children === label);
export const field = (tree, label) => nodes(tree).find(node => typeof node.type === 'function' && node.props.label === label);
