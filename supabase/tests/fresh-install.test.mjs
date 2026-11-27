// A brand-new self-hosted install: nobody gets in until the operator invites the first
// owner, who then gets the install's one company. `npm run test:db`.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const DIR = process.argv[2] ?? new URL('../migrations', import.meta.url).pathname;
const db = new PGlite();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
await db.exec(readFileSync(new URL('./mock-supabase.sql', import.meta.url), 'utf8'));
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(`${DIR}/${f}`, 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
ok((await db.query(`select public.team_is_set_up() s`)).rows[0].s === false, 'a fresh install is not set up');
const hook = (email) => db.query(`select public.hook_before_user_created($1::jsonb) r`, [JSON.stringify({ user: { email } })]).then((r) => r.rows[0].r);
ok((await hook('first@acme.com')).error, 'nobody can create an account on a fresh install');
await db.query(`select public.invite_owner('first@acme.com', 'Acme Design Build')`);
ok(!(await hook('first@acme.com')).error, 'the invited first owner can');
await db.exec(`insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'first@acme.com')`);
await db.exec(`select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false), set_config('test.email', 'first@acme.com', false); set role authenticated;`);
const n = (await db.query(`select public.accept_invites() n`)).rows[0].n;
const cs = (await db.query(`select name from public.companies`)).rows;
await db.exec('reset role');
ok(n === 1 && cs.length === 1 && cs[0].name === 'Acme Design Build', "the first owner gets the install's one company (no second company)");
ok((await db.query(`select count(*)::int c from public.companies`)).rows[0].c === 1, 'still exactly one company');
ok((await db.query(`select public.team_is_set_up() s`)).rows[0].s === true, 'now set up');
