import { Calculator } from 'lucide-react';
import type { Job } from '../../data';
import { useStore, money, pct } from '../../store';
import { SummaryRow } from '../../components/Detail';
import { definePlugin } from '../sdk';
import Budgets, { JobBudgets } from './Budgets';
import BudgetDetail from './BudgetDetail';
import { VendorBudgetLines } from './VendorBudgetLines';
import { budgetCostEntries, jobRollup } from './budgets';

function Summary({ job }: { job: Job }) {
  const { db } = useStore();
  const r = jobRollup(db, job.id);
  return (
    <>
      <SummaryRow label={`Approved (${r.approvedCount})`}>{money(r.contract.price)} <span className="muted">({pct(r.contract.price ? ((r.contract.price - r.contract.cost) / r.contract.price) * 100 : NaN)} margin)</span></SummaryRow>
      <SummaryRow label="Awaiting approval">{money(r.pending.price)}</SummaryRow>
    </>
  );
}

export default definePlugin({
  id: 'buildtrack.budgets',
  name: 'Budgets',
  description: 'Proposals and change orders: lines with cost and markup, a customer document, signing and approval.',
  nav: [{ to: '/budgets', label: 'Budgets', icon: Calculator, group: 'work', order: 40 }],
  routes: [
    { path: '/budgets', component: Budgets },
    { path: '/budgets/:id', component: BudgetDetail },
  ],
  jobTabs: [{ id: 'budget', label: 'Budgets', order: 10, component: JobBudgets }],
  jobSummary: [{ order: 10, component: Summary }],
  accountSections: [{ id: 'budget-lines', order: 30, component: VendorBudgetLines }],
  costEntries: budgetCostEntries,
  filesInUse: (db) => db.budgets.flatMap((b) => (b.signedCopy ? [b.signedCopy.fileId] : [])),
  removeParty: (d, id) => ({
    ...d,
    budgets: d.budgets.map((x) => (x.partyId === id ? { ...x, partyId: '' } : x)),
    budgetLines: d.budgetLines.map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)),
  }),
});
