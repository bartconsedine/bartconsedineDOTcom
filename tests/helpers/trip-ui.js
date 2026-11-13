import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createUiRuntime, manualIntervals, tick } from './ui-runtime.js';
import * as workspace from '../../src/lib/workspace-policy.js';
import * as options from '../../src/private-apps/japan-trip/options.js';
import * as coast from '../../src/private-apps/japan-trip/coastline.js';
import * as partyModel from '../../src/private-apps/robot-party/model.js';
import * as model from '../../src/private-apps/japan-trip/model.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');

// Executes the real JSX and event handlers while substituting only hooks/network.
// This is a local UI fixture, never a production authentication or storage path.
export function connectUi(fetcher, props) { return componentUi('../robot-party/connect-form.js', fetcher, [], props); }
export function personalUi(fetcher, props = {}) { return componentUi('../robot-party/personal-chat.js', fetcher, [], props); }
export function partyUi(fetcher, props = {}) { return componentUi('../robot-party/board.js', fetcher, [], props); }
export function tripUi(fetcher, initial = [], props = {}) { return componentUi('command-center.js', fetcher, initial, props); }
export function accessUi(fetcher) { return componentUi('../../app/admin/access/access-manager.js', fetcher, []); }
export function explorerUi(plan) { return componentUi('option-explorer.js', null, [], { plan }); }
function componentUi(file, fetcher, initial, props = {}) {
  const runtime = createUiRuntime(initial), timers = manualIntervals(), navigations = [];
  const { code } = transformSync(readFileSync(new URL(`../../src/private-apps/japan-trip/${file}`, import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, setInterval: timers.setInterval, clearInterval: timers.clearInterval, TextEncoder, URL, Blob, crypto: globalThis.crypto, navigator: { clipboard: { writeText: async () => {} } }, window: { location: { origin: 'https://site.example', assign(url){navigations.push(url);} }, addEventListener() {}, removeEventListener() {} }, require: id => {
    if (id === 'react') return runtime.hooks;
    if (id === '@/lib/workspace-policy') return workspace;
    if (id === './model.js') return partyModel;
    if (id === './model') return model;
    if (id === './options.js') return options;
    if (id === './coastline.js') return coast;
    if (id === './option-explorer.js') return { default: () => null, __esModule: true };
    if (id.endsWith('.css')) return {};
    if (id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  const component = () => module.exports.default(props);
  return {
    states: runtime.states,
    navigations,
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
