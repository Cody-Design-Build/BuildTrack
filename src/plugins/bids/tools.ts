// Agent tools for bids (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { defineTool, names, type PluginTools } from '../../agent/sdk';
import { todayYmd } from '../invoices/invoices';
import { packageLabel, packageSummary } from './bids';

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
  ],
} satisfies PluginTools;
