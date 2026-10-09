-- Disposable local tests only. Supabase owns the real Auth schema.
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false);
create table auth.identities (user_id uuid references auth.users(id), provider text, identity_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
