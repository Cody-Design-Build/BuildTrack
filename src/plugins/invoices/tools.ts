// Agent tools for invoices (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { checkParty, commit, defineTool, find, findJob, jobCustomer, names, usd, type AgentContext, type PluginTools } from '../../agent/sdk';
import { PAYMENT_METHODS, type Db } from '../../data';
import { uid } from '../../model';
import { budgetLabel, linesByBudget } from '../budgets/budgets';
import { createInvoice, editInvoice, INVOICE_NEXT, invoiceLabel, invoiceMoney, invoiceSections, invoiceStage, invoiceTotals, isInvoiceEditable, jobBilling, recordPayment, setInvoiceStatus, todayYmd } from './invoices';

/** What an invoice bills, section by section and line by line. */
function invoiceDetail(db: Db, id: string) {
  const inv = db.invoices.find((x) => x.id === id)!;
  const t = invoiceTotals(db, inv);
  return {
    id, label: invoiceLabel(inv), status: inv.status, date: inv.date, due: inv.due,
    contract: t.value, previouslyBilled: t.previous, thisInvoice: t.amount, billedToDate: t.toDate, balanceToFinish: t.remaining,
    sections: invoiceSections(db, inv).map((s) => ({
      budget: budgetLabel(s.budget), budgetId: s.budget.id, value: s.value, thisInvoice: s.thisAmount,
      lines: s.rows.map((r) => ({ lineId: r.line.id, group: r.line.group, name: r.line.name, value: Math.round(r.value * 100) / 100, previousPct: r.prevPct, toDatePct: r.toDatePct, thisInvoice: r.thisAmount })),
    })),
  };
}

const draftOnly = (ctx: AgentContext, id: string) => {
  const inv = find(ctx.db.invoices, id, 'invoice');
  if (!isInvoiceEditable(inv)) throw new Error(`${invoiceLabel(inv)} is ${inv.status} and locked; only drafts can change.`);
  return inv;
};

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

    defineTool({
      name: 'get_invoice',
      title: 'An invoice line by line',
      description: 'One invoice with every budget line it bills: value, percent billed before, percent complete to date and this invoice\'s amount, plus totals. Use before set_invoice_progress to see the line ids.',
      input: z.object({ invoiceId: z.string() }),
      run: ({ db }, { invoiceId }) => (find(db.invoices, invoiceId, 'invoice'), invoiceDetail(db, invoiceId)),
    }),

    defineTool({
      name: 'create_invoice',
      title: 'Start a progress invoice',
      description: 'Creates a draft invoice on a job against every approved proposal and change order, billing nothing yet (then set_invoice_progress). Addressed to the job\'s customer unless partyId is given. Due in 14 days.',
      input: z.object({ jobId: z.string(), partyId: z.string().optional(), due: z.string().optional().describe('yyyy-mm-dd') }),
      writes: true,
      run: async (ctx, { jobId, partyId, due }) => {
        findJob(ctx.db, jobId);
        const to = partyId ?? jobCustomer(ctx.db, jobId);
        checkParty(ctx.db, to);
        const id = uid('inv');
        let next = createInvoice(ctx.db, jobId, to, id);
        if (!next.invoices.find((i) => i.id === id)!.budgetIds.length) throw new Error('The job has no approved proposal or change order to bill against yet.');
        if (due) next = editInvoice(next, id, () => ({ due }));
        await commit(ctx, next, 'The invoice could not be created.');
        return invoiceDetail(next, id);
      },
    }),

    defineTool({
      name: 'set_invoice_progress',
      title: 'Bill work done on a draft invoice',
      description: 'Sets the percent complete TO DATE (0–100) on lines of a draft invoice; the invoice bills the difference from what was billed before. Give lines by id, or whole budgets with budgetIds (every line of that budget to the same percent, e.g. 100 to finish it).',
      input: z.object({
        invoiceId: z.string(),
        lines: z.array(z.object({ lineId: z.string(), percent: z.number().min(0).max(100) })).optional(),
        budgets: z.array(z.object({ budgetId: z.string(), percent: z.number().min(0).max(100) })).optional(),
      }),
      writes: true,
      run: async (ctx, { invoiceId, lines = [], budgets = [] }) => {
        const inv = draftOnly(ctx, invoiceId);
        const billable = new Map(invoiceSections(ctx.db, inv).flatMap((s) => s.rows.map((r) => [r.line.id, { budgetId: s.budget.id, prev: r.prevPct }] as const)));
        const set: Record<string, number> = {};
        for (const b of budgets) {
          if (!inv.budgetIds.includes(b.budgetId)) throw new Error(`Budget "${b.budgetId}" isn't on this invoice.`);
          for (const [lineId, x] of billable) if (x.budgetId === b.budgetId) set[lineId] = b.percent;
        }
        for (const l of lines) {
          if (!billable.has(l.lineId)) throw new Error(`Line "${l.lineId}" isn't on this invoice. get_invoice lists its lines.`);
          set[l.lineId] = l.percent;
        }
        for (const [lineId, pct] of Object.entries(set)) {
          const prev = billable.get(lineId)!.prev;
          if (pct < prev) throw new Error(`Line "${lineId}" was already billed to ${prev}%; percent complete to date can't go below that.`);
        }
        const next = editInvoice(ctx.db, invoiceId, (i) => ({ progress: { ...i.progress, ...set } }));
        await commit(ctx, next, 'The invoice could not be changed.');
        return invoiceDetail(next, invoiceId);
      },
    }),

    defineTool({
      name: 'set_invoice_status',
      title: 'Send or void an invoice',
      description: 'Marks a draft invoice Sent (locks it and freezes what was billed before it), or voids a sent invoice (its amounts become billable again). Recording it as sent does not email the customer.',
      input: z.object({ invoiceId: z.string(), status: z.enum(['Sent', 'Void']) }),
      writes: true,
      confirm: ({ db }, { invoiceId, status }) => {
        const inv = find(db.invoices, invoiceId, 'invoice');
        if (!INVOICE_NEXT[inv.status].includes(status)) throw new Error(`${invoiceLabel(inv)} is ${inv.status}; it can move to ${INVOICE_NEXT[inv.status].join(', ') || 'nothing else'}.`);
        if (status === 'Void' && db.payments.some((p) => p.invoiceId === invoiceId)) throw new Error(`${invoiceLabel(inv)} has payments recorded; remove them in the app before voiding.`);
        const amount = invoiceTotals(db, inv).amount;
        if (status === 'Sent' && !(amount > 0)) throw new Error(`${invoiceLabel(inv)} bills nothing yet; set_invoice_progress first.`);
        return `Mark ${invoiceLabel(inv)} for ${usd(amount)} on ${names(db).job(inv.jobId)} as ${status}?${status === 'Sent' ? ' It will be locked.' : ''}`;
      },
      run: async (ctx, { invoiceId, status }) => {
        const next = setInvoiceStatus(ctx.db, invoiceId, status);
        await commit(ctx, next, 'The status could not be changed.');
        return invoiceDetail(next, invoiceId);
      },
    }),

    defineTool({
      name: 'record_payment',
      title: 'Record a customer payment',
      description: 'Records money received against a sent invoice. The invoice turns Paid when payments cover it.',
      input: z.object({
        invoiceId: z.string(),
        amount: z.number().positive(),
        date: z.string().describe('yyyy-mm-dd the money came in'),
        method: z.enum(PAYMENT_METHODS),
        reference: z.string().optional().describe('Check number or transaction id'),
        notes: z.string().optional(),
      }),
      writes: true,
      confirm: ({ db }, { invoiceId, amount, date, method, reference }) => {
        const inv = find(db.invoices, invoiceId, 'invoice');
        if (inv.status !== 'Sent') throw new Error(`${invoiceLabel(inv)} is ${inv.status}; payments go against sent invoices.`);
        const { balance } = invoiceMoney(db, inv);
        return `Record a ${method}${reference ? ` #${reference}` : ''} payment of ${usd(amount)} on ${date} against ${invoiceLabel(inv)} (${names(db).job(inv.jobId)}, ${usd(balance)} due)?${amount > balance + 0.005 ? ' That is more than is due.' : ''}`;
      },
      run: async (ctx, { invoiceId, amount, date, method, reference, notes }) => {
        const next = recordPayment(ctx.db, { invoiceId, amount, date, method, reference: reference ?? '', notes: notes ?? '' });
        await commit(ctx, next, 'The payment could not be recorded.');
        const inv = next.invoices.find((i) => i.id === invoiceId)!;
        return { invoice: invoiceLabel(inv), status: inv.status, ...invoiceMoney(next, inv) };
      },
    }),
  ],
} satisfies PluginTools;
