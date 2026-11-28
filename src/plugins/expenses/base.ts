// Expenses recorded against a job (e.g. receipts). No screens yet: this plugin only feeds
// job costing, as actual cost that's already paid.
import { definePluginBase, type CostEntry } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.expenses',
  name: 'Expenses',
  description: 'Receipts and other spending on a job, counted as actual cost in job costing.',
  collections: ['expenses'],
  costEntries: (db, jobId): CostEntry[] =>
    db.expenses
      .filter((e) => !jobId || e.jobId === jobId)
      .map((e) => ({
        jobId: e.jobId, costCodeId: e.costCodeId, kind: 'actual', amount: e.amount, paid: e.amount, vendorId: e.vendorId || undefined, date: e.date,
        label: `Expense · ${e.description || e.date}`,
        source: { plugin: 'buildtrack.expenses', id: e.id },
      })),
  removeParty: (d, id) => ({ ...d, expenses: d.expenses.map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)) }),
});
