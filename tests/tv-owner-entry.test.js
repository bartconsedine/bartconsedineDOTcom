import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { TV_VIEWS } from '../src/private-apps/morning-feed/tv/history.js';
const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');

test('TV entry uses verified owner sessions for Calendar; every denied session retains the limited pairing screen', async () => {
  const { code } = transformSync(readFileSync(new URL('../src/app/tv/page.js', import.meta.url), 'utf8'), { babelrc: false, configFile: false, presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]], plugins: [require('next/dist/compiled/babel/plugin-transform-modules-commonjs')] });
  let access = { ok: false, status: 401 };
  const module = { exports: {} }, TvScreen = () => null;
  runInNewContext(code, { module, exports: module.exports, require: id => {
    if (id === '@/lib/admin-qr/api') return { qrEnabled: () => true };
    if (id === '@/lib/auth') return { checkAdmin: async () => access };
    if (id === 'next/navigation') return { redirect: url => { throw Error(url); } };
    if (id.endsWith('/history')) return { TV_VIEWS };
    if (id.endsWith('/tv-screen')) return { default: TvScreen, __esModule: true };
    return require(id);
  } });
  for (const status of [401, 403, 503]) {
    access = { ok: false, status };
    const page = await module.exports.default({ searchParams: Promise.resolve({ view: 'calendar', owner: 'another-owner' }) });
    assert.equal(page.type, TvScreen);
    assert.equal(page.props.ownerLoginEnabled, true);
  }
  access = { ok: true, user: { id: 'verified-owner' } };
  await assert.rejects(module.exports.default({ searchParams: Promise.resolve({ view: 'calendar', owner: 'another-owner' }) }), /^Error: \/admin\/apps\/morning-feed\?view=calendar$/);
  await assert.rejects(module.exports.default({ searchParams: Promise.resolve({ view: 'https://evil.example' }) }), /^Error: \/admin\/apps\/morning-feed\?view=home$/);
});
