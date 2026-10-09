import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { connectionFromPassword, directEndpoint, runPasswordHandoff } from '../scripts/private-database-password.mjs';
import { validateTarget } from '../scripts/private-database-check.mjs';

test('password-only input uses the verified fixed endpoint and encodes literal reserved characters once', () => {
  assert.equal(new URL(directEndpoint).hostname,'db.vgsmfbupgydafvotkold.supabase.co');
  for (const password of ['Synthetic%40Literal', 'Synth:#/?@[]!$&\'()*+,;=\\"', '  Synthetic spaces  ', 'Synthetic-密码-☃', 'Synthetic$(whoami)`id`']) {
    const target = validateTarget(connectionFromPassword(password));
    assert.equal(target.password,password);
    assert.equal(target.user,'postgres'); assert.equal(target.database,'postgres'); assert.equal(target.port,'5432');
    assert.equal(target.url.searchParams.get('sslaccept'),'strict');
    assert.equal(target.url.searchParams.get('sslmode'),'require');
  }
});

test('password validation needs no network and does not print the password or internally assembled URL', async () => {
  const password = 'SYNTHETIC-secret#%@2283';
  let loaded = false;
  const result = await runPasswordHandoff('validate-target',{DATABASE_PASSWORD:password},async()=>{loaded=true;throw new Error(password);});
  assert.equal(result.ok,true); assert.equal(loaded,false);
  assert.ok(!result.message.includes(password)); assert.ok(!result.message.includes(connectionFromPassword(password)));
});

test('password flow rejects full-URL pastes without confusing them with incorrect passwords', async () => {
  for (const value of [connectionFromPassword('SYNTHETIC-secret'), 'DATABASE_URL='+connectionFromPassword('SYNTHETIC-secret')]) {
    const result = await runPasswordHandoff('validate-target',{DATABASE_PASSWORD:value});
    assert.equal(result.ok,false); assert.match(result.message,/input\/PASSWORD_MODE/);
    assert.ok(!result.message.includes('SYNTHETIC-secret'));
  }
  assert.match((await runPasswordHandoff('validate-target',{})).message,/PASSWORD_EMPTY/);
});

test('password mode retains no-mutation boundary and redacts raw driver errors', async () => {
  const password='SYNTHETIC-password-with-@%#';
  assert.match((await runPasswordHandoff('deploy',{DATABASE_PASSWORD:password})).message,/input\/ACTION/);
  const result = await runPasswordHandoff('baseline-check',{DATABASE_PASSWORD:password},async()=>({baselineCheck:async target=>{
    assert.equal(target.password,password);
    throw Object.assign(new Error(connectionFromPassword(password)),{code:'28P01',detail:password});
  }}));
  assert.match(result.message,/connection\/baseline\/AUTH/); assert.ok(!result.message.includes(password));
});

test('password-only Terminal prompt hides reserved characters and clears credentials', {skip:process.platform==='win32'}, () => {
  const result=spawnSync('python3',['tests/private-database-terminal.py','scripts/private-database-password.command','password'],{
    cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:30000,
  });
  assert.equal(result.status,0,result.stderr);
});
