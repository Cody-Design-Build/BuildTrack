import type { Job } from '../../data';
import { useStore, money, pct } from '../../store';
import { SummaryRow } from '../../components/Detail';
import { costEntries } from '../registry';
import { definePlugin } from '../sdk';
import { JobCosts } from './Costs';
import { jobCosts } from './costing';

function Summary({ job }: { job: Job }) {
  const { db } = useStore();
  const c = jobCosts(costEntries(db, job.id), db.costCodes);
  return (
    <>
      <SummaryRow label="Actual cost to date">{money(c.actual)} <span className="muted">of {money(c.budget)} budgeted</span></SummaryRow>
      <SummaryRow label="Projected profit" danger={c.profit < 0}>{money(c.profit)} <span className="muted">({pct(c.margin)} margin)</span></SummaryRow>
    </>
  );
}

export default definePlugin({
  id: 'buildtrack.costing',
  name: 'Job costing',
  description: 'Budget, committed, actual and projected cost for each cost code, with variance and profit.',
  role: { id: 'costing', label: 'Job costing' },
  jobTabs: [{ id: 'costs', label: 'Costs', order: 50, component: JobCosts }],
  jobSummary: [{ order: 40, component: Summary }],
});
