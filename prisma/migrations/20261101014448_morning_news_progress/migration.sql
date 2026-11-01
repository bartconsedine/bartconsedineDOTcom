begin;
-- Owner progress survives session expiry, device replacement and re-pairing.
-- New paired-device read-history/write capability stays off until authorized.
create table private.morning_news_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.morning_news_settings(singleton,enabled) values(true,false);
create table private.morning_news_reads (
 owner_id uuid not null references private.site_admin(user_id) on delete cascade,
 article_id text not null check(article_id ~ '^[a-f0-9]{64}$'),
 read_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,article_id)
);
alter table private.morning_news_settings enable row level security;
alter table private.morning_news_reads enable row level security;
revoke all on private.morning_news_settings,private.morning_news_reads from public,anon,authenticated;

create function private.morning_news_progress(p_action text,p_secret text default null,p_article_id text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid; checked jsonb; stamp timestamptz; items jsonb;
begin
 if p_action is null or p_action not in ('list','read') or
    (p_action='list' and p_article_id is not null) or
    (p_action='read' and (p_article_id is null or p_article_id !~ '^[a-f0-9]{64}$')) then
  raise exception using errcode='22023',message='news_progress_invalid';
 end if;
 if p_secret is null then
  if auth.uid() is null or not private.is_site_admin() then
   raise exception using errcode='42501',message='news_progress_denied';
  end if;
  who:=auth.uid();
 else
  if p_secret !~ '^[A-Za-z0-9_-]{43}$' then raise exception using errcode='42501',message='news_progress_denied'; end if;
  select owner_id into who from private.morning_tv_devices
   where device_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex') for update;
  if not found or who is null then raise exception using errcode='42501',message='news_progress_denied'; end if;
  checked:=private.morning_tv('read',p_secret,null);
  if checked->>'status' is distinct from 'connected' then raise exception using errcode='42501',message='news_progress_denied'; end if;
 end if;
 -- Serialize same-owner marks across TVs without replacing a JSON read list.
 perform 1 from private.site_admin where user_id=who for update;
 if not found then raise exception using errcode='42501',message='news_progress_denied'; end if;
 if not coalesce((select enabled from private.morning_news_settings where singleton),false) then
  return jsonb_build_object('state','disabled','reads','[]'::jsonb);
 end if;
 if p_action='read' then
  insert into private.morning_news_reads(owner_id,article_id) values(who,p_article_id) on conflict(owner_id,article_id) do nothing;
  select read_at into stamp from private.morning_news_reads where owner_id=who and article_id=p_article_id;
  return jsonb_build_object('state','saved','id',p_article_id,'readAt',stamp);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',article_id,'readAt',read_at) order by read_at desc,article_id),'[]'::jsonb)
  into items from private.morning_news_reads where owner_id=who;
 return jsonb_build_object('state','ready','reads',items);
end;
$$;
revoke all on function private.morning_news_progress(text,text,text) from public,anon,authenticated;
grant execute on function private.morning_news_progress(text,text,text) to anon,authenticated;
create function public.morning_news_progress(p_action text,p_secret text default null,p_article_id text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.morning_news_progress(p_action,p_secret,p_article_id); $$;
revoke all on function public.morning_news_progress(text,text,text) from public,anon,authenticated;
grant execute on function public.morning_news_progress(text,text,text) to anon,authenticated;
commit;
