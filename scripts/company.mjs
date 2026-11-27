// Run by whoever operates this BuildTrack install (never from the app).
//
//   npm run invite:owner -- jane@acme.com "Acme Design Build"
//       Invites Jane to own a company (single use, expires in 7 days). On a new install
//       this is how the first owner gets in; on an install that already has companies it
//       starts a new one when she signs in. She then invites her own team from
//       Settings → Members.
//   npm run company:list
//       Every company, its owners, member count and open invites.
//
// Runs against the Supabase project this folder is linked to (`supabase link`). The
// Supabase CLI asks you to confirm before it changes anything.
import { execFileSync } from 'node:child_process';

const [command, email = '', name = ''] = process.argv.slice(2);
const address = email.trim().toLowerCase();
const isEmail = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(address);
const run = (sql, readOnly = false) =>
  execFileSync('supabase', ['db', 'query', '--remote', ...(readOnly ? ['--read-only'] : []), sql], { stdio: 'inherit' });
const quote = (s) => `'${s.replace(/'/g, "''")}'`;

const list = () =>
  run(
    `select c.name as company,
            (select string_agg(u.email, ', ') from public.company_members m join auth.users u on u.id = m.user_id
              where m.company_id = c.id and m.role = 'owner') as owners,
            (select count(*) from public.company_members m where m.company_id = c.id) as members,
            (select string_agg(i.email || ' (' || i.role || ', expires ' || to_char(i.expires_at, 'Mon DD') || ')', ', ')
               from public.invites i where i.company_id = c.id and i.used_at is null and i.expires_at > now()) as open_invites
     from public.companies c
     union all
     select i.company_name || ' (new)', null, 0, i.email || ' (owner, expires ' || to_char(i.expires_at, 'Mon DD') || ')'
     from public.invites i where i.company_id is null and i.used_at is null and i.expires_at > now()
     order by 1`,
    true,
  );

if (command === 'invite-owner' && isEmail && name.trim()) {
  run(`select public.invite_owner(${quote(address)}, ${quote(name.trim())})`);
  console.log(`\nInvited ${address} to own ${name.trim()}. Tell them to sign in at your BuildTrack address within 7 days with that email (Google, or an emailed code).`);
  list();
} else if (command === 'list') {
  list();
} else {
  console.error('Usage: npm run invite:owner -- jane@acme.com "Acme Design Build"');
  console.error('       npm run company:list');
  process.exit(1);
}
