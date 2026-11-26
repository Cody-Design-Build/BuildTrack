// Converts data saved by the old account/contact model into the people/accounts model.
//
// Old model: customer and vendor ACCOUNTS were containers, and every CONTACT belonged to
// exactly one of them (so one real person could exist twice). Jobs, documents, to-dos and
// activity each pointed at one account.
//
// New model: PEOPLE are standalone records. They can belong to any number of ACCOUNTS
// (through memberships with a title), and both people and accounts link to jobs with a role.
import type { Account, Budget, BudgetKind, BudgetLine, BudgetStatus, CostCode, CostType, Db, Doc, Expense, JobLink, Membership, Person } from './data';

interface LegacyAccount {
  id: string;
  type: 'customer' | 'vendor';
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  color: string;
  trade?: string;
}

interface LegacyContact {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  primary: boolean;
  color?: string;
}

interface LegacyLocation {
  id: string;
  accountId: string;
  name: string;
  address: string;
}

interface LegacyDb {
  accounts: LegacyAccount[];
  contacts: LegacyContact[];
  locations?: LegacyLocation[];
  jobs: ({ accountId: string; locationId: string } & Record<string, unknown>)[];
  docs?: ({ accountId: string } & Record<string, unknown>)[];
  todos?: ({ accountId: string } & Record<string, unknown>)[];
  activity?: ({ accountId: string } & Record<string, unknown>)[];
  [key: string]: unknown;
}

export const isLegacy = (raw: unknown): raw is LegacyDb =>
  !!raw && typeof raw === 'object' && Array.isArray((raw as LegacyDb).contacts) && !Array.isArray((raw as Db).people);

type LegacyScheduleDb = Omit<Db, 'tasks' | 'scheduleEntries'> & {
  todos?: Db['tasks'];
  tasks?: Omit<Db['scheduleEntries'][number], 'crewIds'>[];
};

export function migrateSchedule(db: Db | LegacyScheduleDb): Db {
  if ('scheduleEntries' in db) return db;
  const { todos = [], tasks = [], ...rest } = db;
  return { ...rest, tasks: todos, scheduleEntries: tasks.map((entry) => ({ ...entry, crewIds: [] })) };
}

const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim();

export function migrateLegacy(old: LegacyDb): LegacyScheduleDb {
  // People: one record per real person. Contacts with the same full name are the same person.
  const people: Person[] = [];
  const personFor = new Map<string, string>(); // legacy contact id -> person id
  const byName = new Map<string, Person>();
  for (const c of old.contacts) {
    const key = fullName(c).toLowerCase();
    const existing = key ? byName.get(key) : undefined;
    if (existing) {
      if (!existing.email) existing.email = c.email;
      if (!existing.phone) existing.phone = c.phone;
      personFor.set(c.id, existing.id);
      continue;
    }
    const p: Person = { id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, address: '', notes: '', color: c.color };
    people.push(p);
    if (key) byName.set(key, p);
    personFor.set(c.id, p.id);
  }

  const accounts: Account[] = old.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    types: [a.type === 'customer' ? 'Customer' : 'Vendor'],
    phone: a.phone,
    email: a.email,
    address: a.address,
    notes: a.notes,
    color: a.color,
    trade: a.trade || undefined,
  }));

  const memberships: Membership[] = old.contacts.map((c) => ({
    id: `m-${c.id}`,
    personId: personFor.get(c.id)!,
    accountId: c.accountId,
    title: c.title,
    primary: c.primary,
  }));

  // Jobs: the customer account and every person in it are linked with the Customer role,
  // and the job keeps its site address directly instead of through a location record.
  const locations = new Map((old.locations ?? []).map((l) => [l.id, l] as const));
  const jobLinks: JobLink[] = [];
  const jobs = old.jobs.map((j) => {
    const { accountId, locationId, ...rest } = j;
    if (accountId) {
      jobLinks.push({ id: `l-${j.id}-${accountId}`, jobId: j.id as string, partyId: accountId, role: 'Customer' });
      const seen = new Set<string>();
      for (const m of memberships.filter((m) => m.accountId === accountId)) {
        if (seen.has(m.personId)) continue;
        seen.add(m.personId);
        jobLinks.push({ id: `l-${j.id}-${m.personId}`, jobId: j.id as string, partyId: m.personId, role: 'Customer' });
      }
    }
    const loc = locations.get(locationId);
    return { ...rest, address: loc?.address || loc?.name || '' };
  });

  // Documents, to-dos and activity keep pointing at the same account (account ids are unchanged).
  const repoint = <T extends { accountId: string }>(xs: T[] = []) =>
    xs.map(({ accountId, ...rest }) => ({ ...rest, partyId: accountId }));

  const { contacts: _c, locations: _l, ...others } = old;
  return {
    ...(others as unknown as LegacyScheduleDb),
    people,
    accounts,
    memberships,
    jobLinks,
    jobs: jobs as unknown as Db['jobs'],
    docs: repoint(old.docs) as unknown as Db['docs'],
    todos: repoint(old.todos) as unknown as Db['tasks'],
    activity: repoint(old.activity) as unknown as Db['activity'],
  };
}

// ---------------------------------------------------------------------------------------------
// Budgets: from one budget table per job to proposals and change orders that own their lines.
//
// Old model: every job had a single list of budget items (each with "spent so far"), and a
// proposal or change order was a document header with only a total.
// New model: each proposal / change order is a Budget with its own BudgetLines, money spent
// is an Expense against a cost code, and documents keep only the other kinds.
// ---------------------------------------------------------------------------------------------

export interface LegacyBudgetItem {
  id: string;
  jobId: string;
  group: string;
  name: string;
  costType: CostType;
  quantity: number;
  unit: string;
  unitCost: number;
  markup: number;
  vendorId: string;
  actual: number;
}

type LegacyDoc = Omit<Doc, 'kind' | 'status'> & { kind: string; status: string };

export type PreBudgetDb = Omit<Db, 'costCodes' | 'budgets' | 'budgetLines' | 'expenses' | 'invoices' | 'payments' | 'docs'> & {
  items?: LegacyBudgetItem[];
  docs: LegacyDoc[];
};

export const DEFAULT_COST_CODES: [string, string][] = [
  ['01', 'Project Management'],
  ['02', 'Design & Permits'],
  ['03', 'Demolition'],
  ['04', 'Site Work'],
  ['05', 'Foundation & Structure'],
  ['06', 'Framing'],
  ['07', 'Roofing'],
  ['08', 'Windows & Doors'],
  ['09', 'Plumbing'],
  ['10', 'HVAC'],
  ['11', 'Electrical'],
  ['12', 'Insulation'],
  ['13', 'Drywall'],
  ['14', 'Tile'],
  ['15', 'Cabinets & Finishes'],
  ['16', 'Flooring'],
  ['17', 'Painting'],
  ['18', 'Fixtures'],
  ['99', 'General'],
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Cost-code list plus a finder that adds a code for any name it hasn't seen. */
export function costCodeBook(codes: CostCode[] = DEFAULT_COST_CODES.map(([number, name]) => ({ id: `cc-${slug(name)}`, number, name }))) {
  const list = [...codes];
  const idFor = (name: string) => {
    const n = name.trim() || 'General';
    const hit = list.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (hit) return hit.id;
    const used = list.map((c) => Number(c.number)).filter((x) => Number.isFinite(x) && x < 99);
    const code: CostCode = { id: `cc-${slug(n)}`, number: String(Math.max(0, ...used) + 1).padStart(2, '0'), name: n };
    list.push(code);
    return code.id;
  };
  return { list, idFor };
}

export const isBudgetDb = (db: unknown): db is Db => Array.isArray((db as Db)?.budgets);

const BUDGET_DOC_KINDS = ['Proposal', 'Change Order'];

/** The job's customer to address a budget to: an account if there is one, else a person. */
function customerOf(db: Pick<Db, 'jobLinks' | 'accounts'>, jobId: string) {
  const links = db.jobLinks.filter((l) => l.jobId === jobId && l.role === 'Customer');
  const accountIds = new Set(db.accounts.map((a) => a.id));
  return (links.find((l) => accountIds.has(l.partyId)) ?? links[0])?.partyId ?? '';
}

export function migrateBudgets(old: PreBudgetDb, now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19)): Db {
  const { items = [], docs, ...rest } = old;
  const book = costCodeBook();
  const budgets: Budget[] = [];
  const budgetLines: BudgetLine[] = [];
  const expenses: Expense[] = [];
  const used = new Set<string>();
  const status = (s: string): BudgetStatus => (s === 'Draft' ? 'Draft' : s === 'Pending' ? 'Sent' : 'Approved');

  // Each job's budget table becomes one proposal. If the job already had a proposal document,
  // the lines go onto it (keeping its number and status); otherwise a signed job's budget is
  // treated as approved and anything else as a draft.
  for (const job of old.jobs) {
    const jobItems = items.filter((i) => i.jobId === job.id);
    if (jobItems.length === 0) continue;
    const doc = docs.find((d) => d.jobId === job.id && d.kind === 'Proposal');
    if (doc) used.add(doc.id);
    const b: Budget = {
      id: doc?.id ?? `bud-${job.id}`,
      jobId: job.id,
      kind: 'Proposal',
      number: doc?.number ?? `${job.id.replace(/\D/g, '') || '1'}-1`,
      title: job.name,
      status: doc ? status(doc.status) : job.total > 0 ? 'Approved' : 'Draft',
      partyId: doc?.partyId || customerOf(old, job.id),
      notes: '',
      // the job's original scope: date it from the job's start, so change orders count it as earlier
      created: job.start ? `${job.start}T00:00:00` : now,
      updated: now,
    };
    budgets.push(b);
    for (const i of jobItems) {
      const costCodeId = book.idFor(i.group);
      budgetLines.push({
        id: i.id, budgetId: b.id, group: i.group, costCodeId, name: i.name, description: '',
        costType: i.costType, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost, markup: i.markup, vendorId: i.vendorId,
      });
      if (i.actual) {
        expenses.push({ id: `e-${i.id}`, jobId: job.id, costCodeId, date: now.slice(0, 10), amount: i.actual, vendorId: i.vendorId, description: `${i.name} (spent to date)`, budgetLineId: i.id });
      }
    }
  }

  // Proposal and change-order documents without a budget table keep their total as one line.
  for (const d of docs) {
    if (!BUDGET_DOC_KINDS.includes(d.kind) || used.has(d.id)) continue;
    const start = old.jobs.find((j) => j.id === d.jobId)?.start;
    const b: Budget = {
      id: d.id, jobId: d.jobId, kind: d.kind as BudgetKind, number: d.number, title: '',
      status: status(d.status), partyId: d.partyId, notes: '',
      // proposals date from the job's start (see above); change orders from when they were converted
      created: d.kind === 'Proposal' && start ? `${start}T00:00:00` : now, updated: now,
    };
    budgets.push(b);
    budgetLines.push({
      id: `${d.id}-l1`, budgetId: d.id, group: 'Scope of work', costCodeId: book.idFor('General'), name: 'Scope of work', description: '',
      costType: 'Other', quantity: 1, unit: 'lump', unitCost: d.amount, markup: 0, vendorId: '',
    });
  }

  return {
    ...rest,
    docs: docs.filter((d) => !BUDGET_DOC_KINDS.includes(d.kind)) as Doc[],
    costCodes: book.list,
    budgets,
    budgetLines,
    expenses,
    invoices: [],
    payments: [],
  };
}
