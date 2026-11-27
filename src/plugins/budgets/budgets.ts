// Budget rules shared by the job page, the budget page and the Budgets list.
import type { Activity, Budget, BudgetKind, BudgetLine, BudgetStatus, Db, StoredFile } from '../../data';
import { meOf, lineCost, linePrice, localIso, uid } from '../../store';
import type { CostEntry } from '../sdk';

export const BUDGET_STATUS_COLOR: Record<BudgetStatus, string> = {
  Draft: '#2b7fff',
  Sent: '#f0b100',
  Approved: '#00c950',
  Declined: '#fb2c36',
  Void: '#6b7280',
};

/** Only drafts can be edited. Once sent, a budget is locked; clone it to make changes. */
export const isEditable = (b: Pick<Budget, 'status'>) => b.status === 'Draft';

/** What a budget in each status can be moved to. */
export const NEXT_STATUSES: Record<BudgetStatus, BudgetStatus[]> = {
  Draft: ['Sent'],
  Sent: ['Approved', 'Declined', 'Void'],
  Approved: ['Void'],
  Declined: [],
  Void: [],
};

export function totals(lines: Pick<BudgetLine, 'quantity' | 'unitCost' | 'markup'>[]) {
  const cost = lines.reduce((s, l) => s + lineCost(l), 0);
  const price = lines.reduce((s, l) => s + linePrice(l), 0);
  return { cost, price, profit: price - cost, margin: price ? ((price - cost) / price) * 100 : NaN };
}

export { pct } from '../../store';

export const budgetLabel = (b: Pick<Budget, 'kind' | 'number'>) => `${b.kind} ${b.number}`;

/** Lines for every budget, looked up once. */
export function linesByBudget(db: Db) {
  const m = new Map<string, BudgetLine[]>();
  for (const l of db.budgetLines) m.set(l.budgetId, [...(m.get(l.budgetId) ?? []), l]);
  return m;
}

/** The job's money picture: everything approved (every signed proposal and change order), awaiting signature, and spent. */
export function jobRollup(db: Db, jobId: string) {
  const byBudget = linesByBudget(db);
  const sum = (bs: Budget[]) => bs.reduce((s, b) => {
    const t = totals(byBudget.get(b.id) ?? []);
    return { cost: s.cost + t.cost, price: s.price + t.price };
  }, { cost: 0, price: 0 });
  const budgets = db.budgets.filter((b) => b.jobId === jobId);
  const approved = budgets.filter((b) => b.status === 'Approved');
  const pending = sum(budgets.filter((b) => b.status === 'Sent'));
  const spent = db.expenses.filter((e) => e.jobId === jobId).reduce((s, e) => s + e.amount, 0);
  return {
    contract: sum(approved), // the job's contract: all approved budgets together
    pending,
    pendingCount: budgets.filter((b) => b.status === 'Sent').length,
    draftCount: budgets.filter((b) => b.status === 'Draft').length,
    approvedCount: approved.length,
    spent,
  };
}

/** Next number for a budget on a job, e.g. "12-3" (job number, then a running count). */
export function nextBudgetNumber(db: Db, jobId: string) {
  const prefix = `${jobId.replace(/\D/g, '') || '1'}-`;
  const seqs = db.budgets.filter((b) => b.jobId === jobId && b.number.startsWith(prefix)).map((b) => Number(b.number.slice(prefix.length)));
  return prefix + (Math.max(0, ...seqs.filter(Number.isFinite)) + 1);
}

const nowIso = () => localIso();

/** An activity-feed entry for something that happened to a budget. */
export function logBudget(d: Db, b: Budget, what: string): Activity {
  const p = d.people.find((x) => x.id === b.partyId);
  const who = p ? `${p.firstName} ${p.lastName}`.trim() : d.accounts.find((a) => a.id === b.partyId)?.name ?? '';
  const job = d.jobs.find((j) => j.id === b.jobId);
  const me = meOf(d)?.name ?? 'You';
  return {
    id: uid('a'),
    date: nowIso(),
    partyId: b.partyId,
    jobId: b.jobId,
    title: who,
    doc: budgetLabel(b),
    amount: Math.round(totals(d.budgetLines.filter((l) => l.budgetId === b.id)).price),
    text: `${what} by ${me}${job ? ` on ${job.name}` : ''}`,
    color: what === 'Created' || what.startsWith('Cloned') ? '#2b7fff' : BUDGET_STATUS_COLOR[b.status],
    budgetId: b.id,
  };
}

/** Sets a signed job's contract total to the sum of its approved budgets. */
function syncJobTotal(d: Db, jobId: string): Db {
  const r = jobRollup(d, jobId);
  if (r.approvedCount === 0) return d;
  return { ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, total: Math.round(r.contract.price) } : j)) };
}

/** Adds a new draft budget to a job. Pass the id in so callers can open it straight away. */
export function createBudget(d: Db, jobId: string, kind: BudgetKind, partyId: string, id = uid('bud')): Db {
  const t = nowIso();
  const b: Budget = { id, jobId, kind, number: nextBudgetNumber(d, jobId), title: '', status: 'Draft', partyId, notes: '', created: t, updated: t };
  const next = { ...d, budgets: [...d.budgets, b] };
  return { ...next, activity: [...next.activity, logBudget(next, b, 'Created')] };
}

/** Copies a budget and its lines as a new draft, e.g. to make an alternate or revise a sent one. */
export function cloneBudget(d: Db, id: string, newId = uid('bud')): Db {
  const src = d.budgets.find((b) => b.id === id);
  if (!src) return d;
  const t = nowIso();
  const b: Budget = {
    ...src,
    id: newId,
    number: nextBudgetNumber(d, src.jobId),
    title: src.title ? `${src.title} (copy)` : '',
    status: 'Draft',
    created: t,
    updated: t,
    clonedFromId: src.id,
    statusDates: {},
    approval: undefined,
    signedCopy: undefined,
  };
  const lines = d.budgetLines.filter((l) => l.budgetId === id).map((l) => ({ ...l, id: uid('bl'), budgetId: b.id }));
  const next = { ...d, budgets: [...d.budgets, b], budgetLines: [...d.budgetLines, ...lines] };
  return { ...next, activity: [...next.activity, logBudget(next, b, `Cloned from ${budgetLabel(src)}`)] };
}

export function setBudgetStatus(d: Db, id: string, status: BudgetStatus): Db {
  const src = d.budgets.find((b) => b.id === id);
  if (!src || !NEXT_STATUSES[src.status].includes(status)) return d;
  const t = nowIso();
  const b = { ...src, status, updated: t, statusDates: { ...src.statusDates, [status]: t } };
  const next = { ...d, budgets: d.budgets.map((x) => (x.id === id ? b : x)) };
  return syncJobTotal({ ...next, activity: [...next.activity, logBudget(next, b, `Marked as ${status.toLowerCase()}`)] }, b.jobId);
}

/** Other proposals on the same job still out with the customer, i.e. alternates to decline when one is signed. */
export const openAlternates = (db: Db, b: Budget) =>
  b.kind === 'Proposal' ? db.budgets.filter((x) => x.jobId === b.jobId && x.id !== b.id && x.kind === 'Proposal' && x.status === 'Sent') : [];

/**
 * Records the customer's signature: who signed and when, optionally the signed copy, and
 * optionally declines the alternates that weren't chosen.
 */
export function approveBudget(d: Db, id: string, opts: { signedBy: string; date: string; signedCopy?: StoredFile; declineIds?: string[] }): Db {
  const src = d.budgets.find((b) => b.id === id);
  if (!src || !NEXT_STATUSES[src.status].includes('Approved')) return d;
  const t = nowIso();
  const signedAt = `${opts.date}T12:00:00`;
  const b: Budget = {
    ...src,
    status: 'Approved',
    updated: t,
    statusDates: { ...src.statusDates, Approved: signedAt },
    approval: { signedBy: opts.signedBy.trim(), date: opts.date },
    signedCopy: opts.signedCopy ?? src.signedCopy,
  };
  let next: Db = { ...d, budgets: d.budgets.map((x) => (x.id === id ? b : x)) };
  const who = opts.signedBy.trim();
  next = { ...next, activity: [...next.activity, logBudget(next, b, `Marked as approved${who ? ` (signed by ${who})` : ''}`)] };
  if (opts.signedCopy) next = { ...next, activity: [...next.activity, logBudget(next, b, `Signed copy attached (${opts.signedCopy.name})`)] };
  for (const other of opts.declineIds ?? []) {
    if (other !== id) next = setBudgetStatus(next, other, 'Declined');
  }
  return syncJobTotal(next, b.jobId);
}

/** Attaches, replaces or removes the signed copy of a sent or approved budget. */
export function setSignedCopy(d: Db, id: string, file: StoredFile | undefined): Db {
  const src = d.budgets.find((b) => b.id === id);
  if (!src || (src.status !== 'Sent' && src.status !== 'Approved')) return d;
  const b: Budget = { ...src, signedCopy: file, updated: nowIso() };
  const next = { ...d, budgets: d.budgets.map((x) => (x.id === id ? b : x)) };
  const what = file ? `Signed copy ${src.signedCopy ? 'replaced' : 'attached'} (${file.name})` : 'Signed copy removed';
  return { ...next, activity: [...next.activity, logBudget(next, b, what)] };
}

/** Deletes a draft budget and its lines. Sent and signed budgets can't be deleted, only voided. */
export function deleteBudget(d: Db, id: string): Db {
  const b = d.budgets.find((x) => x.id === id);
  if (!b || !isEditable(b)) return d;
  const lineIds = new Set(d.budgetLines.filter((l) => l.budgetId === id).map((l) => l.id));
  return {
    ...d,
    budgets: d.budgets.filter((x) => x.id !== id),
    budgetLines: d.budgetLines.filter((l) => l.budgetId !== id),
    expenses: d.expenses.map((e) => (e.budgetLineId && lineIds.has(e.budgetLineId) ? { ...e, budgetLineId: undefined } : e)),
  };
}

/** Edits a draft budget's own fields or lines; refuses anything locked. */
/**
 * What was approved on the job before this budget: every approved proposal and change order
 * created before it. Gives a change-order document its "previously approved / this / new" summary.
 */
export function approvedBefore(db: Db, b: Budget) {
  const byBudget = linesByBudget(db);
  return db.budgets
    .filter((x) => x.jobId === b.jobId && x.id !== b.id && x.status === 'Approved' && x.created < b.created)
    .reduce((s, x) => s + totals(byBudget.get(x.id) ?? []).price, 0);
}

export function editBudget(d: Db, id: string, fn: (b: Budget, lines: BudgetLine[]) => { budget?: Partial<Budget>; lines?: BudgetLine[] }): Db {
  const b = d.budgets.find((x) => x.id === id);
  if (!b || !isEditable(b)) return d;
  const own = d.budgetLines.filter((l) => l.budgetId === id);
  const res = fn(b, own);
  const budgets = d.budgets.map((x) => (x.id === id ? { ...x, ...res.budget, updated: nowIso() } : x));
  if (!res.lines) return { ...d, budgets };
  // keep the budget's lines together, in their new order, where the first one used to be
  const first = d.budgetLines.findIndex((l) => l.budgetId === id);
  const others = d.budgetLines.filter((l) => l.budgetId !== id);
  const at = first < 0 ? others.length : d.budgetLines.slice(0, first).filter((l) => l.budgetId !== id).length;
  return { ...d, budgets, budgetLines: [...others.slice(0, at), ...res.lines, ...others.slice(at)] };
}

/** costs/v1: each line of an approved proposal or change order is budgeted cost (and price). */
export function budgetCostEntries(db: Db, jobId?: string): CostEntry[] {
  const approved = new Map(db.budgets.filter((b) => b.status === 'Approved' && (!jobId || b.jobId === jobId)).map((b) => [b.id, b] as const));
  return db.budgetLines.flatMap((l) => {
    const b = approved.get(l.budgetId);
    if (!b) return [];
    const cost = lineCost(l);
    return [{
      jobId: b.jobId, costCodeId: l.costCodeId, kind: 'budget' as const, amount: cost, price: cost * (1 + l.markup / 100),
      vendorId: l.vendorId || undefined, label: `${budgetLabel(b)} · ${l.name}`,
      source: { plugin: 'buildtrack.budgets', id: l.id, href: `/budgets/${b.id}` },
    }];
  });
}
