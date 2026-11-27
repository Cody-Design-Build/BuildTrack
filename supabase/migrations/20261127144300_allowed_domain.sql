-- This install's team: anyone with a Cody Design Build Google account.
-- Another company running BuildTrack would change this domain.
insert into public.allowed_domains (domain) values ('codydesignbuild.com') on conflict do nothing;
