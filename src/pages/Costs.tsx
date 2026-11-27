// The Costs tab on a job: budget vs committed vs actual by cost code (see src/costing.ts).
import { Link } from 'react-router-dom';
import type { Job } from '../data';
import { useStore, money } from '../store';
import { jobCosts, type CostRow } from '../costing';
import { pct } from '../budgets';
import { cn } from '@/lib/utils';

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <b className={className}>{value}</b>
      {sub && <span className="muted small-text">{sub}</span>}
    </div>
  );
}

/** Spent vs budget as a bar: the filled part is actual, the tick is committed. */
function Bar({ r }: { r: CostRow }) {
  const scale = Math.max(r.budget, r.projected, 1);
  const w = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const over = r.actual > r.budget && r.budget > 0;
  return (
    <span className="relative block h-1.5 w-full min-w-24 overflow-hidden rounded-full bg-muted" title={`Actual ${money(r.actual)} of ${money(r.budget)} budget`}>
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: w(r.actual), background: over ? 'var(--destructive)' : 'var(--c-blue)' }} />
      {r.committed > 0 && <span className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: w(r.committed) }} />}
      {r.budget > 0 && r.projected > r.budget && <span className="absolute inset-y-0 w-0.5 bg-destructive" style={{ left: w(r.budget) }} />}
    </span>
  );
}

const signed = (n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : money(0));

export function JobCosts({ job }: { job: Job }) {
  const { db } = useStore();
  const c = jobCosts(db, job.id);
  const nothing = c.rows.length === 0;
  return (
    <div className="b-wrap">
      <div className="b-summary">
        <Stat label="Contract" value={money(c.price)} sub="Approved proposals and change orders" />
        <Stat label="Budgeted cost" value={money(c.budget)} sub={c.price ? `${pct(((c.price - c.budget) / c.price) * 100)} planned margin` : undefined} />
        <Stat label="Actual cost to date" value={money(c.actual)} sub={`${money(c.billed)} in bills · ${money(c.expenses)} expenses`} />
        <Stat label="Projected cost" value={money(c.projected)} sub={c.variance >= 0 ? `${money(c.variance)} under budget` : `${money(-c.variance)} over budget`} className={c.variance < 0 ? 'text-destructive' : ''} />
        <Stat label="Projected profit" value={money(c.profit)} sub={`${pct(c.margin)} margin`} className={c.profit < 0 ? 'text-destructive' : ''} />
      </div>

      <div className="toolbar b-toolbar">
        <h2 className="text-base font-semibold">By cost code</h2>
        <span className="muted small-text">Committed is awarded bids. Actual is approved bills plus expenses. Projected uses the committed amount once a bid is awarded, otherwise the budget, and never less than actual.</span>
      </div>
      {nothing ? (
        <div className="card b-empty"><p>Nothing to cost yet. Approve a proposal to set the budget, then award bids and enter bills as the work happens.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="grid-table bt-table">
            <thead>
              <tr>
                <th>Cost code</th>
                <th className="num">Budget</th>
                <th className="num">Committed</th>
                <th className="num">Actual</th>
                <th>Spent</th>
                <th className="num">Projected</th>
                <th className="num">Variance</th>
                <th className="num">Paid out</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.key}>
                  <td className="whitespace-nowrap">{r.code ? <><span className="text-muted-foreground">{r.code.number}</span> {r.code.name}</> : <span className="muted">No cost code</span>}</td>
                  <td className="num">{r.budget ? money(r.budget) : <span className="muted">—</span>}</td>
                  <td className="num">
                    {r.committed ? (
                      <Link to={`/bids?job=${job.id}`} className="hover:underline">{money(r.committed)}</Link>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="num">
                    {r.actual ? money(r.actual) : <span className="muted">—</span>}
                    {r.billed > 0 && r.expenses > 0 && <div className="text-xs text-muted-foreground">{money(r.billed)} bills · {money(r.expenses)} exp.</div>}
                  </td>
                  <td className="w-32"><Bar r={r} /><div className="mt-0.5 text-xs text-muted-foreground">{r.budget ? pct((r.actual / r.budget) * 100) : ''}</div></td>
                  <td className="num">{money(r.projected)}</td>
                  <td className={cn('num font-medium', r.variance < 0 ? 'text-destructive' : r.variance > 0 ? 'text-[var(--success-strong)]' : 'text-muted-foreground')}>{signed(r.variance)}</td>
                  <td className="num text-muted-foreground">{r.paid ? money(r.paid) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="b-group">
                <td className="bold">Total</td>
                <td className="num bold">{money(c.budget)}</td>
                <td className="num bold">{money(c.committed)}</td>
                <td className="num bold">{money(c.actual)}</td>
                <td />
                <td className="num bold">{money(c.projected)}</td>
                <td className={cn('num bold', c.variance < 0 ? 'text-destructive' : 'text-[var(--success-strong)]')}>{signed(c.variance)}</td>
                <td className="num bold">{money(c.paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
