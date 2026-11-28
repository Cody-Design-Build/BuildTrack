-- Installed plugins are code that runs for everyone in the company, so only owners and admins
-- may add, change or remove them, or change which plugins are on (Settings → Plugins).
-- Everyone in the company can still read them (the app has to load them).
--
-- Guarded records:
--   collection 'installedPlugins'         the installed plugins themselves
--   collection '$meta', id 'plugins'      which plugins are on, and role choices
--
-- These are restrictive policies: they add to the company-member policies on records, so a
-- row must pass both.

create function public.is_admin_record(collection text, id text) returns boolean
  language sql immutable set search_path = ''
as $$ select collection = 'installedPlugins' or (collection = '$meta' and id = 'plugins') $$;

revoke all on function public.is_admin_record(text, text) from public, anon, authenticated;
grant execute on function public.is_admin_record(text, text) to authenticated;

create policy "Only admins add plugins" on public.records as restrictive
  for insert to authenticated
  with check (not public.is_admin_record(collection, id) or public.is_company_admin(company_id));

create policy "Only admins change plugins" on public.records as restrictive
  for update to authenticated
  using (not public.is_admin_record(collection, id) or public.is_company_admin(company_id))
  with check (not public.is_admin_record(collection, id) or public.is_company_admin(company_id));

create policy "Only admins remove plugins" on public.records as restrictive
  for delete to authenticated
  using (not public.is_admin_record(collection, id) or public.is_company_admin(company_id));
