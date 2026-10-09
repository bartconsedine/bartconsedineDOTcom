import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL enforces private app-data RLS for owner, non-owner and anonymous roles', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const stranger = '22222222-2222-4222-8222-222222222222';
  try {
    // Minimal Supabase Auth schema/roles for an isolated real Postgres policy test.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false);
      create table auth.identities (user_id uuid references auth.users(id), provider text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${owner}', 'bartconsedine@gmail.com', now(), false), ('${stranger}', 'other@example.com', now(), false);
      insert into auth.identities values ('${owner}', 'google'), ('${stranger}', 'google');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202610090001_private_workspace.sql', import.meta.url), 'utf8'));
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
    assert.equal((await db.query('select public.is_site_owner() allowed')).rows[0].allowed, false, 'Google user cannot self-enroll');
    await assert.rejects(db.exec(`insert into private.site_owner(user_id,email) values('${owner}','bartconsedine@gmail.com')`), /permission denied/);
    await db.exec(`reset role; insert into private.site_owner(user_id,email) values('${owner}','bartconsedine@gmail.com'); set role authenticated;`);
    await db.exec(`insert into public.app_data(app_slug,key,value) values('test-app','note','{"text":"private"}')`);
    assert.equal((await db.query('select * from public.app_data')).rows.length, 1);
    await db.exec(`update public.app_data set value='{"text":"updated"}' where key='note'`);
    await assert.rejects(db.exec(`insert into public.app_data(owner_id,app_slug,key) values('${stranger}','test-app','other')`), /row-level security/);
    await db.exec(`select set_config('request.jwt.claim.sub', '${stranger}', false)`);
    assert.equal((await db.query('select * from public.app_data')).rows.length, 0, 'other Google user sees no records');
    await assert.rejects(db.exec(`insert into public.app_data(app_slug,key) values('test-app','intruder')`), /row-level security/);
    await assert.rejects(db.exec(`insert into public.app_data(owner_id,app_slug,key) values('${owner}','test-app','spoofed')`), /row-level security/);
    await db.exec(`update public.app_data set value='{}'; delete from public.app_data;`);
    await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub','',false);`);
    await assert.rejects(db.exec('select * from public.app_data'), /permission denied/);
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false)`);
    assert.equal((await db.query('select value from public.app_data')).rows[0].value.text, 'updated', 'unauthorized mutations did not change owner data');
    await db.exec(`reset role; delete from auth.identities where user_id='${owner}'; set role authenticated;`);
    assert.equal((await db.query('select * from public.app_data')).rows.length, 0, 'removed Google identity revokes database access');
    await db.exec(`reset role; insert into auth.identities values('${owner}','google'); update auth.users set email='changed@example.com' where id='${owner}'; set role authenticated;`);
    assert.equal((await db.query('select * from public.app_data')).rows.length, 0, 'changed owner email revokes database access');
  } finally { await db.close(); }
});
