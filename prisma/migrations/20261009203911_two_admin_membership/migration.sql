begin;

-- Administrative enrollment only. Keep private OUT of Data API exposed schemas.
create table private.site_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email in ('bartconsedine@gmail.com', 'mjshah8@gmail.com')),
  enrolled_at timestamptz not null default now()
);
alter table private.site_admin enable row level security;
alter table private.site_admin force row level security;
revoke all on private.site_admin from public, anon, authenticated;

-- Preserve an explicitly enrolled legacy owner; never enroll from Auth users alone.
insert into private.site_admin (user_id, email)
select user_id, lower(email) from private.site_owner;

-- Privileged lookup stays outside the exposed schema. It can only check the caller.
create function private.is_site_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
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
revoke all on function private.is_site_admin() from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
-- USAGE permits the wrapper/policy lookup, not table access or Data API exposure.
grant usage on schema private to authenticated;
grant execute on function private.is_site_admin() to authenticated;

-- Only a boolean for the current session is exposed; no membership list or enroll API.
create function public.is_site_admin()
returns boolean
language sql stable security invoker
set search_path = ''
as $$ select private.is_site_admin(); $$;
revoke all on function public.is_site_admin() from public, anon, authenticated;
grant execute on function public.is_site_admin() to authenticated;

-- Admins keep separate data. Membership is checked live, not cached in JWT metadata.
drop policy owner_private_data on public.app_data;
create policy admin_own_data on public.app_data
for all to authenticated
using ((select private.is_site_admin()) and owner_id = (select auth.uid()))
with check ((select private.is_site_admin()) and owner_id = (select auth.uid()));

drop function public.is_site_owner();
drop table private.site_owner;

-- Prisma creates its ledger before running SQL. It is never a public API table.
-- The conditional supports SQL-only policy tests without a Prisma runner.
do $$
begin
  if to_regclass('private._prisma_migrations') is not null then
    alter table private._prisma_migrations enable row level security;
    revoke all on private._prisma_migrations from public, anon, authenticated;
  end if;
end;
$$;

commit;
