begin;
-- OAuth handoff state is durable, short-lived and single use. Only hashes are
-- stored. Raw authorization codes, verifiers and bearer keys never enter tables.
create table public.robot_party_oauth_codes (
 code_hash text primary key check(code_hash ~ '^[a-f0-9]{64}$'),
 robot_id uuid not null references public.robot_party_robots(id) on delete cascade,
 client_id text not null check(client_id ~ '^https://chatgpt\.com/oauth/([A-Za-z0-9_-]+/)?client\.json$'),
 redirect_uri text not null check(redirect_uri='https://chatgpt.com/connector_platform_oauth_redirect' or redirect_uri ~ '^https://chatgpt\.com/connector/oauth/[A-Za-z0-9_-]+$'),
 resource text not null check(length(resource)<=300 and resource ~ '^https://[a-zA-Z0-9.:-]+/api/robot-party/mcp$'),
 challenge text not null check(challenge ~ '^[A-Za-z0-9_-]{43}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '5 minutes'),
 consumed_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '6 minutes')
);
create index robot_party_oauth_robot on public.robot_party_oauth_codes(robot_id);
alter table public.robot_party_oauth_codes enable row level security;
revoke all on public.robot_party_oauth_codes from public,anon,authenticated;
grant insert(code_hash,robot_id,client_id,redirect_uri,resource,challenge) on public.robot_party_oauth_codes to authenticated;
create policy robot_party_own_consent on public.robot_party_oauth_codes for insert to authenticated
with check(exists(select 1 from public.robot_party_robots r where r.id=robot_id and r.created_by=(select auth.uid())
 and r.revoked_at is null and private.can_access_app(r.owner_id,'robot-party',r.role='writer')));

create function private.robot_party_authorize_connection(p_code_hash text,p_robot_id uuid,p_owner uuid,p_name text,p_role text,p_initial_hash text,p_client_id text,p_redirect_uri text,p_resource text,p_challenge text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.robot_party_robots(id,owner_id,created_by,name,role,token_hash)
 values(p_robot_id,p_owner,(select auth.uid()),p_name,p_role,p_initial_hash);
 insert into public.robot_party_oauth_codes(code_hash,robot_id,client_id,redirect_uri,resource,challenge)
 values(p_code_hash,p_robot_id,p_client_id,p_redirect_uri,p_resource,p_challenge);
end;
$$;
revoke all on function private.robot_party_authorize_connection(text,uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.robot_party_authorize_connection(text,uuid,uuid,text,text,text,text,text,text,text) to authenticated;
create function public.robot_party_authorize_connection(p_code_hash text,p_robot_id uuid,p_owner uuid,p_name text,p_role text,p_initial_hash text,p_client_id text,p_redirect_uri text,p_resource text,p_challenge text) returns void
language sql security invoker set search_path='' as $$ select private.robot_party_authorize_connection(p_code_hash,p_robot_id,p_owner,p_name,p_role,p_initial_hash,p_client_id,p_redirect_uri,p_resource,p_challenge); $$;
revoke all on function public.robot_party_authorize_connection(text,uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.robot_party_authorize_connection(text,uuid,uuid,text,text,text,text,text,text,text) to authenticated;

create function private.robot_party_exchange_code(p_code_hash text,p_client_id text,p_redirect_uri text,p_resource text,p_challenge text,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare handoff public.robot_party_oauth_codes; robot public.robot_party_robots;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='invalid_grant'; end if;
 select * into handoff from public.robot_party_oauth_codes c where c.code_hash=p_code_hash for update;
 if not found or handoff.consumed_at is not null or handoff.expires_at<=clock_timestamp()
  or handoff.client_id is distinct from p_client_id or handoff.redirect_uri is distinct from p_redirect_uri
  or handoff.resource is distinct from p_resource or handoff.challenge is distinct from p_challenge then
  raise exception using errcode='42501',message='invalid_grant';
 end if;
 select * into robot from public.robot_party_robots r where r.id=handoff.robot_id for update;
 if not found or robot.revoked_at is not null or robot.expires_at<=clock_timestamp()
  or not private.robot_party_issuer_access(robot.owner_id,robot.created_by,robot.role='writer',robot.grant_revision) then
  raise exception using errcode='42501',message='invalid_grant';
 end if;
 update public.robot_party_robots set token_hash=p_token_hash where id=robot.id;
 update public.robot_party_oauth_codes set consumed_at=clock_timestamp() where code_hash=handoff.code_hash;
 return jsonb_build_object('role',robot.role,'expires_at',robot.expires_at);
end;
$$;
revoke all on function private.robot_party_exchange_code(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.robot_party_exchange_code(text,text,text,text,text,text) to anon,authenticated;
create function public.robot_party_exchange_code(p_code_hash text,p_client_id text,p_redirect_uri text,p_resource text,p_challenge text,p_token_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.robot_party_exchange_code(p_code_hash,p_client_id,p_redirect_uri,p_resource,p_challenge,p_token_hash); $$;
revoke all on function public.robot_party_exchange_code(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.robot_party_exchange_code(text,text,text,text,text,text) to anon,authenticated;

-- Return only the authenticated robot's public identity and permission. Discovery
-- and tool listing must not fetch private board messages to authenticate a key.
create function private.robot_party_identity(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare robot public.robot_party_robots;
begin
 robot:=private.robot_party_actor(p_token);
 return jsonb_build_object('id',robot.id,'name',robot.name,'role',robot.role);
end;
$$;
revoke all on function private.robot_party_identity(text) from public,anon,authenticated;
grant execute on function private.robot_party_identity(text) to anon,authenticated;
create function public.robot_party_identity(token text) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.robot_party_identity(token); $$;
revoke all on function public.robot_party_identity(text) from public,anon,authenticated;
grant execute on function public.robot_party_identity(text) to anon,authenticated;
-- Preserve reader authentication after the row lock so writer calls return a
-- read-only denial rather than prompting viewers to reconnect forever.
create or replace function private.robot_party_robot_write(p_token text,p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare robot public.robot_party_robots; existing public.robot_party_messages; saved public.robot_party_messages;
  action text; target_id uuid; parent uuid; expected timestamptz; content jsonb; labels text[]; required_keys text[]; field text;
begin
  robot:=private.robot_party_actor(p_token);
  -- Serialize mutations and revocation per robot, including calls through REST.
  select * into robot from public.robot_party_robots r where r.id=robot.id for update;
  if robot.revoked_at is not null or robot.expires_at<=clock_timestamp() or not private.robot_party_issuer_access(robot.owner_id,robot.created_by,robot.role='writer',robot.grant_revision) then raise exception using errcode='42501',message='robot_access_denied'; end if;
  if robot.role<>'writer' then raise exception using errcode='42501',message='robot_read_only'; end if;
  action:=p_command->>'action';
  required_keys:=case action when 'create' then array['action','id','parentId','content'] when 'edit' then array['action','id','expectedAt','content'] when 'remove' then array['action','id','expectedAt'] else null end;
  if required_keys is null or jsonb_typeof(p_command)<>'object' or (select count(*) from jsonb_object_keys(p_command))<>cardinality(required_keys) or exists(select 1 from jsonb_object_keys(p_command) k where not(k=any(required_keys))) then raise exception using errcode='22023',message='Invalid command'; end if;
  target_id:=(p_command->>'id')::uuid;
  if target_id is null then raise exception using errcode='22023',message='Invalid ID'; end if;
  if action<>'remove' then
    content:=p_command->'content';
    if jsonb_typeof(content)<>'object' or (select count(*) from jsonb_object_keys(content))<>7 or exists(select 1 from jsonb_object_keys(content) k where k not in('title','body','kind','status','robotName','tags','projectUrl')) then raise exception using errcode='22023',message='Invalid content'; end if;
    foreach field in array array['title','body','kind','status','robotName','projectUrl'] loop
      if jsonb_typeof(content->field)<>'string' then raise exception using errcode='22023',message='Invalid content'; end if;
    end loop;
    if jsonb_typeof(content->'tags')<>'array' or exists(select 1 from jsonb_array_elements(content->'tags') t where jsonb_typeof(t)<>'string') then raise exception using errcode='22023',message='Invalid tags'; end if;
    select coalesce(array_agg(t),'{}'::text[]) into labels from jsonb_array_elements_text(content->'tags') t;
    if cardinality(labels)<>(select count(distinct t) from unnest(labels) t) then raise exception using errcode='22023',message='Duplicate tags'; end if;
  end if;
  if action='create' then
    parent:=(p_command->>'parentId')::uuid;
    select * into existing from public.robot_party_messages m where m.owner_id=robot.owner_id and m.id=target_id;
    if found then
      if existing.robot_id=robot.id and existing.parent_id is not distinct from parent and existing.removed_at is null
        and existing.title=content->>'title' and existing.body=content->>'body' and existing.kind=content->>'kind' and existing.status=content->>'status'
        and existing.tags=labels and existing.project_url=content->>'projectUrl' then
        return jsonb_build_object('saved',true,'message',to_jsonb(existing)-'search_text');
      end if;
      raise exception using errcode='P0001',message='robot_conflict';
    end if;
  else
    expected:=(p_command->>'expectedAt')::timestamptz;
    select * into existing from public.robot_party_messages m where m.owner_id=robot.owner_id and m.id=target_id and m.robot_id=robot.id for update;
    if not found or expected is null or existing.updated_at<>expected or existing.removed_at is not null then raise exception using errcode='P0001',message='robot_conflict'; end if;
  end if;
  if robot.last_write_at>clock_timestamp()-interval '5 seconds' then raise exception using errcode='P0001',message='robot_rate_limited'; end if;
  if action='create' and (select count(*) from public.robot_party_messages m where m.robot_id=robot.id and m.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=200 then raise exception using errcode='P0001',message='robot_rate_limited'; end if;
  if action='create' then
    insert into public.robot_party_messages(id,owner_id,parent_id,author_id,actor_kind,robot_id,robot_name,title,body,kind,status,tags,project_url)
    values(target_id,robot.owner_id,parent,robot.created_by,'robot',robot.id,robot.name,content->>'title',content->>'body',content->>'kind',content->>'status',labels,content->>'projectUrl') returning * into saved;
  elsif action='edit' then
    update public.robot_party_messages m set title=content->>'title',body=content->>'body',kind=content->>'kind',status=content->>'status',tags=labels,project_url=content->>'projectUrl'
      where m.owner_id=robot.owner_id and m.id=target_id and m.robot_id=robot.id and m.updated_at=expected returning * into saved;
  else
    update public.robot_party_messages m set removed_at=clock_timestamp() where m.owner_id=robot.owner_id and m.id=target_id and m.robot_id=robot.id and m.updated_at=expected returning * into saved;
  end if;
  if saved.id is null then raise exception using errcode='P0001',message='robot_conflict'; end if;
  update public.robot_party_robots set last_write_at=clock_timestamp() where id=robot.id;
  return jsonb_build_object('saved',true,'message',to_jsonb(saved)-'search_text');
end;
$$;


commit;
