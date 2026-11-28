// Agent tools for vendor bills (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { checkCostCode, checkParty, commit, defineTool, find, findJob, names, usd, type PluginTools } from '../../agent/sdk';
import { PAYMENT_METHODS, type Db } from '../../data';
import { uid } from '../../model';
import { todayYmd } from '../invoices/invoices';
import { BILL_NEXT, billAmount, billLabel, billMoney, billStage, canMoveBill, createBill, editBill, payables, recordBillPayment, setBillStatus } from './bills';

const billSummary = (db: Db, id: string) => {
  const b = db.bills.find((x) => x.id === id)!;
  const n = names(db);
  return { id, label: billLabel(b), status: b.status, vendor: n.party(b.vendorId), job: n.job(b.jobId), vendorRef: b.vendorRef, date: b.date, due: b.due, lines: b.lines.map((l) => ({ ...l, costCode: n.code(l.costCodeId) })), ...billMoney(db, b) };
};

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

    defineTool({
      name: 'create_bill',
      title: 'Enter a vendor bill',
      description: "Enters a vendor's or subcontractor's invoice as a draft bill on a job, with one or more charges, each coded to a cost code. Drafts don't count as cost until approved (set_bill_status Open).",
      input: z.object({
        jobId: z.string(),
        vendorId: z.string().describe('The account we owe'),
        vendorRef: z.string().optional().describe("The vendor's own invoice number"),
        title: z.string().optional(),
        date: z.string().optional().describe('yyyy-mm-dd on the vendor\'s bill (default today)'),
        due: z.string().optional().describe('yyyy-mm-dd (default 30 days)'),
        lines: z.array(z.object({ description: z.string(), costCodeId: z.string(), amount: z.number() })).min(1),
        notes: z.string().optional(),
      }),
      writes: true,
      run: async (ctx, a) => {
        findJob(ctx.db, a.jobId);
        checkParty(ctx.db, a.vendorId, 'vendor');
        a.lines.forEach((l) => checkCostCode(ctx.db, l.costCodeId));
        const id = uid('bill');
        let next = createBill(ctx.db, a.jobId, a.vendorId, id);
        next = editBill(next, id, (b) => ({
          vendorRef: a.vendorRef ?? '', title: a.title ?? '', notes: a.notes ?? '', date: a.date ?? b.date, due: a.due ?? b.due,
          lines: a.lines.map((l) => ({ id: uid('bl'), description: l.description, costCodeId: l.costCodeId, amount: l.amount })),
        }));
        await commit(ctx, next, 'The bill could not be created.');
        return billSummary(next, id);
      },
    }),

    defineTool({
      name: 'set_bill_status',
      title: 'Approve, unapprove or void a bill',
      description: 'Open = approve to pay (locks the amounts and counts it as actual cost). Draft = back to checking. Void = cancel. A bill with payments can\'t go back to draft or be voided.',
      input: z.object({ billId: z.string(), status: z.enum(['Open', 'Draft', 'Void']) }),
      writes: true,
      confirm: ({ db }, { billId, status }) => {
        const b = find(db.bills, billId, 'bill');
        if (!canMoveBill(db, b, status)) throw new Error(`${billLabel(b)} is ${b.status}${db.payments.some((p) => p.billId === billId) ? ' with payments recorded' : ''}; it can move to ${BILL_NEXT[b.status].join(', ') || 'nothing else'}.`);
        if (status === 'Open' && !(billAmount(b) > 0)) throw new Error(`${billLabel(b)} has no amount yet.`);
        const what = status === 'Open' ? 'Approve to pay' : status === 'Draft' ? 'Move back to draft' : 'Void';
        return `${what} ${billLabel(b)} from ${names(db).party(b.vendorId)} for ${usd(billAmount(b))} on ${names(db).job(b.jobId)}?`;
      },
      run: async (ctx, { billId, status }) => {
        const next = setBillStatus(ctx.db, billId, status);
        await commit(ctx, next, 'The status could not be changed.');
        return billSummary(next, billId);
      },
    }),

    defineTool({
      name: 'record_bill_payment',
      title: 'Record a payment to a vendor',
      description: 'Records money paid on an approved (open) bill. The bill turns Paid when payments cover it.',
      input: z.object({
        billId: z.string(),
        amount: z.number().positive(),
        date: z.string().describe('yyyy-mm-dd the money went out'),
        method: z.enum(PAYMENT_METHODS),
        reference: z.string().optional().describe('Check number or transaction id'),
        notes: z.string().optional(),
      }),
      writes: true,
      confirm: ({ db }, { billId, amount, date, method, reference }) => {
        const b = find(db.bills, billId, 'bill');
        if (b.status !== 'Open') throw new Error(`${billLabel(b)} is ${b.status}; payments go against approved (open) bills.`);
        const { balance } = billMoney(db, b);
        return `Record a ${method}${reference ? ` #${reference}` : ''} payment of ${usd(amount)} on ${date} to ${names(db).party(b.vendorId)} for ${billLabel(b)} (${usd(balance)} owed)?${amount > balance + 0.005 ? ' That is more than is owed.' : ''}`;
      },
      run: async (ctx, { billId, amount, date, method, reference, notes }) => {
        const next = recordBillPayment(ctx.db, { billId, amount, date, method, reference: reference ?? '', notes: notes ?? '' });
        await commit(ctx, next, 'The payment could not be recorded.');
        return billSummary(next, billId);
      },
    }),
  ],
} satisfies PluginTools;
