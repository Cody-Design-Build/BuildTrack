// Job costing: for each cost code on a job, what we planned to spend, what we've agreed to
// spend, and what we've actually spent.
//
//   Budget     cost (not price) of the job's approved proposal and change-order lines
//   Committed  awarded subcontractor bids
//   Actual     approved vendor bills (open or paid) plus recorded expenses
//   Projected  the best guess at the final cost: the committed amount once a bid is awarded,
//              otherwise the budget, and never less than what's actually been spent
//   Variance   budget − projected (positive is under budget)
import type { CostCode, Db } from './data';
import { lineCost } from './store';
import { billAmount } from './bills';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CostRow {
  code: CostCode | null; // null for amounts with no cost code
  key: string;
  budget: number;
  price: number; // what the customer pays for this code (approved lines)
  committed: number;
  billed: number; // approved bills
  expenses: number;
  actual: number;
  paid: number; // paid out on bills
  projected: number;
  variance: number;
}

// A credit line (negative budget) stays a credit until money is actually spent against it.
const projectedOf = (budget: number, committed: number, actual: number) => {
  const planned = committed > 0 ? committed : budget;
  return actual > 0 ? Math.max(planned, actual) : planned;
};

/** The job's costs by cost code (only codes with something in them), plus totals. */
export function jobCosts(db: Db, jobId: string) {
  const rows = new Map<string, CostRow>();
  const row = (codeId: string) => {
    const key = codeId && db.costCodes.some((c) => c.id === codeId) ? codeId : '';
    let r = rows.get(key);
    if (!r) {
      r = { code: db.costCodes.find((c) => c.id === key) ?? null, key, budget: 0, price: 0, committed: 0, billed: 0, expenses: 0, actual: 0, paid: 0, projected: 0, variance: 0 };
      rows.set(key, r);
    }
    return r;
  };

  const approved = new Set(db.budgets.filter((b) => b.jobId === jobId && b.status === 'Approved').map((b) => b.id));
  for (const l of db.budgetLines) {
    if (!approved.has(l.budgetId)) continue;
    const r = row(l.costCodeId);
    r.budget += lineCost(l);
    r.price += lineCost(l) * (1 + l.markup / 100);
  }

  const packages = new Map(db.bidPackages.filter((p) => p.jobId === jobId).map((p) => [p.id, p] as const));
  for (const b of db.bids) {
    const p = packages.get(b.packageId);
    if (p && b.status === 'Awarded') row(p.costCodeId).committed += b.amount;
  }

  for (const bill of db.bills) {
    if (bill.jobId !== jobId || (bill.status !== 'Open' && bill.status !== 'Paid')) continue;
    const total = billAmount(bill);
    const paid = db.payments.filter((p) => p.billId === bill.id).reduce((s, p) => s + p.amount, 0);
    for (const l of bill.lines) {
      const r = row(l.costCodeId);
      r.billed += l.amount;
      // spread what's been paid across the bill's lines in proportion to their amounts
      if (total) r.paid += (paid * l.amount) / total;
    }
  }

  for (const e of db.expenses) if (e.jobId === jobId) row(e.costCodeId).expenses += e.amount;

  const list = [...rows.values()].map((r) => {
    const actual = r.billed + r.expenses;
    const projected = projectedOf(r.budget, r.committed, actual);
    return {
      ...r,
      budget: round2(r.budget), price: round2(r.price), committed: round2(r.committed), billed: round2(r.billed), expenses: round2(r.expenses),
      actual: round2(actual), paid: round2(r.paid), projected: round2(projected), variance: round2(r.budget - projected),
    };
  });
  list.sort((a, b) => (a.code ? a.code.number : '~').localeCompare(b.code ? b.code.number : '~'));

  const sum = (f: (r: CostRow) => number) => round2(list.reduce((s, r) => s + f(r), 0));
  const price = sum((r) => r.price);
  const projected = sum((r) => r.projected);
  return {
    rows: list,
    budget: sum((r) => r.budget),
    price,
    committed: sum((r) => r.committed),
    billed: sum((r) => r.billed),
    expenses: sum((r) => r.expenses),
    actual: sum((r) => r.actual),
    paid: sum((r) => r.paid),
    projected,
    variance: sum((r) => r.variance),
    profit: round2(price - projected),
    margin: price ? ((price - projected) / price) * 100 : NaN,
  };
}

/** The job's approved budgeted cost for one cost code (what bids on a package are compared with). */
export function budgetForCode(db: Db, jobId: string, costCodeId: string) {
  if (!costCodeId) return 0;
  const approved = new Set(db.budgets.filter((b) => b.jobId === jobId && b.status === 'Approved').map((b) => b.id));
  return round2(db.budgetLines.filter((l) => approved.has(l.budgetId) && l.costCodeId === costCodeId).reduce((s, l) => s + lineCost(l), 0));
}
