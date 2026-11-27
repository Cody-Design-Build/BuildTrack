import { Receipt } from 'lucide-react';
import type { Job } from '../../data';
import { useStore, money } from '../../store';
import { SummaryRow } from '../../components/Detail';
import { definePlugin } from '../sdk';
import Bills, { JobBills } from './Bills';
import BillDetail from './BillDetail';
import { VendorBills } from './VendorBills';
import { billCostEntries, jobPayables } from './bills';

function Summary({ job }: { job: Job }) {
  const { db } = useStore();
  const p = jobPayables(db, job.id);
  return (
    <>
      <SummaryRow label="Vendor bills">{money(p.billed)} <span className="muted">({money(p.paid)} paid)</span></SummaryRow>
      <SummaryRow label="Owed to vendors" danger={p.overdue > 0}>{money(p.owed)}{p.overdue > 0 && <span className="font-normal"> ({money(p.overdue)} overdue)</span>}</SummaryRow>
    </>
  );
}

export default definePlugin({
  id: 'buildtrack.bills',
  name: 'Bills',
  description: 'What you owe vendors and subcontractors, coded to cost codes, with payments made.',
  nav: [{ to: '/bills', label: 'Bills', icon: Receipt, group: 'work', order: 70 }],
  routes: [
    { path: '/bills', component: Bills },
    { path: '/bills/:id', component: BillDetail },
  ],
  jobTabs: [{ id: 'bills', label: 'Bills', order: 40, component: JobBills }],
  jobSummary: [{ order: 30, component: Summary }],
  accountSections: [{ id: 'bills', order: 10, component: VendorBills }],
  costEntries: billCostEntries,
  filesInUse: (db) => db.bills.flatMap((b) => b.attachments.map((f) => f.fileId)),
  // bills are financial records: keep them, just without the vendor
  removeParty: (d, id) => ({ ...d, bills: d.bills.map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)) }),
});
