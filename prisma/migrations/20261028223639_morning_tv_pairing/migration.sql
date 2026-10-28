begin;
-- Device credentials are separate from Google sessions and grant only one feed read.
create table private.morning_tv_devices (
 device_hash text primary key check(device_hash ~ '^[a-f0-9]{64}$'),
 approval_hash text not null unique check(approval_hash ~ '^[a-f0-9]{64}$'),
 owner_id uuid references private.site_admin(user_id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 pairing_expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
 expires_at timestamptz,
 revoked_at timestamptz
);
create index morning_tv_owner on private.morning_tv_devices(owner_id);
create index morning_tv_expiry on private.morning_tv_devices(pairing_expires_at) where owner_id is null;
alter table private.morning_tv_devices enable row level security;
revoke all on private.morning_tv_devices from public,anon,authenticated;

-- The definer is the narrow capability boundary. Clients cannot select the table,
-- choose an owner, change lifetimes, or fetch any key other than screen-v1.
create function private.morning_tv(p_action text,p_secret text,p_other text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.morning_tv_devices; h text; payload jsonb;
begin
 if p_action in ('inspect','approve','list','revoke') then
  if auth.uid() is null or not private.is_site_admin() then
   raise exception using errcode='42501',message='tv_denied';
  end if;
 end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',device_hash,'code',upper(left(approval_hash,8)), 'createdAt',created_at,'expiresAt',expires_at) order by created_at desc),'[]'::jsonb)
   into payload from private.morning_tv_devices where owner_id=auth.uid() and revoked_at is null and expires_at>clock_timestamp();
  return jsonb_build_object('devices',payload);
 end if;
 if p_action='revoke' then
  update private.morning_tv_devices set revoked_at=clock_timestamp() where device_hash=p_secret and owner_id=auth.uid() and revoked_at is null;
  return jsonb_build_object('revoked',true);
 end if;
 if p_secret is null or p_secret !~ '^[A-Za-z0-9_-]{43}$' then
  raise exception using errcode='22023',message='tv_invalid';
 end if;
 h:=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
 if p_action='start' then
  if p_other is null or p_other !~ '^[A-Za-z0-9_-]{43}$' or p_other=p_secret then raise exception using errcode='22023',message='tv_invalid'; end if;
  -- Serialize new requests, bound pending state, and remove expired credentials.
  perform pg_advisory_xact_lock(742810);
  delete from private.morning_tv_devices where (owner_id is null and pairing_expires_at<clock_timestamp()) or expires_at<clock_timestamp() or revoked_at is not null;
  if (select count(*) from private.morning_tv_devices where owner_id is null)>=1000 then raise exception using errcode='P0001',message='tv_busy'; end if;
  insert into private.morning_tv_devices(device_hash,approval_hash) values(h,encode(sha256(convert_to(p_other,'UTF8')),'hex')) returning * into d;
  return jsonb_build_object('status','pending','expiresAt',d.pairing_expires_at);
 elsif p_action in ('inspect','approve') then
  select * into d from private.morning_tv_devices where approval_hash=h for update;
  if not found or d.owner_id is not null or d.pairing_expires_at<=clock_timestamp() or d.revoked_at is not null then raise exception using errcode='42501',message='tv_expired'; end if;
  if p_action='approve' then
   -- Owner comes exclusively from the verified Google/admin session.
   update private.morning_tv_devices set owner_id=auth.uid(),expires_at=clock_timestamp()+interval '30 days' where device_hash=d.device_hash;
   return jsonb_build_object('approved',true);
  end if;
  return jsonb_build_object('code',upper(left(d.approval_hash,8)),'expiresAt',d.pairing_expires_at);
 elsif p_action in ('read','forget') then
  select * into d from private.morning_tv_devices where device_hash=h;
  if not found or d.revoked_at is not null then return jsonb_build_object('status','expired'); end if;
  if p_action='forget' then
   update private.morning_tv_devices set revoked_at=clock_timestamp() where device_hash=h;
   return jsonb_build_object('disconnected',true);
  end if;
  if d.owner_id is null then
   return jsonb_build_object('status',case when d.pairing_expires_at>clock_timestamp() then 'pending' else 'expired' end,'expiresAt',d.pairing_expires_at);
  end if;
  -- Recheck live enrollment AND the matching verified Google identity per read.
  if d.expires_at<=clock_timestamp() or not exists (
   select 1 from private.site_admin a join auth.users u on u.id=a.user_id
   where a.user_id=d.owner_id and lower(u.email)=a.email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=a.email)
  ) then return jsonb_build_object('status','expired'); end if;
  select jsonb_build_object('screen',value,'updatedAt',updated_at) into payload from public.app_data
   where owner_id=d.owner_id and app_slug='morning-feed' and key='screen-v1';
  return jsonb_build_object('status','connected','screen',payload->'screen','updatedAt',payload->'updatedAt','expiresAt',d.expires_at);
 end if;
 raise exception using errcode='22023',message='tv_invalid';
end;
$$;
revoke all on function private.morning_tv(text,text,text) from public,anon,authenticated;
grant usage on schema private to anon;
grant execute on function private.morning_tv(text,text,text) to anon,authenticated;
create function public.morning_tv(p_action text,p_secret text,p_other text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.morning_tv(p_action,p_secret,p_other); $$;
revoke all on function public.morning_tv(text,text,text) from public,anon,authenticated;
grant execute on function public.morning_tv(text,text,text) to anon,authenticated;
commit;
