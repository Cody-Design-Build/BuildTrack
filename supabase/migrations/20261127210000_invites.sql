-- Invite-only: nobody gets an account, or into a company, without an invite.
--
--   - An invite is for one email address, works once, and expires after 7 days.
--   - Owners and admins invite people to their own company (Settings → Members).
--   - Invites that start a new company are made only by whoever runs the install
--     (`npm run invite:owner`; later, payment), never from the app.
--   - The before-user-created auth hook below refuses to create any account
--     without a valid invite, whether by Google or an emailed code.
--   - The custom-access-token hook refuses password sign-ins.
--
-- Membership is now the only way into a company: the allowed domain and email
-- lists (and joining automatically by domain) are removed.

-- 1. Everyone the allowed lists let in today (with a confirmed email) becomes a named
--    member of that company.
--    In each company, the first person to have signed in is its owner.
insert into public.company_members (company_id, user_id, role)
select c.id, u.id,
       case when row_number() over (partition by c.id order by u.created_at) = 1 then 'owner' else 'member' end
from public.companies c
cross join auth.users u
where u.email_confirmed_at is not null  -- only addresses someone has proved they own
  and (exists (select 1 from public.allowed_domains d
               where d.company_id = c.id and d.domain = lower(split_part(u.email, '@', 2)))
    or exists (select 1 from public.allowed_emails e
               where e.company_id = c.id and e.email = lower(u.email)))
on conflict do nothing;

-- 2. Access is membership only.
create or replace function public.is_company_member(company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select company is not null and auth.uid() is not null and exists (
    select 1 from public.company_members m where m.company_id = company and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.company_members m where m.user_id = auth.uid());
$$;

-- The sign-in screen uses this to tell "nobody has been invited to run this install
-- yet" apart from "you're not on a team". Reveals only yes/no.
create or replace function public.team_is_set_up() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_members);
$$;

-- 3. Remove the allowed lists.
drop table public.allowed_domains;
drop table public.allowed_emails;
drop function public.sole_company_id();

-- 4. Invites.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email like '%_@_%._%'),
  -- The company to join, or null for an invite that starts a new company.
  company_id uuid references public.companies on delete cascade,
  company_name text,
  role text not null check (role in ('owner', 'admin', 'member')),
  invited_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users on delete set null,
  check ((company_id is null) = (company_name is not null)),
  check (company_id is not null or role = 'owner')
);
-- At most one open invite per address and company.
create unique index invites_one_open on public.invites
  (email, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where used_at is null;

alter table public.invites enable row level security;
revoke all on public.invites from anon;
create policy "Members can see their company's invites" on public.invites
  for select to authenticated using (public.is_company_member(company_id));

create function public.my_email() returns text
language sql stable set search_path = '' as $$
  select lower(auth.jwt() ->> 'email');
$$;

create function public.is_company_admin(company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = company and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

-- Use every valid invite for the signed-in person's (verified) email: join those
-- companies, or start the company a new-company invite is for. Called after sign-in.
create function public.accept_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites;
  target uuid;
  used integer := 0;
begin
  if auth.uid() is null or public.my_email() is null then return 0; end if;
  for inv in
    select * from public.invites
    where email = public.my_email() and used_at is null and expires_at > now()
    order by created_at
    for update
  loop
    target := inv.company_id;
    if target is null then
      insert into public.companies (name) values (inv.company_name) returning id into target;
    end if;
    insert into public.company_members (company_id, user_id, role)
    values (target, auth.uid(), inv.role)
    on conflict do nothing;
    update public.invites set used_at = now(), used_by = auth.uid() where id = inv.id;
    used := used + 1;
  end loop;
  return used;
end;
$$;

-- Invite someone to your company (owners and admins). Replaces any open invite for
-- that address, so inviting again restarts the 7 days.
create function public.invite_member(company uuid, invite_email text, invite_role text default 'member') returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(invite_email));
  expires timestamptz;
begin
  if not public.is_company_admin(company) then raise exception 'Only owners and admins can invite people'; end if;
  if invite_role not in ('admin', 'member') then raise exception 'Unknown role %', invite_role; end if;
  if exists (select 1 from public.company_members m join auth.users u on u.id = m.user_id
             where m.company_id = company and lower(u.email) = e) then
    raise exception '% is already on the team', e;
  end if;
  delete from public.invites where company_id = company and email = e and used_at is null;
  insert into public.invites (email, company_id, role) values (e, company, invite_role)
  returning expires_at into expires;
  return expires;
end;
$$;

create function public.cancel_invite(company uuid, invite_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_company_admin(company) then raise exception 'Only owners and admins can manage invites'; end if;
  delete from public.invites where company_id = company and email = lower(trim(invite_email)) and used_at is null;
end;
$$;

-- Operator only (no app access): an invite to start a company. On a new install
-- whose one company has nobody in it yet, the invite is to own that company.
create function public.invite_owner(invite_email text, new_company_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(invite_email));
  empty_company uuid;
  new_id uuid;
begin
  if trim(coalesce(new_company_name, '')) = '' then raise exception 'Give the company a name'; end if;
  select c.id into empty_company from public.companies c
  where not exists (select 1 from public.company_members m where m.company_id = c.id)
    and (select count(*) from public.companies) = 1;
  if empty_company is not null then
    update public.companies set name = trim(new_company_name) where id = empty_company;
    delete from public.invites where company_id = empty_company and email = e and used_at is null;
    insert into public.invites (email, company_id, role) values (e, empty_company, 'owner') returning id into new_id;
  else
    delete from public.invites where company_id is null and email = e and used_at is null;
    insert into public.invites (email, company_name, role) values (e, trim(new_company_name), 'owner') returning id into new_id;
  end if;
  return new_id;
end;
$$;

-- The team as the Members page shows it: members with their email, then open invites.
create function public.company_team(company uuid)
returns table (user_id uuid, email text, role text, since timestamptz, pending boolean, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from (
    select m.user_id, u.email::text, m.role, m.created_at, false, null::timestamptz
    from public.company_members m join auth.users u on u.id = m.user_id
    where m.company_id = company and public.is_company_member(company)
    union all
    select null, i.email, i.role, i.created_at, true, i.expires_at
    from public.invites i
    where i.company_id = company and i.used_at is null and public.is_company_member(company)
  ) t
  order by 5, 4;
$$;

-- Change someone's role, or remove them (new_role null). A company always keeps an
-- owner, and only an owner can make or unmake owners. Anyone can leave.
create function public.set_member_role(company uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
  select role into old_role from public.company_members where company_id = company and user_id = member;
  if old_role is null then raise exception 'Not on this team'; end if;
  if not (member = auth.uid() and new_role is null) and not public.is_company_admin(company) then
    raise exception 'Only owners and admins can change the team';
  end if;
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

create function public.rename_company(company uuid, new_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_company_admin(company) then raise exception 'Only owners and admins can rename the company'; end if;
  update public.companies set name = trim(new_name) where id = company and trim(coalesce(new_name, '')) <> '';
end;
$$;

revoke all on function public.my_email(), public.is_company_admin(uuid), public.accept_invites(),
  public.invite_member(uuid, text, text), public.cancel_invite(uuid, text), public.invite_owner(text, text),
  public.company_team(uuid), public.set_member_role(uuid, uuid, text), public.rename_company(uuid, text)
  from public, anon, authenticated;  -- Supabase grants new functions to anon and authenticated by default
grant execute on function public.my_email(), public.is_company_admin(uuid), public.accept_invites(),
  public.invite_member(uuid, text, text), public.cancel_invite(uuid, text),
  public.company_team(uuid), public.set_member_role(uuid, uuid, text), public.rename_company(uuid, text)
  to authenticated;
-- invite_owner: no grant. Only the database owner (the CLI) can run it.

-- 5. Auth hooks (switched on in supabase/config.jsonc).

-- No account without a valid invite for its email.
create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e text := lower(event #>> '{user,email}');
begin
  if e is not null and exists (
    select 1 from public.invites i where i.email = e and i.used_at is null and i.expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'BuildTrack is invite-only. Sign in with the email address your invite was sent to, within 7 days of the invite.'
  ));
end;
$$;

-- No password sign-ins: sessions come from Google or an emailed code only.
create function public.hook_custom_access_token(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if event ->> 'authentication_method' = 'password' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Password sign-in is turned off. Use Google or an emailed code.'
    ));
  end if;
  return jsonb_build_object('claims', event -> 'claims');
end;
$$;

revoke all on function public.hook_before_user_created(jsonb), public.hook_custom_access_token(jsonb)
  from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb), public.hook_custom_access_token(jsonb)
  to supabase_auth_admin;
