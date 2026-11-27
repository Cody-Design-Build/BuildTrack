-- Each install decides who its team is: email domains in allowed_domains and
-- individual addresses in allowed_emails. A new install has neither, so nobody
-- can see any data until its owner runs `npm run team:allow -- yourcompany.com`
-- (see docs/self-hosting.md). Failing closed like this is deliberate.

-- Lets the sign-in screen tell "this install isn't set up yet" apart from
-- "you're not on this team". Reveals only yes/no, never the domains themselves.
create function public.team_is_set_up() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.allowed_domains)
      or exists (select 1 from public.allowed_emails);
$$;

revoke all on function public.team_is_set_up() from public;
grant execute on function public.team_is_set_up() to anon, authenticated;

-- Keep entries in the form is_team_member() compares against: a bare,
-- lower-case domain ("yourcompany.com", no "@") and lower-case addresses.
alter table public.allowed_domains
  add constraint allowed_domains_bare_lowercase
  check (domain = lower(domain) and domain like '%.%' and domain !~ '[@[:space:]/]');

alter table public.allowed_emails
  add constraint allowed_emails_lowercase
  check (email = lower(email) and email like '%@%.%');
