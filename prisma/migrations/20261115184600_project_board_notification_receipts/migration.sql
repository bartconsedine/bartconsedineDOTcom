-- Correct notification receipt provenance without altering the applied workflow migration.
-- No new permissions, provider actions, schedules or credentials are introduced.
begin;

create or replace function private.project_board_reconcile() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid();item record;r public.project_board_runs;e jsonb;old_event public.project_board_events;
 stamp timestamptz;delivered timestamptz;scheduled timestamptz;accepted timestamptz;started timestamptz;completed timestamptz;time_key text;parsed timestamptz;valid boolean;conflict boolean;event_key text;state text;processed integer:=0;conflicts integer:=0;
begin
 if who is null or not private.is_site_admin() then raise exception using errcode='42501',message='board_access_denied'; end if;
 perform 1 from private.site_admin where user_id=who for update;
 -- Only replies to a bound request, from its granted connection/channel. The
 -- grant must still be live; credential reuse never expands access to other owners.
 for item in select m.id message_id,m.body,m.created_at reply_created_at,rn.id run_id
  from public.project_board_runs rn
  join public.robot_party_personal_messages request on request.id=rn.request_message_id and request.owner_id=who and request.sender='owner'
  join public.robot_party_personal_channels c on c.id=request.channel_id and c.owner_id=who and c.revoked_at is null
  join public.robot_party_robots robot on robot.id=c.robot_id and robot.owner_id=who and robot.created_by=who and robot.role='writer' and robot.revoked_at is null and robot.expires_at>clock_timestamp()
  join public.robot_party_personal_messages m on m.reply_to=request.id and m.channel_id=c.id and m.owner_id=who and m.robot_id=c.robot_id and m.sender='dot'
  where rn.owner_id=who and not exists(select 1 from public.project_board_events done where done.owner_id=who and done.source_message_id=m.id)
  order by m.seq limit 100
 loop
  select * into r from public.project_board_runs where owner_id=who and id=item.run_id for update;
  valid:=false;conflict:=false;e:=null;stamp:=null;delivered:=null;scheduled:=null;accepted:=null;started:=null;completed:=null;
  begin
   e:=item.body::jsonb;
   valid:=jsonb_typeof(e)='object' and (select count(*) from jsonb_object_keys(e))=15 and e ?& array['type','version','run_id','event_id','status','occurred_at','outcome','evidence','provider_run_id','provider_delivery_id','scheduled_at','accepted_at','started_at','completed_at','delivered_at']
    and e->>'type'='project-board.run-event' and e->'version'='1'::jsonb and e->>'run_id'=r.id::text
    and jsonb_typeof(e->'event_id')='string' and length(btrim(e->>'event_id')) between 1 and 500
    and e->>'status' in('accepted','running','waiting','succeeded','failed','cancelled','uncertain')
    and jsonb_typeof(e->'outcome')='string' and length(e->>'outcome')<=4000
    and private.project_board_evidence_valid(e->'evidence')
    and (e->'provider_run_id'='null'::jsonb or (jsonb_typeof(e->'provider_run_id')='string' and length(btrim(e->>'provider_run_id')) between 1 and 500))
    and (e->'provider_delivery_id'='null'::jsonb or (jsonb_typeof(e->'provider_delivery_id')='string' and length(btrim(e->>'provider_delivery_id')) between 1 and 500))
    and e->>'occurred_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$';
   if valid then
    stamp:=(e->>'occurred_at')::timestamptz;
    valid:=isfinite(stamp) and stamp<=clock_timestamp()+interval '5 minutes' and stamp>=r.created_at-interval '5 minutes';
    foreach time_key in array array['scheduled_at','accepted_at','started_at','completed_at','delivered_at'] loop
     parsed:=null;
     if e->time_key<>'null'::jsonb then
      valid:=valid and e->>time_key ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$';
      parsed:=(e->>time_key)::timestamptz;
      valid:=valid and isfinite(parsed) and (time_key='scheduled_at' or (parsed<=clock_timestamp()+interval '5 minutes' and parsed>=r.created_at-interval '5 minutes'));
     end if;
     case time_key when 'scheduled_at' then scheduled:=parsed;when 'accepted_at' then accepted:=parsed;when 'started_at' then started:=parsed;when 'completed_at' then completed:=parsed;when 'delivered_at' then delivered:=parsed;end case;
    end loop;
    if delivered is not null then valid:=valid and delivered<=clock_timestamp() and private.project_board_evidence_confirmed(e->'evidence');end if;
    if completed is not null then valid:=valid and completed<=clock_timestamp();end if;
    if started is not null and completed is not null then valid:=valid and completed>=started;end if;
    if e->>'status'='running' then valid:=valid and started is not null;end if;
    if e->>'status' in('succeeded','cancelled') then valid:=valid and completed is not null and jsonb_array_length(e->'evidence')>0 and length(btrim(e->>'outcome'))>0 and not exists(select 1 from jsonb_array_elements(e->'evidence') ev where ev->'observed_at'='null'::jsonb); end if;
   end if;
  exception when others then valid:=false;
  end;
  if valid is not true then
   event_key:='unstructured:'||item.message_id::text;state:='uncertain';stamp:=item.reply_created_at;
   e:=jsonb_build_object('reason','Private reply did not match the structured outcome contract. Inspect the original private message.','message_id',item.message_id);
  else
   event_key:=e->>'event_id';state:=e->>'status';
   select * into old_event from public.project_board_events where owner_id=who and provider='dot' and provider_event_id=event_key;
   if found then
    if old_event.run_id=r.id and old_event.payload=e then
     -- A second request cannot apply the same provider event to another run.
     -- This branch is defensive: private replies are already one-per-request.
     conflict:=false;
    else conflict:=true;end if;
   end if;
   if exists(select 1 from public.project_board_runs other where other.owner_id=who and other.id<>r.id and other.provider='dot' and other.provider_run_id=e->>'provider_run_id') then conflict:=true;end if;
   if exists(select 1 from public.project_board_deliveries other where other.owner_id=who and other.kind='result' and other.provider='dot' and other.provider_delivery_id=e->>'provider_delivery_id') then conflict:=true;end if;
   if r.provider_run_id is not null and e->>'provider_run_id' is not null and r.provider_run_id<>e->>'provider_run_id' then conflict:=true;end if;
   if r.revision<>r.dispatched_revision+1 then conflict:=true;end if;
   if r.status in('cancel_requested','cancelled') and state<>'cancelled' then conflict:=true;end if;
   if r.status in('succeeded','failed') and state<>r.status then conflict:=true;end if;
   if conflict then
    conflicts:=conflicts+1;event_key:='conflict:'||item.message_id::text;state:='conflict';
    e:=jsonb_build_object('reason','Provider event conflicts with saved outcome, cancellation, or event identity. Inspect the private reply before further action.','message_id',item.message_id,'claimed_event_id',e->>'event_id');
   end if;
  end if;
  insert into public.project_board_events(owner_id,run_id,provider_event_id,kind,occurred_at,source_message_id,payload)
   values(who,r.id,event_key,state,stamp,item.message_id,e) on conflict(owner_id,provider,provider_event_id) do nothing;
  if state in('uncertain','conflict') then
   update public.project_board_runs set status='uncertain',
    outcome=case when valid and not conflict then e->>'outcome' else outcome end,
    evidence=case when valid and not conflict then e->'evidence' else evidence end,
    next_action='Inspect the original private Dot reply and saved event before retrying any external action.' where owner_id=who and id=r.id;
   update public.project_board_deliveries set status='uncertain',next_action='Delivery or outcome is uncertain; inspect the private reply.' where owner_id=who and run_id=r.id and kind='result';
  else
   update public.project_board_runs set status=state,provider_run_id=coalesce(e->>'provider_run_id',provider_run_id),
    scheduled_at=coalesce(scheduled,scheduled_at),accepted_at=coalesce(accepted,accepted_at),
    started_at=coalesce(started,started_at),completed_at=coalesce(completed,completed_at),
    verified_at=case when state in('succeeded','cancelled') then clock_timestamp() else verified_at end,
    outcome=e->>'outcome',evidence=e->'evidence',next_action=case when state in('succeeded','cancelled') then 'Verified structured provider outcome recorded.' when state='failed' then 'Review failure and decide the next action; no automatic retry.' else 'Await a verified outcome; acceptance is not completion.' end
    where owner_id=who and id=r.id;
  end if;
  if valid and not conflict and (delivered is not null or e->>'provider_delivery_id' is not null) then
   insert into public.project_board_deliveries(owner_id,id,run_id,kind,provider_delivery_id,message_id,status,received_at,delivered_at,verified_at,evidence,next_action)
    values(who,item.message_id,r.id,'result',e->>'provider_delivery_id',item.message_id,case when delivered is not null then 'confirmed' else 'uncertain' end,item.reply_created_at,delivered,case when delivered is not null then clock_timestamp() else null end,e->'evidence',case when delivered is not null then 'Provider reported confirmed result delivery with evidence.' else 'Provider reported a result identifier without confirmed delivery. Inspect before retrying.' end);
  end if;
  processed:=processed+1;
 end loop;
 -- Notification transport comes only from its exact outbox record. A private
 -- reply does not prove the callback was received, even when the run succeeded.
 with notification_state as (
  select d.owner_id,d.id,o.received_at,
   case when o.state='received' and o.received_at is not null then 'received'
    when o.state='failed' and d.status='cancelled' and o.attempts=0 then 'cancelled'
    when o.state='failed' then 'failed' when o.state='queued' then 'queued' else 'uncertain' end status,
   case when o.state='received' and o.received_at is not null then 'Private callback received; Dot outcomes and result deliveries are tracked separately.'
    when o.state='failed' and d.status='cancelled' and o.attempts=0 then 'Notification suppressed before a callback attempt; remote cancellation remains unconfirmed.'
    when o.state='failed' then 'Transport failed; inspect saved state before deciding on another action.'
    when o.state='queued' then 'Private callback receipt is not confirmed; a Dot reply is tracked separately.'
    else 'Notification transport receipt is unknown; inspect saved outbox state.' end next_action
  from public.project_board_deliveries d
  join public.project_board_runs bound_run on bound_run.owner_id=d.owner_id and bound_run.id=d.run_id and bound_run.request_message_id=d.message_id
  join public.robot_party_personal_messages request on request.owner_id=d.owner_id and request.id=d.message_id and request.sender='owner'
  left join private.robot_party_personal_outbox o on o.message_id=request.id and o.channel_id=request.channel_id
  where d.kind='notification' and d.owner_id=who
 )
 update public.project_board_deliveries d set received_at=s.received_at,status=s.status,next_action=s.next_action
 from notification_state s where d.owner_id=s.owner_id and d.id=s.id
  and row(d.received_at,d.status,d.next_action) is distinct from row(s.received_at,s.status,s.next_action);
 return jsonb_build_object('saved',true,'processed',processed,'conflicts',conflicts);
end; $$;

-- Repair only Bart's verified-owner, run/message-bound notification rows. The
-- source is the exact private outbox value, including NULL when unconfirmed.
-- Result delivery, execution and reply timestamps are intentionally untouched.
 with notification_state as (
  select d.owner_id,d.id,o.received_at,
   case when o.state='received' and o.received_at is not null then 'received'
    when o.state='failed' and d.status='cancelled' and o.attempts=0 then 'cancelled'
    when o.state='failed' then 'failed' when o.state='queued' then 'queued' else 'uncertain' end status,
   case when o.state='received' and o.received_at is not null then 'Private callback received; Dot outcomes and result deliveries are tracked separately.'
    when o.state='failed' and d.status='cancelled' and o.attempts=0 then 'Notification suppressed before a callback attempt; remote cancellation remains unconfirmed.'
    when o.state='failed' then 'Transport failed; inspect saved state before deciding on another action.'
    when o.state='queued' then 'Private callback receipt is not confirmed; a Dot reply is tracked separately.'
    else 'Notification transport receipt is unknown; inspect saved outbox state.' end next_action
  from public.project_board_deliveries d
  join public.project_board_runs bound_run on bound_run.owner_id=d.owner_id and bound_run.id=d.run_id and bound_run.request_message_id=d.message_id
  join public.robot_party_personal_messages request on request.owner_id=d.owner_id and request.id=d.message_id and request.sender='owner'
  left join private.robot_party_personal_outbox o on o.message_id=request.id and o.channel_id=request.channel_id
  where d.kind='notification' and exists(select 1 from private.site_admin a join auth.users u on u.id=a.user_id
   where a.user_id=d.owner_id and a.email='bartconsedine@gmail.com' and lower(u.email)=a.email
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
     and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=a.email))
 )
 update public.project_board_deliveries d set received_at=s.received_at,status=s.status,next_action=s.next_action
 from notification_state s where d.owner_id=s.owner_id and d.id=s.id
  and row(d.received_at,d.status,d.next_action) is distinct from row(s.received_at,s.status,s.next_action);

commit;
