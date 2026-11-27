// Job costing by cost code. It knows nothing about budgets, bids, bills or expenses: it reads
// the costs/v1 entries those plugins provide (see src/plugins/sdk.ts) and adds them up.
//
//   Budget     cost (not price) of the job's approved proposal and change-order lines
//   Committed  awarded subcontractor bids
//   Actual     approved vendor bills (open or paid) plus recorded expenses
//   Projected  the best guess at the final cost: the committed amount once a bid is awarded,
//              otherwise the budget, and never less than what's actually been spent
//   Variance   budget − projected (positive is under budget)
import type { CostCode } from '../../data';
import type { CostEntry } from '../sdk';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CostRow {
  code: CostCode | null; // null for amounts with no cost code
  key: string;
  budget: number;
  price: number; // what the customer pays for this code (approved lines)
  committed: number;
  actual: number;
  paid: number; // paid out so far
  projected: number;
  variance: number;
  entries: CostEntry[];
}

// A credit line (negative budget) stays a credit until money is actually spent against it.
export const projectedOf = (budget: number, committed: number, actual: number) => {
  const planned = committed > 0 ? committed : budget;
  return actual > 0 ? Math.max(planned, actual) : planned;
};

/** Costs by cost code (only codes with something in them), plus totals. */
export function jobCosts(entries: CostEntry[], costCodes: CostCode[]) {
  const rows = new Map<string, CostRow>();
  for (const e of entries) {
    const key = e.costCodeId && costCodes.some((c) => c.id === e.costCodeId) ? e.costCodeId : '';
    let r = rows.get(key);
    if (!r) {
      r = { code: costCodes.find((c) => c.id === key) ?? null, key, budget: 0, price: 0, committed: 0, actual: 0, paid: 0, projected: 0, variance: 0, entries: [] };
      rows.set(key, r);
    }
    r.entries.push(e);
    if (e.kind === 'budget') {
      r.budget += e.amount;
      r.price += e.price ?? e.amount;
    } else if (e.kind === 'committed') r.committed += e.amount;
    else {
      r.actual += e.amount;
      r.paid += e.paid ?? 0;
    }
  }

  const list = [...rows.values()].map((r) => {
    const projected = projectedOf(r.budget, r.committed, r.actual);
    return {
      ...r,
      budget: round2(r.budget), price: round2(r.price), committed: round2(r.committed),
      actual: round2(r.actual), paid: round2(r.paid), projected: round2(projected), variance: round2(r.budget - projected),
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
    actual: sum((r) => r.actual),
    paid: sum((r) => r.paid),
    projected,
    variance: sum((r) => r.variance),
    profit: round2(price - projected),
    margin: price ? ((price - projected) / price) * 100 : NaN,
  };
}
