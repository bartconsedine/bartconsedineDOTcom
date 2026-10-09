-- NOT a migration. Run only after review of the two real Auth UUIDs and approval.
-- Replace BOTH placeholders using verified Google Auth records, never guessed IDs.
-- This statement enrolls both or neither; a failed assertion rolls it all back.
do $$
declare
  bart_id uuid := 'REPLACE_WITH_VERIFIED_BART_AUTH_UUID';
  wife_id uuid := 'REPLACE_WITH_VERIFIED_MJSHAH_AUTH_UUID';
  enrolled integer;
begin
  insert into private.site_admin (user_id, email)
  select u.id, approved.email
  from (values
    (bart_id, 'bartconsedine@gmail.com'),
    (wife_id, 'mjshah8@gmail.com')
  ) as approved(id, email)
  join auth.users u on u.id = approved.id
  where lower(u.email) = approved.email
    and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous, false)
    and exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'google'
        and i.identity_data -> 'email_verified' = 'true'::jsonb
        and lower(i.identity_data ->> 'email') = approved.email
    )
  on conflict (user_id) do update set email = excluded.email;
  get diagnostics enrolled = row_count;
  if enrolled <> 2 then
    raise exception 'Expected two verified, matching Google identities; enrollment rolled back';
  end if;
end;
$$;
