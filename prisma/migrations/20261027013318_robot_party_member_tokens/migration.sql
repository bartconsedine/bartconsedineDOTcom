begin;

-- Bind guest-issued keys to the precise invitation revision that authorized
-- their creation. Revocation, role changes and re-invitation cannot revive keys.
alter table public.robot_party_robots add column grant_revision timestamptz;
create index robot_party_issuer on public.robot_party_robots(owner_id,created_by,created_at desc);

create function private.robot_party_bind_issuer() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.created_by=new.owner_id then new.grant_revision:=null;
  else
    select g.updated_at into new.grant_revision from public.app_access_grants g
      where g.owner_id=new.owner_id and g.app_slug='robot-party'
        and g.invited_email=private.current_google_email();
    if new.grant_revision is null then raise exception 'Robot Party invitation is unavailable'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.robot_party_bind_issuer() from public,anon,authenticated;
create trigger robot_party_bind_issuer before insert on public.robot_party_robots
for each row execute function private.robot_party_bind_issuer();

-- Revocation is one-way. An issuer cannot undo an owner's revocation by
-- updating the REST table directly; a replacement always requires a fresh key.
create function private.robot_party_key_revocation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'Revoked robot keys cannot be reactivated';
  end if;
  if old.revoked_at is null and new.revoked_at is not null then new.revoked_at:=clock_timestamp(); end if;
  return new;
end;
$$;
revoke all on function private.robot_party_key_revocation() from public,anon,authenticated;
create trigger robot_party_key_revocation before update on public.robot_party_robots
for each row execute function private.robot_party_key_revocation();

-- Anonymous bearer calls have no human JWT. Resolve the original issuer's live
-- verified identity in a private helper; never trust caller-supplied identity.
create function private.robot_party_issuer_access(p_owner uuid,p_issuer uuid,p_write boolean,p_revision timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_app_owner(p_owner) and (
    (p_owner=p_issuer and p_revision is null) or exists (
      select 1 from auth.users u join public.app_access_grants g on g.invited_email=lower(u.email)
      where u.id=p_issuer and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
        and exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
          and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
        and g.owner_id=p_owner and g.app_slug='robot-party' and g.updated_at=p_revision
        and (not p_write or g.role='editor')));
$$;
revoke all on function private.robot_party_issuer_access(uuid,uuid,boolean,timestamptz) from public,anon,authenticated;

-- Members see and revoke their own keys; the board owner can revoke any key.
-- Creation never exceeds the issuer's human permission.
drop policy robot_party_manage_robots on public.robot_party_robots;
create policy robot_party_list_keys on public.robot_party_robots for select to authenticated
using (private.can_access_app(owner_id,'robot-party',false)
  and (created_by=(select auth.uid()) or owner_id=(select auth.uid())));
create policy robot_party_issue_keys on public.robot_party_robots for insert to authenticated
with check (created_by=(select auth.uid()) and private.can_access_app(owner_id,'robot-party',role='writer'));
create policy robot_party_revoke_keys on public.robot_party_robots for update to authenticated
using (private.can_access_app(owner_id,'robot-party',false)
  and (created_by=(select auth.uid()) or owner_id=(select auth.uid())))
with check (private.can_access_app(owner_id,'robot-party',false)
  and (created_by=(select auth.uid()) or owner_id=(select auth.uid())));

create or replace function private.robot_party_actor(p_token text) returns public.robot_party_robots
language plpgsql stable security definer set search_path='' as $$
declare robot public.robot_party_robots;
begin
  if p_token is null or p_token !~ '^rp_[A-Za-z0-9_-]{43}$' then raise exception using errcode='42501',message='robot_access_denied'; end if;
  select * into robot from public.robot_party_robots r
    where r.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and r.revoked_at is null and r.expires_at>now()
      and private.robot_party_issuer_access(r.owner_id,r.created_by,r.role='writer',r.grant_revision);
  if not found then raise exception using errcode='42501',message='robot_access_denied'; end if;
  return robot;
end;
$$;
-- Recheck the issuer after waiting on a key's mutation lock as well.
create or replace function private.robot_party_robot_write(p_token text,p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare robot public.robot_party_robots; existing public.robot_party_messages; saved public.robot_party_messages;
  action text; target_id uuid; parent uuid; expected timestamptz; content jsonb; labels text[]; required_keys text[]; field text;
begin
  robot:=private.robot_party_actor(p_token);
  -- Serialize mutations and revocation per robot, including calls through REST.
  select * into robot from public.robot_party_robots r where r.id=robot.id for update;
  if robot.revoked_at is not null or robot.expires_at<=clock_timestamp() or not private.robot_party_issuer_access(robot.owner_id,robot.created_by,true,robot.grant_revision) then raise exception using errcode='42501',message='robot_access_denied'; end if;
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
