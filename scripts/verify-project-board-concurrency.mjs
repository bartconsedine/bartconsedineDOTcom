// Real PostgreSQL concurrency checks for the disposable recovery drill only.
// No transport pump or provider tool is called. Never point this at hosted data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { connection } from './database-connection.mjs';

const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const tracked=promise=>{
 const state={settled:false,result:null};
 state.promise=promise.then(value=>{state.settled=true;state.result={value};return state.result;},error=>{state.settled=true;state.result={error};return state.result;});
 return state;
};

async function expectBlocked(observer,pending,waitingPid,blockingPid,label){
 const deadline=Date.now()+3000;
 while(Date.now()<deadline){
  const result=await observer.query('select $1::integer=any(pg_catalog.pg_blocking_pids($2::integer)) blocked',[blockingPid,waitingPid]);
  if(result.rows[0].blocked){assert.equal(pending.settled,false,`${label} must remain pending while its blocker holds the row`);return;}
  assert.equal(pending.settled,false,`${label} completed without waiting for the conflicting transaction`);
  await delay(15);
 }
 assert.fail(`${label} did not expose the expected PostgreSQL row lock within three seconds`);
}

export async function verifyProjectBoardConcurrency(connectionString,{ownerId}={}){
 const c=connection(connectionString);
 assert.equal(c.local,true,'Project board concurrency verification permits only a disposable loopback database');
 assert.match(ownerId??'',/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,'Supply the existing synthetic fixture owner UUID');
 // Explicit connection fields ignore the recovery drill's poisoned libpq env.
 const config={host:c.host,port:Number(c.port),database:c.database,user:c.user,password:c.password,ssl:false,options:'-c search_path=public',connectionTimeoutMillis:5000};
 const clients=[new pg.Client(config),new pg.Client(config),new pg.Client(config)];
 const [observer,left,right]=clients;
 const fixture={jobId:randomUUID(),runs:[randomUUID(),randomUUID()],approvals:[randomUUID(),randomUUID()],messages:[randomUUID(),randomUUID()]};
 let connected=0,fixturesCreated=false;
 try{
  for(const client of clients){await client.connect();connected++;await client.query("set statement_timeout='10s';set lock_timeout='7s';");}
  const [{rows:[{pid:leftPid}]},{rows:[{pid:rightPid}]}]=await Promise.all([left.query('select pg_backend_pid() pid'),right.query('select pg_backend_pid() pid')]);
  for(const client of [left,right]){
   await client.query('set role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,false)",[ownerId]);
   assert.equal((await client.query('select public.is_site_admin() allowed')).rows[0].allowed,true,'Concurrency fixtures require the existing verified synthetic owner');
  }
  // A known live private channel/subscription is a fixture prerequisite, never
  // created or extended by this helper.
  const snapshot=(await left.query("select public.robot_party_personal_owner('snapshot','{}'::jsonb) value")).rows[0].value;
  assert.equal(snapshot.connectionActive,true,'The fixture private connection must already be active');
  assert.ok(snapshot.channel?.id&&snapshot.subscription?.active,'The fixture private subscription must already be active');

  await left.query('insert into public.project_board_jobs(id,title)values($1,$2)',[fixture.jobId,'Synthetic two-client revision fixture']);
  fixturesCreated=true;
  await left.query('begin');
  const winner=await left.query('update public.project_board_jobs set next_action=$1 where id=$2 and revision=1 returning revision',['First editor',fixture.jobId]);
  const loser=tracked(right.query('update public.project_board_jobs set next_action=$1 where id=$2 and revision=1 returning revision',['Second editor',fixture.jobId]));
  await expectBlocked(observer,loser,rightPid,leftPid,'Conflicting revision update');
  await left.query('commit');
  const lost=await loser.promise;assert.ifError(lost.error);
  assert.equal(winner.rowCount+lost.value.rowCount,1,'Exactly one real concurrent CAS writer wins');
  assert.equal(winner.rows[0].revision,2);assert.equal(lost.value.rowCount,0);
  const persisted=(await left.query('select revision,next_action from public.project_board_jobs where id=$1',[fixture.jobId])).rows[0];
  assert.deepEqual(persisted,{revision:2,next_action:'First editor'});

  const createApprovalFixture=async index=>{
   await left.query('insert into public.project_board_runs(id,request_summary,mode)values($1,$2,$3)',[fixture.runs[index],'Synthetic local concurrency fixture only. Never execute an external action.','action']);
   await left.query("insert into public.project_board_approvals(id,run_id,run_revision,status,decided_at)values($1,$2,1,'approved',clock_timestamp())",[fixture.approvals[index],fixture.runs[index]]);
  };
  await createApprovalFixture(0);
  await left.query('begin');
  await left.query("update public.project_board_approvals set status='revoked',decided_at=clock_timestamp() where id=$1",[fixture.approvals[0]]);
  const denied=tracked(right.query('select public.project_board_dispatch($1,$2,1) result',[fixture.runs[0],fixture.messages[0]]));
  await expectBlocked(observer,denied,rightPid,leftPid,'Dispatch behind uncommitted approval revocation');
  await left.query('commit');
  const refusal=await denied.promise;
  assert.match(refusal.error?.message??'',/board_approval_required/,'Dispatch must reread the committed revocation and refuse');
  const deniedState=(await left.query('select request_message_id from public.project_board_runs where id=$1',[fixture.runs[0]])).rows[0];
  assert.equal(deniedState.request_message_id,null,'Revocation must leave no bound request');
  assert.equal((await observer.query('select count(*)::integer count from public.robot_party_personal_messages where id=$1',[fixture.messages[0]])).rows[0].count,0);
  assert.equal((await left.query('select count(*)::integer count from public.project_board_deliveries where run_id=$1',[fixture.runs[0]])).rows[0].count,0);

  await createApprovalFixture(1);
  await left.query('begin');
  const accepted=(await left.query('select public.project_board_dispatch($1,$2,1) result',[fixture.runs[1],fixture.messages[1]])).rows[0].result;
  assert.equal(accepted.saved,true);assert.equal(accepted.record.request_message_id,fixture.messages[1]);
  await right.query('begin');
  const revokeAfterDispatch=tracked(right.query("update public.project_board_approvals set status='revoked',decided_at=clock_timestamp() where id=$1 returning status",[fixture.approvals[1]]));
  await expectBlocked(observer,revokeAfterDispatch,rightPid,leftPid,'Approval revocation behind atomic dispatch');
  assert.equal((await observer.query('select count(*)::integer count from public.robot_party_personal_messages where id=$1',[fixture.messages[1]])).rows[0].count,0,'No partial private message is visible before dispatch commits');
  assert.equal((await observer.query('select count(*)::integer count from public.project_board_deliveries where run_id=$1',[fixture.runs[1]])).rows[0].count,0,'No partial delivery is visible before dispatch commits');
  await left.query('commit');
  const revoked=await revokeAfterDispatch.promise;assert.ifError(revoked.error);assert.equal(revoked.value.rows[0].status,'revoked');await right.query('commit');
  const atomic=(await observer.query('select r.request_message_id,r.revision,(select count(*)::integer from public.project_board_deliveries d where d.owner_id=r.owner_id and d.run_id=r.id) deliveries,(select count(*)::integer from private.robot_party_personal_outbox o where o.message_id=r.request_message_id) outbox from public.project_board_runs r where owner_id=$1 and id=$2',[ownerId,fixture.runs[1]])).rows[0];
  assert.deepEqual(atomic,{request_message_id:fixture.messages[1],revision:2,deliveries:1,outbox:1},'Run binding, private message notification, and board delivery commit together');
  return {casWinners:1,revokedApprovalDenied:true,dispatchApprovalSerialized:true};
 }finally{
  // Rollbacks release any locks even after a failed assertion; the bounded SQL
  // timeouts prevent a broken race assertion from hanging the recovery drill.
  await Promise.allSettled(clients.slice(0,connected).map(client=>client.query('rollback')));
  let cleanupError;
  if(connected>0&&fixturesCreated){
   // Delete only this helper's random local fixtures, retaining the caller's
   // channel, grant, subscription, history and recovery fixture records.
   try{
    await observer.query('begin');
    await observer.query('delete from public.project_board_events where owner_id=$1 and run_id=any($2::uuid[])',[ownerId,fixture.runs]);
    await observer.query('delete from public.project_board_deliveries where owner_id=$1 and run_id=any($2::uuid[])',[ownerId,fixture.runs]);
    await observer.query('delete from public.project_board_approvals where owner_id=$1 and id=any($2::uuid[])',[ownerId,fixture.approvals]);
    await observer.query('delete from public.project_board_runs where owner_id=$1 and id=any($2::uuid[])',[ownerId,fixture.runs]);
    await observer.query('delete from private.robot_party_personal_outbox where message_id=any($1::uuid[])',[fixture.messages]);
    await observer.query('delete from public.robot_party_personal_messages where owner_id=$1 and id=any($2::uuid[])',[ownerId,fixture.messages]);
    await observer.query('delete from public.project_board_jobs where owner_id=$1 and id=$2',[ownerId,fixture.jobId]);
    await observer.query('commit');
   }catch(error){await observer.query('rollback').catch(()=>{});cleanupError=error;}
  }
  await Promise.allSettled(clients.slice(0,connected).map(client=>client.end()));
  if(cleanupError)throw cleanupError;
 }
}
