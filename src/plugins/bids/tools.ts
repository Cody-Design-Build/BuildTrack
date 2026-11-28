// Agent tools for bids (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { checkCostCode, checkParty, commit, defineTool, find, findJob, names, usd, type PluginTools } from '../../agent/sdk';
import type { Db } from '../../data';
import { uid } from '../../model';
import { todayYmd } from '../invoices/invoices';
import { awardBid, createPackage, declineBid, importItems, inviteVendors, isPackageOpen, markSent, packageBids, packageLabel, packageSummary, recordBid } from './bids';

const pkgSummary = (db: Db, id: string) => {
  const p = db.bidPackages.find((x) => x.id === id)!;
  const n = names(db);
  return {
    id, label: packageLabel(p), title: p.title, status: p.status, job: n.job(p.jobId), costCode: n.code(p.costCodeId), due: p.due, items: p.items,
    bids: packageBids(db, id).map((b) => ({ id: b.id, vendor: n.party(b.vendorId), status: b.status, sent: b.invited, amount: b.amount })),
  };
};
const bidOf = (db: Db, bidId: string) => find(db.bids, bidId, 'bid', 'bid_comparison or list_records with collection "bids" lists them.');

export default {
  plugin: 'buildtrack.bids',
  tools: [
    defineTool({
      name: 'bid_comparison',
      title: 'Compare bids on a package',
      description: "One bid package with every subcontractor's bid side by side: status, total, price per scope item, inclusions, exclusions, how long the price is good for, and the job's budgeted cost for the package's cost code. Flags the lowest total and the lowest price on each item.",
      input: z.object({ packageId: z.string().describe('The bid package id (collection "bidPackages")') }),
      run: ({ db }, { packageId }) => {
        const p = db.bidPackages.find((x) => x.id === packageId);
        if (!p) throw new Error(`No bid package with id "${packageId}". Use list_records with collection "bidPackages" to find it.`);
        const n = names(db);
        const s = packageSummary(db, p);
        const today = todayYmd();
        const priced = s.bids.filter((b) => b.amount > 0 && b.status !== 'Declined' && b.status !== 'Invited');
        return {
          package: { id: p.id, label: packageLabel(p), title: p.title, job: n.job(p.jobId), status: p.status, costCode: n.code(p.costCodeId), due: p.due, scope: p.scope },
          budgetedCost: s.budget,
          lowestTotal: s.low ? { vendor: n.party(s.low.vendorId), amount: s.low.amount } : null,
          items: p.items.map((it) => {
            const prices = priced.filter((b) => b.itemPrices[it.id] != null).map((b) => ({ vendor: n.party(b.vendorId), price: b.itemPrices[it.id] }));
            const low = prices.reduce<(typeof prices)[number] | null>((m, x) => (!m || x.price < m.price ? x : m), null);
            return { item: it, prices, lowest: low?.vendor ?? null };
          }),
          bids: s.bids.map((b) => ({
            id: b.id, vendor: n.party(b.vendorId), status: b.status, amount: b.amount, vsBudget: s.budget ? Math.round((b.amount - s.budget) * 100) / 100 : null,
            received: b.received, validUntil: b.validUntil, expired: !!b.validUntil && b.validUntil < today,
            inclusions: b.inclusions, exclusions: b.exclusions, notes: b.notes,
          })),
          awarded: { total: s.awardedTotal, billed: s.billed, paid: s.paid },
        };
      },
    }),

    defineTool({
      name: 'create_bid_package',
      title: 'Put work out to bid',
      description: 'Creates a draft bid package on a job: the scope subcontractors price. Items can be written fresh or copied from budget lines (quantities only, never our prices). Then invite_vendors.',
      input: z.object({
        jobId: z.string(),
        title: z.string().describe('e.g. "Electrical — rough and finish"'),
        costCodeId: z.string().optional().describe('The trade, from costCodes'),
        due: z.string().optional().describe('yyyy-mm-dd bids are due back (default two weeks)'),
        scope: z.string().optional().describe('The written scope of work'),
        items: z.array(z.object({ description: z.string(), quantity: z.number(), unit: z.string() })).optional(),
        budgetLineIds: z.array(z.string()).optional().describe('Budget lines to copy in as items'),
      }),
      writes: true,
      run: async (ctx, a) => {
        findJob(ctx.db, a.jobId);
        if (a.costCodeId) checkCostCode(ctx.db, a.costCodeId);
        const id = uid('bp');
        let next = createPackage(ctx.db, a.jobId, id, {
          title: a.title, scope: a.scope ?? '', costCodeId: a.costCodeId ?? '', ...(a.due ? { due: a.due } : {}),
          items: (a.items ?? []).map((i) => ({ id: uid('bi'), ...i })),
        });
        if (a.budgetLineIds?.length) next = importItems(next, id, a.budgetLineIds);
        await commit(ctx, next, 'The bid package could not be created.');
        return pkgSummary(next, id);
      },
    }),

    defineTool({
      name: 'invite_vendors',
      title: 'Add subcontractors to a bid package',
      description: "Adds subcontractors (accounts) to an open package's invite list. Doesn't email anyone: send the bid request yourself, then mark_bids_sent.",
      input: z.object({ packageId: z.string(), vendorIds: z.array(z.string()).min(1) }),
      writes: true,
      run: async (ctx, { packageId, vendorIds }) => {
        const p = find(ctx.db.bidPackages, packageId, 'bid package');
        if (!isPackageOpen(p)) throw new Error(`${packageLabel(p)} is ${p.status}; only open packages take new invites.`);
        vendorIds.forEach((v) => checkParty(ctx.db, v, 'vendor'));
        const next = inviteVendors(ctx.db, packageId, vendorIds);
        await commit(ctx, next, 'Those subcontractors are already invited.');
        return pkgSummary(next, packageId);
      },
    }),

    defineTool({
      name: 'mark_bids_sent',
      title: 'Record that bid requests went out',
      description: 'Records that the bid request was sent to these invited subcontractors (all not yet sent, if bidIds is left out). The package becomes Out for bid. It does not send email.',
      input: z.object({ packageId: z.string(), bidIds: z.array(z.string()).optional(), date: z.string().optional().describe('yyyy-mm-dd (default today)') }),
      writes: true,
      run: async (ctx, { packageId, bidIds, date }) => {
        find(ctx.db.bidPackages, packageId, 'bid package');
        const ids = bidIds ?? packageBids(ctx.db, packageId).filter((b) => b.status === 'Invited' && !b.invited).map((b) => b.id);
        const next = markSent(ctx.db, packageId, ids, date);
        await commit(ctx, next, 'Nothing to mark: no invited subcontractor is waiting to be sent this package.');
        return pkgSummary(next, packageId);
      },
    }),

    defineTool({
      name: 'record_bid',
      title: "Enter a subcontractor's bid",
      description: "Enters the price a subcontractor sent back: a total (or prices per item, which add up to the total), inclusions, exclusions, how long it's good for and notes.",
      input: z.object({
        bidId: z.string(),
        amount: z.number().optional().describe('Their total (leave out to add up itemPrices)'),
        itemPrices: z.record(z.string(), z.number()).optional().describe('Scope item id → price'),
        inclusions: z.string().optional(),
        exclusions: z.string().optional(),
        notes: z.string().optional(),
        validUntil: z.string().optional().describe('yyyy-mm-dd'),
        received: z.string().optional().describe('yyyy-mm-dd (default today)'),
      }),
      writes: true,
      run: async (ctx, a) => {
        const b = bidOf(ctx.db, a.bidId);
        if (b.status === 'Awarded') throw new Error('That bid has been awarded and can no longer change.');
        const next = recordBid(ctx.db, a.bidId, {
          amount: a.amount ?? 0, itemPrices: a.itemPrices ?? {}, inclusions: a.inclusions ?? '', exclusions: a.exclusions ?? '', notes: a.notes ?? '',
          validUntil: a.validUntil ?? '', received: a.received ?? todayYmd(),
        });
        await commit(ctx, next, 'A bid needs a total above zero (or item prices that add up to one).');
        return pkgSummary(next, b.packageId);
      },
    }),

    defineTool({
      name: 'decline_bid',
      title: 'Mark that a subcontractor declined',
      description: 'Records that a subcontractor declined to bid.',
      input: z.object({ bidId: z.string() }),
      writes: true,
      run: async (ctx, { bidId }) => {
        const b = bidOf(ctx.db, bidId);
        const next = declineBid(ctx.db, bidId);
        await commit(ctx, next, 'An awarded bid can\'t be declined.');
        return pkgSummary(next, b.packageId);
      },
    }),

    defineTool({
      name: 'award_bid',
      title: 'Award a bid',
      description: "Awards a subcontractor's bid: it becomes committed cost in job costing and a draft bill is created for it. Optionally marks the other priced bids Not selected.",
      input: z.object({ bidId: z.string(), othersNotSelected: z.boolean().default(true) }),
      writes: true,
      confirm: ({ db }, { bidId, othersNotSelected }) => {
        const b = bidOf(db, bidId);
        const p = find(db.bidPackages, b.packageId, 'bid package');
        if (p.status === 'Cancelled' || b.status === 'Awarded' || !(b.amount > 0)) throw new Error(b.status === 'Awarded' ? 'That bid is already awarded.' : p.status === 'Cancelled' ? 'The package is cancelled.' : 'That bid has no price yet; record_bid first.');
        const n = names(db);
        return `Award ${packageLabel(p)}${p.title ? ` (${p.title})` : ''} on ${n.job(p.jobId)} to ${n.party(b.vendorId)} for ${usd(b.amount)}? A draft bill will be created${othersNotSelected ? ' and the other bids marked Not selected' : ''}.`;
      },
      run: async (ctx, { bidId, othersNotSelected }) => {
        const b = bidOf(ctx.db, bidId);
        const billId = uid('bill');
        const next = awardBid(ctx.db, bidId, othersNotSelected, billId);
        await commit(ctx, next, 'The bid could not be awarded.');
        return { ...pkgSummary(next, b.packageId), draftBillId: billId };
      },
    }),
  ],
} satisfies PluginTools;
