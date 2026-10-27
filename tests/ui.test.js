import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import {loginReturn} from '../src/lib/login-return.js';
import { renderToStaticMarkup } from 'react-dom/server';

// Render real JSX with Next's bundled compiler; isolate framework/auth boundaries.
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
const arrows = /[\u2190-\u21ff\u2794-\u27bf]/u;
const Link = ({ children, ...props }) => React.createElement('a', props, children);
function component(path, mocks = {}) {
  const { code } = transformSync(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
    plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: id => {
    if (id in mocks) return mocks[id];
    if (id === 'next/link') return Link;
    if (id.endsWith('.css')) return {};
    if (id === 'react/jsx-runtime') return require(id);
    throw new Error(`Unexpected UI dependency: ${id}`);
  } });
  return module.exports.default;
}
function cleanMarkup(element) {
  const html = renderToStaticMarkup(element);
  assert.doesNotMatch(html, arrows, 'Rendered UI must not contain decorative arrows');
  return html;
}
const apps = [{ slug: 'sample', name: 'Sample app', description: 'A fixture', href: '/admin/apps/sample', ownerId: 'owner', role: 'owner', access: {role:'owner',ownerId:'owner'}, Component: () => React.createElement('p', null, 'App content') }];
const auth = { requireWorkspace: async () => ({isAdmin:true,user:{id:'owner'}}), checkWorkspace: async () => ({ok:false}), requireAdmin: async () => {}, checkAdmin: async () => ({ ok: false }) };

test('public text links keep destinations without decorative arrows', () => {
  const Home = component('app/page.js', { '@/components/work-grid': () => null });
  const html = cleanMarkup(React.createElement(Home));
  for (const [href, label] of [['#contact', 'Contact'], ['#work', 'Explore my work'], ['/login', 'Private workspace'], ['https://www.linkedin.com/in/bartconsedine', 'More on LinkedIn']]) {
    assert.ok(html.includes(`href="${href}">${label}</a>`));
  }
  assert.ok(html.includes('href="mailto:bartconsedine@gmail.com">Let’s talk.</a>'));
});

test('admin navigation, sign-out POST, app cards and empty state keep working text controls', async () => {
  const AdminNav = component('components/admin-nav.js', { 'next/navigation': { usePathname: () => '/admin' } });
  const appModule = { listApps: async () => apps };
  const Layout = component('app/admin/layout.js', { '@/lib/auth': auth, '@/lib/apps': appModule, '@/components/admin-nav': AdminNav });
  const html = cleanMarkup(await Layout({ children: 'Workspace content' }));
  assert.match(html, /href="\/">Public site<\/a>/);
  assert.match(html, /href="\/admin" aria-current="page">My apps<\/a>/);
  assert.match(html, /<form action="\/auth\/signout" method="post"><button type="submit">Sign out<\/button>/);
  const Home = component('app/admin/page.js', { '@/lib/auth': auth, '@/lib/apps': appModule });
  assert.match(cleanMarkup(await Home()), /href="\/admin\/apps\/sample"><h3>Sample app<\/h3>/);
  appModule.listApps = async () => [];
  assert.match(cleanMarkup(await Home()), /Capture an app idea<\/a>/);
  const App = component('app/admin/apps/[slug]/page.js', { '@/lib/auth': auth, '@/lib/apps': { getApp: async () => apps[0] }, 'next/navigation': { notFound: () => { throw new Error('not found'); } } });
  assert.match(cleanMarkup(await App({ params: Promise.resolve({ slug: 'sample' }), searchParams: Promise.resolve({}) })), /href="\/admin">All apps<\/a>/);
});

test('Google sign-in keeps enabled, pending and unconfigured states with clean labels', async () => {
  const status = { pending: false };
  const Form = component('app/login/login-form.js', { 'react-dom': { useFormStatus: () => status }, './actions': { signInWithGoogle: () => {} } });
  const enabled = cleanMarkup(React.createElement(Form, { configured: true }));
  assert.match(enabled, /Continue with Google<\/button>/);
  assert.doesNotMatch(enabled, /disabled=/);
  status.pending = true;
  assert.match(cleanMarkup(React.createElement(Form, { configured: true })), /disabled="".*Opening Google…<\/button>/);
  status.pending = false;
  assert.match(cleanMarkup(React.createElement(Form, { configured: false })), /disabled=""/);
  const Login = component('app/login/page.js', { '@/lib/auth': auth, '@/lib/auth-config': { authConfig: () => ({}) }, '@/lib/login-return': {loginReturn}, './login-form': Form, 'next/navigation': { redirect: () => { throw new Error('redirect'); } } });
  assert.match(cleanMarkup(await Login({ searchParams: Promise.resolve({ state: 'signedout' }) })), /href="\/">Back to the public site<\/a>/);
});
