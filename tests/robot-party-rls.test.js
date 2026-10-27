import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {readFile,readdir} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',guest='33333333-3333-4333-8333-333333333333';
const token='rp_'+'A'.repeat(43),robotId='55555555-5555-4555-8555-555555555555';
const content={title:'Building a better planner',body:'Feedback welcome',kind:'idea',status:'working',robotName:'',tags:['agents'],projectUrl:'https://example.com'};
const login=(db,id)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
async function database(includeMembers=true){const db=new PGlite();await db.exec('create role anon;create role authenticated;');await db.exec(await readFile('tests/fixtures/auth.sql','utf8'));await db.exec(`insert into auth.users values('${owner}','bartconsedine@gmail.com',now(),false),('${other}','mjshah8@gmail.com',now(),false),('${guest}','guest@example.com',now(),false);insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;`);for(const name of(await readdir('prisma/migrations')).filter(n=>n!=='migration_lock.toml').sort().slice(0,includeMembers?undefined:4))await db.exec(await readFile('prisma/migrations/'+name+'/migration.sql','utf8'));await db.exec(`insert into private.site_admin(user_id,email) select id,email from auth.users where id in('${owner}','${other}');`);return db;}
const post=async(db,id,parent=null)=>db.query(`insert into public.robot_party_messages(id,owner_id,author_id,parent_id,title,body,kind,status)values($1,$2,$3,$4,$5,'Hello',$6,$7) returning *`,[id,owner,guest,parent,parent?'':'An idea',parent?'reply':'idea',parent?'':'working']);
const rpc=async(db,name,value,key=token)=>(await db.query(`select public.robot_party_${name}($1,$2::jsonb) result`,[key,JSON.stringify(value)])).rows[0].result;
async function connect(db){await login(db,owner);await db.query('insert into public.robot_party_robots(id,owner_id,created_by,name,role,token_hash)values($1,$2,$2,$3,$4,$5)',[robotId,owner,'Helpful bot','writer',createHash('sha256').update(token).digest('hex')]);await db.exec('reset role;set role anon;');}
test('human board RLS: invitation scope, viewer denial, author edits, moderation, revisions and safe removal',async()=>{const db=await database();try{
 await login(db,owner);await db.exec(`insert into public.app_access_grants(owner_id,app_slug,invited_email,role)values('${owner}','robot-party','guest@example.com','viewer')`);await login(db,guest);
 const id=randomUUID();await assert.rejects(post(db,id),/row-level security/);
 await login(db,owner);await db.exec("update public.app_access_grants set role='editor'");await login(db,guest);const row=(await post(db,id)).rows[0];assert.equal(row.author_label,'guest');
 await assert.rejects(db.exec(`update public.robot_party_messages set owner_id='${other}'`),/immutable/);
 const reply=randomUUID();await post(db,reply,id);await assert.rejects(post(db,randomUUID(),reply),/Reply target/);
 const updated=await db.query('update public.robot_party_messages set body=$1 where id=$2 and updated_at=$3 returning updated_at::text',['Changed',id,row.updated_at]);assert.equal(updated.rows.length,1);
 assert.equal((await db.query('update public.robot_party_messages set body=$1 where id=$2 and updated_at=$3 returning id',['Stale',id,row.updated_at])).rows.length,0);
 await login(db,other);assert.equal((await db.query('select * from public.robot_party_messages')).rows.length,0);
 await login(db,owner);await db.query('update public.robot_party_messages set removed_at=now() where id=$1',[id]);const removed=(await db.query('select * from public.robot_party_messages where id=$1',[id])).rows[0];assert.equal(removed.body,'');assert.equal((await db.query('select * from public.robot_party_messages where parent_id=$1',[id])).rows.length,1);
 await assert.rejects(db.exec('delete from public.robot_party_messages'),/permission denied/);
 await db.exec('delete from public.app_access_grants');await login(db,guest);assert.equal((await db.query('select * from public.robot_party_messages')).rows.length,0);
}finally{await db.close();}});
test('robot capabilities: own board only, hashed keys, idempotency, author attribution, rate limits and immediate revocation',async()=>{const db=await database();try{
 await connect(db);await assert.rejects(db.exec('select * from public.robot_party_messages'),/permission denied/);await assert.rejects(db.exec('select token_hash from public.robot_party_robots'),/permission denied/);await assert.rejects(db.exec(`select private.robot_party_actor('${token}')`),/permission denied/);
 await assert.rejects(rpc(db,'read',{},'rp_'+'B'.repeat(43)),/robot_access_denied/);
 const id=randomUUID(),command={action:'create',id,parentId:null,content};const saved=await rpc(db,'write',command);assert.equal(saved.message.actor_kind,'robot');assert.equal(saved.message.author_label,'Helpful bot');assert.equal(saved.message.owner_id,owner);assert.equal(saved.message.robot_name,'Helpful bot');
 assert.equal((await rpc(db,'write',command)).message.id,id);assert.equal((await rpc(db,'read',{})).threads.length,1);
 await assert.rejects(rpc(db,'write',{...command,id:randomUUID()}),/robot_rate_limited/);
 await assert.rejects(rpc(db,'write',{...command,content:{...content,body:'Different'}}),/robot_conflict/);
 await assert.rejects(rpc(db,'write',{action:'edit',id:randomUUID(),expectedAt:saved.message.updated_at,content}),/robot_conflict/);
 await db.exec('reset role;update public.robot_party_robots set last_write_at=null;set role anon;');
 const changed=await rpc(db,'write',{action:'edit',id,expectedAt:saved.message.updated_at,content:{...content,body:'Improved'}});assert.equal(changed.message.body,'Improved');
 await assert.rejects(rpc(db,'write',{action:'remove',id,expectedAt:saved.message.updated_at}),/robot_conflict/);
 await login(db,owner);await assert.rejects(db.exec('select token_hash from public.robot_party_robots'),/permission denied/);await db.exec('update public.robot_party_robots set revoked_at=now()');await db.exec('reset role;set role anon;');await assert.rejects(rpc(db,'read',{}),/robot_access_denied/);
}finally{await db.close();}});
test('read-only and expired robot keys cannot write; guests cannot forge another issuer or robot identity',async()=>{const db=await database();try{
 await connect(db);await db.exec("reset role;update public.robot_party_robots set role='reader';set role anon;");assert.deepEqual((await rpc(db,'read',{})).threads,[]);await assert.rejects(rpc(db,'write',{action:'create',id:randomUUID(),parentId:null,content}),/robot_read_only/);
 await db.exec("reset role;update public.robot_party_robots set created_at=now()-interval '91 days',expires_at=now()-interval '1 day';set role anon;");await assert.rejects(rpc(db,'read',{}),/robot_access_denied/);
 await login(db,owner);await db.exec(`insert into public.app_access_grants(owner_id,app_slug,invited_email,role)values('${owner}','robot-party','guest@example.com','editor')`);await login(db,guest);assert.equal((await db.query('select id,name from public.robot_party_robots')).rows.length,0);
 await assert.rejects(db.exec(`insert into public.robot_party_robots(owner_id,created_by,name,role,token_hash)values('${owner}','${owner}','Forged','writer','${'a'.repeat(64)}')`),/row-level security/);
 await assert.rejects(db.exec(`insert into public.robot_party_messages(owner_id,author_id,actor_kind,robot_id,title,body,kind,status)values('${owner}','${guest}','robot','${robotId}','Fake','fake','idea','working')`),/row-level security|Robot identity is unavailable/);
}finally{await db.close();}});
test('robot pagination is bounded, other owners stay hidden, and a robot cannot edit a human message or survive owner suspension',async()=>{const db=await database();try{
 await connect(db);await login(db,owner);await db.exec(`insert into public.robot_party_messages(owner_id,author_id,title,body,kind,status)select '${owner}','${owner}','Human thread '||n,'Work in progress','update','working' from generate_series(1,32)n`);
 await login(db,other);const hidden=(await db.query(`insert into public.robot_party_messages(owner_id,author_id,title,body,kind,status)values('${other}','${other}','Other board','Hidden','idea','working')returning id`)).rows[0].id;
 await db.exec('reset role;set role anon;');const first=await rpc(db,'read',{});assert.equal(first.threads.length,30);assert.ok(first.next);const second=await rpc(db,'read',{cursor:first.next});assert.equal(second.threads.length,2);assert.equal(second.next,null);assert.equal(new Set([...first.threads,...second.threads].map(r=>r.id)).size,32);
 assert.equal((await rpc(db,'read',{thread:hidden})).notFound,true);await assert.rejects(rpc(db,'read',{cursor:hidden}),/Invalid cursor/);
 await assert.rejects(rpc(db,'write',{action:'edit',id:first.threads[0].id,expectedAt:first.threads[0].updated_at,content}),/robot_conflict/);
 await db.exec(`reset role;update auth.users set email_confirmed_at=null where id='${owner}';set role anon;`);await assert.rejects(rpc(db,'read',{}),/robot_access_denied/);
}finally{await db.close();}});
test('invited members issue independent scoped keys, manage only their keys and cannot delegate beyond human permissions',async()=>{const db=await database();try{
 await connect(db);await login(db,owner);await db.exec(`insert into public.app_access_grants(owner_id,app_slug,invited_email,role)values('${owner}','robot-party','guest@example.com','editor'),('${owner}','robot-party','mjshah8@gmail.com','viewer')`);
 await login(db,guest);const memberRobot=randomUUID(),memberToken='rp_'+'C'.repeat(43);await db.query('insert into public.robot_party_robots(id,owner_id,created_by,name,role,token_hash)values($1,$2,$3,$4,$5,$6)',[memberRobot,owner,guest,'Guest robot','writer',createHash('sha256').update(memberToken).digest('hex')]);
 assert.deepEqual((await db.query('select id,created_by from public.robot_party_robots')).rows,[{id:memberRobot,created_by:guest}]);assert.equal((await db.query('update public.robot_party_robots set revoked_at=now() where id=$1 returning id',[robotId])).rows.length,0);
 await assert.rejects(db.exec(`insert into public.robot_party_robots(owner_id,created_by,name,role,token_hash)values('${other}','${guest}','Wrong board','reader','${'e'.repeat(64)}')`),/invitation|row-level security/);
 await db.exec('reset role;set role anon;');const saved=await rpc(db,'write',{action:'create',id:randomUUID(),parentId:null,content},memberToken);assert.equal(saved.message.author_id,guest);assert.equal(saved.message.author_label,'Guest robot');assert.equal(saved.message.owner_id,owner);
 await login(db,other);assert.equal((await db.query('select id from public.robot_party_robots')).rows.length,0);
 await assert.rejects(db.exec(`insert into public.robot_party_robots(owner_id,created_by,name,role,token_hash)values('${owner}','${other}','Viewer writer','writer','${'b'.repeat(64)}')`),/row-level security/);
 await db.exec(`insert into public.robot_party_robots(owner_id,created_by,name,role,token_hash)values('${owner}','${other}','Viewer reader','reader','${'b'.repeat(64)}')`);
 await login(db,owner);assert.equal((await db.query('select id from public.robot_party_robots')).rows.length,3);await db.query('update public.robot_party_robots set revoked_at=now() where id=$1',[memberRobot]);await login(db,guest);await assert.rejects(db.exec('update public.robot_party_robots set revoked_at=null'),/cannot be reactivated/);await db.exec('reset role;set role anon;');await assert.rejects(rpc(db,'read',{},memberToken),/robot_access_denied/);
}finally{await db.close();}});
test('invitation downgrade, revocation, re-invitation and live issuer identity changes disable member tokens without affecting owner tokens',async()=>{const db=await database();try{
 await connect(db);await login(db,owner);await db.exec(`insert into public.app_access_grants(owner_id,app_slug,invited_email,role)values('${owner}','robot-party','guest@example.com','editor')`);
 await login(db,guest);const memberToken='rp_'+'D'.repeat(43),hash=createHash('sha256').update(memberToken).digest('hex');await db.query(`insert into public.robot_party_robots(owner_id,created_by,name,role,token_hash)values($1,$2,'Member robot','writer',$3)`,[owner,guest,hash]);
 await db.exec('reset role;set role anon;');assert.deepEqual((await rpc(db,'read',{},memberToken)).threads,[]);
 for(const change of [`update public.app_access_grants set role='viewer'`,`delete from public.app_access_grants`,`update auth.users set email_confirmed_at=null where id='${guest}'`,`update auth.identities set identity_data='{"email":"other@example.com","email_verified":true}' where user_id='${guest}'`]){
  await db.exec('reset role;begin;');await db.exec(change);await db.exec('set role anon;savepoint denied_call;');await assert.rejects(rpc(db,'read',{},memberToken),/robot_access_denied/);await db.exec('rollback to savepoint denied_call;');assert.deepEqual((await rpc(db,'read',{})).threads,[]);await db.exec('rollback;');
 }
 await db.exec(`reset role;update public.app_access_grants set role='viewer';update public.app_access_grants set role='editor';set role anon;`);await assert.rejects(rpc(db,'read',{},memberToken),/robot_access_denied/);
 await db.exec(`reset role;delete from public.app_access_grants;insert into public.app_access_grants(owner_id,app_slug,invited_email,role)values('${owner}','robot-party','guest@example.com','editor');set role anon;`);await assert.rejects(rpc(db,'read',{},memberToken),/robot_access_denied/);
 await assert.rejects(db.exec(`select private.robot_party_issuer_access('${owner}','${guest}',false,null)`),/permission denied/);
}finally{await db.close();}});

test('member-token upgrade preserves existing owner-issued credentials and board posts',async()=>{const db=await database(false);try{
 await connect(db);const command={action:'create',id:randomUUID(),parentId:null,content};await rpc(db,'write',command);
 await db.exec('reset role;');await db.exec(await readFile('prisma/migrations/20261027013318_robot_party_member_tokens/migration.sql','utf8'));await db.exec('set role anon;');
 const after=await rpc(db,'read',{});assert.equal(after.threads[0].id,command.id);assert.equal(after.threads[0].title,content.title);
}finally{await db.close();}});
