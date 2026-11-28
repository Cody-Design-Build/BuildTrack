// Tests the agent server end to end on the sample data: a real MCP client connects over HTTP
// (in-process), lists the tools and skills, runs every tool, and saves a skill.
// Run with `npm run test:agent` (bundled by scripts/agent-test.mjs).
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { InMemoryServerEventBus, type ServerEventBus } from '@modelcontextprotocol/server';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import { seed, type Db, type PluginChoices } from '../src/data';
import { activeOf, normalizeChoices } from '../src/plugins/activation';
import { PLUGIN_BASES } from '../src/plugins/bases';
import { readFileSync } from 'node:fs';
import { lineDiff, parseSkillMarkdown, saveSkill, skillMarkdown } from '../src/skills';
import { eventsFor, mcpHandlerFor, protectedResourceMetadata } from '../src/agent/http';
import type { AgentContext } from '../src/agent/sdk';

let failures = 0;
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures++;
};

/** A connected client for a company whose data is `store.db`; saves go back into `store`. */
type Store = { db: Db; rpcs?: { fn: string; args?: Record<string, unknown> }[] };
type ConnectOptions = { modern?: boolean; elicit?: 'accept' | 'decline'; asked?: string[]; bus?: ServerEventBus; onToolsChanged?: (names: string[]) => void };

async function connect(store: Store, o: ConnectOptions = {}) {
  const ctx = (): AgentContext => ({
    db: store.db,
    plugins: activeOf(PLUGIN_BASES, normalizeChoices(store.db.plugins)),
    company: { id: 'c1', name: store.db.companyName },
    user: { email: 'dana@example.com', name: 'Dana Cole' },
    save: async (next) => void (store.db = next),
    rpc: async <T,>(fn: string, args?: Record<string, unknown>) => {
      (store.rpcs ??= []).push({ fn, args });
      const team = [{ user_id: 'u-dana', email: 'dana@example.com', role: 'owner', since: '2026-11-01', pending: false, expires_at: null }, { user_id: null, email: 'new@example.com', role: 'member', since: '2026-11-20', pending: true, expires_at: '2026-11-27' }];
      return (fn === 'company_team' ? team : fn === 'invite_member' ? '2026-12-04T00:00:00Z' : null) as T;
    },
  });
  // a fresh server for every request, as on Vercel
  const fetch = (url: string | URL, init?: RequestInit) => mcpHandlerFor(ctx(), o.bus).fetch(new Request(url, init));
  const client = new Client(
    { name: 'test', version: '1.0.0' },
    {
      ...(o.modern ? { versionNegotiation: { mode: 'auto' as const } } : {}),
      ...(o.elicit ? { capabilities: { elicitation: { form: {} } } } : {}),
      ...(o.onToolsChanged ? { listChanged: { tools: { onChanged: (_e: unknown, tools: { name: string }[] | null) => o.onToolsChanged!((tools ?? []).map((t) => t.name)) } } } : {}),
    },
  );
  if (o.elicit) {
    client.setRequestHandler('elicitation/create', async (req) => {
      o.asked?.push(String((req.params as { message?: string }).message));
      return o.elicit === 'accept' ? { action: 'accept', content: { confirm: true } } : { action: 'decline' };
    });
  }
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

const sample = seed();
// the signed-in person is a team member, so activity says who did what
const store: Store = { db: { ...sample, team: sample.team.map((t, i) => (i === 0 ? { ...t, email: 'dana@example.com' } : t)) } };
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
// Settings → Agents → Upload SKILL.md: the file is read, saved like save_skill, and served
const uploaded = parseSkillMarkdown(`---\nname: punch-lists\ndescription: >\n  How we run punch lists\n  at the end of a job.\n---\n\n# Punch lists\n\nWalk the job with the customer.\n`);
check(uploaded.name === 'punch-lists' && uploaded.description === 'How we run punch lists at the end of a job.' && uploaded.body.startsWith('# Punch lists'), 'an uploaded SKILL.md is read (folded description)');
const roundTrip = parseSkillMarkdown(skillMarkdown({ name: 'x-y', description: 'Says "hi": twice', body: 'Body' }));
check(roundTrip.description === 'Says "hi": twice' && roundTrip.body === 'Body', 'a downloaded SKILL.md reads back the same');
let notSkill = '';
try { parseSkillMarkdown('# no front matter'); } catch (e) { notSkill = (e as Error).message; }
check(notSkill.includes('front matter'), 'a file without front matter is refused with a reason');
const activePlugins = () => activeOf(PLUGIN_BASES, normalizeChoices(store.db.plugins));
store.db = saveSkill(store.db, activePlugins(), uploaded, 'Dana Cole');
const servedUpload = (await skills.list()).skills.find((s) => s.frontmatter?.name === 'punch-lists');
check(servedUpload && (await skills.read(servedUpload)).body?.includes('Walk the job'), 'an uploaded skill is served over MCP and reads back');
// switching off one of the company's own skills stops agents getting it
store.db = saveSkill(store.db, activePlugins(), { ...uploaded, off: true }, 'Dana Cole');
check(!(await skills.list()).skills.some((s) => s.frontmatter?.name === 'punch-lists'), "a company skill that's switched off isn't served");
check((await call(client, 'list_skills')).data.items.find((s: { name: string }) => s.name === 'punch-lists')?.status === 'off', 'list_skills shows it as off');
check(lineDiff('a\nb\nc', 'a\nc\nd').map((l) => l.kind[0]).join('') === 'srsa', 'line differences for What changed');

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

// ── Changing data ──────────────────────────────────────────────────────────────────────────
{
  const st: Store = { db: { ...store.db, plugins: undefined } };
  const c = await connect(st); // no confirmation forms: the agent has to ask in the conversation
  const job = st.db.jobs.find((j) => j.status === 'In Progress') ?? st.db.jobs[0];
  const code = st.db.costCodes[0].id;

  // jobs, contacts, tasks
  const acct = await call(c, 'create_account', { name: 'Brightwater Glass', types: ['Subcontractor'], trade: 'Glass' });
  check(acct.data?.id && st.db.accounts.some((a) => a.name === 'Brightwater Glass'), 'create_account adds an account');
  check((await call(c, 'create_account', { name: 'brightwater glass', types: ['Vendor'] })).error.includes('already'), 'create_account refuses a duplicate');
  const person = await call(c, 'create_person', { firstName: 'Rita', lastName: 'Moss', accountId: acct.data.id, title: 'Estimator' });
  check(st.db.memberships.some((m) => m.personId === person.data?.id && m.accountId === acct.data.id), 'create_person joins them to the account');
  const newJob = await call(c, 'create_job', { name: 'Pine Street ADU', customerId: person.data.id });
  check(st.db.jobLinks.some((l) => l.jobId === newJob.data?.id && l.role === 'Customer'), 'create_job links the customer');
  check(!(await call(c, 'update_job', { jobId: newJob.data.id, status: 'Estimating' })).error && st.db.jobs.find((j) => j.id === newJob.data.id)?.status === 'Estimating', 'update_job changes the status');
  check(!(await call(c, 'link_to_job', { jobId: newJob.data.id, partyId: acct.data.id, role: 'Subcontractor' })).error, 'link_to_job puts an account on a job');
  const task = await call(c, 'create_task', { name: 'Measure for glass', jobId: newJob.data.id, assigneeIds: [st.db.team[0].id] });
  check(!(await call(c, 'complete_task', { taskId: task.data.id })).error && st.db.tasks.find((t) => t.id === task.data.id)?.done, 'create_task and complete_task');

  // a proposal from draft to signed
  const bud = await call(c, 'create_budget', { jobId: newJob.data.id, kind: 'Proposal', title: 'ADU shell', lines: [{ group: 'Framing', name: 'Walls', costCodeId: code, quantity: 10, unit: 'hr', unitCost: 100, markup: 25 }] });
  check(bud.data?.cost === 1000 && bud.data.price === 1250 && bud.data.status === 'Draft', 'create_budget works out cost and price');
  check((await call(c, 'add_budget_lines', { budgetId: bud.data.id, lines: [{ group: 'Framing', name: 'Roof', costCodeId: 'nope', quantity: 1, unit: 'lump', unitCost: 1, markup: 0 }] })).error.includes('cost code'), 'a wrong cost code is refused');
  const ask = await call(c, 'set_budget_status', { budgetId: bud.data.id, status: 'Sent' });
  check(ask.data?.needsConfirmation && ask.data.change.includes('$1,250.00') && st.db.budgets.find((b) => b.id === bud.data.id)?.status === 'Draft', 'without a form, a status change asks first and changes nothing');
  check((await call(c, 'set_budget_status', { budgetId: bud.data.id, status: 'Sent', confirmed: true })).data?.status === 'Sent', 'with confirmed: true it goes ahead');
  check((await call(c, 'add_budget_lines', { budgetId: bud.data.id, lines: [{ group: 'x', name: 'y', costCodeId: code, quantity: 1, unit: 'ea', unitCost: 1, markup: 0 }] })).error.includes('locked'), 'a sent budget is locked');
  check((await call(c, 'set_budget_status', { budgetId: bud.data.id, status: 'Sent', confirmed: true })).error.includes('can move to'), 'an impossible change is refused before anyone is asked');
  check((await call(c, 'approve_budget', { budgetId: bud.data.id, signedBy: 'Rita Moss', date: '2026-11-27', confirmed: true })).data?.status === 'Approved', 'approve_budget records the signature');
  const log = st.db.activity.filter((a) => a.budgetId === bud.data.id).map((a) => a.text);
  check(log.some((t) => t.includes('by Dana Cole')), 'activity says the change was made by the signed-in person');

  // bill it, get paid
  const inv = await call(c, 'create_invoice', { jobId: newJob.data.id });
  check(inv.data?.contract === 1250, 'create_invoice bills against the approved budget');
  const lineId = inv.data.sections[0].lines[0].lineId;
  const half = await call(c, 'set_invoice_progress', { invoiceId: inv.data.id, lines: [{ lineId, percent: 50 }] });
  check(half.data?.thisInvoice === 625, 'set_invoice_progress bills 50% of the line');
  check(!(await call(c, 'set_invoice_status', { invoiceId: inv.data.id, status: 'Sent', confirmed: true })).error, 'set_invoice_status sends it');
  check((await call(c, 'set_invoice_progress', { invoiceId: inv.data.id, lines: [{ lineId, percent: 80 }] })).error.includes('locked'), 'a sent invoice is locked');
  const paid = await call(c, 'record_payment', { invoiceId: inv.data.id, amount: 625, date: '2026-11-27', method: 'Check', reference: '1001', confirmed: true });
  check(paid.data?.status === 'Paid' && paid.data.balance === 0, 'record_payment pays the invoice off');

  // a bill from a sub, approved and paid
  const bill = await call(c, 'create_bill', { jobId: newJob.data.id, vendorId: acct.data.id, vendorRef: 'BG-77', lines: [{ description: 'Glass', costCodeId: code, amount: 400 }] });
  check(bill.data?.amount === 400 && bill.data.status === 'Draft', 'create_bill enters a draft bill');
  check((await call(c, 'set_bill_status', { billId: bill.data.id, status: 'Open', confirmed: true })).data?.status === 'Open', 'set_bill_status approves it to pay');
  check((await call(c, 'record_bill_payment', { billId: bill.data.id, amount: 400, date: '2026-11-27', method: 'ACH', confirmed: true })).data?.status === 'Paid', 'record_bill_payment pays it');
  const costs = await call(c, 'job_costs', { jobId: newJob.data.id });
  check(costs.data?.totals.actual === 400 && costs.data.totals.budget === 1000, 'job costing sees the bill as actual cost against the budget');

  // bids: package, invite, send, price, award
  const pkg = await call(c, 'create_bid_package', { jobId: job.id, title: 'Glass and mirrors', costCodeId: code, items: [{ description: 'Shower glass', quantity: 2, unit: 'ea' }] });
  check(pkg.data?.status === 'Draft' && pkg.data.items.length === 1, 'create_bid_package');
  const invited = await call(c, 'invite_vendors', { packageId: pkg.data.id, vendorIds: [acct.data.id] });
  check(invited.data?.bids.length === 1, 'invite_vendors adds the sub');
  check((await call(c, 'mark_bids_sent', { packageId: pkg.data.id })).data?.status === 'Out for bid', 'mark_bids_sent puts the package out for bid');
  const bidId = invited.data.bids[0].id;
  check((await call(c, 'record_bid', { bidId, amount: 1800, exclusions: 'Hardware' })).data?.bids[0].amount === 1800, 'record_bid enters the price');
  const award = await call(c, 'award_bid', { bidId, confirmed: true });
  check(award.data?.status === 'Awarded' && st.db.bills.some((b) => b.id === award.data.draftBillId && b.status === 'Draft'), 'award_bid awards it and drafts the bill');

  // forms: the person confirms (or not) in the agent
  const asked: string[] = [];
  const yes = await connect(st, { modern: true, elicit: 'accept', asked });
  const inv2 = await call(yes, 'create_invoice', { jobId: job.id });
  if (inv2.data) {
    await call(yes, 'set_invoice_progress', { invoiceId: inv2.data.id, budgets: inv2.data.sections.map((x: { budgetId: string }) => ({ budgetId: x.budgetId, percent: 100 })) });
    const sent = await call(yes, 'set_invoice_status', { invoiceId: inv2.data.id, status: 'Sent' });
    check(sent.data?.status === 'Sent' && asked.some((m) => m.includes('as Sent')), 'with forms, the person is asked in the agent and the change goes ahead');
    const no = await connect(st, { modern: true, elicit: 'decline' });
    const declined = await call(no, 'set_invoice_status', { invoiceId: inv2.data.id, status: 'Void' });
    check(declined.data?.changed === false && st.db.invoices.find((i) => i.id === inv2.data.id)?.status === 'Sent', 'when the person says no, nothing changes');
  } else check(false, `create_invoice on ${job.name}: ${inv2.error}`);

  // settings
  const settings = await call(c, 'get_settings');
  check(settings.data?.plugins.length === PLUGIN_BASES.length && settings.data.themes.length > 0, 'get_settings lists plugins and themes');
  check((await call(c, 'set_plugin', { pluginId: 'buildtrack.jobs', on: false })).error.includes('always on'), "set_plugin won't turn off a core plugin");
  const off = await call(c, 'set_plugin', { pluginId: 'buildtrack.bills', on: false });
  check(off.data?.needsConfirmation && off.data.change.includes('Bids'), 'turning Bills off warns that Bids needs it');
  await call(c, 'set_plugin', { pluginId: 'buildtrack.bills', on: false, confirmed: true });
  check(!(await (await connect(st)).listTools()).tools.some((t) => t.name === 'award_bid'), 'with Bills off, the bid tools are gone on the next request');
  await call(c, 'set_plugin', { pluginId: 'buildtrack.bills', on: true });
  check(normalizeChoices(st.db.plugins).off.length === 0, 'turning it back on needs no confirmation');
  check((await call(c, 'set_company_theme', { theme: 'nope', confirmed: true })).error.includes('No theme'), 'set_company_theme refuses an unknown theme');
  const theme = settings.data.themes[1].id;
  check((await call(c, 'set_company_theme', { theme, mode: 'dark', confirmed: true })).data?.companyTheme.theme === theme && st.db.companyLook?.mode === 'dark', 'set_company_theme sets the company theme');
  check((await call(c, 'set_company_details', { licenceNumber: '999', confirmed: true })).data?.licenceNumber === '999', 'set_company_details changes the licence number');
  check((await call(c, 'list_members')).data?.team.length === 2, 'list_members reads the team through the database');
  await call(c, 'invite_member', { email: 'Sam@Example.com', role: 'admin', confirmed: true });
  check(st.rpcs?.some((r) => r.fn === 'invite_member' && r.args?.invite_email === 'sam@example.com' && r.args.invite_role === 'admin'), 'invite_member calls invite_member as the person');
  check((await call(c, 'set_member_role', { email: 'new@example.com', role: 'admin', confirmed: true })).error.includes('invite is open'), "set_member_role explains an invite isn't a member yet");
  await call(c, 'set_member_role', { email: 'dana@example.com', role: 'remove', confirmed: true });
  check(st.rpcs?.some((r) => r.fn === 'set_member_role' && r.args?.member === 'u-dana' && r.args.new_role === null), 'set_member_role removes with a null role');
  const toolInfo = (await c.listTools()).tools.find((t) => t.name === 'record_payment');
  check(toolInfo?.annotations?.destructiveHint === true && JSON.stringify(toolInfo.inputSchema).includes('confirmed'), 'tools that ask first are marked and take confirmed');
}

// ── The current protocol (2026-07-28) as well as the older one used above ─────────────────
{
  const st: Store = { db: { ...store.db, plugins: undefined } };
  const m = await connect(st, { modern: true });
  check((await m.listTools()).tools.length === (await (await connect(st)).listTools()).tools.length, 'modern and older clients get the same tools');
  check((await call(m, 'company_overview')).data?.company === st.db.companyName, 'tools work on the modern protocol');
  check((await new SkillsClient(m).list()).skills.length >= 6, 'skills work on the modern protocol');
}

// ── Telling connected agents about changes ─────────────────────────────────────────────────
{
  check(eventsFor({ collection: '$meta', id: 'plugins' }).some((e) => e.kind === 'tools_list_changed'), 'a plugin change means new tools');
  check(eventsFor({ collection: 'skills', id: 'job-costing' }).some((e) => e.kind === 'resource_updated' && e.uri === 'skill://job-costing/SKILL.md'), 'a skill change updates that skill');
  check(eventsFor({ collection: 'jobs', id: 'j1' }).length === 0, 'other records change nothing for agents');
  const st: Store = { db: { ...store.db, plugins: undefined } };
  const bus = new InMemoryServerEventBus();
  let seen: string[] | null = null;
  const listening = await connect(st, { modern: true, bus, onToolsChanged: (n) => (seen = n) });
  await new Promise((r) => setTimeout(r, 200));
  st.db = { ...st.db, plugins: { off: ['buildtrack.bids'], roles: {} } };
  bus.publish({ kind: 'tools_list_changed' });
  for (let i = 0; i < 40 && !seen; i++) await new Promise((r) => setTimeout(r, 50));
  check(seen !== null && !(seen as string[]).includes('award_bid') && (seen as string[]).includes('bills_owed'), 'a listening agent is told, and gets the new tool list');
  await listening.close();
}

const meta = protectedResourceMetadata(new Request('https://app.example.com/mcp'), { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k' });
check(meta.resource === 'https://app.example.com/mcp' && meta.authorization_servers[0] === 'https://x.supabase.co/auth/v1', 'sign-in metadata points at the Supabase OAuth server');

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
