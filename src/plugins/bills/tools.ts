// Agent tools for vendor bills (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { defineTool, names, type PluginTools } from '../../agent/sdk';
import { todayYmd } from '../invoices/invoices';
import { billLabel, billMoney, billStage, payables } from './bills';

export default {
  plugin: 'buildtrack.bills',
  tools: [
    defineTool({
      name: 'bills_owed',
      title: 'What we owe vendors',
      description: 'Everything owed to vendors and subcontractors, across all jobs or for one: totals (approved, paid, owed, overdue, due in the next 7 days, drafts waiting for approval) and each open bill with its vendor, due date and balance. Soonest due first.',
      input: z.object({ jobId: z.string().optional().describe('Only this job (leave out for every job)') }),
      run: ({ db }, { jobId }) => {
        const n = names(db);
        const bills = db.bills.filter((b) => !jobId || b.jobId === jobId);
        const today = todayYmd();
        return {
          today,
          totals: payables(db, bills),
          openBills: bills
            .filter((b) => b.status === 'Open')
            .sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))
            .map((b) => ({ id: b.id, label: billLabel(b), vendor: n.party(b.vendorId), vendorRef: b.vendorRef, title: b.title, job: n.job(b.jobId), jobId: b.jobId, due: b.due, stage: billStage(db, b, today), ...billMoney(db, b) })),
          draftsToReview: bills.filter((b) => b.status === 'Draft').map((b) => ({ id: b.id, label: billLabel(b), vendor: n.party(b.vendorId), job: n.job(b.jobId), amount: billMoney(db, b).amount })),
        };
      },
    }),
  ],
} satisfies PluginTools;
