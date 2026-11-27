// Companies on this BuildTrack install (invite-only for now: there's no public sign-up).
//
//   npm run company:list                                   every company and who can get in
//   npm run company:create -- "Acme Design Build" acme.com  a new company, open to @acme.com
//   npm run company:create -- "Acme Design Build" jane@acme.com   …or to one address
//
// A new company starts empty; its first person to sign in gets the sample data, like a new
// install. Runs against the linked Supabase project; the CLI asks before changing anything.
import { execFileSync } from 'node:child_process';

const [command, name = '', who = ''] = process.argv.slice(2);
const entry = who.trim().toLowerCase().replace(/^@/, '');
const isEmail = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(entry);
const isDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(entry);
const run = (sql, readOnly = false) =>
  execFileSync('supabase', ['db', 'query', '--remote', ...(readOnly ? ['--read-only'] : []), sql], { stdio: 'inherit' });
const quote = (s) => `'${s.replace(/'/g, "''")}'`;

const list = () =>
  run(
    `select c.name, c.id, coalesce(string_agg(x.who, ', ' order by x.who), '(nobody yet)') as who_can_sign_in
     from public.companies c
     left join (select company_id, domain as who from public.allowed_domains
                union all select company_id, email from public.allowed_emails) x on x.company_id = c.id
     group by c.id order by c.created_at`,
    true,
  );

if (command === 'list') {
  list();
} else if (command === 'create' && name.trim() && (isEmail || isDomain)) {
  const table = isEmail ? 'allowed_emails' : 'allowed_domains';
  const column = isEmail ? 'email' : 'domain';
  run(
    `with c as (insert into public.companies (name) values (${quote(name.trim())}) returning id)
     insert into public.${table} (${column}, company_id) select ${quote(entry)}, id from c`,
  );
  list();
} else {
  console.error('Usage: npm run company:create -- "Company name" theirdomain.com | person@example.com');
  console.error('       npm run company:list');
  process.exit(1);
}
