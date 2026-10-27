begin;

-- Invitations are email-bound grants. No bearer link grants access, no enrollment
-- in site_admin, and no service key is needed by the application.
create table public.app_access_grants (
  owner_id uuid not null references private.site_admin(user_id) on delete cascade,
  app_slug text not null check (length(app_slug) <= 80 and app_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  invited_email text not null check (length(invited_email) <= 254 and invited_email = lower(trim(invited_email)) and invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role text not null check (role in ('viewer', 'editor')),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (owner_id, app_slug, invited_email)
);
create index app_grants_recipient on public.app_access_grants(invited_email);
alter table public.app_access_grants enable row level security;
revoke all on public.app_access_grants from public, anon, authenticated;
grant select, insert, update, delete on public.app_access_grants to authenticated;

-- Auth server identity checked live in SQL as well as in the Next.js guards.
create function private.current_google_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = (select auth.uid())
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
      and i.identity_data->'email_verified' = 'true'::jsonb
      and lower(i.identity_data->>'email') = lower(u.email));
$$;
create function private.active_app_owner(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.site_admin a join auth.users u on u.id = a.user_id
    where a.user_id = p_owner and lower(u.email) = a.email and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
      and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
        and i.identity_data->'email_verified' = 'true'::jsonb and lower(i.identity_data->>'email') = a.email));
$$;
create function private.can_access_app(p_owner uuid, p_slug text, p_write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.active_app_owner(p_owner) and (
    (p_owner = (select auth.uid()) and private.is_site_admin()) or
    exists (select 1 from public.app_access_grants g
      where g.owner_id = p_owner and g.app_slug = p_slug
        and g.invited_email = private.current_google_email()
        and (not p_write or g.role = 'editor')));
$$;
revoke all on function private.current_google_email(), private.active_app_owner(uuid), private.can_access_app(uuid,text,boolean) from public, anon, authenticated;
grant execute on function private.current_google_email(), private.active_app_owner(uuid), private.can_access_app(uuid,text,boolean) to authenticated;

create policy manage_own_app_grants on public.app_access_grants for all to authenticated
using ((select private.is_site_admin()) and owner_id = (select auth.uid()))
with check ((select private.is_site_admin()) and owner_id = (select auth.uid()));
create policy read_received_app_grants on public.app_access_grants for select to authenticated
using (invited_email = (select private.current_google_email()) and private.active_app_owner(owner_id));

-- REST callers only learn grants addressed to their own verified account.
create function public.my_app_grants()
returns table (owner_id uuid, app_slug text, role text)
language sql stable security invoker set search_path = '' as $$
  select g.owner_id, g.app_slug, g.role from public.app_access_grants g
  where g.invited_email = private.current_google_email() and private.active_app_owner(g.owner_id);
$$;
revoke all on function public.my_app_grants() from public, anon, authenticated;
grant execute on function public.my_app_grants() to authenticated;

-- Split read/write policies so view-only means no write path, even via REST.
drop policy admin_own_data on public.app_data;
create policy app_data_read on public.app_data for select to authenticated
using (private.can_access_app(owner_id, app_slug, false));
create policy app_data_insert on public.app_data for insert to authenticated
with check (private.can_access_app(owner_id, app_slug, true));
create policy app_data_update on public.app_data for update to authenticated
using (private.can_access_app(owner_id, app_slug, true))
with check (private.can_access_app(owner_id, app_slug, true));
create policy app_data_delete on public.app_data for delete to authenticated
using (private.can_access_app(owner_id, app_slug, true));

-- Every actual update advances its revision. Editors cannot relocate a record
-- to another app/owner/key through a crafted direct database request.
create function private.advance_app_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'app_data' and (new.owner_id <> old.owner_id or new.app_slug <> old.app_slug or new.key <> old.key) then
    raise exception 'Record identity is immutable';
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function private.advance_app_revision() from public, anon, authenticated;
create trigger app_data_revision before update on public.app_data for each row execute function private.advance_app_revision();
-- Use a separate trigger because grants have no key field.
create function private.advance_grant_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function private.advance_grant_revision() from public, anon, authenticated;
create trigger app_grant_revision before update on public.app_access_grants for each row execute function private.advance_grant_revision();

commit;
