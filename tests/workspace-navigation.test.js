import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createUiRuntime } from './helpers/ui-runtime.js';
import { nodes } from './helpers/trip-ui.js';
import * as presentation from '../src/lib/workspace-presentation.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
const apps = [
  { slug: 'project-board', name: 'Project board', description: 'Tasks, decisions and work', href: '/admin/apps/project-board', ownerId: 'self', role: 'owner' },
  { slug: 'japan-trip', name: 'Japan command center', description: 'Hokkaido snow and bookings', href: '/admin/apps/japan-trip', ownerId: 'self', role: 'owner' },
  { slug: 'japan-trip', name: 'Japan command center', description: 'Hokkaido snow and bookings', href: '/admin/apps/japan-trip?owner=friend', ownerId: 'friend', role: 'viewer' },
];
const byClass = (tree, className) => nodes(tree).filter(node => node.type === 'a' && node.props.className === className);
const content = node => renderToStaticMarkup(node);

// Runs actual JSX handlers with lightweight DOM boundaries. Native dialog focus
// containment and Escape behavior still require browser verification.
function workspaceUi(file, props = { apps, isAdmin: true }) {
  const runtime = createUiRuntime(), listeners = new Map(), navigations = [];
  const route = { pathname: '/admin', owner: null };
  let tree, focused = null, externalModal = false, dialogElement;
  const browser = {
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); },
  };
  const document = { querySelector(selector) {
    if (selector === 'dialog[open]') return dialogElement?.open ? dialogElement : null;
    return externalModal ? {} : null;
  } };
  const { code } = transformSync(readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, document, window: browser, require(id) {
    if (id === 'react') return runtime.hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id === 'next/link') return { __esModule: true, default: ({ children, ...props }) => createElement('a', props, children) };
    if (id === 'next/navigation') return { usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams(route.owner ? { owner: route.owner } : {}) };
    if (id === './workspace-icon') return { __esModule: true, default: () => null };
    if (id === '@/lib/workspace-presentation') return presentation;
    throw Error(`Unexpected import: ${id}`);
  } });
  const render = () => {
    tree = runtime.render(() => module.exports.default(props));
    for (const node of nodes(tree)) {
      if (!node.props?.ref || node.props.ref.current) continue;
      if (node.type === 'dialog') {
        dialogElement = {
          open: false,
          showModal() { this.open = true; },
          close() { if (this.open) { this.open = false; nodes(tree).find(node => node.type === 'dialog').props.onClose(); } },
          querySelectorAll() { return byClass(tree, 'ws-launcher-result').map(result => ({ scrollIntoView() {}, click() { navigations.push(result.props.href); result.props.onClick(); } })); },
        };
        node.props.ref.current = dialogElement;
      } else node.props.ref.current = { focus() { focused = node.type; } };
    }
    return tree;
  };
  render();
  return {
    render, route, navigations,
    get dialog() { return dialogElement; },
    get focused() { return focused; },
    get listenerCount() { return listeners.size; },
    modal(value) { externalModal = value; },
    key(key, options = {}) { let prevented = false; listeners.get('keydown')?.({ key, ...options, preventDefault() { prevented = true; } }); render(); return prevented; },
    input(value) { nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value } }); render(); },
    inputKey(key, options = {}) { let prevented = false; nodes(tree).find(node => node.type === 'input').props.onKeyDown?.({ key, ...options, preventDefault() { prevented = true; } }); render(); return prevented; },
    close: runtime.unmount,
  };
}

test('launcher toggles with Control K, returns focus, respects another modal and removes its shortcut on unmount', () => {
  const ui = workspaceUi('admin-nav.js');
  assert.equal(ui.key('k', { ctrlKey: true }), true);
  assert.equal(ui.dialog.open, true); assert.equal(ui.focused, 'input');
  ui.key('K', { ctrlKey: true }); assert.equal(ui.dialog.open, false); assert.equal(ui.focused, 'button');
  ui.modal(true); ui.key('k', { ctrlKey: true }); assert.equal(ui.dialog.open, false);
  ui.modal(false);
  ui.key('k', { ctrlKey: true, isComposing: true }); assert.equal(ui.dialog.open, false);
  ui.key('k', { ctrlKey: true, altKey: true }); assert.equal(ui.dialog.open, false);
  ui.key('k', { metaKey: true }); assert.equal(ui.dialog.open, true);
  // Browser Escape/backdrop closure uses the real onClose focus restoration.
  ui.dialog.close(); assert.equal(ui.focused, 'button');
  assert.equal(ui.listenerCount, 1); ui.close(); assert.equal(ui.listenerCount, 0);
});

test('launcher filters by all search words and navigates the selected owner-scoped result with arrows and Enter', () => {
  const ui = workspaceUi('admin-nav.js'); ui.key('k', { ctrlKey: true });
  ui.inputKey('ArrowUp');
  assert.match(content(byClass(ui.render(), 'ws-launcher-result').find(node => node.props['data-selected'])), /People &amp; access/);
  ui.inputKey('ArrowDown');
  assert.match(content(byClass(ui.render(), 'ws-launcher-result').find(node => node.props['data-selected'])), /My apps/);
  ui.input(' JAPAN  VIEW ');
  let results = byClass(ui.render(), 'ws-launcher-result'); assert.equal(results.length, 1);
  assert.equal(results[0].props.href, '/admin/apps/japan-trip?owner=friend');
  assert.equal(ui.inputKey('Enter'), true);
  assert.deepEqual(ui.navigations, ['/admin/apps/japan-trip?owner=friend']); assert.equal(ui.dialog.open, false);
  ui.key('k', { ctrlKey: true }); ui.input('Japan');
  assert.equal(byClass(ui.render(), 'ws-launcher-result').length, 2);
  ui.inputKey('ArrowDown'); ui.inputKey('Enter');
  assert.equal(ui.navigations.at(-1), '/admin/apps/japan-trip?owner=friend');
  ui.close();
});

test('empty launcher search is honest and a new opening resets search and selection', () => {
  const ui = workspaceUi('admin-nav.js'); ui.key('k', { ctrlKey: true }); ui.input('no matching app');
  assert.equal(byClass(ui.render(), 'ws-launcher-result').length, 0);
  assert.match(content(ui.render()), /No apps match/);
  ui.inputKey('ArrowDown'); ui.inputKey('Enter'); assert.deepEqual(ui.navigations, []);
  ui.dialog.close(); ui.key('k', { ctrlKey: true });
  assert.equal(nodes(ui.render()).find(node => node.type === 'input').props.value, '');
  assert.equal(byClass(ui.render(), 'ws-launcher-result')[0].props['data-selected'], true);
  ui.close();
});

test('route and owner changes close the launcher and highlight only the matching shared app context', () => {
  const ui = workspaceUi('admin-nav.js'); ui.key('k', { ctrlKey: true });
  ui.route.pathname = '/admin/apps/japan-trip/details'; ui.render(); assert.equal(ui.dialog.open, false);
  let active = byClass(ui.render(), 'ws-nav-link').filter(node => node.props['aria-current'] === 'page');
  assert.equal(active.length, 1); assert.equal(active[0].props.href, '/admin/apps/japan-trip');
  ui.key('k', { ctrlKey: true }); ui.route.owner = 'friend'; ui.render(); assert.equal(ui.dialog.open, false);
  active = byClass(ui.render(), 'ws-nav-link').filter(node => node.props['aria-current'] === 'page');
  assert.equal(active.length, 1); assert.equal(active[0].props.href, '/admin/apps/japan-trip?owner=friend');
  ui.close();
});

test('guest navigation exposes authorized destinations without access-management controls', () => {
  const ui = workspaceUi('admin-nav.js', { apps: [apps[2]], isAdmin: false });
  const destinations = byClass(ui.render(), 'ws-nav-link').map(node => node.props.href);
  assert.deepEqual(destinations, ['/admin', '/admin/apps/japan-trip?owner=friend', '/']);
  ui.key('k', { ctrlKey: true }); ui.input('People');
  assert.equal(byClass(ui.render(), 'ws-launcher-result').length, 0); ui.close();
});

test('home filtering preserves authorized URLs and can recover from no matching apps', () => {
  const ui = workspaceUi('workspace-home.js');
  assert.equal(byClass(ui.render(), 'ws-app-card').length, 3);
  ui.input('  HOKKAIDO  view  ');
  let cards = byClass(ui.render(), 'ws-app-card'); assert.equal(cards.length, 1);
  assert.equal(cards[0].props.href, '/admin/apps/japan-trip?owner=friend');
  ui.input('no result'); assert.equal(byClass(ui.render(), 'ws-app-card').length, 0); assert.match(content(ui.render()), /No apps found/);
  nodes(ui.render()).find(node => node.type === 'button' && node.props.children === 'Clear search').props.onClick();
  assert.equal(byClass(ui.render(), 'ws-app-card').length, 3); ui.close();
  const empty = workspaceUi('workspace-home.js', { apps: [], isAdmin: false });
  assert.match(content(empty.render()), /Your workspace starts here/);
  assert.equal(byClass(empty.render(), 'ws-app-card').length, 0); empty.close();
});
