begin;

-- This schema must NOT be added to Supabase's exposed API schemas.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- One owner, provisioned administratively. No browser/client can enroll itself.
create table private.site_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null check (lower(email) = 'bartconsedine@gmail.com')
);
alter table private.site_owner enable row level security;
revoke all on private.site_owner from public, anon, authenticated;

create function public.is_site_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.site_owner o
    join auth.users u on u.id = o.user_id
    where o.user_id = (select auth.uid())
      and lower(u.email) = lower(o.email)
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')
  );
$$;
revoke all on function public.is_site_owner() from public, anon;
grant execute on function public.is_site_owner() to authenticated;

-- Generic per-app storage; no private records or sample apps are seeded.
create table public.app_data (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  app_slug text not null check (app_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  key text not null check (length(key) between 1 and 200),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id, app_slug, key)
);
alter table public.app_data enable row level security;
alter table public.app_data force row level security;
revoke all on public.app_data from public, anon, authenticated;
grant select, insert, update, delete on public.app_data to authenticated;

create policy owner_private_data on public.app_data
for all to authenticated
using ((select public.is_site_owner()) and owner_id = (select auth.uid()))
with check ((select public.is_site_owner()) and owner_id = (select auth.uid()));

commit;

-- Historical base only. Admin enrollment follows the reviewed two-admin migration.
