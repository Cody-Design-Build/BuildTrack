// Agent tools for budgets (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { checkCostCode, checkParty, commit, defineTool, find, findJob, jobCustomer, names, usd, type PluginTools } from '../../agent/sdk';
import { BUDGET_KINDS, COST_TYPES, type BudgetLine } from '../../data';
import { uid } from '../../model';
import { approveBudget, budgetLabel, cloneBudget, createBudget, editBudget, isEditable, jobRollup, linesByBudget, NEXT_STATUSES, openAlternates, setBudgetStatus, totals } from './budgets';

const r2 = (n: number) => Math.round(n * 100) / 100;

const LINE = z.object({
  group: z.string().describe('Section heading on the document, e.g. "Demolition"'),
  name: z.string(),
  description: z.string().optional(),
  costCodeId: z.string().describe('From costCodes'),
  costType: z.enum(COST_TYPES).optional().describe('Default Other'),
  quantity: z.number(),
  unit: z.string().describe('e.g. ea, hr, sqft, lump'),
  unitCost: z.number().describe('Our cost per unit (can be negative for a credit)'),
  markup: z.number().describe('Percent added to cost to get the customer price'),
  vendorId: z.string().optional().describe('Account doing or supplying the work'),
});

function toLines(db: Parameters<typeof checkCostCode>[0], budgetId: string, lines: z.infer<typeof LINE>[]): BudgetLine[] {
  return lines.map((l) => {
    checkCostCode(db, l.costCodeId);
    if (l.vendorId) checkParty(db, l.vendorId, 'vendor');
    return { id: uid('bl'), budgetId, group: l.group, costCodeId: l.costCodeId, name: l.name, description: l.description ?? '', costType: l.costType ?? 'Other', quantity: l.quantity, unit: l.unit, unitCost: l.unitCost, markup: l.markup, vendorId: l.vendorId ?? '' };
  });
}

const summary = (db: Parameters<typeof linesByBudget>[0], id: string) => {
  const b = db.budgets.find((x) => x.id === id)!;
  const t = totals(linesByBudget(db).get(id) ?? []);
  return { id, label: budgetLabel(b), status: b.status, cost: r2(t.cost), price: r2(t.price) };
};

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

    defineTool({
      name: 'create_budget',
      title: 'Write a proposal or change order',
      description: 'Creates a draft proposal or change order on a job, optionally with its lines. Addressed to the job\'s customer unless partyId is given. Drafts can be changed freely; nothing is sent.',
      input: z.object({
        jobId: z.string(),
        kind: z.enum(BUDGET_KINDS),
        title: z.string().optional().describe('e.g. "Kitchen remodel — Option B"'),
        notes: z.string().optional().describe('Shown on the document: scope notes or terms'),
        partyId: z.string().optional().describe('Who it is addressed to (default: the job\'s customer)'),
        lines: z.array(LINE).optional(),
      }),
      writes: true,
      run: async (ctx, a) => {
        findJob(ctx.db, a.jobId);
        const partyId = a.partyId ?? jobCustomer(ctx.db, a.jobId);
        checkParty(ctx.db, partyId);
        const id = uid('bud');
        let next = createBudget(ctx.db, a.jobId, a.kind, partyId, id);
        next = editBudget(next, id, () => ({ budget: { title: a.title ?? '', notes: a.notes ?? '' }, lines: toLines(ctx.db, id, a.lines ?? []) }));
        await commit(ctx, next, 'The budget could not be created.');
        return summary(next, id);
      },
    }),

    defineTool({
      name: 'add_budget_lines',
      title: 'Add lines to a draft budget',
      description: 'Adds lines to a draft proposal or change order. Sent budgets are locked: clone_budget makes an editable copy.',
      input: z.object({ budgetId: z.string(), lines: z.array(LINE).min(1) }),
      writes: true,
      run: async (ctx, { budgetId, lines }) => {
        const b = find(ctx.db.budgets, budgetId, 'budget');
        if (!isEditable(b)) throw new Error(`${budgetLabel(b)} is ${b.status} and locked. Use clone_budget to make an editable copy.`);
        const next = editBudget(ctx.db, budgetId, (_, own) => ({ lines: [...own, ...toLines(ctx.db, budgetId, lines)] }));
        await commit(ctx, next, 'The lines could not be added.');
        return summary(next, budgetId);
      },
    }),

    defineTool({
      name: 'remove_budget_lines',
      title: 'Remove lines from a draft budget',
      description: 'Removes lines (by id, from budgetLines) from a draft proposal or change order.',
      input: z.object({ budgetId: z.string(), lineIds: z.array(z.string()).min(1) }),
      writes: true,
      run: async (ctx, { budgetId, lineIds }) => {
        const b = find(ctx.db.budgets, budgetId, 'budget');
        if (!isEditable(b)) throw new Error(`${budgetLabel(b)} is ${b.status} and locked.`);
        const next = editBudget(ctx.db, budgetId, (_, own) => ({ lines: own.filter((l) => !lineIds.includes(l.id)) }));
        await commit(ctx, next, 'The lines could not be removed.');
        return summary(next, budgetId);
      },
    }),

    defineTool({
      name: 'clone_budget',
      title: 'Copy a budget as a new draft',
      description: 'Copies a budget and its lines as a new draft, e.g. to revise one that was sent or to make an alternate.',
      input: z.object({ budgetId: z.string() }),
      writes: true,
      run: async (ctx, { budgetId }) => {
        find(ctx.db.budgets, budgetId, 'budget');
        const id = uid('bud');
        const next = cloneBudget(ctx.db, budgetId, id);
        await commit(ctx, next, 'The budget could not be copied.');
        return summary(next, id);
      },
    }),

    defineTool({
      name: 'set_budget_status',
      title: 'Send, decline or void a budget',
      description: 'Marks a budget Sent (locks it so it matches what the customer saw), Declined or Void. Recording that it was sent does not email anyone. For a signed budget use approve_budget.',
      input: z.object({ budgetId: z.string(), status: z.enum(['Sent', 'Declined', 'Void']) }),
      writes: true,
      confirm: ({ db }, { budgetId, status }) => {
        const b = find(db.budgets, budgetId, 'budget');
        if (!NEXT_STATUSES[b.status].includes(status)) throw new Error(`${budgetLabel(b)} is ${b.status}; it can move to ${NEXT_STATUSES[b.status].join(', ') || 'nothing else'}.`);
        const s = summary(db, budgetId);
        return `Mark ${s.label} (${usd(s.price)}) on ${names(db).job(b.jobId)} as ${status}?${status === 'Sent' ? ' It will be locked.' : ''}`;
      },
      run: async (ctx, { budgetId, status }) => {
        const next = setBudgetStatus(ctx.db, budgetId, status);
        await commit(ctx, next, 'The status could not be changed.');
        return summary(next, budgetId);
      },
    }),

    defineTool({
      name: 'approve_budget',
      title: 'Record a signed budget',
      description: 'Records that the customer signed a sent proposal or change order: who signed and when. It then counts toward the job\'s contract. Optionally declines the other proposals still out on the job.',
      input: z.object({
        budgetId: z.string(),
        signedBy: z.string().describe('Name of the person who signed'),
        date: z.string().describe('yyyy-mm-dd'),
        declineOtherProposals: z.boolean().optional().describe('Decline the other proposals still waiting on this job'),
      }),
      writes: true,
      confirm: ({ db }, { budgetId, signedBy, date, declineOtherProposals }) => {
        const b = find(db.budgets, budgetId, 'budget');
        if (b.status !== 'Sent') throw new Error(`${budgetLabel(b)} is ${b.status}; only a sent budget can be approved.`);
        const s = summary(db, budgetId);
        const others = declineOtherProposals ? openAlternates(db, b) : [];
        return `Record ${s.label} (${usd(s.price)}) on ${names(db).job(b.jobId)} as signed by ${signedBy} on ${date}?${others.length ? ` This also declines ${others.map(budgetLabel).join(', ')}.` : ''}`;
      },
      run: async (ctx, { budgetId, signedBy, date, declineOtherProposals }) => {
        const b = find(ctx.db.budgets, budgetId, 'budget');
        const declineIds = declineOtherProposals ? openAlternates(ctx.db, b).map((x) => x.id) : [];
        const next = approveBudget(ctx.db, budgetId, { signedBy, date, declineIds });
        await commit(ctx, next, 'The budget could not be approved.');
        return { ...summary(next, budgetId), declined: declineIds };
      },
    }),
  ],
} satisfies PluginTools;

