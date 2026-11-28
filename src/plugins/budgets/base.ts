import { definePluginBase } from '../sdk';
import { budgetCostEntries } from './budgets';

export default definePluginBase({
  id: 'buildtrack.budgets',
  name: 'Budgets',
  description: 'Proposals and change orders: lines with cost and markup, a customer document, signing and approval.',
  collections: ['budgets', 'budgetLines'],
  costEntries: budgetCostEntries,
  filesInUse: (db) => db.budgets.flatMap((b) => (b.signedCopy ? [b.signedCopy.fileId] : [])),
  removeParty: (d, id) => ({
    ...d,
    budgets: d.budgets.map((x) => (x.partyId === id ? { ...x, partyId: '' } : x)),
    budgetLines: d.budgetLines.map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)),
  }),
  skills: [
    {
      name: 'proposals-and-change-orders',
      description: 'How proposals and change orders (budgets) work: statuses, locking, cost versus price, and what makes up a job\'s contract. Use before answering questions about what a customer signed or what a job is worth.',
      body: `# Proposals and change orders

In BuildTrack each proposal or change order is a **budget**: its own record (\`budgets\`) with its own lines (\`budgetLines\`, linked by \`budgetId\`) and its own customer document.

## Statuses
- **Draft**: being written; the only status that can be edited.
- **Sent**: locked so it always matches what the customer saw. To change a sent budget, clone it and send the copy.
- **Approved**: the customer signed. Records who signed and when, and may have a signed copy attached.
- **Declined** and **Void**: no longer count.

## Money
- Each line has a quantity, unit cost and markup (percent). Cost = quantity × unit cost. Price = cost × (1 + markup / 100).
- The customer only ever sees **price**, never cost or markup. Never put cost or markup in anything meant for a customer.
- Lines can be negative (credits).
- A job's **contract** is the total price of all its **Approved** budgets (proposals and change orders together). Sent ones are "awaiting approval".
- Every line has a cost code (\`costCodeId\`, see \`costCodes\`); that is what job costing totals by.

## Answering questions
- Use \`job_budgets\` for a job's contract, margin and the list of budgets with their totals.
- Use \`list_records\` with \`budgets\` or \`budgetLines\` for detail. Always say whether an amount is cost or price.`,
    },
  ],
});
