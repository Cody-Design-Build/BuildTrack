-- Sign-up and invites: anyone can sign up (Google or an emailed code), create a
-- company, and invite their team by email. An invite is accepted by signing in
-- with that same (verified) email address.
--
-- Whether strangers may create companies is an install setting: off by default,
-- so a self-hosted install stays private; the hosted version turns it on with
-- `npm run company:signup -- on`.

create table public.install_settings (
  key text primary key,
  value jsonb not null
);
alter table public.install_settings enable row level security;
revoke all on public.install_settings from anon, authenticated;

create table public.company_invites (
  company_id uuid not null references public.companies on delete cascade,
  email text not null check (email = lower(email) and email like '%@%.%'),
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, email)
);
alter table public.company_invites enable row level security;
revoke all on public.company_invites from anon;

-- Everyone already using an install becomes a named member of its company, so the
-- team can be managed in the app. In each company, the first person to have signed in is its owner.
insert into public.company_members (company_id, user_id, role)
select c.id, u.id, case when row_number() over (partition by c.id order by u.created_at) = 1 then 'owner' else 'member' end
from public.companies c
cross join auth.users u
where (
    exists (select 1 from public.allowed_domains d where d.company_id = c.id and d.domain = lower(split_part(u.email, '@', 2)))
    or exists (select 1 from public.allowed_emails e where e.company_id = c.id and e.email = lower(u.email))
  )
on conflict do nothing;

create function public.my_email() returns text
language sql stable set search_path = '' as $$
  select lower(auth.jwt() ->> 'email');
$$;

-- Owners and admins manage the team.
create function public.is_company_admin(company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = company and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

-- Join every company that has invited this (verified) email. Called after sign-in.
create function public.accept_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare joined integer;
begin
  if auth.uid() is null or public.my_email() is null then return 0; end if;
  insert into public.company_members (company_id, user_id, role)
  select i.company_id, auth.uid(), i.role from public.company_invites i where i.email = public.my_email()
  on conflict do nothing;
  get diagnostics joined = row_count;
  delete from public.company_invites where email = public.my_email();
  return joined;
end;
$$;

-- Whether this install lets anyone create a company (a brand-new install always lets
-- its first person in, so it can be set up without touching the database).
create function public.signup_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.install_settings where key = 'open_signup'), false)
      or not exists (select 1 from public.companies);
$$;

-- A new company, owned by the person creating it. At most three per person.
create function public.create_company(company_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.signup_open() then raise exception 'New companies can''t be created here. Ask for an invite.'; end if;
  if trim(coalesce(company_name, '')) = '' then raise exception 'Give the company a name'; end if;
  if (select count(*) from public.company_members where user_id = auth.uid() and role = 'owner') >= 3 then
    raise exception 'You already own three companies';
  end if;
  insert into public.companies (name) values (trim(company_name)) returning id into new_id;
  insert into public.company_members (company_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

-- The team as the Team page shows it: members with their email, and pending invites.
create function public.company_team(company uuid)
returns table (user_id uuid, email text, role text, joined timestamptz, pending boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at, false
  from public.company_members m join auth.users u on u.id = m.user_id
  where m.company_id = company and public.is_company_member(company)
  union all
  select null, i.email, i.role, i.created_at, true
  from public.company_invites i
  where i.company_id = company and public.is_company_member(company)
  order by 5, 4;
$$;

create function public.invite_member(company uuid, invite_email text, invite_role text default 'member') returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(invite_email));
begin
  if not public.is_company_admin(company) then raise exception 'Only owners and admins can invite people'; end if;
  if invite_role not in ('admin', 'member') then raise exception 'Unknown role %', invite_role; end if;
  if exists (select 1 from public.company_members m join auth.users u on u.id = m.user_id
             where m.company_id = company and lower(u.email) = e) then
    raise exception '% is already on the team', e;
  end if;
  insert into public.company_invites (company_id, email, role) values (company, e, invite_role)
  on conflict (company_id, email) do update set role = excluded.role, invited_by = auth.uid(), created_at = now();
end;
$$;

create function public.cancel_invite(company uuid, invite_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_company_admin(company) then raise exception 'Only owners and admins can manage invites'; end if;
  delete from public.company_invites where company_id = company and email = lower(trim(invite_email));
end;
$$;

-- Change someone's role, or remove them (new_role null). A company always keeps an owner,
-- and only an owner can make or unmake owners.
create function public.set_member_role(company uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
  select role into old_role from public.company_members where company_id = company and user_id = member;
  if old_role is null then raise exception 'Not on this team'; end if;
  if member <> auth.uid() and not public.is_company_admin(company) then raise exception 'Only owners and admins can change the team'; end if;
  if (old_role = 'owner' or new_role = 'owner')
     and not exists (select 1 from public.company_members where company_id = company and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only an owner can change owners';
  end if;
  if old_role = 'owner' and coalesce(new_role, '') <> 'owner'
     and (select count(*) from public.company_members where company_id = company and role = 'owner') = 1 then
    raise exception 'The company needs at least one owner';
  end if;
  if new_role is null then
    delete from public.company_members where company_id = company and user_id = member;
  elsif new_role in ('owner', 'admin', 'member') then
    update public.company_members set role = new_role where company_id = company and user_id = member;
  else
    raise exception 'Unknown role %', new_role;
  end if;
end;
$$;

-- Rename a company (owners and admins).
create function public.rename_company(company uuid, new_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_company_admin(company) then raise exception 'Only owners and admins can rename the company'; end if;
  update public.companies set name = trim(new_name) where id = company and trim(coalesce(new_name, '')) <> '';
end;
$$;

revoke all on function public.my_email(), public.is_company_admin(uuid), public.accept_invites(), public.signup_open(),
  public.create_company(text), public.company_team(uuid), public.invite_member(uuid, text, text),
  public.cancel_invite(uuid, text), public.set_member_role(uuid, uuid, text), public.rename_company(uuid, text)
  from public, anon;
grant execute on function public.is_company_admin(uuid), public.accept_invites(), public.signup_open(),
  public.create_company(text), public.company_team(uuid), public.invite_member(uuid, text, text),
  public.cancel_invite(uuid, text), public.set_member_role(uuid, uuid, text), public.rename_company(uuid, text)
  to authenticated;
grant execute on function public.my_email() to authenticated;

-- Invites are visible to the company's members (the functions above do the changing).
create policy "Members can see their company's invites" on public.company_invites
  for select to authenticated using (public.is_company_member(company_id));
