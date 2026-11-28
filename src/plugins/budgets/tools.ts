// Agent tools for budgets (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { defineTool, findJob, names, type PluginTools } from '../../agent/sdk';
import { budgetLabel, jobRollup, linesByBudget, totals } from './budgets';

const r2 = (n: number) => Math.round(n * 100) / 100;

export default {
  plugin: 'buildtrack.budgets',
  tools: [
    defineTool({
      name: 'job_budgets',
      title: "A job's proposals and change orders",
      description: "A job's contract (every approved proposal and change order, at cost and at price, with margin), what's awaiting approval, and each budget with its status and totals. Cost is the company's; price is the customer's.",
      input: z.object({ jobId: z.string().describe('The job id') }),
      run: ({ db }, { jobId }) => {
        const job = findJob(db, jobId);
        const n = names(db);
        const r = jobRollup(db, jobId);
        const byBudget = linesByBudget(db);
        return {
          job: job.name,
          contract: { cost: r2(r.contract.cost), price: r2(r.contract.price), marginPct: r.contract.price ? r2(((r.contract.price - r.contract.cost) / r.contract.price) * 100) : null, approvedBudgets: r.approvedCount },
          awaitingApproval: { cost: r2(r.pending.cost), price: r2(r.pending.price), budgets: r.pendingCount },
          budgets: db.budgets.filter((b) => b.jobId === jobId).map((b) => {
            const t = totals(byBudget.get(b.id) ?? []);
            return { id: b.id, label: budgetLabel(b), title: b.title, status: b.status, customer: n.party(b.partyId), cost: r2(t.cost), price: r2(t.price), lines: (byBudget.get(b.id) ?? []).length };
          }),
        };
      },
    }),
  ],
} satisfies PluginTools;
