// Tests the agent server end to end on the sample data: a real MCP client connects over HTTP
// (in-process), lists the tools and skills, runs every tool, and saves a skill.
// Run with `npm run test:agent` (bundled by scripts/agent-test.mjs).
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import { seed, type Db, type PluginChoices } from '../src/data';
import { activeOf, normalizeChoices } from '../src/plugins/activation';
import { PLUGIN_BASES } from '../src/plugins/bases';
import { readFileSync } from 'node:fs';
import { mcpHandlerFor, protectedResourceMetadata } from '../src/agent/http';
import type { AgentContext } from '../src/agent/sdk';

let failures = 0;
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures++;
};

/** A connected client for a company whose data is `store.db`; saves go back into `store`. */
async function connect(store: { db: Db }) {
  const ctx = (): AgentContext => ({
    db: store.db,
    plugins: activeOf(PLUGIN_BASES, normalizeChoices(store.db.plugins)),
    company: { id: 'c1', name: store.db.companyName },
    user: { email: 'dana@example.com', name: 'Dana Cole' },
    save: async (next) => void (store.db = next),
  });
  // a fresh server for every request, as on Vercel
  const fetch = (url: string | URL, init?: RequestInit) => mcpHandlerFor(ctx()).fetch(new Request(url, init));
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch }));
  return client;
}

const text = (r: { content?: unknown }) => ((r.content as { text: string }[])[0]?.text ?? '');
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { error: r.isError ? text(r) : '', data: r.isError ? null : JSON.parse(text(r)) };
};

// The app and the server know the same plugins.
// The app and the server know the same plugins (index.ts imports each folder, bases.ts each folder's base.ts).
const folders = (file: string, re: RegExp) => [...readFileSync(file, 'utf8').matchAll(re)].map((m) => m[1]).filter((f) => f !== 'sdk').sort().join();
check(folders('src/plugins/index.ts', /from '\.\/(\w+)'/g) === folders('src/plugins/bases.ts', /from '\.\/(\w+)\/base'/g), 'src/plugins/index.ts and bases.ts list the same plugins');

const store = { db: seed() };
const client = await connect(store);
const tools = (await client.listTools()).tools;
const names = tools.map((t) => t.name);
console.log(`  tools: ${names.join(', ')}`);
for (const n of ['company_overview', 'list_records', 'get_record', 'search_records', 'list_skills', 'read_skill', 'save_skill', 'reset_skill', 'job_budgets', 'job_billing', 'open_invoices', 'bills_owed', 'bid_comparison', 'job_costs']) check(names.includes(n), `offers ${n}`);
check(tools.find((t) => t.name === 'job_costs')?.annotations?.readOnlyHint === true, 'read tools are marked read-only');
check(tools.find((t) => t.name === 'save_skill')?.annotations?.readOnlyHint === false, 'save_skill is not marked read-only');

const overview = await call(client, 'company_overview');
check(overview.data?.company === 'Acme Design Build Co.', 'company_overview names the company');
const job = store.db.jobs.find((j) => store.db.budgets.some((b) => b.jobId === j.id && b.status === 'Approved'))!;

const costs = await call(client, 'job_costs', { jobId: job.id });
check(costs.data?.costCodes?.length > 0 && typeof costs.data.totals.projectedProfit === 'number', `job_costs works out ${job.name}`);
const budgets = await call(client, 'job_budgets', { jobId: job.id });
check(budgets.data?.contract.price > 0, 'job_budgets has a contract price');
const billing = await call(client, 'job_billing', { jobId: job.id });
check(billing.data?.contract === Math.round(budgets.data.contract.price * 100) / 100, 'job_billing contract matches the approved budgets');
check(Array.isArray((await call(client, 'open_invoices')).data?.invoices), 'open_invoices lists invoices');
check(typeof (await call(client, 'bills_owed')).data?.totals.owed === 'number', 'bills_owed totals what is owed');
const pkg = store.db.bidPackages[0];
const bids = await call(client, 'bid_comparison', { packageId: pkg.id });
check(bids.data?.bids.length === store.db.bids.filter((b) => b.packageId === pkg.id).length, 'bid_comparison lists every bid on the package');
check((await call(client, 'job_costs', { jobId: 'nope' })).error.includes('No job'), 'a wrong id comes back as a readable error');
const listed = await call(client, 'list_records', { collection: 'budgets', where: { jobId: job.id }, limit: 2 });
check(listed.data?.records.length <= 2 && listed.data.total >= listed.data.records.length, 'list_records filters and pages');
check((await call(client, 'get_record', { collection: 'jobs', id: job.id })).data?.name === job.name, 'get_record reads a record');
check((await call(client, 'search_records', { text: job.name.split(' ')[0] })).data?.results.length > 0, 'search_records finds the job');
check((await call(client, 'list_records', { collection: 'preferences' })).error !== '', "list_records won't read lists no plugin owns");

// Skills, through the MCP skills extension
const skills = new SkillsClient(client);
check(skills.supported, 'the server offers the skills extension');
const listing = await skills.list();
const skillNames = listing.skills.map((s) => s.frontmatter?.name);
console.log(`  skills: ${skillNames.join(', ')}`);
check(skillNames.includes('buildtrack-basics') && skillNames.includes('job-costing'), 'serves BuildTrack and plugin skills');
const file = await skills.read(listing.skills.find((s) => s.frontmatter?.name === 'job-costing')!);
check(file.body?.includes('Variance'), 'a skill reads back verified');

// Agents change skills
const saved = await call(client, 'save_skill', { name: 'job-costing', description: 'Our way of job costing.', body: '# Job costing\n\nAlways flag codes over 10%.' });
check(!saved.error && store.db.skills?.[0]?.plugin === 'buildtrack.costing' && store.db.skills[0].updatedBy === "Dana Cole's agent", 'save_skill stores the company copy of a default');
check((await call(client, 'read_skill', { name: 'job-costing' })).data?.markdown.includes('over 10%'), 'the changed skill is what agents read');
check((await call(client, 'save_skill', { name: 'Bad Name', description: 'x', body: 'y' })).error.includes('lowercase'), 'save_skill refuses a bad name');
await call(client, 'save_skill', { name: 'our-warranty', description: 'How we handle warranty calls.', body: 'Call within a day.' });
check((await skills.list()).skills.some((s) => s.frontmatter?.name === 'our-warranty'), "the company's own skill is served to the next request");
await call(client, 'reset_skill', { name: 'job-costing' });
check(!store.db.skills?.some((s) => s.name === 'job-costing'), 'reset_skill goes back to the default');

// Turning a plugin off takes its tools, records and skills away on the next request
store.db = { ...store.db, plugins: { off: ['buildtrack.bids'], roles: {} } as PluginChoices };
const after = await connect(store);
const afterNames = (await after.listTools()).tools.map((t) => t.name);
check(!afterNames.includes('bid_comparison') && afterNames.includes('bills_owed'), 'Bids off: bid_comparison is gone, the rest stay');
check((await call(after, 'list_records', { collection: 'bids' })).error !== '', 'Bids off: its records are hidden');
check(!(await new SkillsClient(after).list()).skills.some((s) => s.frontmatter?.name === 'bid-leveling'), 'Bids off: its skill is hidden');
store.db = { ...store.db, plugins: { off: ['buildtrack.budgets'], roles: {} } };
const noBudgets = (await (await connect(store)).listTools()).tools.map((t) => t.name);
check(!noBudgets.includes('job_billing'), 'Budgets off: Invoices (which needs it) loses its tools too');

const meta = protectedResourceMetadata(new Request('https://app.example.com/mcp'), { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k' });
check(meta.resource === 'https://app.example.com/mcp' && meta.authorization_servers[0] === 'https://x.supabase.co/auth/v1', 'sign-in metadata points at the Supabase OAuth server');

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
