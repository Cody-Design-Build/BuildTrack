-- Companies: every record, file and access rule belongs to one company, so one
-- BuildTrack database can hold several companies that never see each other's
-- data (the hosted version), while a self-hosted install simply has one.
--
-- Additive and safe for the app already running: it doesn't send a company, so
-- inserts get the signed-in person's only company by default, and the access
-- rules only ever show them their own company's rows.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  created_at timestamptz not null default now()
);

-- People who belong to a company by invitation, whatever their email address.
-- (Allowed domains and addresses below also let people in.)
create table public.company_members (
  company_id uuid not null references public.companies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- Every install starts with one company, which owns everything already here.
insert into public.companies (name)
select coalesce(
  (select data #>> '{}' from public.records where collection = '$meta' and id = 'companyName'),
  ''
);

-- The install's company while it has exactly one (null once there are several,
-- so nothing is ever filed under the wrong company by default).
create function public.sole_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then min(id::text)::uuid end from public.companies;
$$;

-- Allowed domains and addresses now say which company they let people into.
alter table public.allowed_domains add column company_id uuid references public.companies on delete cascade;
alter table public.allowed_emails add column company_id uuid references public.companies on delete cascade;
update public.allowed_domains set company_id = public.sole_company_id();
update public.allowed_emails set company_id = public.sole_company_id();
alter table public.allowed_domains alter column company_id set default public.sole_company_id();
alter table public.allowed_emails alter column company_id set default public.sole_company_id();
alter table public.allowed_domains alter column company_id set not null;
alter table public.allowed_emails alter column company_id set not null;

-- Whether the signed-in person can work in a company: invited, or their email's
-- domain or address is allowed for it.
create function public.is_company_member(company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    company is not null and auth.uid() is not null and (
      exists (
        select 1 from public.company_members m
        where m.company_id = company and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.allowed_domains d
        where d.company_id = company
          and d.domain = lower(split_part(auth.jwt() ->> 'email', '@', 2))
      )
      or exists (
        select 1 from public.allowed_emails e
        where e.company_id = company and e.email = lower(auth.jwt() ->> 'email')
      )
    ),
    false
  );
$$;

-- The signed-in person's company when they have exactly one (the default for new rows).
create function public.my_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then min(id::text)::uuid end
  from public.companies c where public.is_company_member(c.id);
$$;

-- "On the team" now means "in at least one company" (the sign-in screen asks this).
create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companies c where public.is_company_member(c.id));
$$;

revoke all on function public.sole_company_id() from public, anon, authenticated;
revoke all on function public.is_company_member(uuid) from public, anon, authenticated;
revoke all on function public.my_company_id() from public, anon, authenticated;
-- Supabase grants every new function to anon and authenticated by default, so each is
-- revoked from all three above and only the ones the app needs are granted back.
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.my_company_id() to authenticated;

-- Records: ids are only unique within a company (sample data uses fixed ids).
alter table public.records add column company_id uuid references public.companies on delete cascade;
update public.records set company_id = public.sole_company_id();
alter table public.records alter column company_id set default public.my_company_id();
alter table public.records alter column company_id set not null;
alter table public.records drop constraint records_pkey;
alter table public.records add primary key (company_id, collection, id);

drop policy "Team can read records" on public.records;
drop policy "Team can add records" on public.records;
drop policy "Team can change records" on public.records;
drop policy "Team can delete records" on public.records;
create policy "Company can read its records" on public.records
  for select to authenticated using (public.is_company_member(company_id));
create policy "Company can add records" on public.records
  for insert to authenticated with check (public.is_company_member(company_id));
create policy "Company can change records" on public.records
  for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
create policy "Company can delete records" on public.records
  for delete to authenticated using (public.is_company_member(company_id));

-- Companies, members and access lists: visible to the company, changed from the
-- dashboard or scripts for now (invite-only while BuildTrack is early).
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
create policy "Members can see their company" on public.companies
  for select to authenticated using (public.is_company_member(id));
create policy "Members can see their company's members" on public.company_members
  for select to authenticated using (public.is_company_member(company_id));

drop policy "Team can see allowed domains" on public.allowed_domains;
drop policy "Team can see allowed emails" on public.allowed_emails;
create policy "Company can see its allowed domains" on public.allowed_domains
  for select to authenticated using (public.is_company_member(company_id));
create policy "Company can see its allowed emails" on public.allowed_emails
  for select to authenticated using (public.is_company_member(company_id));

revoke all on public.companies, public.company_members from anon;

-- Files: stored under "<company id>/<file id>", readable only by that company.
create function public.company_of_path(path text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(path, '/', 1)::uuid
  end;
$$;

drop policy "Team can read files" on storage.objects;
drop policy "Team can add files" on storage.objects;
drop policy "Team can replace files" on storage.objects;
drop policy "Team can delete files" on storage.objects;
create policy "Company can read its files" on storage.objects
  for select to authenticated
  using (bucket_id = 'files' and public.is_company_member(public.company_of_path(name)));
create policy "Company can add files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'files' and public.is_company_member(public.company_of_path(name)));
create policy "Company can replace files" on storage.objects
  for update to authenticated
  using (bucket_id = 'files' and public.is_company_member(public.company_of_path(name)))
  with check (bucket_id = 'files' and public.is_company_member(public.company_of_path(name)));
create policy "Company can delete files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and public.is_company_member(public.company_of_path(name)));
