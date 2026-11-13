import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createUiRuntime } from './ui-runtime.js';
import * as model from '../../src/private-apps/project-board/model.js';
import * as starter from '../../src/private-apps/project-board/starter.js';
export { tick } from './ui-runtime.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');

export function boardUi(fetcher, initial = []) {
  const runtime = createUiRuntime(initial);
  const { code } = transformSync(readFileSync(new URL('../../src/private-apps/project-board/board.js', import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, fetch: fetcher, URLSearchParams, Date, crypto: globalThis.crypto, require: id => {
    if (id === 'react') return runtime.hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id === './model') return model;
    if (id === './starter') return starter;
    if (id.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error(id);
  } });
  const component = () => module.exports.default();
  return {
    states: runtime.states,
    render() { return runtime.render(component); },
    mount() { return runtime.mount(component); },
    unmount: runtime.unmount,
    close: runtime.unmount,
  };
}

export function nodes(tree){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.children)];}
export const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&n.props.children===label);
