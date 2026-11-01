-- Private command/reply storage. Creates no connection grant or subscription.
begin;
create table public.robot_party_personal_channels(
 id uuid primary key, owner_id uuid not null references auth.users(id),
 robot_id uuid not null references public.robot_party_robots(id),
 created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz
);
create unique index robot_party_one_personal_channel on public.robot_party_personal_channels(owner_id) where revoked_at is null;
create table public.robot_party_personal_messages(
 id uuid primary key, channel_id uuid not null references public.robot_party_personal_channels(id),
 owner_id uuid not null references auth.users(id), sender text not null check(sender in('owner','dot')),
 robot_id uuid references public.robot_party_robots(id), reply_to uuid references public.robot_party_personal_messages(id),
 body text not null check(length(btrim(body)) between 1 and 8000),
 seq bigint generated always as identity unique, created_at timestamptz not null default clock_timestamp(),
 check((sender='owner' and robot_id is null and reply_to is null) or (sender='dot' and robot_id is not null and reply_to is not null))
);
create index robot_party_personal_owner_rate on public.robot_party_personal_messages(owner_id,created_at) where sender='owner';
create index robot_party_personal_history on public.robot_party_personal_messages(channel_id,seq);
create unique index robot_party_one_personal_reply on public.robot_party_personal_messages(reply_to) where sender='dot';
create table private.robot_party_personal_subscriptions(
 id text primary key check(id ~ '^rpps_[a-f0-9]{64}$'),
 channel_id uuid not null unique references public.robot_party_personal_channels(id),
 callback_url text not null check(length(callback_url)<=2048 and callback_url like 'https://%'),
 secret_box text not null check(length(secret_box) between 40 and 2048),
 expires_at timestamptz not null, active boolean not null default true
);
create table private.robot_party_personal_outbox(
 message_id uuid primary key references public.robot_party_personal_messages(id),
 channel_id uuid not null references public.robot_party_personal_channels(id),
 subscription_id text not null,
 state text not null default 'queued' check(state in('queued','received','failed')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_at timestamptz not null default clock_timestamp(), lease_id uuid, lease_until timestamptz,
 received_at timestamptz
);
create index robot_party_personal_pending on private.robot_party_personal_outbox(channel_id,next_at) where state='queued';
-- No table writes through the Data API. These owner policies also isolate direct reads.
alter table public.robot_party_personal_channels enable row level security;
alter table public.robot_party_personal_messages enable row level security;
alter table private.robot_party_personal_subscriptions enable row level security;
alter table private.robot_party_personal_outbox enable row level security;
revoke all on public.robot_party_personal_channels,public.robot_party_personal_messages,private.robot_party_personal_subscriptions,private.robot_party_personal_outbox from public,anon,authenticated;
grant select on public.robot_party_personal_channels,public.robot_party_personal_messages to authenticated;
create policy personal_channel_owner on public.robot_party_personal_channels for select to authenticated using(owner_id=(select auth.uid()) and (select public.is_site_admin()));
create policy personal_message_owner on public.robot_party_personal_messages for select to authenticated using(owner_id=(select auth.uid()) and (select public.is_site_admin()));

create function private.robot_party_personal_actor(p_token text) returns public.robot_party_personal_channels
language plpgsql security definer set search_path='' as $$
declare r public.robot_party_robots; c public.robot_party_personal_channels;
begin
 r:=private.robot_party_actor(p_token);
 if r.role<>'writer' or r.created_by<>r.owner_id then raise exception using errcode='42501',message='personal_access_denied'; end if;
 select * into c from public.robot_party_personal_channels where owner_id=r.owner_id and robot_id=r.id and revoked_at is null;
 if not found then raise exception using errcode='42501',message='personal_access_denied'; end if;
 return c;
end; $$;
revoke all on function private.robot_party_personal_actor(text) from public,anon,authenticated;

create function private.robot_party_personal_owner(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); c public.robot_party_personal_channels; r public.robot_party_robots;
 s private.robot_party_personal_subscriptions; m public.robot_party_personal_messages;
 o private.robot_party_personal_outbox; target uuid; lease uuid; rows jsonb; connection_active boolean:=false;
begin
 if who is null or not private.is_site_admin() then raise exception using errcode='42501',message='personal_access_denied'; end if;
 if jsonb_typeof(p_input)<>'object' then raise exception using errcode='22023',message='Invalid input'; end if;
 -- Serializes create/revoke, message creation, and leases for this owner.
 perform 1 from private.site_admin where user_id=who for update;
 select * into c from public.robot_party_personal_channels where owner_id=who and revoked_at is null for update;
 if p_action='grant' then
  if (select count(*) from jsonb_object_keys(p_input))<>2 or not p_input ?& array['id','robotId'] then raise exception using errcode='22023',message='Invalid grant'; end if;
  target:=(p_input->>'id')::uuid;
  select * into r from public.robot_party_robots where id=(p_input->>'robotId')::uuid and owner_id=who and created_by=who and role='writer' and revoked_at is null and expires_at>clock_timestamp() for update;
  if not found then raise exception using errcode='42501',message='personal_access_denied'; end if;
  if c.id=target and c.robot_id=r.id then return jsonb_build_object('channelId',c.id); end if;
  if c.id is not null then raise exception using errcode='P0001',message='personal_conflict'; end if;
  if exists(select 1 from public.robot_party_personal_channels where id=target) then raise exception using errcode='P0001',message='personal_conflict'; end if;
  insert into public.robot_party_personal_channels(id,owner_id,robot_id) values(target,who,r.id);
  return jsonb_build_object('channelId',target);
 elsif p_action='revoke' then
  if (select count(*) from jsonb_object_keys(p_input))<>1 or not p_input ? 'channelId' then raise exception using errcode='22023',message='Invalid revoke'; end if;
  target:=(p_input->>'channelId')::uuid;
  update public.robot_party_personal_channels set revoked_at=clock_timestamp() where owner_id=who and id=target and revoked_at is null;
  update private.robot_party_personal_subscriptions set active=false where channel_id=target and exists(select 1 from public.robot_party_personal_channels where id=target and owner_id=who);
  return jsonb_build_object('revoked',true);
 end if;
 if c.id is not null then
  select * into r from public.robot_party_robots where id=c.robot_id and owner_id=who and created_by=who and role='writer' and revoked_at is null and expires_at>clock_timestamp();
  connection_active:=found;
 end if;
 if connection_active then select * into s from private.robot_party_personal_subscriptions where channel_id=c.id and active and expires_at>clock_timestamp(); end if;
 if p_action='snapshot' then
  if p_input<>'{}'::jsonb then raise exception using errcode='22023',message='Invalid snapshot'; end if;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.seq),'[]'::jsonb) into rows from(
   select msg.*,delivery_row.state delivery,delivery_row.attempts from public.robot_party_personal_messages msg left join private.robot_party_personal_outbox delivery_row on delivery_row.message_id=msg.id where msg.owner_id=who and msg.channel_id=c.id order by msg.seq desc limit 100
  )v;
  return jsonb_build_object('channel',case when c.id is null then null else to_jsonb(c) end,'connectionActive',connection_active,'subscription',case when s.id is null then null else to_jsonb(s) end,'messages',rows,
   'hasPendingDelivery',exists(select 1 from private.robot_party_personal_outbox where channel_id=c.id and state='queued'));
 end if;
 if c.id is null or not connection_active or s.id is null then raise exception using errcode='42501',message='personal_disconnected'; end if;
 if p_action='send' then
  if (select count(*) from jsonb_object_keys(p_input))<>3 or not p_input ?& array['id','channelId','body'] or jsonb_typeof(p_input->'body')<>'string' or length(btrim(p_input->>'body')) not between 1 and 8000 or (p_input->>'channelId')::uuid<>c.id then raise exception using errcode='22023',message='Invalid message'; end if;
  target:=(p_input->>'id')::uuid;
  select * into m from public.robot_party_personal_messages where id=target;
  if found then
   if m.owner_id=who and m.channel_id=c.id and m.sender='owner' and m.body=p_input->>'body' then return jsonb_build_object('saved',true,'message',to_jsonb(m)); end if;
   raise exception using errcode='P0001',message='personal_conflict';
  end if;
  if (select count(*) from public.robot_party_personal_messages where owner_id=who and sender='owner' and created_at>clock_timestamp()-interval '1 day')>=200 then raise exception using errcode='P0001',message='personal_rate_limited'; end if;
  insert into public.robot_party_personal_messages(id,channel_id,owner_id,sender,body) values(target,c.id,who,'owner',p_input->>'body') returning * into m;
  insert into private.robot_party_personal_outbox(message_id,channel_id,subscription_id)values(m.id,c.id,s.id);
  return jsonb_build_object('saved',true,'message',to_jsonb(m));
 elsif p_action='claim' then
  if p_input<>'{}'::jsonb then raise exception using errcode='22023',message='Invalid claim'; end if;
  update private.robot_party_personal_outbox set state='failed' where channel_id=c.id and state='queued' and attempts>=5 and lease_until<=clock_timestamp();
  select * into o from private.robot_party_personal_outbox where channel_id=c.id and subscription_id=s.id and state='queued' and attempts<5 and next_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp()) order by next_at,message_id limit 1 for update skip locked;
  if not found then return null; end if;
  lease:=gen_random_uuid();
  update private.robot_party_personal_outbox set attempts=attempts+1,lease_id=lease,lease_until=clock_timestamp()+interval '30 seconds' where message_id=o.message_id;
  select * into m from public.robot_party_personal_messages where id=o.message_id;
  return jsonb_build_object('message',to_jsonb(m),'subscription',to_jsonb(s),'channel',to_jsonb(c),'leaseId',lease,'attempt',o.attempts+1);
 elsif p_action='finish' then
  if (select count(*) from jsonb_object_keys(p_input))<>3 or not p_input ?& array['messageId','leaseId','outcome'] or p_input->>'outcome' not in('received','retry','failed') then raise exception using errcode='22023',message='Invalid finish'; end if;
  select * into o from private.robot_party_personal_outbox where message_id=(p_input->>'messageId')::uuid and channel_id=c.id and lease_id=(p_input->>'leaseId')::uuid and state='queued' for update;
  if not found then return jsonb_build_object('saved',false); end if;
  update private.robot_party_personal_outbox set state=case when p_input->>'outcome'='received' then 'received' when p_input->>'outcome'='failed' or attempts>=5 then 'failed' else 'queued' end,
   received_at=case when p_input->>'outcome'='received' then clock_timestamp() else null end,
   next_at=clock_timestamp()+make_interval(secs=>least(300,power(2,attempts)::integer*5)),lease_id=null,lease_until=null where message_id=o.message_id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception using errcode='22023',message='Unknown personal operation';
end; $$;
revoke all on function private.robot_party_personal_owner(text,jsonb) from public,anon,authenticated;
grant execute on function private.robot_party_personal_owner(text,jsonb) to authenticated;
create function public.robot_party_personal_owner(p_action text,p_input jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.robot_party_personal_owner(p_action,p_input);$$;
revoke all on function public.robot_party_personal_owner(text,jsonb) from public,anon,authenticated;
grant execute on function public.robot_party_personal_owner(text,jsonb) to authenticated;

create function private.robot_party_personal_robot(p_token text,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.robot_party_personal_channels; r public.robot_party_robots; m public.robot_party_personal_messages; existing public.robot_party_personal_messages; rows jsonb; s private.robot_party_personal_subscriptions;
begin
 if jsonb_typeof(p_input)<>'object' then raise exception using errcode='22023',message='Invalid input'; end if;
 r:=private.robot_party_actor(p_token);
 if p_action='identity' then
  if p_input<>'{}'::jsonb then raise exception using errcode='22023',message='Invalid identity request'; end if;
  return jsonb_build_object('connectionId',r.id,'name',r.name,'eligible',r.created_by=r.owner_id and r.role='writer');
 end if;
 c:=private.robot_party_personal_actor(p_token);
 perform 1 from public.robot_party_personal_channels where id=c.id and revoked_at is null for update;
 if not found then raise exception using errcode='42501',message='personal_access_denied'; end if;
 -- Recheck credential after waiting for revocation/channel locks.
 r:=private.robot_party_actor(p_token);
 if p_action='context' then
  if p_input<>'{}'::jsonb then raise exception using errcode='22023',message='Invalid context'; end if;
  select * into s from private.robot_party_personal_subscriptions where channel_id=c.id and active and expires_at>clock_timestamp();
  return jsonb_build_object('channelId',c.id,'ownerId',c.owner_id,'connectionId',c.robot_id,'subscription',case when s.id is null then null else to_jsonb(s) end);
 elsif p_action='read' then
  if p_input<>'{}'::jsonb then
   if (select count(*) from jsonb_object_keys(p_input))<>1 or not p_input ? 'messageId' then raise exception using errcode='22023',message='Invalid read'; end if;
   select * into m from public.robot_party_personal_messages where id=(p_input->>'messageId')::uuid and channel_id=c.id;
   if not found then raise exception using errcode='42501',message='personal_access_denied'; end if;
   return jsonb_build_object('channelId',c.id,'messages',jsonb_build_array(to_jsonb(m)));
  end if;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.seq),'[]'::jsonb) into rows from(select * from public.robot_party_personal_messages where channel_id=c.id order by seq desc limit 100)v;
  return jsonb_build_object('channelId',c.id,'messages',rows);
 elsif p_action='reply' then
  if (select count(*) from jsonb_object_keys(p_input))<>3 or not p_input ?& array['id','replyTo','body'] or jsonb_typeof(p_input->'body')<>'string' or length(btrim(p_input->>'body')) not between 1 and 8000 then raise exception using errcode='22023',message='Invalid reply'; end if;
  select * into m from public.robot_party_personal_messages where id=(p_input->>'replyTo')::uuid and channel_id=c.id and sender='owner';
  if not found then raise exception using errcode='42501',message='personal_access_denied'; end if;
  select * into existing from public.robot_party_personal_messages where id=(p_input->>'id')::uuid or reply_to=m.id order by seq limit 1;
  if found then
   if existing.channel_id=c.id and existing.sender='dot' and existing.robot_id=r.id and existing.reply_to=m.id and existing.body=p_input->>'body' then return jsonb_build_object('saved',true,'message',to_jsonb(existing)); end if;
   raise exception using errcode='P0001',message='personal_conflict';
  end if;
  insert into public.robot_party_personal_messages(id,channel_id,owner_id,sender,robot_id,reply_to,body)values((p_input->>'id')::uuid,c.id,c.owner_id,'dot',r.id,m.id,p_input->>'body')returning * into existing;
  return jsonb_build_object('saved',true,'message',to_jsonb(existing));
 elsif p_action='subscribe' then
  if (select count(*) from jsonb_object_keys(p_input))<>4 or not p_input ?& array['id','url','secretBox','expiresAt'] then raise exception using errcode='22023',message='Invalid subscription'; end if;
  if (p_input->>'expiresAt')::timestamptz<=clock_timestamp() or (p_input->>'expiresAt')::timestamptz>clock_timestamp()+interval '24 hours 1 minute' then raise exception using errcode='22023',message='Invalid expiry'; end if;
  select * into s from private.robot_party_personal_subscriptions where channel_id=c.id for update;
  if found and s.active and s.expires_at>clock_timestamp() and s.id<>p_input->>'id' then raise exception using errcode='P0001',message='personal_subscription_conflict'; end if;
  update private.robot_party_personal_outbox set state='failed' where channel_id=c.id and state='queued' and subscription_id<>p_input->>'id';
  insert into private.robot_party_personal_subscriptions(id,channel_id,callback_url,secret_box,expires_at,active)
   values(p_input->>'id',c.id,p_input->>'url',p_input->>'secretBox',(p_input->>'expiresAt')::timestamptz,true)
   on conflict(channel_id) do update set id=excluded.id,callback_url=excluded.callback_url,secret_box=excluded.secret_box,expires_at=excluded.expires_at,active=true;
  return jsonb_build_object('id',p_input->>'id','refreshBefore',p_input->>'expiresAt','cursor',null,'truncated',false);
 elsif p_action='unsubscribe' then
  if (select count(*) from jsonb_object_keys(p_input))<>1 or not p_input ? 'id' then raise exception using errcode='22023',message='Invalid unsubscribe'; end if;
  update private.robot_party_personal_subscriptions set active=false where id=p_input->>'id' and channel_id=c.id;
  update private.robot_party_personal_outbox set state='failed' where channel_id=c.id and subscription_id=p_input->>'id' and state='queued';
  return '{}'::jsonb;
 end if;
 raise exception using errcode='22023',message='Unknown personal operation';
end; $$;
revoke all on function private.robot_party_personal_robot(text,text,jsonb) from public,anon,authenticated;
grant execute on function private.robot_party_personal_robot(text,text,jsonb) to anon,authenticated;
create function public.robot_party_personal_robot(p_token text,p_action text,p_input jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.robot_party_personal_robot(p_token,p_action,p_input);$$;
revoke all on function public.robot_party_personal_robot(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.robot_party_personal_robot(text,text,jsonb) to anon,authenticated;
commit;
