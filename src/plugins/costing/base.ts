import { definePluginBase } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.costing',
  name: 'Job costing',
  description: 'Budget, committed, actual and projected cost for each cost code, with variance and profit.',
  role: { id: 'costing', label: 'Job costing' },
  skills: [
    {
      name: 'job-costing',
      description: 'How BuildTrack works out job costs by cost code: budget, committed, actual, projected, variance and profit. Use for questions like "is this job over budget" or "what will we make on it".',
      body: `# Job costing

Job costing is by **cost code** (\`costCodes\`, e.g. "08 Plumbing"). For each code on a job:

- **Budget**: the **cost** (not price) of the job's approved proposal and change-order lines.
- **Committed**: awarded subcontractor bids.
- **Actual**: approved vendor bills (open or paid) plus recorded expenses. **Paid** is how much of that has been paid out.
- **Projected**: the committed amount once a bid is awarded, otherwise the budget, and never less than actual.
- **Variance**: budget − projected. Positive is under budget; negative is over.

Totals give the projected cost, and with the contract price, the projected **profit** and **margin**.

## Answering questions
- Use \`job_costs\` for one job: every cost code with these columns, plus totals.
- "Over budget" means negative variance. Call out codes where actual already exceeds budget, and codes with budget but nothing committed yet (still at risk).
- Don't confuse cost with price: margin = (price − cost) / price.`,
    },
  ],
});
