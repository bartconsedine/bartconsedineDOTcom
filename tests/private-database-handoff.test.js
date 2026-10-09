import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runHandoff, validateTarget, safeDiagnostic } from '../scripts/private-database-check.mjs';

const secret = 'SYNTHETIC-private-value-8127';
const url = `postgresql://postgres:${secret}@db.vgsmfbupgydafvotkold.supabase.co:5432/postgres`;

test('pre-menu validation accepts direct/session URLs without loading drivers or connecting', async () => {
  let loaded = false;
  const load = async () => { loaded = true; throw new Error(secret); };
  for (const value of [url, `  ${url}\r\n`, url.replace('postgres:', 'postgres.vgsmfbupgydafvotkold:').replace('db.vgsmfbupgydafvotkold.supabase.co', 'aws-0-us-east-2.pooler.supabase.com')]) {
    const result = await runHandoff('validate-target', { DATABASE_URL: value }, load);
    assert.equal(result.ok, true); assert.match(result.message, /input\/OK/);
  }
  assert.equal(loaded, false);
  assert.equal(validateTarget(url + '?sslmode=disable').url.searchParams.get('sslaccept'), 'strict');
  assert.equal(validateTarget(url + '?sslmode=disable').url.searchParams.get('sslmode'), 'require');
});

test('common private paste errors have distinct nonsecret input diagnostics', async () => {
  const cases = [
    ['', 'INPUT_EMPTY'], [secret, 'INPUT_SCHEME'], [`DATABASE_URL=${url}`, 'INPUT_WRAPPER'],
    [`"${url}"`, 'INPUT_WRAPPER'], [url.replace(secret, '[YOUR-PASSWORD]'), 'INPUT_PASSWORD'],
    [url.replace(secret, ''), 'INPUT_PASSWORD'], [url.replace(secret, '%xx'), 'INPUT_ENCODING'],
    [url.replace(secret, 'has#fragment'), 'INPUT_STRUCTURE'], [url.replace('5432', '6543'), 'INPUT_PORT'],
    [url.replace(':5432/postgres', ':5432/other'), 'INPUT_DATABASE'], [url.replace('vgsmfbupgydafvotkold', 'different'), 'INPUT_PROJECT'],
    [url + '?host=example.com', 'INPUT_OPTIONS'], [url + '?sslrootcert=relative.pem', 'INPUT_CA'],
  ];
  for (const [value, code] of cases) {
    const result = await runHandoff('validate-target', { DATABASE_URL: value });
    assert.equal(result.ok, false); assert.ok(result.message.includes(`/` + code + ']'), code);
    assert.ok(!result.message.includes(secret)); assert.ok(!result.message.includes(url));
  }
});

test('driver, dependency and unknown failures expose only allowlisted categories', async () => {
  for (const [code, expected] of [['ENOTFOUND','DNS'],['ENETUNREACH','CONNECTIVITY'],['ECONNREFUSED','CONNECTIVITY'],['ERR_TLS_CERT_ALTNAME_INVALID','TLS'],['28P01','AUTH'],['42501','PERMISSION'],['ERR_MODULE_NOT_FOUND','DEPENDENCIES'],['arbitrary-'+secret,'UNKNOWN']]) {
    const error = Object.assign(new Error(url), { code, detail: secret, cause: new Error(secret) });
    const message = safeDiagnostic(error, 'connection/baseline');
    assert.ok(message.includes('/'+expected+']')); assert.ok(!message.includes(secret)); assert.ok(!message.includes(url));
  }
  const result = await runHandoff('baseline-check', { DATABASE_URL: url }, async () => { throw Object.assign(new Error(url), {code:'ERR_MODULE_NOT_FOUND'}); });
  assert.match(result.message, /dependencies\/DEPENDENCIES/);
});

test('helper cannot dispatch schema writes and rejects temporary backups before driver loading', async () => {
  let loads = 0;
  const load = async () => { loads++; throw new Error(secret); };
  for (const action of ['baseline','deploy','restore-local','enroll']) {
    const result = await runHandoff(action, { DATABASE_URL: url }, load);
    assert.match(result.message, /input\/ACTION/);
  }
  const result = await runHandoff('backup', { DATABASE_URL: url, BACKUP_DIR: '/tmp' }, load);
  assert.match(result.message, /backup-directory\/BACKUP_DIRECTORY/); assert.equal(loads,0);
});

test('read-only action receives the validated target and preserves safe connection errors', async () => {
  let calls = 0;
  const result = await runHandoff('baseline-check', { DATABASE_URL: url }, async () => ({
    baselineCheck: async target => { calls++; assert.equal(target.host, 'db.vgsmfbupgydafvotkold.supabase.co'); throw Object.assign(new Error(secret), {code:'ENOTFOUND'}); },
  }));
  assert.equal(calls,1); assert.match(result.message, /connection\/baseline\/DNS/);
});

test('CLI rejects invalid input with nonzero exit and never prints synthetic credentials', () => {
  const result = spawnSync(process.execPath, ['scripts/private-database-check.mjs','validate-target'], {
    cwd: new URL('../',import.meta.url), env: { PATH:process.env.PATH, DATABASE_URL:`DATABASE_URL=${url}` }, encoding:'utf8',
  });
  assert.equal(result.status,1); assert.match(result.stdout,/input\/INPUT_WRAPPER/);
  assert.ok(!(result.stdout+result.stderr).includes(secret));
});

test('private Terminal input stays hidden and clears on success or validation failure', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync('python3', ['tests/private-database-terminal.py','scripts/private-database.command'], {
    cwd: new URL('../',import.meta.url), env: { PATH:process.env.PATH, HOME:process.env.HOME }, encoding:'utf8', timeout:30000,
  });
  assert.equal(result.status,0,result.stderr || 'Python 3 is required for the POSIX Terminal regression test.');
});
