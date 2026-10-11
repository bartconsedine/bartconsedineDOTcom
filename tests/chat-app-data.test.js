import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { appDataSql } from '../scripts/app-data-sql.mjs';
import { emptyPlan } from '../src/private-apps/japan-trip/model.js';
import { compareAndWrite } from '../src/lib/app-data-write.js';

const bart = '11111111-1111-4111-8111-111111111111';
const wife = '22222222-2222-4222-8222-222222222222';
const options = { slug: 'japan-trip', email: 'bartconsedine@gmail.com' };
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
    const value = { ...emptyPlan(), notes: "Bart's plan; '); delete from public.app_data; --" };
    assert.equal((await write(value, null)).rows[0].saved, true);
    assert.equal((await write(emptyPlan(), null)).rows[0].saved, false);
    const snapshot = (await read()).rows[0];
    assert.deepEqual(snapshot.value, value);
    assert.equal((await write(emptyPlan(), snapshot.updated_at)).rows[0].saved, true);
    assert.equal((await write(value, snapshot.updated_at)).rows[0].saved, false);
    assert.equal((await db.query(appDataSql({ ...options, email: 'mjshah8@gmail.com', operation: 'read' }))).rows[0].value, null);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${wife}',false);`);
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
      assert.deepEqual((await db.query(appDataSql({ ...options, operation: 'write', value: emptyPlan(), expectedAt: null }))).rows[0], { authorized: false, saved: false, updated_at: null });
      await db.exec('rollback;');
    }
  } finally { await db.close(); }
});

test('SQL preparation rejects unknown apps, owners, missing revisions, invalid plans and oversized values', () => {
  for (const changed of [{ slug: 'unknown' }, { email: "x' OR true--" }, { expectedAt: undefined }, { expectedAt: 'bad' }, { value: { owner_id: wife } }, { value: { ...emptyPlan(), notes: 'x'.repeat(16001) } }]) {
    assert.throws(() => appDataSql({ ...options, operation: 'write', value: emptyPlan(), expectedAt: null, ...changed }));
  }
});

test('user-session writer uses atomic revision predicates and returns only confirmed database revisions', async () => {
  const db = await database();
  try {
    // Minimal Supabase adapter against real Postgres, exercising insert/update + revision matching.
    const client = { from(table) {
      assert.equal(table, 'app_data');
      let row, insert = false; const filters = [];
      const chain = {
        insert(value) { row = value; insert = true; return chain; },
        update(value) { row = value; return chain; },
        eq(key, value) { filters.push([key, value]); return chain; },
        select() { return chain; },
        async maybeSingle() {
          try {
            const values = Object.values(row);
            const keys = Object.keys(row);
            const sql = insert
              ? `insert into public.app_data(${keys.join(',')}) values(${values.map((_,i)=>'$'+(i+1)).join(',')}) returning to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at`
              : `update public.app_data set ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} where ${filters.map(([k],i)=>`${k}=$${values.length+i+1}`).join(' and ')} returning to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at`;
            const result = await db.query(sql, [...values, ...filters.map(([,v])=>v)]);
            return { data: result.rows[0] ?? null, error: null };
          } catch (error) { return { data: null, error }; }
        },
      }; return chain;
    } };
    const save = (owner, expectedAt) => compareAndWrite(client, owner, 'japan-trip', 'plan-v1', emptyPlan(), expectedAt);
    const revision = await save(bart, null); assert.ok(revision);
    assert.equal(await save(bart, null), null);
    const next = await save(bart, revision); assert.ok(next); assert.notEqual(next, revision);
    assert.equal(await save(bart, revision), null);
    assert.equal(await save(wife, next), null);
    await db.exec('drop table public.app_data;');
    await assert.rejects(save(bart, next), /Unable to save/);
  } finally { await db.close(); }
});
