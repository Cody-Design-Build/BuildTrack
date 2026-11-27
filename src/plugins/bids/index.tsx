import { ClipboardList } from 'lucide-react';
import { definePlugin } from '../sdk';
import Bids, { JobBids } from './Bids';
import BidPackageDetail from './BidPackageDetail';
import { VendorBids } from './VendorBids';
import { bidCostEntries } from './bids';

export default definePlugin({
  id: 'buildtrack.bids',
  name: 'Bids',
  description: 'Bid packages sent to subcontractors, bid comparison, and awards that become bills.',
  requires: ['buildtrack.bills'], // an award creates a draft bill
  nav: [{ to: '/bids', label: 'Bids', icon: ClipboardList, group: 'work', order: 50 }],
  routes: [
    { path: '/bids', component: Bids },
    { path: '/bids/:id', component: BidPackageDetail },
  ],
  jobTabs: [{ id: 'bids', label: 'Bids', order: 20, component: JobBids }],
  accountSections: [{ id: 'bids', order: 20, component: VendorBids }],
  costEntries: bidCostEntries,
  filesInUse: (db) => [...db.bidPackages.flatMap((p) => p.attachments), ...db.bids.flatMap((b) => b.attachments)].map((f) => f.fileId),
  // drop their invites, but keep an awarded bid (it backs a commitment and bills)
  removeParty: (d, id) => ({
    ...d,
    bids: d.bids.filter((x) => x.vendorId !== id || x.status === 'Awarded').map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)),
  }),
});
