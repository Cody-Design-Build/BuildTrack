import { definePluginBase } from '../sdk';
import { bidCostEntries } from './bids';

export default definePluginBase({
  id: 'buildtrack.bids',
  name: 'Bids',
  description: 'Bid packages sent to subcontractors, bid comparison, and awards that become bills.',
  requires: ['buildtrack.bills'], // an award creates a draft bill
  collections: ['bidPackages', 'bids'],
  costEntries: bidCostEntries,
  filesInUse: (db) => [...db.bidPackages.flatMap((p) => p.attachments), ...db.bids.flatMap((b) => b.attachments)].map((f) => f.fileId),
  // drop their invites, but keep an awarded bid (it backs a commitment and bills)
  removeParty: (d, id) => ({
    ...d,
    bids: d.bids.filter((x) => x.vendorId !== id || x.status === 'Awarded').map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)),
  }),
  skills: [
    {
      name: 'bid-leveling',
      description: 'How bid packages and subcontractor bids work, and how to compare ("level") bids against each other and the budget. Use when asked which bid is best, what is out for bid, or what was awarded.',
      body: `# Bid packages and leveling bids

A **bid package** (\`bidPackages\`) is a piece of a job sent to subcontractors for pricing, with a trade (cost code), a due date, a written scope and optional items to price. Each invited subcontractor has a **bid** (\`bids\`, linked by \`packageId\`).

## Statuses
- Package: **Draft**, **Out for bid**, **Awarded**, **Cancelled**.
- Bid: **Invited**, **Received** (price entered), **Declined**, **Awarded**, **Not selected**.
- Requests go out by email; there is no subcontractor portal. Bids are typed in by hand when they come back.
- Awarding a bid creates a draft vendor bill for it, and its amount becomes **committed** cost in job costing.

## Leveling bids
Use \`bid_comparison\` for a package. When comparing:
1. Compare totals, but also read each bid's inclusions and exclusions: a low price that excludes part of the scope isn't comparable.
2. Look at the item prices row by row; note the lowest in each row.
3. Compare against the **budgeted cost** for the package's cost code (not the customer price).
4. Note bids whose price has expired (\`validUntil\`).
Recommend, but leave the award to a person.`,
    },
  ],
});
