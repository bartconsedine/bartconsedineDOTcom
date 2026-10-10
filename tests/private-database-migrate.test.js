import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runMigrationHandoff } from '../scripts/private-database-migrate.mjs';
const project = 'vgsmfbupgydafvotkold';
const password = 'SYNTHETIC-migration-%#secret';
const confirmed = action => ({ DATABASE_PASSWORD: password, CONFIRM_HOSTED_MIGRATION: project, CONFIRM_MIGRATION_ACTION: action, CONFIRM_RECOVERY_POINT: project });
const fixture = async fn => {
  // Outside the checkout and OS temporary trees, matching the production guard.
  const folder = await mkdtemp(join(dirname(fileURLToPath(new URL('../', import.meta.url))), 'backup-guard-test-'));
  try { await fn(folder); } finally { await rm(folder, { recursive: true, force: true }); }
};

test('migration handoff rejects unsupported actions, missing confirmations and unsafe directories before loading drivers', async () => {
  let loads = 0;
  const load = async () => { loads++; throw new Error(password); };
  for (const action of ['enroll', 'reset', 'resolve', 'restore-local']) assert.match((await runMigrationHandoff(action, confirmed(action), load)).message, /migration\/ACTION/);
  assert.match((await runMigrationHandoff('adopt', { DATABASE_PASSWORD: password }, load)).message, /CONFIRMATION/);
  assert.match((await runMigrationHandoff('adopt', confirmed('deploy'), load)).message, /CONFIRMATION/);
  assert.match((await runMigrationHandoff('adopt', { ...confirmed('adopt'), CONFIRM_RECOVERY_POINT: '' }, load)).message, /RECOVERY/);
  assert.match((await runMigrationHandoff('adopt', { ...confirmed('adopt'), BACKUP_DIR: '/tmp' }, load)).message, /BACKUP_DIRECTORY/);
  assert.equal(loads, 0);
});

test('migration state is read-only and reports only fixed state descriptions', async () => {
  for (const state of ['unadopted', 'baseline', 'complete']) {
    const result = await runMigrationHandoff('state', { DATABASE_PASSWORD: password }, async () => ({ migrationState: async c => { assert.equal(c.host, `db.${project}.supabase.co`); return state; } }));
    assert.equal(result.ok, true); assert.match(result.message, /No schema write was performed/); assert.ok(!result.message.includes(password));
  }
  for (const state of ['attention', password]) {
    const result = await runMigrationHandoff('state', { DATABASE_PASSWORD: password }, async () => ({ migrationState: async () => state }));
    assert.equal(result.ok, false); assert.match(result.message, /HISTORY/); assert.ok(!result.message.includes(password));
  }
});

test('write handoff rejects shared directories and directories inside another Git checkout', async () => fixture(async folder => {
  let loads = 0;
  const check = () => runMigrationHandoff('adopt', { ...confirmed('adopt'), BACKUP_DIR: folder }, async () => { loads++; });
  await chmod(folder, 0o750);
  assert.match((await check()).message, /BACKUP_DIRECTORY/);
  await chmod(folder, 0o700);
  await writeFile(join(folder, '.git'), 'gitdir: synthetic');
  assert.match((await check()).message, /BACKUP_DIRECTORY/);
  assert.equal(loads, 0);
}));

test('adoption and deployment dispatch only their guarded operation and verify resulting state', async () => fixture(async folder => {
  for (const [action, before, after, method] of [['adopt', 'unadopted', 'baseline', 'adoptBaseline'], ['deploy', 'baseline', 'complete', 'deployMigrations']]) {
    const calls = []; let current = before;
    const result = await runMigrationHandoff(action, { ...confirmed(action), BACKUP_DIR: folder }, async () => ({
      migrationState: async () => { calls.push('state'); return current; },
      [method]: async c => { calls.push(action); assert.equal(c.password, password); current = after; },
    }));
    assert.equal(result.ok, true); assert.deepEqual(calls, ['state', action, 'state']); assert.ok(!result.message.includes(password));
  }
}));

test('wrong migration state prevents writes and failed writes never claim nothing happened', async () => fixture(async folder => {
  for (const [action, state] of [['adopt','baseline'], ['adopt','complete'], ['deploy','unadopted'], ['deploy','complete'], ['deploy','attention']]) {
    let writes = 0;
    const result = await runMigrationHandoff(action, { ...confirmed(action), BACKUP_DIR: folder }, async () => ({ migrationState: async () => state, adoptBaseline: async () => writes++, deployMigrations: async () => writes++ }));
    assert.equal(result.ok, false); assert.equal(writes, 0); assert.match(result.message, /HISTORY/);
  }
  const result = await runMigrationHandoff('deploy', { ...confirmed('deploy'), BACKUP_DIR: folder }, async () => ({ migrationState: async () => 'baseline', deployMigrations: async () => { throw new Error(password); } }));
  assert.equal(result.ok, false); assert.match(result.message, /inspect migration state/); assert.ok(!result.message.includes(password));
  assert.ok(!result.message.includes('No schema migration'));
}));

test('private migration Terminal hides the password and cancels unconfirmed writes', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync('python3', ['tests/private-migration-terminal.py'], { cwd: new URL('../', import.meta.url), env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
