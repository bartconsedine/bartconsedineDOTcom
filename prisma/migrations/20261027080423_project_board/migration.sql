begin;
create table public.project_board_projects (
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 id uuid not null, title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=6000),
 source_url text not null default '' check(source_url='' or (length(source_url)<=2000 and source_url ~ '^https://[^[:space:]]+$')),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 revision integer not null default 1 check(revision>0),
 primary key(owner_id,id)
);
create table public.project_board_tasks (
 owner_id uuid not null default auth.uid(), id uuid not null, project_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=6000),
 status text not null default 'backlog' check(status in ('backlog','todo','in-progress','blocked','done')),
 priority text not null default 'medium' check(priority in ('low','medium','high')),
 due_date date, source_url text not null default '' check(source_url='' or (length(source_url)<=2000 and source_url ~ '^https://[^[:space:]]+$')),
 calendar_id text check(length(calendar_id) between 1 and 300), event_id text check(length(event_id) between 1 and 300),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 revision integer not null default 1 check(revision>0),
 check((calendar_id is null) = (event_id is null)),
 primary key(owner_id,id), foreign key(owner_id,project_id) references public.project_board_projects(owner_id,id) on delete restrict
);
create index project_board_tasks_project on public.project_board_tasks(owner_id,project_id,status);
create function private.project_board_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_id<>old.owner_id or new.id<>old.id then raise exception 'Record identity is immutable'; end if;
 new.created_at := old.created_at;
 new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
 new.revision := old.revision + 1;
 return new;
end $$;
revoke all on function private.project_board_revision() from public,anon,authenticated;
create trigger project_board_projects_revision before update on public.project_board_projects for each row execute function private.project_board_revision();
create trigger project_board_tasks_revision before update on public.project_board_tasks for each row execute function private.project_board_revision();
alter table public.project_board_projects enable row level security;
alter table public.project_board_tasks enable row level security;
revoke all on public.project_board_projects, public.project_board_tasks from public,anon,authenticated;
grant select,insert,update on public.project_board_projects,public.project_board_tasks to authenticated;
create policy project_board_projects_owner on public.project_board_projects to authenticated using(owner_id=(select auth.uid()) and (select public.is_site_admin())) with check(owner_id=(select auth.uid()) and (select public.is_site_admin()));
create policy project_board_tasks_owner on public.project_board_tasks to authenticated using(owner_id=(select auth.uid()) and (select public.is_site_admin())) with check(owner_id=(select auth.uid()) and (select public.is_site_admin()));
-- Atomic, retryable initial-project import. SECURITY INVOKER retains owner RLS.
create function public.project_board_start(p_project jsonb,p_tasks jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.project_board_projects(id,title,description,source_url)
 values((p_project->>'id')::uuid,p_project->>'title',p_project->>'description',p_project->>'source_url') on conflict do nothing;
 insert into public.project_board_tasks(id,project_id,title,description,status,priority,source_url)
 select (t->>'id')::uuid,(p_project->>'id')::uuid,t->>'title',t->>'description','backlog','medium',p_project->>'source_url'
 from jsonb_array_elements(p_tasks) t on conflict do nothing;
end $$;
revoke all on function public.project_board_start(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.project_board_start(jsonb,jsonb) to authenticated;
commit;
