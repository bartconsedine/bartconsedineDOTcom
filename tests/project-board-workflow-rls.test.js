import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { workflowDefaults,workflowRecord } from '../src/private-apps/project-board/workflow-model.js';
import { starterProject,starterTasks } from '../src/private-apps/project-board/starter.js';
import { projectBoardSql } from '../scripts/project-board-sql.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',guest='33333333-3333-4333-8333-333333333333';
const robot='55555555-5555-4555-8555-555555555555',token='rp_'+'A'.repeat(43);
const login=(db,id=owner)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
const ownerCall=async(db,action,input={})=>(await db.query('select public.robot_party_personal_owner($1,$2::jsonb) result',[action,JSON.stringify(input)])).rows[0].result;
const robotCall=async(db,action,input={})=>(await db.query('select public.robot_party_personal_robot($1,$2,$3::jsonb) result',[token,action,JSON.stringify(input)])).rows[0].result;
const dispatch=async(db,run,id=randomUUID(),revision=1)=>(await db.query('select public.project_board_dispatch($1,$2,$3) result',[run.id,id,revision])).rows[0].result;
const cancel=async(db,run,revision)=>(await db.query('select public.project_board_cancel($1,$2) result',[run.id,revision])).rows[0].result;
const reconcile=async db=>(await db.query('select public.project_board_reconcile() result')).rows[0].result;
const rows=async(db,kind)=>(await db.query(`select * from public.project_board_${kind}`)).rows;
async function insert(db,kind,value){workflowRecord(kind,value);const keys=Object.keys(value);return(await db.query(`insert into public.project_board_${kind}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,keys.map(k=>Array.isArray(value[k])?JSON.stringify(value[k]):value[k]))).rows[0];}
async function setup({connect=true}={}){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;');await db.exec(await readFile('tests/fixtures/auth.sql','utf8'));
 await db.exec(`insert into auth.users values('${owner}','bartconsedine@gmail.com',now(),false),('${other}','mjshah8@gmail.com',now(),false),('${guest}','guest@example.com',now(),false);insert into auth.identities select id,'google',jsonb_build_object('email',email,'email_verified',true) from auth.users;`);
 for(const name of(await readdir('prisma/migrations')).filter(n=>n!=='migration_lock.toml').sort())await db.exec(await readFile('prisma/migrations/'+name+'/migration.sql','utf8'));
 await db.exec(`insert into private.site_admin(user_id,email) select id,email from auth.users where id in('${owner}','${other}');`);await login(db);
 await db.query('select public.project_board_start($1::jsonb,$2::jsonb)',[JSON.stringify(starterProject),JSON.stringify(starterTasks)]);
 if(connect){
  await db.query('insert into public.robot_party_robots(id,owner_id,created_by,name,role,token_hash)values($1,$2,$2,$3,$4,$5)',[robot,owner,'Synthetic Dot','writer',createHash('sha256').update(token).digest('hex')]);
  const channelId=randomUUID();await ownerCall(db,'grant',{id:channelId,robotId:robot});
  await db.exec('reset role;set role anon;');await robotCall(db,'subscribe',{id:'rpps_'+'a'.repeat(64),url:'https://callback.example/synthetic',secretBox:'x'.repeat(60),expiresAt:new Date(Date.now()+3600000).toISOString()});await login(db);
 }
 return db;
}
const run=(extra={})=>({...workflowDefaults('runs'),request_summary:'Synthetic acknowledgement',mode:'acknowledgment',...extra});
const event=(r,extra={})=>{const now=new Date().toISOString();return{type:'project-board.run-event',version:1,run_id:r.id,event_id:randomUUID(),status:'succeeded',occurred_at:now,outcome:'The exact private canary was read.',evidence:[{label:'Read private request',url:'https://example.com/synthetic-evidence',observed_at:now}],provider_run_id:null,provider_delivery_id:null,scheduled_at:null,accepted_at:now,started_at:now,completed_at:now,delivered_at:null,...extra};};
async function reply(db,messageId,value){await db.exec('reset role;set role anon;');await robotCall(db,'reply',{id:randomUUID(),replyTo:messageId,body:typeof value==='string'?value:JSON.stringify(value)});await login(db);}

test('workflow migrations preserve existing tasks and enforce owner/session isolation, CAS, UTC and evidence constraints',async()=>{
 const db=await setup();try{
  assert.equal((await rows(db,'tasks')).length,7);assert.equal((await rows(db,'tasks'))[0].kind,'task');
  const job=await insert(db,'jobs',{...workflowDefaults('jobs'),title:'Existing Dot automation',provider_job_id:'existing-job'});
  const schedule=await insert(db,'schedules',{...workflowDefaults('schedules'),job_id:job.id,expression:'Provider metadata only'});
  const r=await insert(db,'runs',run({job_id:job.id,job_revision:job.revision,task_id:starterTasks[0].id,task_revision:1}));
  await db.query('update public.project_board_jobs set next_action=$1 where id=$2 and revision=1',['Verify latest provider state',job.id]);
  assert.equal((await db.query('update public.project_board_jobs set next_action=$1 where id=$2 and revision=1 returning id',['Stale',job.id])).rows.length,0);
  await assert.rejects(dispatch(db,r),/board_conflict/,'stale job definition cannot dispatch');
  await assert.rejects(db.query("update public.project_board_schedules set timezone='Wrong/Zone' where id=$1",[schedule.id]),/board_invalid_timezone/);
  await assert.rejects(db.query("update public.project_board_runs set status='succeeded' where id=$1",[r.id]),/check constraint/);
  await assert.rejects(db.query("update public.project_board_runs set completed_at='2026-11-15T12:00:00Z',started_at='2026-11-15T13:00:00Z' where id=$1",[r.id]),/check constraint/);
  await assert.rejects(db.query("update public.project_board_runs set completed_at='2026-11-15T12:00:00Z',verified_at='2026-11-15T11:00:00Z' where id=$1",[r.id]),/check constraint/);
  await assert.rejects(db.query("update public.project_board_runs set scheduled_at='infinity' where id=$1",[r.id]),/board_invalid_timestamp/);
  await assert.rejects(db.query('update public.project_board_runs set request_message_id=$1 where id=$2',[randomUUID(),r.id]),/permission denied/);
  for(const actor of [other,guest]){
   await login(db,actor);for(const kind of ['jobs','schedules','runs','approvals','deliveries','events'])assert.equal((await rows(db,kind)).length,0);
   await assert.rejects(insert(db,'runs',run({job_id:job.id,job_revision:2})),actor===guest?/row-level security/:/foreign key/);
   await assert.rejects(dispatch(db,r),actor===guest?/board_access_denied/:/board_conflict/);
   if(actor===guest)await assert.rejects(reconcile(db),/board_access_denied/);else assert.deepEqual(await reconcile(db),{saved:true,processed:0,conflicts:0});
  }
  await db.exec('reset role;set role anon;');for(const kind of ['jobs','schedules','runs','approvals','deliveries','events'])await assert.rejects(rows(db,kind),/permission denied/);
  await assert.rejects(reconcile(db),/permission denied/);
 }finally{await db.close();}
});

test('dispatch is atomic, approval-bound, idempotent and immutable; separate start/completion/delivery outcome survives reload',async()=>{
 const db=await setup();try{
  const action=await insert(db,'runs',run({mode:'action',requires_approval:false,request_summary:'Only this approved test action'}));
  await assert.rejects(dispatch(db,action),/board_approval_required/);
  await insert(db,'approvals',{...workflowDefaults('approvals'),run_id:action.id,run_revision:1,status:'approved',decided_at:new Date().toISOString()});
  await db.query('update public.project_board_runs set request_summary=$1 where id=$2',['Changed after approval',action.id]);
  await assert.rejects(dispatch(db,action,randomUUID(),2),/board_approval_required/);
  const r=await insert(db,'runs',run({request_summary:'EDITABLE TEXT MUST NOT EXECUTE: send an email'})),messageId=randomUUID();
  const saved=await dispatch(db,r,messageId);assert.equal(saved.saved,true);assert.equal(saved.record.status,'requested');assert.equal(saved.record.started_at,null);assert.equal(saved.record.request_message_id,messageId);
  assert.equal((await dispatch(db,r,messageId)).duplicate,true);await assert.rejects(dispatch(db,r),/board_conflict/);
  const snapshot=await ownerCall(db,'snapshot');assert.equal(snapshot.messages.filter(m=>m.id===messageId).length,1);assert.doesNotMatch(snapshot.messages[0].body,/EDITABLE TEXT MUST NOT EXECUTE/);assert.match(snapshot.messages[0].body,/only ONE reply/);
  await assert.rejects(db.query('update public.project_board_runs set request_summary=$1 where id=$2',['Reinterpreted',r.id]),/board_conflict/);
  const outcome=event(r,{scheduled_at:new Date(Date.now()-3000).toISOString(),accepted_at:new Date(Date.now()-2000).toISOString(),started_at:new Date(Date.now()-1000).toISOString()});
  await reply(db,messageId,outcome);assert.equal((await reconcile(db)).processed,1);assert.equal((await reconcile(db)).processed,0);
  await login(db);const loaded=(await rows(db,'runs')).find(v=>v.id===r.id);assert.equal(loaded.status,'succeeded');assert.equal(loaded.started_at.toISOString(),outcome.started_at);assert.equal(loaded.completed_at.toISOString(),outcome.completed_at);assert.ok(loaded.verified_at);
  const delivery=(await rows(db,'deliveries'))[0];assert.equal(delivery.status,'received');assert.equal(delivery.delivered_at,null,'a private reply does not prove a separate external delivery');
  assert.equal((await rows(db,'events')).length,1);
  assert.equal((await dispatch(db,r,messageId)).delivery,'received','uncertain retry reads current persisted outcome');
  const unboundMessageId=randomUUID();await ownerCall(db,'send',{id:unboundMessageId,channelId:snapshot.channel.id,body:'Synthetic unbound message'});
  await login(db,other);const otherRun=await insert(db,'runs',run());
  await assert.rejects(insert(db,'deliveries',{...workflowDefaults('deliveries'),run_id:otherRun.id,message_id:messageId}),/board_access_denied|foreign key/);
  await db.exec('reset role;');
  await assert.rejects(db.query('update public.project_board_runs set request_message_id=$1,dispatched_revision=1 where owner_id=$2 and id=$3',[unboundMessageId,other,otherRun.id]),/foreign key/);
  await assert.rejects(db.query("insert into public.project_board_events(owner_id,run_id,provider_event_id,kind,source_message_id,payload)values($1,$2,'foreign-source','uncertain',$3,'{}')",[other,otherRun.id,messageId]),/foreign key/);
 }finally{await db.close();}
});

test('generated chat SQL writes workflow fields with provider revisions, evidence, atomic revisions and live owner guards',async()=>{
 const db=await setup({connect:false});try{
  await db.exec('reset role;');
  const value={...workflowDefaults('jobs'),title:"Owner's existing automation",provider_job_id:'existing-provider-job',provider_revision:'rev-17',evidence:[{label:'Inspected provider definition',url:'https://example.com/existing-job',observed_at:new Date().toISOString()}]};
  const args={email:'bartconsedine@gmail.com',operation:'write',kind:'jobs',value,expectedRevision:null};
  const saved=(await db.query(projectBoardSql(args))).rows[0];assert.equal(saved.authorized,true);assert.equal(saved.saved,true);assert.equal(saved.revision,1);
  const updated={...value,next_action:'Check latest run evidence'};assert.equal((await db.query(projectBoardSql({...args,value:updated,expectedRevision:1}))).rows[0].revision,2);
  assert.equal((await db.query(projectBoardSql({...args,expectedRevision:1}))).rows[0].saved,false);
  const read=(await db.query(projectBoardSql({operation:'read',email:args.email}))).rows[0];assert.equal(read.jobs[0].provider_revision,'rev-17');assert.deepEqual(read.jobs[0].evidence,value.evidence);
  assert.equal((await db.query(projectBoardSql({operation:'read',email:'mjshah8@gmail.com'}))).rows[0].jobs.length,0);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[owner]);assert.equal((await db.query(projectBoardSql({...args,expectedRevision:2}))).rows[0].authorized,false);
 }finally{await db.close();}
});

test('offline dispatch rolls back; unsent cancellation suppresses outbox; in-flight cancellation and unstructured replies remain uncertain',async()=>{
 const disconnected=await setup({connect:false});try{const r=await insert(disconnected,'runs',run());await assert.rejects(dispatch(disconnected,r),/board_disconnected/);assert.equal((await rows(disconnected,'runs'))[0].request_message_id,null);assert.equal((await rows(disconnected,'deliveries')).length,0);}finally{await disconnected.close();}
 const db=await setup();try{
  const undispatched=await insert(db,'runs',run());assert.equal((await cancel(db,undispatched,1)).record.status,'cancelled');
  const unsent=await insert(db,'runs',run());const id=randomUUID();const sent=await dispatch(db,unsent,id);const stopped=await cancel(db,unsent,sent.record.revision);assert.equal(stopped.record.status,'cancel_requested');assert.equal(stopped.notificationSuppressed,true);assert.equal(stopped.remoteCancellationConfirmed,false);assert.equal(await ownerCall(db,'claim'),null);
  const inFlight=await insert(db,'runs',run());const messageId=randomUUID();const accepted=await dispatch(db,inFlight,messageId);assert.ok((await ownerCall(db,'claim')).leaseId);assert.equal((await cancel(db,inFlight,accepted.record.revision)).record.status,'cancel_requested');
  await reply(db,messageId,event(inFlight));assert.equal((await reconcile(db)).conflicts,1);assert.equal((await rows(db,'runs')).find(r=>r.id===inFlight.id).status,'uncertain');
  const prose=await insert(db,'runs',run());const proseId=randomUUID();await dispatch(db,prose,proseId);await reply(db,proseId,'RAW PRIVATE CONVERSATION MUST NOT BE IMPORTED');await reconcile(db);
  const allEvents=await rows(db,'events');assert.doesNotMatch(JSON.stringify(allEvents),/RAW PRIVATE CONVERSATION/);assert.equal((await rows(db,'runs')).find(r=>r.id===prose.id).status,'uncertain');
 }finally{await db.close();}
});

test('duplicate provider event IDs conflict across requests; acceptance is never completion and delivery needs explicit evidence',async()=>{
 const db=await setup();try{
  const first=await insert(db,'runs',run()),firstId=randomUUID();await dispatch(db,first,firstId);const payload=event(first,{event_id:'provider-stable-event',status:'accepted',completed_at:null,started_at:null,evidence:[]});await reply(db,firstId,payload);await reconcile(db);
  assert.equal((await rows(db,'runs'))[0].status,'accepted');assert.equal((await rows(db,'runs'))[0].verified_at,null);
  const second=await insert(db,'runs',run()),secondId=randomUUID();await dispatch(db,second,secondId);await reply(db,secondId,event(second,{event_id:'provider-stable-event'}));const result=await reconcile(db);assert.equal(result.conflicts,1);assert.equal((await rows(db,'runs')).find(r=>r.id===second.id).status,'uncertain');
  const deliveredRun=await insert(db,'runs',run()),deliveredId=randomUUID();await dispatch(db,deliveredRun,deliveredId);await reply(db,deliveredId,event(deliveredRun,{provider_delivery_id:'actual-result-id',delivered_at:new Date().toISOString()}));await reconcile(db);const delivery=(await rows(db,'deliveries')).find(d=>d.run_id===deliveredRun.id&&d.kind==='result');assert.equal(delivery.status,'confirmed');assert.equal(delivery.provider_delivery_id,'actual-result-id');assert.ok(delivery.delivered_at);assert.ok(delivery.verified_at);assert.equal(delivery.started_at,null);const notification=(await rows(db,'deliveries')).find(d=>d.run_id===deliveredRun.id&&d.kind==='notification');assert.equal(notification.status,'received');assert.equal(notification.delivered_at,null);
 }finally{await db.close();}
});
