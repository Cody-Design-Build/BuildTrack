// Agent tools for job costing (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { defineTool, findJob, type PluginTools } from '../../agent/sdk';
import { costEntries } from '../registry';
import { jobCosts } from './costing';

const r2 = (n: number) => Math.round(n * 10) / 10;

export default {
  plugin: 'buildtrack.costing',
  tools: [
    defineTool({
      name: 'job_costs',
      title: 'Job costs by cost code',
      description: "One job's costs by cost code: budget (at cost), committed (awarded bids), actual (approved bills and expenses), paid out, projected and variance (budget minus projected; negative is over budget), with totals, projected profit and margin.",
      input: z.object({ jobId: z.string().describe('The job id') }),
      run: ({ db }, { jobId }) => {
        const job = findJob(db, jobId);
        const c = jobCosts(costEntries(db, jobId), db.costCodes);
        return {
          job: job.name,
          totals: { budget: c.budget, contractPrice: c.price, committed: c.committed, actual: c.actual, paid: c.paid, projected: c.projected, variance: c.variance, projectedProfit: c.profit, marginPct: Number.isFinite(c.margin) ? r2(c.margin) : null },
          costCodes: c.rows.map((r) => ({
            costCode: r.code ? `${r.code.number} ${r.code.name}` : 'Not coded', costCodeId: r.code?.id ?? '',
            budget: r.budget, price: r.price, committed: r.committed, actual: r.actual, paid: r.paid, projected: r.projected, variance: r.variance,
            entries: r.entries.map((e) => ({ kind: e.kind, amount: e.amount, label: e.label, date: e.date, source: e.source })),
          })),
        };
      },
    }),
  ],
} satisfies PluginTools;
