import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const bart = '11111111-1111-4111-8111-111111111111';
const wife = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
async function database(legacyOwner = false) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false);
    create table auth.identities (user_id uuid references auth.users(id), provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${bart}', 'bartconsedine@gmail.com', now(), false), ('${wife}', 'mjshah8@gmail.com', now(), false), ('${stranger}', 'other@example.com', now(), false);
    insert into auth.identities select id, 'google', jsonb_build_object('email',email,'email_verified',true) from auth.users;
  `);
  const folder = new URL('../supabase/migrations/', import.meta.url);
  const files = (await readdir(folder)).filter(file => file.endsWith('.sql')).sort();
  await db.exec(await readFile(new URL(files[0], folder), 'utf8'));
  if (legacyOwner) await db.exec(`insert into private.site_owner(user_id,email) values('${bart}','bartconsedine@gmail.com'); insert into public.app_data(owner_id,app_slug,key) values('${bart}','test-app','legacy');`);
  for (const file of files.slice(1)) await db.exec(await readFile(new URL(file, folder), 'utf8'));
  return db;
}
const login = (db, id) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
const allowed = async db => (await db.query('select public.is_site_admin() allowed')).rows[0].allowed;
const enroll = db => db.exec(`reset role; insert into private.site_admin(user_id,email) values('${bart}','bartconsedine@gmail.com'),('${wife}','mjshah8@gmail.com');`);

test('fresh migrations enroll nobody; SQL privileges forbid self-enrollment and leakage', async () => {
  const db = await database();
  try {
    for (const id of [bart, wife, stranger, '']) {
      await login(db, id);
      assert.equal(await allowed(db), false);
      for (const sql of [
        'select * from private.site_admin',
        `insert into private.site_admin(user_id,email) values('${bart}','bartconsedine@gmail.com')`,
        `update private.site_admin set email='mjshah8@gmail.com'`,
        'delete from private.site_admin', 'truncate private.site_admin',
        'create table private.spoof(id int)', 'select * from auth.users', 'select * from auth.identities',
      ]) await assert.rejects(db.exec(sql), /permission denied/);
      await assert.rejects(db.exec(`insert into public.app_data(app_slug,key) values('test-app','blocked')`), /row-level security/);
    }
    await db.exec('reset role; set role anon;');
    for (const sql of ['select public.is_site_admin()', 'select private.is_site_admin()', 'select * from public.app_data']) await assert.rejects(db.exec(sql), /permission denied/);
    await db.exec('reset role;');
    assert.equal((await db.query("select prosecdef from pg_proc where oid='public.is_site_admin()'::regprocedure")).rows[0].prosecdef, false);
    assert.equal((await db.query("select to_regprocedure('public.is_site_owner()') old")).rows[0].old, null);
    await assert.rejects(db.exec(`insert into private.site_admin(user_id,email) values('${stranger}','other@example.com')`), /check constraint/);
  } finally { await db.close(); }
});

test('both approved admins have CRUD only on their own app data', async () => {
  const db = await database();
  try {
    await enroll(db);
    for (const id of [bart, wife]) {
      await login(db, id);
      assert.equal(await allowed(db), true);
      await db.exec(`insert into public.app_data(app_slug,key,value) values('test-app','note','{"text":"private"}')`);
      await db.exec(`update public.app_data set value='{"text":"updated"}' where key='note'`);
      const rows = (await db.query('select * from public.app_data')).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].owner_id, id);
      const other = id === bart ? wife : bart;
      await assert.rejects(db.exec(`insert into public.app_data(owner_id,app_slug,key) values('${other}','test-app','spoofed')`), /row-level security/);
      await assert.rejects(db.exec(`update public.app_data set owner_id='${other}'`), /row-level security/);
    }
    await login(db, stranger);
    assert.equal(await allowed(db), false);
    assert.equal((await db.query('select * from public.app_data')).rows.length, 0);
    await assert.rejects(db.exec(`insert into public.app_data(app_slug,key) values('test-app','intruder')`), /row-level security/);
    await db.exec(`update public.app_data set value='{}'; delete from public.app_data;`);
    for (const id of [bart, wife]) {
      await login(db, id);
      assert.equal((await db.query('select value from public.app_data')).rows[0].value.text, 'updated');
      await db.exec('delete from public.app_data');
      assert.equal((await db.query('select * from public.app_data')).rows.length, 0);
    }
  } finally { await db.close(); }
});

test('live DB identity and membership changes revoke access for either admin', async () => {
  const db = await database();
  try {
    await enroll(db);
    for (const [id, email] of [[bart, 'bartconsedine@gmail.com'], [wife, 'mjshah8@gmail.com']]) {
      await login(db, id);
      await db.exec(`insert into public.app_data(app_slug,key) values('test-app','note')`);
      for (const change of [
        `update auth.users set email_confirmed_at=null where id='${id}'`,
        `update auth.users set is_anonymous=true where id='${id}'`,
        `update auth.users set email='changed@example.com' where id='${id}'`,
        `update auth.identities set provider='email' where user_id='${id}'`,
        `update auth.identities set identity_data='{"email":"spoof@example.com","email_verified":true}' where user_id='${id}'`,
        `update auth.identities set identity_data=jsonb_build_object('email','${email}','email_verified',false) where user_id='${id}'`,
        `update auth.identities set identity_data=jsonb_build_object('email','${email}','email_verified','true') where user_id='${id}'`,
        `delete from private.site_admin where user_id='${id}'`,
      ]) {
        await db.exec('reset role; begin;');
        await db.exec(change);
        await login(db, id);
        assert.equal(await allowed(db), false, change);
        assert.equal((await db.query('select * from public.app_data')).rows.length, 0, change);
        await assert.rejects(db.exec(`insert into public.app_data(app_slug,key) values('test-app','blocked')`), /row-level security/);
        await db.exec('rollback;');
        await login(db, id);
        assert.equal(await allowed(db), true, 'rollback restores original enrollment/identity');
      }
    }
  } finally { await db.close(); }
});

test('upgrade preserves explicitly enrolled legacy owner and data but enrolls no second user', async () => {
  const db = await database(true);
  try {
    await login(db, bart);
    assert.equal(await allowed(db), true);
    assert.equal((await db.query('select key from public.app_data')).rows[0].key, 'legacy');
    await login(db, wife);
    assert.equal(await allowed(db), false);
  } finally { await db.close(); }
});

test('administrative enrollment script rechecks UUIDs and atomically rejects mismatched identities', async () => {
  const db = await database();
  try {
    const sql = (await readFile(new URL('../supabase/admin/enroll_two_admins.sql', import.meta.url), 'utf8'))
      .replace('REPLACE_WITH_VERIFIED_BART_AUTH_UUID', bart).replace('REPLACE_WITH_VERIFIED_MJSHAH_AUTH_UUID', wife);
    await db.exec(`update auth.identities set identity_data='{}' where user_id='${wife}'`);
    await assert.rejects(db.exec(sql), /Expected two verified/);
    assert.equal((await db.query('select * from private.site_admin')).rows.length, 0, 'neither enrolled on partial failure');
    await db.exec(`update auth.identities set identity_data=jsonb_build_object('email','mjshah8@gmail.com','email_verified',true) where user_id='${wife}'`);
    await assert.rejects(db.exec(sql.replaceAll(wife, stranger)), /Expected two verified/);
    assert.equal((await db.query('select * from private.site_admin')).rows.length, 0);
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query('select * from private.site_admin')).rows.length, 2, 'repeat enrollment is idempotent');
    await login(db, bart);
    await assert.rejects(db.exec(sql), /permission denied/);
  } finally { await db.close(); }
});
