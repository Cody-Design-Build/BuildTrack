// Access rules, tested: runs every migration on PGlite (real Postgres in WebAssembly) with a
// stand-in for Supabase (mock-supabase.sql), starting from data like the live install's,
// then checks who can see and do what. `npm run test:db`.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const DIR = process.argv[2] ?? new URL('../migrations', import.meta.url).pathname;
const db = new PGlite();
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
await db.exec(readFileSync(new URL('./mock-supabase.sql', import.meta.url), 'utf8'));
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const pre = files.filter((f) => f < '20261127200000');
const post = files.filter((f) => f >= '20261127200000');
const late = post.filter((f) => f >= '20261127210000');
post.splice(post.findIndex((f) => f >= '20261127210000'), 9);
for (const f of pre) await db.exec(readFileSync(`${DIR}/${f}`, 'utf8'));
// the live install before the company migration: our domain allowed, some records
await db.exec(`insert into public.allowed_domains values ('codydesignbuild.com');
insert into public.records (collection, id, data) values ('$meta','companyName','"Cody Design Build Inc."'), ('$meta','companyLicense','"1118207"'), ('jobs','j12','{"id":"j12","name":"Lincoln"}');
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','david@codydesignbuild.com'), ('22222222-2222-2222-2222-222222222222','wile@acme.com'), ('33333333-3333-3333-3333-333333333333','eve@gmail.com');
insert into auth.users (id, email, email_confirmed_at) values ('88888888-8888-8888-8888-888888888888','fake-staff@codydesignbuild.com', null);`);
for (const f of post) await db.exec(readFileSync(`${DIR}/${f}`, 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated; grant select, insert, update, delete on storage.objects to authenticated;`);

const as = async (uid, email, sql, params) => {
  await db.exec(`reset role; select set_config('test.uid', '${uid}', false), set_config('test.email', '${email}', false); set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } catch (e) { return { error: e.message }; } finally { await db.exec('reset role'); }
};
const DAVID = ['11111111-1111-1111-1111-111111111111', 'david@codydesignbuild.com'];
const WILE = ['22222222-2222-2222-2222-222222222222', 'wile@acme.com'];
const EVE = ['33333333-3333-3333-3333-333333333333', 'eve@gmail.com'];

const [cdb] = (await db.query(`select id, name from public.companies`)).rows;
ok(cdb.name === 'Cody Design Build Inc.', `existing data became company "${cdb.name}"`);
ok((await db.query(`select count(*)::int n from public.records where company_id = $1`, [cdb.id])).rows[0].n === 3, 'existing records (incl. $meta settings) filed under it');
ok((await db.query(`select company_id from public.allowed_domains`)).rows[0].company_id === cdb.id, 'allowed domain filed under it');

ok((await as(...DAVID, `select public.is_team_member() t`))[0].t === true, 'david is on the team');
ok((await as(...EVE, `select public.is_team_member() t`))[0].t === false, 'eve (gmail) is not');
ok((await as(...DAVID, `select * from public.records`)).length === 3, 'david sees the records');
ok((await as(...EVE, `select * from public.records`)).length === 0, 'eve sees nothing');
// the app as it runs today: no company sent
const ins = await as(...DAVID, `insert into public.records (collection, id, data) values ('jobs','j13','{}') returning company_id`);
ok(!ins.error && ins[0].company_id === cdb.id, 'old app insert (no company) defaults to david\'s company ' + (ins.error ?? ''));
const up = await as(...DAVID, `insert into public.records (collection, id, data) values ('jobs','j12','{"id":"j12","name":"Lincoln 2"}') on conflict (company_id, collection, id) do update set data = excluded.data returning data`);
ok(!up.error && up[0].data.name === 'Lincoln 2', 'upsert updates in place ' + (up.error ?? ''));
ok((await as(...EVE, `insert into public.records (collection, id, data) values ('jobs','x','{}')`)).error, 'eve cannot insert');
// #6's team:allow still works on a one-company install
await db.exec(`insert into public.allowed_emails (email) values ('bookkeeper@gmail.com')`);
ok((await db.query(`select company_id from public.allowed_emails`)).rows[0].company_id === cdb.id, 'team:allow without a company files it under the only company');

// a second company (the hosted version)
const [acme] = (await db.query(`insert into public.companies (name) values ('Acme') returning id`)).rows;
await db.exec(`insert into public.allowed_domains (domain, company_id) values ('acme.com', '${acme.id}')`);
const w = await as(...WILE, `insert into public.records (collection, id, data) values ('jobs','j12','{"id":"j12","name":"Acme job"}') returning company_id`);
ok(!w.error && w[0].company_id === acme.id, 'acme can use the same record id j12 ' + (w.error ?? ''));
ok((await as(...WILE, `select * from public.records`)).length === 1, 'acme sees only its own record');
ok((await as(...DAVID, `select * from public.records`)).length === 4, 'david still sees only cdb records');
ok((await as(...WILE, `insert into public.records (company_id, collection, id, data) values ('${cdb.id}','jobs','evil','{}')`)).error, 'acme cannot write into cdb');
ok((await as(...WILE, `update public.records set data='{}' where company_id='${cdb.id}' returning id`)).length === 0, 'acme cannot change cdb records');
ok((await as(...WILE, `delete from public.records where company_id='${cdb.id}' returning id`)).length === 0, 'acme cannot delete cdb records');
ok((await as(...WILE, `select id from public.companies`)).length === 1, 'acme sees only its company');
ok((await as(...WILE, `select * from public.allowed_domains`)).length === 1, "acme sees only its allowed domains");
const amb = await db.query(`select public.sole_company_id() s`); ok(amb.rows[0].s === null, 'no default company once there are two');
const bad = await db.query(`insert into public.allowed_emails (email) values ('x@y.com')`).catch((e) => e);
ok(bad instanceof Error, 'allowing an address without naming a company fails once there are two');
// invited member
await db.exec(`insert into public.company_members (company_id, user_id) values ('${acme.id}', '${EVE[0]}')`);
ok((await as(...EVE, `select * from public.records`)).length === 1, 'eve invited to acme sees acme data only');

// $meta settings: the app upserts them like any record
const lic = await as(...DAVID, `insert into public.records (company_id, collection, id, data) values ('${cdb.id}','$meta','companyLicense','"999"') on conflict (company_id, collection, id) do update set data = excluded.data returning data`);
ok(!lic.error && lic[0].data === '999', 'david updates the companyLicense setting ' + (lic.error ?? ''));
const wl = await as(...WILE, `insert into public.records (collection, id, data) values ('$meta','companyLicense','"ACME-1"') returning company_id`);
ok(!wl.error && wl[0].company_id === acme.id, 'acme has its own companyLicense setting');
ok((await db.query(`select data from public.records where company_id = $1 and collection = '$meta' and id = 'companyLicense'`, [cdb.id])).rows[0].data === '999', "cdb's setting is untouched by acme's");
// ---- invite-only migration (on the two-company state above) ----
await db.exec(`delete from public.company_members`); // as on live: nobody named yet
for (const f of late) await db.exec(readFileSync(`${DIR}/${f}`, 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
const own = (await db.query(`select u.email, m.role from public.company_members m join auth.users u on u.id = m.user_id where company_id = $1`, [cdb.id])).rows;
ok(own.length === 1 && own[0].email === 'david@codydesignbuild.com' && !own.some((o) => o.email.startsWith('fake')) && own[0].role === 'owner', 'existing confirmed codydesignbuild.com account (david) becomes owner; the unconfirmed one does not join');
ok((await db.query(`select to_regclass('public.allowed_domains') a, to_regclass('public.allowed_emails') b`)).rows.every((r) => !r.a && !r.b), 'allowed lists are gone');
ok((await as(...DAVID, `select * from public.records`)).length === 4, 'david still sees cdb data after the switch to membership');
ok((await as(...EVE, `select public.is_team_member() t`))[0].t === false, 'eve (gmail, never invited to cdb, removed from acme) is on no team');
// domain auto-join is gone: a new codydesignbuild.com account gets nothing without an invite
const hook = (email) => db.query(`select public.hook_before_user_created($1::jsonb) r`, [JSON.stringify({ user: { email } })]).then((r) => r.rows[0].r);
ok((await hook('newhire@codydesignbuild.com')).error?.http_code === 403, 'hook refuses an account for our domain without an invite');
ok((await hook('stranger@gmail.com')).error, 'hook refuses a stranger');
// operator: new-company invite
await db.query(`select public.invite_owner('Owner@NewCo.com', 'New Co Builders')`);
ok(!(await hook('owner@newco.com')).error, 'hook allows an address with a valid invite (case-insensitive)');
ok((await as(...DAVID, `select public.invite_owner('x@y.com', 'Sneaky')`)).error, 'the app cannot create new-company invites');
for (const [fn, sig] of [['invite_owner', '(text, text)'], ['hook_before_user_created', '(jsonb)'], ['hook_custom_access_token', '(jsonb)'], ['sole_company_id', '()']].filter(([f]) => f !== 'sole_company_id')) {
  for (const role of ['anon', 'authenticated']) {
    ok(!(await db.query(`select has_function_privilege('${role}', 'public.${fn}${sig}', 'execute') a`)).rows[0].a, `${role} cannot run ${fn}`);
  }
}
for (const fn of ['accept_invites()', 'invite_member(uuid, text, text)', 'company_team(uuid)', 'is_company_member(uuid)', 'my_company_id()']) {
  ok(!(await db.query(`select has_function_privilege('anon', 'public.${fn}', 'execute') a`)).rows[0].a, `anon cannot run ${fn}`);
}
const OWN = ['66666666-6666-6666-6666-666666666666', 'owner@newco.com'];
await db.exec(`insert into auth.users (id, email) values ('${OWN[0]}', '${OWN[1]}')`);
ok((await as(...OWN, `select public.accept_invites() n`))[0].n === 1, 'invited owner accepts');
const nc = (await db.query(`select c.id, c.name, m.role from public.companies c join public.company_members m on m.company_id = c.id where m.user_id = $1`, [OWN[0]])).rows;
ok(nc.length === 1 && nc[0].name === 'New Co Builders' && nc[0].role === 'owner', 'a new company is created and they own it');
ok((await hook('owner@newco.com')).error, 'single use: the used invite no longer allows an account');
ok((await as(...OWN, `select public.accept_invites() n`))[0].n === 0, 'single use: accepting again does nothing');
ok((await as(...OWN, `select * from public.records`)).length === 0, 'the new company sees no other company records');
// owner invites a member
const exp = await as(...OWN, `select public.invite_member('${nc[0].id}', 'pat@outlook.com', 'member') e`);
ok(!exp.error && Math.round((new Date(exp[0].e) - Date.now()) / 86400000) === 7, 'member invites expire in 7 days ' + (exp.error ?? ''));
ok((await as(...WILE, `select public.invite_member('${nc[0].id}', 'evil@x.com')`)).error, "another company's owner can't invite into it");
ok((await as(...OWN, `select public.invite_member('${nc[0].id}', 'boss@x.com', 'owner')`)).error, 'owners cannot be invited from the app');
ok((await as(...OWN, `select * from public.company_team('${nc[0].id}')`)).some((t) => t.pending && t.email === 'pat@outlook.com'), 'pending invite listed');
ok((await as(...WILE, `select * from public.invites`)).every((i) => i.company_id !== nc[0].id), "other companies can't see its invites");
const PAT = ['55555555-5555-5555-5555-555555555555', 'pat@outlook.com'];
await db.exec(`insert into auth.users (id, email) values ('${PAT[0]}', '${PAT[1]}')`);
ok((await as(...PAT, `select public.accept_invites() n`))[0].n === 1 && (await as(...PAT, `select * from public.records`)).length === 0, 'pat joins (empty new company)');
// expiry
await db.exec(`insert into public.invites (email, company_id, role, expires_at) values ('late@x.com', '${nc[0].id}', 'member', now() - interval '1 minute')`);
ok((await hook('late@x.com')).error, 'an expired invite does not allow an account');
const LATE = ['77777777-7777-7777-7777-777777777777', 'late@x.com'];
await db.exec(`insert into auth.users (id, email) values ('${LATE[0]}', '${LATE[1]}')`);
ok((await as(...LATE, `select public.accept_invites() n`))[0].n === 0, 'an expired invite cannot be accepted');
ok(!(await as(...OWN, `select public.invite_member('${nc[0].id}', 'late@x.com')`)).error, 're-inviting replaces the expired invite');
ok((await as(...LATE, `select public.accept_invites() n`))[0].n === 1, 'the fresh invite works');
// roles
ok((await as(...PAT, `select public.set_member_role('${nc[0].id}', '${OWN[0]}', null)`)).error, 'a member cannot remove the owner');
ok((await as(...OWN, `select public.set_member_role('${nc[0].id}', '${OWN[0]}', null)`)).error?.includes('at least one owner'), 'the last owner cannot leave');
ok(!(await as(...PAT, `select public.set_member_role('${nc[0].id}', '${PAT[0]}', null)`)).error, 'a member can leave');
ok((await as(...WILE, `insert into public.company_members (company_id, user_id, role) values ('${cdb.id}', '${WILE[0]}', 'owner')`)).error, 'nobody can add themselves to a company directly');
ok((await as(...WILE, `insert into public.invites (email, company_id, role) values ('wile@acme.com', '${cdb.id}', 'member')`)).error, 'nobody can write invites directly');
// password hook
const tok = (m) => db.query(`select public.hook_custom_access_token($1::jsonb) r`, [JSON.stringify({ authentication_method: m, claims: { sub: 'x', role: 'authenticated' } })]).then((r) => r.rows[0].r);
ok((await tok('password')).error?.http_code === 403, 'password sign-in refused');
ok((await tok('otp')).claims?.sub === 'x' && (await tok('oauth')).claims?.role === 'authenticated', 'email codes and Google pass with claims unchanged');
ok((await db.query(`select has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute') a`)).rows[0].a === false, 'hooks are not callable from the app');
// files
ok(!(await as(...DAVID, `insert into storage.objects (bucket_id, name) values ('files', '${cdb.id}/f1') returning id`)).error, 'david stores a file in cdb folder');
ok((await as(...WILE, `insert into storage.objects (bucket_id, name) values ('files', '${cdb.id}/f2')`)).error, 'acme cannot store in cdb folder');
ok((await as(...WILE, `select * from storage.objects`)).length === 0, 'acme cannot see cdb files');
ok((await as(...DAVID, `insert into storage.objects (bucket_id, name) values ('files', 'flat-file')`)).error, 'flat (no company) file names are refused');
ok((await as(...DAVID, `select * from storage.objects`)).length === 1, 'david sees his file');
