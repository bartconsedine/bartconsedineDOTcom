begin;
-- Separate target-bound Google PKCE relay. Never upgrades morning_tv_devices.
create table private.admin_qr_requests (
 device_hash text primary key, approval_hash text unique not null,
 label text not null check(length(label) between 1 and 100),
 oauth_url text not null check(length(oauth_url)<4096),
 owner_id uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 deadline timestamptz not null default clock_timestamp()+interval '10 minutes',
 auth_code text check(length(auth_code)<4096), claimed boolean not null default false,
 session_id uuid unique, expires_at timestamptz, revoked_at timestamptz
);
alter table private.admin_qr_requests enable row level security;
revoke all on private.admin_qr_requests from public,anon,authenticated;
-- Keep session tombstones: deleting an expired/revoked row could restore access.
create function private.admin_qr_session_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.admin_qr_requests r
 where r.session_id::text = (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')
 and (r.revoked_at is not null or r.expires_at<=statement_timestamp() or r.owner_id is distinct from auth.uid()
 or not exists(select 1 from auth.sessions s where s.id=r.session_id and s.user_id=r.owner_id)));
$$;
revoke all on function private.admin_qr_session_allowed() from public,anon,authenticated;
grant execute on function private.admin_qr_session_allowed() to authenticated;
create or replace function private.is_site_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.admin_qr_session_allowed() and exists (
    select 1 from private.site_admin a
    join auth.users u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and lower(u.email) = a.email
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider = 'google'
          and i.identity_data -> 'email_verified' = 'true'::jsonb
          and lower(i.identity_data ->> 'email') = a.email
      )
  );
$$;
create or replace function private.current_google_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where private.admin_qr_session_allowed() and u.id = (select auth.uid())
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
      and i.identity_data->'email_verified' = 'true'::jsonb
      and lower(i.identity_data->>'email') = lower(u.email));
$$;

create function private.admin_qr(p_action text,p_secret text default null,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.admin_qr_requests; h text; result jsonb; sid uuid;
begin
 if p_action in ('inspect','approve','decline','relay','list','revoke','complete') then
  if not private.is_site_admin() then raise exception 'qr_denied'; end if;
 end if;
 if p_action='signout' then
  update private.admin_qr_requests set revoked_at=clock_timestamp() where session_id::text=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id') and owner_id=auth.uid();
  return jsonb_build_object('signedOut',true);
 end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',device_hash,'label',label,'expiresAt',expires_at,'active',session_id is not null,'createdAt',created_at) order by created_at desc),'[]') into result
  from private.admin_qr_requests where owner_id=auth.uid() and revoked_at is null and (expires_at>clock_timestamp() or deadline>clock_timestamp());
  return jsonb_build_object('devices',result);
 end if;
 if p_action='revoke' then
  update private.admin_qr_requests set revoked_at=clock_timestamp(),auth_code=null where device_hash=p_secret and owner_id=auth.uid();
  return jsonb_build_object('revoked',true);
 end if;
 if p_secret is null or p_secret !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'qr_invalid'; end if;
 h:=encode(sha256(convert_to(p_secret,'UTF8')),'hex');
 if p_action='start' then
  if p_data->>'approval' !~ '^[A-Za-z0-9_-]{43}$' or p_data->>'approval'=p_secret or coalesce(length(p_data->>'label'),0) not between 1 and 100 or p_data->>'url' is null then raise exception 'qr_invalid'; end if;
  perform pg_advisory_xact_lock(742811);
  delete from private.admin_qr_requests where session_id is null and deadline<clock_timestamp();
  if (select count(*) from private.admin_qr_requests where session_id is null)>=1000 then raise exception 'qr_busy'; end if;
  insert into private.admin_qr_requests(device_hash,approval_hash,label,oauth_url) values(h,encode(sha256(convert_to(p_data->>'approval','UTF8')),'hex'),p_data->>'label',p_data->>'url');
  return jsonb_build_object('status','pending');
 end if;
 if p_action in ('inspect','approve','decline','relay') then
  select * into r from private.admin_qr_requests where approval_hash=h for update;
 else select * into r from private.admin_qr_requests where device_hash=h for update; end if;
 if not found or r.revoked_at is not null then raise exception 'qr_expired'; end if;
 if p_action='cancel' then
  update private.admin_qr_requests set revoked_at=clock_timestamp(),auth_code=null where device_hash=r.device_hash;
  return jsonb_build_object('cancelled',true);
 end if;
 if r.session_id is not null or r.deadline<=clock_timestamp() then raise exception 'qr_expired'; end if;
 if p_action='decline' then
  if r.owner_id is not null and r.owner_id is distinct from auth.uid() then raise exception 'qr_denied'; end if;
  update private.admin_qr_requests set revoked_at=clock_timestamp(),auth_code=null where device_hash=r.device_hash;
  return jsonb_build_object('declined',true);
 elsif p_action='inspect' then
  if r.owner_id is not null then raise exception 'qr_expired'; end if;
  return jsonb_build_object('label',r.label,'confirmation',upper(left(r.approval_hash,8)),'deadline',r.deadline);
 elsif p_action='approve' then
  if r.owner_id is not null then raise exception 'qr_expired'; end if;
  update private.admin_qr_requests set owner_id=auth.uid() where device_hash=r.device_hash;
  return jsonb_build_object('url',r.oauth_url);
 elsif p_action='relay' then
  if r.owner_id is distinct from auth.uid() or r.auth_code is not null or r.claimed or coalesce(length(p_data->>'code'),0) not between 1 and 4095 then raise exception 'qr_denied'; end if;
  update private.admin_qr_requests set auth_code=p_data->>'code' where device_hash=r.device_hash;
  return jsonb_build_object('relayed',true);
 elsif p_action='poll' then
  return jsonb_build_object('status',case when r.auth_code is not null then 'ready' else 'pending' end);
 elsif p_action='claim' then
  if r.auth_code is null or r.claimed then raise exception 'qr_expired'; end if;
  update private.admin_qr_requests set auth_code=null,claimed=true where device_hash=r.device_hash;
  return jsonb_build_object('code',r.auth_code,'owner',r.owner_id);
 elsif p_action='complete' then
  sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
  if not r.claimed or r.owner_id is distinct from auth.uid() or sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()) then raise exception 'qr_denied'; end if;
  update private.admin_qr_requests set session_id=sid,expires_at=clock_timestamp()+interval '30 days',oauth_url='' where device_hash=r.device_hash;
  return jsonb_build_object('connected',true);
 end if;
 raise exception 'qr_invalid';
end;
$$;
revoke all on function private.admin_qr(text,text,jsonb) from public,anon,authenticated;
grant execute on function private.admin_qr(text,text,jsonb) to anon,authenticated;
create function public.admin_qr(p_action text,p_secret text default null,p_data jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.admin_qr(p_action,p_secret,p_data); $$;
revoke all on function public.admin_qr(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_qr(text,text,jsonb) to anon,authenticated;
commit;
