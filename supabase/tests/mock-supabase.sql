-- Just enough of Supabase for the migrations to run on PGlite: the roles, auth.uid() and
-- auth.jwt() (driven by test.uid / test.email settings), auth.users, storage.objects,
-- the realtime publication, and Supabase's default privileges (new functions and tables
-- in public are granted to anon and authenticated, so migrations must revoke explicitly).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_auth_admin nologin;
create schema auth;
create schema storage;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz default clock_timestamp()
);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', nullif(current_setting('test.email', true), '')) $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create publication supabase_realtime;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
