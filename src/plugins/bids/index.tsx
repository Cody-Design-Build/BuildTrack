import { ClipboardList } from 'lucide-react';
import { definePlugin } from '../sdk';
import base from './base';
import Bids, { JobBids } from './Bids';
import BidPackageDetail from './BidPackageDetail';
import { VendorBids } from './VendorBids';

export default definePlugin({
  ...base,
  nav: [{ to: '/bids', label: 'Bids', icon: ClipboardList, group: 'work', order: 50 }],
  routes: [
    { path: '/bids', component: Bids },
    { path: '/bids/:id', component: BidPackageDetail },
  ],
  jobTabs: [{ id: 'bids', label: 'Bids', order: 20, component: JobBids }],
  accountSections: [{ id: 'bids', order: 20, component: VendorBids }],
});
