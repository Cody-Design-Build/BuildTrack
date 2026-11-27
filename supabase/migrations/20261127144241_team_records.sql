-- BuildTrack's shared data.
--
-- The app keeps its data as named collections of records (jobs, people, budgets,
-- invoices…). Each record is one row here: its collection, its id, and the record
-- itself as JSON. New kinds of records need no database change. Plain settings
-- such as the company name are stored in the '$meta' collection.

create table public.records (
  collection text not null,
  id text not null,
  data jsonb not null,
  -- Position in its collection, so lists keep the order people arranged them in.
  sort double precision not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  -- Which open copy of the app made the change, so a tab can ignore its own echoes.
  origin text,
  primary key (collection, id)
);

create function public.touch_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_record();

-- Who counts as the team: anyone signed in with an email at an allowed domain,
-- plus individually allowed addresses (e.g. an outside bookkeeper).
create table public.allowed_domains (domain text primary key);
create table public.allowed_emails (email text primary key);

create function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (auth.jwt() ->> 'email') is not null and (
      exists (
        select 1 from public.allowed_domains d
        where d.domain = lower(split_part(auth.jwt() ->> 'email', '@', 2))
      )
      or exists (
        select 1 from public.allowed_emails e
        where lower(e.email) = lower(auth.jwt() ->> 'email')
      )
    ),
    false
  );
$$;

revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

alter table public.records enable row level security;
alter table public.allowed_domains enable row level security;
alter table public.allowed_emails enable row level security;

create policy "Team can read records" on public.records
  for select to authenticated using ((select public.is_team_member()));
create policy "Team can add records" on public.records
  for insert to authenticated with check ((select public.is_team_member()));
create policy "Team can change records" on public.records
  for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "Team can delete records" on public.records
  for delete to authenticated using ((select public.is_team_member()));

-- The access lists can be read by the team but only changed from the dashboard.
create policy "Team can see allowed domains" on public.allowed_domains
  for select to authenticated using ((select public.is_team_member()));
create policy "Team can see allowed emails" on public.allowed_emails
  for select to authenticated using ((select public.is_team_member()));

revoke all on public.records, public.allowed_domains, public.allowed_emails from anon;

-- Live updates: everyone's screen follows changes as they're saved.
alter table public.records replica identity full;
alter publication supabase_realtime add table public.records;

-- Shared files (signed copies, bill attachments), private to the team.
insert into storage.buckets (id, name, public) values ('files', 'files', false)
  on conflict (id) do nothing;

create policy "Team can read files" on storage.objects
  for select to authenticated using (bucket_id = 'files' and (select public.is_team_member()));
create policy "Team can add files" on storage.objects
  for insert to authenticated with check (bucket_id = 'files' and (select public.is_team_member()));
create policy "Team can replace files" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and (select public.is_team_member()))
  with check (bucket_id = 'files' and (select public.is_team_member()));
create policy "Team can delete files" on storage.objects
  for delete to authenticated using (bucket_id = 'files' and (select public.is_team_member()));
