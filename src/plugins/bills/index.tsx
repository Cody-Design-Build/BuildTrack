import { Receipt } from 'lucide-react';
import type { Job } from '../../data';
import { useStore, money } from '../../store';
import { SummaryRow } from '../../components/Detail';
import { definePlugin } from '../sdk';
import base from './base';
import Bills, { JobBills } from './Bills';
import BillDetail from './BillDetail';
import { VendorBills } from './VendorBills';
import { jobPayables } from './bills';

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
  ...base,
  nav: [{ to: '/bills', label: 'Bills', icon: Receipt, group: 'work', order: 70 }],
  routes: [
    { path: '/bills', component: Bills },
    { path: '/bills/:id', component: BillDetail },
  ],
  jobTabs: [{ id: 'bills', label: 'Bills', order: 40, component: JobBills }],
  jobSummary: [{ order: 30, component: Summary }],
  accountSections: [{ id: 'bills', order: 10, component: VendorBills }],
});
