import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const owner='11111111-1111-4111-8111-111111111111', second='22222222-2222-4222-8222-222222222222', guest='33333333-3333-4333-8333-333333333333';
const device='D'.repeat(43), approval='A'.repeat(43), article='a'.repeat(64), another='b'.repeat(64);
const login=(db,id)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
const anon=db=>db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false);");
const call=async(db,action='list',secret=null,id=null)=>(await db.query('select public.morning_news_progress($1,$2,$3) result',[action,secret,id])).rows[0].result;
const tv=async(db,action,secret=device,other=null)=>(await db.query('select public.morning_tv($1,$2,$3) result',[action,secret,other])).rows[0].result;
async function database() {
  const db=new PGlite(); await db.exec('create role anon;create role authenticated;');await db.exec(await readFile('tests/fixtures/auth.sql','utf8'));
  await db.exec(`insert into auth.users values('${owner}','bartconsedine@gmail.com',now(),false),('${second}','mjshah8@gmail.com',now(),false),('${guest}','guest@example.com',now(),false);insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;`);
  for(const name of (await readdir('prisma/migrations')).filter(n=>n!=='migration_lock.toml').sort()) await db.exec(await readFile(`prisma/migrations/${name}/migration.sql`,'utf8'));
  await db.exec(`insert into private.site_admin(user_id,email) values('${owner}','bartconsedine@gmail.com'),('${second}','mjshah8@gmail.com');`);
  return db;
}
async function pair(db,who=owner,secret=device,code=approval) {await anon(db);await tv(db,'start',secret,code);await login(db,who);await tv(db,'approve',code);await anon(db);}
test('real SQL progress defaults off, persists across sessions/re-pairing, and isolates both admins and their TVs', async()=>{
  const db=await database();try {
    await pair(db);assert.equal((await call(db,'read',device,article)).state,'disabled');
    await db.exec('reset role;update private.morning_news_settings set enabled=true');await anon(db);
    const saved=await call(db,'read',device,article);assert.equal(saved.state,'saved');assert.equal((await call(db,'read',device,article)).readAt,saved.readAt);
    await login(db,owner);assert.equal((await call(db)).reads[0].id,article);await call(db,'read',null,another);
    await login(db,second);assert.deepEqual((await call(db)).reads,[]);await call(db,'read',null,article);
    await pair(db,second,'E'.repeat(43),'B'.repeat(43));assert.equal((await call(db,'list','E'.repeat(43))).reads.length,1);
    await anon(db);assert.equal((await call(db,'list',device)).reads.length,2);
    await tv(db,'forget');await assert.rejects(call(db,'list',device),/news_progress_denied/);
    await pair(db,owner,'F'.repeat(43),'C'.repeat(43));assert.equal((await call(db,'list','F'.repeat(43))).reads.length,2);
    for(const table of ['morning_news_reads','morning_news_settings']) await assert.rejects(db.exec(`select * from private.${table}`),/permission denied/);
    await login(db,owner);await assert.rejects(db.exec('delete from private.morning_news_reads'),/permission denied/);
    await db.exec(`reset role;delete from private.site_admin where user_id='${owner}'`);await anon(db);await assert.rejects(call(db,'list','F'.repeat(43)),/news_progress_denied/);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int count from private.morning_news_reads')).rows[0].count,1);
  }finally{await db.close();}
});
test('real SQL denies pending/expired/revoked TVs, guests, missing identity, anonymous owner access and malformed marks',async()=>{
  const db=await database();try {
    await db.exec('update private.morning_news_settings set enabled=true');await anon(db);
    await assert.rejects(call(db),/news_progress_denied/);await tv(db,'start',device,approval);await assert.rejects(call(db,'list',device),/news_progress_denied/);
    await login(db,guest);await assert.rejects(call(db),/news_progress_denied/);
    await login(db,owner);await tv(db,'approve',approval);await assert.rejects(call(db,'write'),/news_progress_invalid/);await assert.rejects(call(db,'read',null,'bad'),/news_progress_invalid/);await assert.rejects(call(db,'list',null,article),/news_progress_invalid/);
    await db.exec(`reset role;update auth.identities set identity_data='{}' where user_id='${owner}'`);await login(db,owner);await assert.rejects(call(db),/news_progress_denied/);await anon(db);await assert.rejects(call(db,'list',device),/news_progress_denied/);
    await db.exec(`reset role;update auth.identities set identity_data=jsonb_build_object('email','bartconsedine@gmail.com','email_verified',true) where user_id='${owner}';update private.morning_tv_devices set expires_at=now()-interval '1 second'`);await anon(db);await assert.rejects(call(db,'list',device),/news_progress_denied/);
    await db.exec("reset role;update private.morning_tv_devices set expires_at=now()+interval '1 day'");await login(db,owner);const list=await tv(db,'list',null);await tv(db,'revoke',list.devices[0].id);await anon(db);await assert.rejects(call(db,'list',device),/news_progress_denied/);
  }finally{await db.close();}
});
