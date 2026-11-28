// Agent tools for invoices (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { defineTool, findJob, names, type PluginTools } from '../../agent/sdk';
import { linesByBudget } from '../budgets/budgets';
import { invoiceLabel, invoiceMoney, invoiceStage, jobBilling, todayYmd } from './invoices';

export default {
  plugin: 'buildtrack.invoices',
  tools: [
    defineTool({
      name: 'job_billing',
      title: "A job's billing",
      description: "One job's billing to the customer: contract (approved budgets at price), billed (sent and paid invoices), received, outstanding, overdue, drafts not yet sent and left to bill, plus each invoice and payment received.",
      input: z.object({ jobId: z.string().describe('The job id') }),
      run: ({ db }, { jobId }) => {
        const job = findJob(db, jobId);
        const b = jobBilling(db, jobId);
        const byBudget = linesByBudget(db);
        return {
          job: job.name,
          contract: b.contract, billed: b.billed, received: b.received, outstanding: b.outstanding, overdue: b.overdue, drafts: b.drafts, leftToBill: b.left,
          invoices: db.invoices.filter((i) => i.jobId === jobId).map((i) => ({ id: i.id, label: invoiceLabel(i), date: i.date, due: i.due, stage: invoiceStage(db, i, byBudget), ...invoiceMoney(db, i, byBudget) })),
          paymentsReceived: b.payments.map((p) => ({ date: p.date, amount: p.amount, method: p.method, reference: p.reference, invoiceId: p.invoiceId })),
        };
      },
    }),
    defineTool({
      name: 'open_invoices',
      title: 'Unpaid customer invoices',
      description: 'Every sent invoice that still has money due, across all jobs, with the customer, amount, paid, balance, due date and whether it is overdue. Oldest due first.',
      input: z.object({}),
      run: ({ db }) => {
        const n = names(db);
        const byBudget = linesByBudget(db);
        const today = todayYmd();
        const open = db.invoices
          .filter((i) => i.status === 'Sent')
          .map((i) => ({ i, m: invoiceMoney(db, i, byBudget) }))
          .filter(({ m }) => m.balance > 0)
          .sort((a, b) => (a.i.due || '9').localeCompare(b.i.due || '9'))
          .map(({ i, m }) => ({ id: i.id, label: invoiceLabel(i), job: n.job(i.jobId), jobId: i.jobId, customer: n.party(i.partyId), date: i.date, due: i.due, overdue: !!i.due && i.due < today, amount: m.amount, paid: m.paid, balance: m.balance }));
        const sum = (f: (x: (typeof open)[number]) => number) => Math.round(open.reduce((s, x) => s + f(x), 0) * 100) / 100;
        return { today, outstanding: sum((x) => x.balance), overdue: sum((x) => (x.overdue ? x.balance : 0)), invoices: open };
      },
    }),
  ],
} satisfies PluginTools;
