// Manage who can sign in to this BuildTrack install.
//
//   npm run team:allow -- yourcompany.com          allow everyone @yourcompany.com
//   npm run team:allow -- jane@bookkeeping.com     allow one outside address
//   npm run team:remove -- yourcompany.com         stop allowing a domain or address
//   npm run team:list                              show who's allowed
//
// Runs against the Supabase project this folder is linked to (`supabase link`).
// The Supabase CLI asks you to confirm before it changes anything.
import { execFileSync } from 'node:child_process';

const [command, value = ''] = process.argv.slice(2);
const entry = value.trim().toLowerCase().replace(/^@/, '');
const isEmail = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(entry);
const isDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(entry);

const sql = (statement) => execFileSync('supabase', ['db', 'query', '--remote', statement], { stdio: 'inherit' });
const list = () =>
  execFileSync(
    'supabase',
    ['db', 'query', '--remote', '--read-only', "select 'domain' as kind, domain as allowed from public.allowed_domains union all select 'email', email from public.allowed_emails order by 1, 2"],
    { stdio: 'inherit' },
  );

if (command === 'list') {
  list();
} else if ((command === 'allow' || command === 'remove') && (isEmail || isDomain)) {
  // Only plain domain and address characters get past the checks above, so the value is safe to quote.
  const table = isEmail ? 'allowed_emails' : 'allowed_domains';
  const column = isEmail ? 'email' : 'domain';
  sql(
    command === 'allow'
      ? `insert into public.${table} (${column}) values ('${entry}') on conflict do nothing`
      : `delete from public.${table} where ${column} = '${entry}'`,
  );
  list();
} else {
  console.error('Usage: npm run team:allow -- yourcompany.com | person@example.com');
  console.error('       npm run team:remove -- yourcompany.com | person@example.com');
  console.error('       npm run team:list');
  process.exit(1);
}
