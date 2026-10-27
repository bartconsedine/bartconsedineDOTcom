import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const bart='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', guest='33333333-3333-4333-8333-333333333333', stranger='44444444-4444-4444-8444-444444444444';
async function database() {
  const db=new PGlite();await db.exec('create role anon; create role authenticated;');await db.exec(await readFile(new URL('./fixtures/auth.sql',import.meta.url),'utf8'));
  await db.exec(`insert into auth.users values('${bart}','bartconsedine@gmail.com',now(),false),('${other}','mjshah8@gmail.com',now(),false),('${guest}','guest@example.com',now(),false),('${stranger}','stranger@example.com',now(),false); insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;`);
  const folder=new URL('../prisma/migrations/',import.meta.url), files=(await readdir(folder)).filter(f=>f!=='migration_lock.toml').sort();
  for(const file of files.slice(0,2)) await db.exec(await readFile(new URL(`${file}/migration.sql`,folder),'utf8'));
  await db.exec(`insert into private.site_admin(user_id,email) select id,email from auth.users where id in('${bart}','${other}'); insert into public.app_data(owner_id,app_slug,key,value) values('${bart}','japan-trip','plan-v1','{"saved":"original"}'),('${bart}','uninvited-app','secret','{"saved":"hidden"}'),('${other}','japan-trip','plan-v1','{"saved":"other-owner"}');`);
  await db.exec(await readFile(new URL(`${files[2]}/migration.sql`,folder),'utf8')); return db;
}
const login=(db,id)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
const invite=async(db,role='viewer')=>{await login(db,bart);await db.exec(`insert into public.app_access_grants(owner_id,app_slug,invited_email,role) values('${bart}','japan-trip','guest@example.com','${role}')`);};
const records=async db=>(await db.query('select owner_id,app_slug,key,value,updated_at::text from public.app_data')).rows;

test('upgrade preserves records; a guest can only read the invited owner/app; viewers cannot mutate records or grants',async()=>{
 const db=await database();try{
  await invite(db);await login(db,guest);const rows=await records(db);assert.equal(rows.length,1);assert.equal(rows[0].owner_id,bart);assert.equal(rows[0].value.saved,'original');
  assert.equal((await db.query('select * from public.my_app_grants()')).rows.length,1);assert.equal((await db.query('select public.is_site_admin() allowed')).rows[0].allowed,false);
  await db.exec("update public.app_data set value='{}';delete from public.app_data;");assert.equal((await records(db))[0].value.saved,'original');
  await assert.rejects(db.exec(`insert into public.app_data(owner_id,app_slug,key) values('${bart}','japan-trip','forged')`),/row-level security/);
  await assert.rejects(db.exec(`insert into public.app_access_grants(owner_id,app_slug,invited_email,role) values('${bart}','uninvited-app','guest@example.com','editor')`),/row-level security/);
  await db.exec("update public.app_access_grants set role='editor';delete from public.app_access_grants;");assert.equal((await db.query('select role from public.my_app_grants()')).rows[0].role,'viewer');
  await login(db,stranger);assert.equal((await records(db)).length,0);assert.equal((await db.query('select * from public.app_access_grants')).rows.length,0);
  await login(db,bart);assert.equal((await records(db)).length,2);await login(db,other);assert.equal((await records(db))[0].value.saved,'other-owner');
 }finally{await db.close();}
});

test('editors write only the invited app and exact owner; CAS rejects stale edits; record identity cannot move',async()=>{
 const db=await database();try{
  await invite(db,'editor');await login(db,guest);const before=(await records(db))[0];
  const first=await db.query(`update public.app_data set value='{"saved":"guest-edit"}' where updated_at=$1 returning updated_at::text`,[before.updated_at]);assert.equal(first.rows.length,1);assert.notEqual(first.rows[0].updated_at,before.updated_at);
  assert.equal((await db.query(`update public.app_data set value='{}' where updated_at=$1 returning key`,[before.updated_at])).rows.length,0);
  for(const sql of [`insert into public.app_data(owner_id,app_slug,key) values('${bart}','uninvited-app','forged')`,`insert into public.app_data(owner_id,app_slug,key) values('${guest}','japan-trip','forged')`]) await assert.rejects(db.exec(sql),/row-level security/);
  await assert.rejects(db.exec("update public.app_data set app_slug='uninvited-app'"),/identity is immutable/);
  await db.exec(`insert into public.app_data(owner_id,app_slug,key) values('${bart}','japan-trip','new-record')`);assert.equal((await records(db)).length,2);
  await login(db,bart);await db.exec("update public.app_access_grants set role='viewer'");await login(db,guest);await db.exec("update public.app_data set value='{}'");assert.equal((await records(db)).find(r=>r.key==='plan-v1').value.saved,'guest-edit');
 }finally{await db.close();}
});

test('revocation, owner suspension and live Google identity changes deny access with the same session',async()=>{
 const db=await database();try{
  await invite(db,'editor');
  for(const change of ["delete from public.app_access_grants",`delete from private.site_admin where user_id='${bart}'`,`update auth.users set email_confirmed_at=null where id='${guest}'`,`update auth.users set is_anonymous=true where id='${guest}'`,`update auth.identities set identity_data=jsonb_build_object('email','guest@example.com','email_verified','true') where user_id='${guest}'`,`update auth.identities set identity_data=jsonb_build_object('email','stranger@example.com','email_verified',true) where user_id='${guest}'`]){
    await db.exec('reset role;begin;');await db.exec(change);await login(db,guest);assert.equal((await records(db)).length,0,change);assert.equal((await db.query('select * from public.my_app_grants()')).rows.length,0,change);await db.exec('rollback;');
  }
  await db.exec('reset role;set role anon;');for(const sql of ['select * from public.app_data','select * from public.app_access_grants','select * from public.my_app_grants()']) await assert.rejects(db.exec(sql),/permission denied/);
 }finally{await db.close();}
});
