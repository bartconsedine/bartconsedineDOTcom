import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { appDataSql } from '../scripts/app-data-sql.mjs';
import { emptyScreen } from '../src/private-apps/morning-feed/model.js';

const bart = '11111111-1111-4111-8111-111111111111';
const wife = '22222222-2222-4222-8222-222222222222';
const options = { slug: 'morning-feed', email: 'bartconsedine@gmail.com' };
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    insert into auth.users values('${bart}','bartconsedine@gmail.com',now(),false),('${wife}','mjshah8@gmail.com',now(),false);
    insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;`);
  const folder = new URL('../prisma/migrations/', import.meta.url);
  for (const name of (await readdir(folder)).filter(n => n !== 'migration_lock.toml').sort()) await db.exec(await readFile(new URL(`${name}/migration.sql`, folder), 'utf8'));
  await db.exec('insert into private.site_admin(user_id,email) select id,email from auth.users;');
  return db;
}

test('trusted connector SQL roundtrip is owner-scoped, injection-safe and rejects stale/retried writes', async () => {
  const db = await database();
  const read = () => db.query(appDataSql({ ...options, operation: 'read' }));
  const write = (value, expectedAt) => db.query(appDataSql({ ...options, operation: 'write', value, expectedAt }));
  try {
    assert.equal((await read()).rows[0].value, null);
    const value = { ...emptyScreen(), focus: "Bart's plan; '); delete from public.app_data; --" };
    assert.equal((await write(value, null)).rows[0].saved, true);
    assert.equal((await write(emptyScreen(), null)).rows[0].saved, false);
    const snapshot = (await read()).rows[0];
    assert.deepEqual(snapshot.value, value);
    assert.equal((await write(emptyScreen(), snapshot.updated_at)).rows[0].saved, true);
    assert.equal((await write(value, snapshot.updated_at)).rows[0].saved, false);
    assert.equal((await db.query(appDataSql({ ...options, email: 'mjshah8@gmail.com', operation: 'read' }))).rows[0].value, null);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${wife}',false);`);
    assert.equal((await db.query("select * from public.app_data where app_slug='morning-feed'")).rows.length, 0);
    assert.equal((await db.query("update public.app_data set value='{}' where app_slug='morning-feed' returning key")).rows.length, 0);
    await assert.rejects(db.exec(`insert into public.app_data(owner_id,app_slug,key) values('${bart}','morning-feed','screen-v1')`), /row-level security/);
    await assert.rejects(read(), /permission denied/, 'operator SQL is not an unauthenticated app API');
  } finally { await db.close(); }
});

test('connector guard rejects revoked enrollment and nonverified Google identities without touching saved records', async () => {
  const db = await database();
  try {
    for (const change of [
      `delete from private.site_admin where user_id='${bart}'`,
      `update auth.users set email_confirmed_at=null where id='${bart}'`,
      `update auth.users set is_anonymous=true where id='${bart}'`,
      `update auth.identities set identity_data='{}' where user_id='${bart}'`,
      `update auth.identities set provider='email' where user_id='${bart}'`,
    ]) {
      await db.exec('begin;'); await db.exec(change);
      assert.equal((await db.query(appDataSql({ ...options, operation: 'read' }))).rows.length, 0);
      assert.deepEqual((await db.query(appDataSql({ ...options, operation: 'write', value: emptyScreen(), expectedAt: null }))).rows[0], { authorized: false, saved: false, updated_at: null });
      await db.exec('rollback;');
    }
  } finally { await db.close(); }
});

test('SQL preparation rejects unknown apps, owners, missing revisions, invalid screens and oversized values', () => {
  for (const changed of [{ slug: 'unknown' }, { email: "x' OR true--" }, { expectedAt: undefined }, { expectedAt: 'bad' }, { value: { owner_id: wife } }, { value: { ...emptyScreen(), focus: 'x'.repeat(401) } }]) {
    assert.throws(() => appDataSql({ ...options, operation: 'write', value: emptyScreen(), expectedAt: null, ...changed }));
  }
});
