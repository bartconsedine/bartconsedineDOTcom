import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const owner = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222', guest = '33333333-3333-4333-8333-333333333333';
const device = 'D'.repeat(43), approval = 'A'.repeat(43);
const hash = value => createHash('sha256').update(value).digest('hex');
const login = (db, id) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
const anon = db => db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false);");
const call = async (db, action, secret = device, other = null) => (await db.query('select public.morning_tv($1,$2,$3) result', [action, secret, other])).rows[0].result;
async function database() {
  const db = new PGlite(); await db.exec('create role anon; create role authenticated;');
  await db.exec(await readFile('tests/fixtures/auth.sql', 'utf8'));
  await db.exec(`insert into auth.users values('${owner}','bartconsedine@gmail.com',now(),false),('${second}','mjshah8@gmail.com',now(),false),('${guest}','guest@example.com',now(),false); insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;`);
  for (const migration of (await readdir('prisma/migrations')).filter(n => n !== 'migration_lock.toml').sort()) await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
  await db.exec(`insert into private.site_admin(user_id,email) values('${owner}','bartconsedine@gmail.com'),('${second}','mjshah8@gmail.com'); insert into public.app_data(owner_id,app_slug,key,value) values('${owner}','morning-feed','screen-v1','{"title":"Owner morning"}'),('${second}','morning-feed','screen-v1','{"title":"Second morning"}'),('${owner}','other-app','secret','{"private":true}');`);
  return db;
}
test('real SQL device flow: anon waits, authenticated owner approves once, TV reads only that feed, reload works, owner revokes', async () => {
  const db = await database(); try {
    await anon(db); assert.equal((await call(db, 'start', device, approval)).status, 'pending');
    assert.equal((await call(db, 'read')).status, 'pending');
    await assert.rejects(call(db, 'approve', approval), /tv_denied/);
    await assert.rejects(call(db, 'inspect', approval), /tv_denied/);
    await login(db, guest); await assert.rejects(call(db, 'approve', approval), /tv_denied/);
    await login(db, owner); assert.equal((await call(db, 'inspect', approval)).code, hash(approval).slice(0, 8).toUpperCase());
    assert.equal((await call(db, 'approve', approval)).approved, true);
    await assert.rejects(call(db, 'approve', approval), /tv_expired/);
    const list = await call(db, 'list', null); assert.equal(list.devices.length, 1);
    await login(db, second); assert.deepEqual((await call(db, 'list', null)).devices, []);
    await call(db, 'revoke', list.devices[0].id);
    await anon(db);
    const result = await call(db, 'read'); assert.equal(result.screen.title, 'Owner morning'); assert.equal(result.status, 'connected'); assert.ok(!JSON.stringify(result).includes('Second morning')); assert.ok(!JSON.stringify(result).includes('private'));
    assert.equal((await call(db, 'read')).screen.title, 'Owner morning');
    assert.equal((await call(db, 'read', approval)).status, 'expired');
    await assert.rejects(call(db, 'read', hash(device)), /tv_invalid/);
    await assert.rejects(db.exec('select * from private.morning_tv_devices'), /permission denied/);
    await assert.rejects(db.exec('select * from public.app_data'), /permission denied/);
    await assert.rejects(call(db, 'write'), /tv_invalid/);
    await login(db, owner); await call(db, 'revoke', list.devices[0].id);
    await anon(db); assert.equal((await call(db, 'read')).status, 'expired');
  } finally { await db.close(); }
});
test('real SQL denies expired approval, expired sessions, deleted membership and mismatched Google identity', async () => {
  const db = await database(); try {
    await anon(db); await call(db, 'start', device, approval);
    await db.exec("reset role; update private.morning_tv_devices set pairing_expires_at=now()-interval '1 second'");
    await login(db, owner); await assert.rejects(call(db, 'approve', approval), /tv_expired/);
    await anon(db); assert.equal((await call(db, 'read')).status, 'expired');
    await call(db, 'start', device, approval); // cleanup expired row before reuse
    await login(db, owner); await call(db, 'approve', approval);
    await db.exec("reset role; update auth.identities set identity_data='{}' where user_id='" + owner + "'");
    await anon(db); assert.equal((await call(db, 'read')).status, 'expired');
    await db.exec("reset role; update auth.identities set identity_data=jsonb_build_object('email','bartconsedine@gmail.com','email_verified',true) where user_id='" + owner + "'; update private.morning_tv_devices set expires_at=now()-interval '1 second'");
    await anon(db); assert.equal((await call(db, 'read')).status, 'expired');
    await db.exec("reset role; update private.morning_tv_devices set expires_at=now()+interval '1 day'; delete from private.site_admin where user_id='" + owner + "'");
    await anon(db); assert.equal((await call(db, 'read')).status, 'expired');
  } finally { await db.close(); }
});
test('device forget revokes without owner login; stored hashes and pending admission bounds do not become bearer credentials', async () => {
  const db = await database(); try {
    await anon(db); await assert.rejects(call(db, 'start', 'short', approval), /tv_invalid/);
    await assert.rejects(call(db, 'start', device, device), /tv_invalid/);
    await call(db, 'start', device, approval);
    await db.exec('reset role');
    const stored = (await db.query('select device_hash,approval_hash from private.morning_tv_devices')).rows[0];
    assert.deepEqual(stored, { device_hash: hash(device), approval_hash: hash(approval) });
    await login(db, owner); await call(db, 'approve', approval);
    await anon(db); assert.equal((await call(db, 'forget')).disconnected, true);
    assert.equal((await call(db, 'read')).status, 'expired');
    await call(db, 'start', device, approval); // revoked row cleaned, explicit new pairing needed
    await db.exec("reset role; insert into private.morning_tv_devices(device_hash,approval_hash) select encode(sha256(convert_to('device-'||n::text,'UTF8')),'hex'),encode(sha256(convert_to('approval-'||n::text,'UTF8')),'hex') from generate_series(1,999) n");
    await anon(db); await assert.rejects(call(db, 'start', 'N'.repeat(43), 'P'.repeat(43)), /tv_busy/);
  } finally { await db.close(); }
});
