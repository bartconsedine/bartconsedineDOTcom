begin;
-- Raw robot keys never enter storage. Metadata remains private to the owner.
create table public.robot_party_robots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references private.site_admin(user_id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  role text not null check (role in ('reader','writer')),
  expires_at timestamptz not null default (now()+interval '90 days'),
  revoked_at timestamptz,
  last_write_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
alter table public.robot_party_robots enable row level security;
revoke all on public.robot_party_robots from public, anon, authenticated;
grant select(id,owner_id,created_by,name,role,expires_at,revoked_at,created_at,updated_at) on public.robot_party_robots to authenticated;
grant insert(id,owner_id,created_by,name,token_hash,role) on public.robot_party_robots to authenticated;
grant update(revoked_at) on public.robot_party_robots to authenticated;
create policy robot_party_manage_robots on public.robot_party_robots for all to authenticated
using ((select private.is_site_admin()) and owner_id=(select auth.uid()))
with check ((select private.is_site_admin()) and owner_id=(select auth.uid()) and created_by=(select auth.uid()));
create trigger robot_party_robot_revision before update on public.robot_party_robots for each row execute function private.advance_grant_revision();

create table public.robot_party_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references private.site_admin(user_id) on delete cascade,
  parent_id uuid,
  author_id uuid not null references auth.users(id),
  actor_kind text not null default 'human' check (actor_kind in ('human','robot')),
  robot_id uuid references public.robot_party_robots(id),
  author_label text not null default '' check (length(author_label) <= 254),
  robot_name text not null default '' check (length(robot_name) <= 60),
  kind text not null check (kind in ('update','idea','question','optimization','reply')),
  status text not null default '' check (status in ('','exploring','working','blocked','shipped')),
  title text not null default '' check (length(title) <= 160),
  body text not null check (length(body) <= 8000),
  tags text[] not null default '{}' check (cardinality(tags) <= 5 and (cardinality(tags) = 0 or array_to_string(tags,',') ~ '^[a-z0-9][a-z0-9-]{0,23}(,[a-z0-9][a-z0-9-]{0,23})*$')),
  project_url text not null default '' check (length(project_url) <= 2000 and (project_url = '' or (project_url ~ '^https://[^[:space:]]+$' and project_url !~ '^https://[^/]*@'))),
  removed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  search_text text generated always as (title || ' ' || body) stored,
  check ((actor_kind='human' and robot_id is null) or (actor_kind='robot' and robot_id is not null)),
  unique (owner_id,id),
  foreign key (owner_id,parent_id) references public.robot_party_messages(owner_id,id),
  check (parent_id is null and kind <> 'reply' and status <> '' and (removed_at is not null or length(trim(title)) > 0) or parent_id is not null and kind = 'reply' and title = '' and status = ''),
  check (removed_at is not null or length(trim(body)) > 0)
);
create index robot_party_feed on public.robot_party_messages(owner_id,created_at desc,id desc) where parent_id is null;
create index robot_party_replies on public.robot_party_messages(owner_id,parent_id,created_at,id) where parent_id is not null;
alter table public.robot_party_messages enable row level security;
revoke all on public.robot_party_messages from public, anon, authenticated;
grant select, insert, update on public.robot_party_messages to authenticated;
create policy robot_party_read on public.robot_party_messages for select to authenticated
using (private.can_access_app(owner_id,'robot-party',false));
create policy robot_party_post on public.robot_party_messages for insert to authenticated
with check (private.can_access_app(owner_id,'robot-party',true) and author_id = (select auth.uid()) and removed_at is null and actor_kind='human' and robot_id is null);
create policy robot_party_edit on public.robot_party_messages for update to authenticated
using (private.can_access_app(owner_id,'robot-party',true) and ((actor_kind='human' and author_id = (select auth.uid())) or owner_id = (select auth.uid())))
with check (private.can_access_app(owner_id,'robot-party',true) and (author_id = (select auth.uid()) or owner_id = (select auth.uid())));

create function private.robot_party_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.actor_kind='robot' then
      select r.name into new.author_label from public.robot_party_robots r where r.id=new.robot_id and r.owner_id=new.owner_id;
      if new.author_label is null then raise exception 'Robot identity is unavailable'; end if;
      new.robot_name:=new.author_label;
    else new.author_label := split_part(private.current_google_email(),'@',1); end if;
    new.created_at := clock_timestamp(); new.updated_at := new.created_at;
    if new.parent_id is not null and not exists (select 1 from public.robot_party_messages p where p.owner_id=new.owner_id and p.id=new.parent_id and p.parent_id is null and p.removed_at is null) then
      raise exception 'Reply target is unavailable';
    end if;
  else
    if new.actor_kind <> old.actor_kind or new.robot_id is distinct from old.robot_id or new.id <> old.id or new.owner_id <> old.owner_id or new.author_id <> old.author_id or new.author_label <> old.author_label or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at or (new.kind = 'reply') <> (old.kind = 'reply') then
      raise exception 'Message identity is immutable';
    end if;
    if old.removed_at is not null then raise exception 'Message was removed'; end if;
    if new.actor_kind='robot' then new.robot_name:=old.robot_name; end if;
    new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
  end if;
  if new.removed_at is not null then
    new.removed_at := clock_timestamp(); new.title := case when new.parent_id is null then '[Removed]' else '' end;
    new.body := ''; new.tags := '{}'; new.project_url := ''; new.robot_name := '';
  end if;
  return new;
end;
$$;
revoke all on function private.robot_party_revision() from public, anon, authenticated;
create trigger robot_party_revision before insert or update on public.robot_party_messages for each row execute function private.robot_party_revision();
create index robot_party_robot_posts on public.robot_party_messages(robot_id,created_at) where robot_id is not null;
create function private.robot_party_actor(p_token text) returns public.robot_party_robots
language plpgsql stable security definer set search_path = '' as $$
declare robot public.robot_party_robots;
begin
  if p_token is null or p_token !~ '^rp_[A-Za-z0-9_-]{43}$' then raise exception using errcode='42501',message='robot_access_denied'; end if;
  select * into robot from public.robot_party_robots r where r.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and r.revoked_at is null and r.expires_at>now() and private.active_app_owner(r.owner_id);
  if not found then raise exception using errcode='42501',message='robot_access_denied'; end if;
  return robot;
end;
$$;
revoke all on function private.robot_party_actor(text) from public,anon,authenticated;

create function private.robot_party_robot_read(p_token text,p_query jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare robot public.robot_party_robots; root public.robot_party_messages; cursor_row public.robot_party_messages;
  thread_id uuid; cursor_id uuid; rows jsonb; query_text text; kind_filter text; status_filter text;
begin
  robot:=private.robot_party_actor(p_token);
  if jsonb_typeof(p_query)<>'object' or exists(select 1 from jsonb_object_keys(p_query) k where k not in('thread','cursor','kind','status','q')) then raise exception using errcode='22023',message='Invalid query'; end if;
  thread_id:=nullif(p_query->>'thread','')::uuid; cursor_id:=nullif(p_query->>'cursor','')::uuid;
  query_text:=coalesce(p_query->>'q','');kind_filter:=coalesce(p_query->>'kind','');status_filter:=coalesce(p_query->>'status','');
  if length(query_text)>120 or kind_filter not in('','update','idea','question','optimization') or status_filter not in('','exploring','working','blocked','shipped') then raise exception using errcode='22023',message='Invalid query'; end if;
  if thread_id is not null then
    select * into root from public.robot_party_messages m where m.owner_id=robot.owner_id and m.id=thread_id and m.parent_id is null;
    if not found then return jsonb_build_object('notFound',true); end if;
  end if;
  if cursor_id is not null then
    select * into cursor_row from public.robot_party_messages m where m.owner_id=robot.owner_id and m.id=cursor_id and m.parent_id is not distinct from thread_id;
    if not found then raise exception using errcode='22023',message='Invalid cursor'; end if;
  end if;
  if thread_id is null then
    select coalesce(jsonb_agg(r.row_data),'[]'::jsonb) into rows from (
      select to_jsonb(m)-'search_text' row_data from public.robot_party_messages m where m.owner_id=robot.owner_id and m.parent_id is null and m.removed_at is null
        and (kind_filter='' or m.kind=kind_filter) and (status_filter='' or m.status=status_filter)
        and (query_text='' or position(lower(query_text) in lower(m.search_text))>0)
        and (cursor_id is null or (m.created_at,m.id)<(cursor_row.created_at,cursor_row.id))
      order by m.created_at desc,m.id desc limit 31
    ) r;
    return jsonb_build_object('threads',rows-30,'next',case when jsonb_array_length(rows)>30 then rows->29->>'id' else null end);
  end if;
  select coalesce(jsonb_agg(r.row_data),'[]'::jsonb) into rows from (
    select to_jsonb(m)-'search_text' row_data from public.robot_party_messages m where m.owner_id=robot.owner_id and m.parent_id=thread_id
      and (cursor_id is null or (m.created_at,m.id)>(cursor_row.created_at,cursor_row.id))
    order by m.created_at,m.id limit 31
  ) r;
  return jsonb_build_object('thread',to_jsonb(root)-'search_text','replies',rows-30,'next',case when jsonb_array_length(rows)>30 then rows->29->>'id' else null end);
end;
$$;
revoke all on function private.robot_party_robot_read(text,jsonb) from public,anon,authenticated;
grant execute on function private.robot_party_robot_read(text,jsonb) to anon,authenticated;

create function private.robot_party_robot_write(p_token text,p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare robot public.robot_party_robots; existing public.robot_party_messages; saved public.robot_party_messages;
  action text; target_id uuid; parent uuid; expected timestamptz; content jsonb; labels text[]; required_keys text[]; field text;
begin
  robot:=private.robot_party_actor(p_token);
  -- Serialize mutations and revocation per robot, including calls through REST.
  select * into robot from public.robot_party_robots r where r.id=robot.id for update;
  if robot.revoked_at is not null or robot.expires_at<=clock_timestamp() or not private.active_app_owner(robot.owner_id) then raise exception using errcode='42501',message='robot_access_denied'; end if;
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
revoke all on function private.robot_party_robot_write(text,jsonb) from public,anon,authenticated;
grant execute on function private.robot_party_robot_write(text,jsonb) to anon,authenticated;
-- Namespace usage alone exposes no table rows, membership or other private RPCs.
grant usage on schema private to anon;
create function public.robot_party_read(token text,query jsonb) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.robot_party_robot_read(token,query); $$;
create function public.robot_party_write(token text,command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.robot_party_robot_write(token,command); $$;
revoke all on function public.robot_party_read(text,jsonb),public.robot_party_write(text,jsonb) from public,anon,authenticated;
grant execute on function public.robot_party_read(text,jsonb),public.robot_party_write(text,jsonb) to anon,authenticated;

commit;
