// The Costs tab on a job: budget vs committed vs actual by cost code (see ./costing.ts).
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Job } from '../../data';
import { useStore, money, pct } from '../../store';
import { jobCosts, type CostRow } from './costing';
import { costEntries } from '../registry';
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
  const c = jobCosts(costEntries(db, job.id), db.costCodes);
  const [open, setOpen] = useState<string | null>(null);
  const nothing = c.rows.length === 0;
  return (
    <div className="b-wrap">
      <div className="b-summary">
        <Stat label="Contract" value={money(c.price)} sub="Approved proposals and change orders" />
        <Stat label="Budgeted cost" value={money(c.budget)} sub={c.price ? `${pct(((c.price - c.budget) / c.price) * 100)} planned margin` : undefined} />
        <Stat label="Actual cost to date" value={money(c.actual)} sub={`${money(c.paid)} paid out so far`} />
        <Stat label="Projected cost" value={money(c.projected)} sub={c.variance >= 0 ? `${money(c.variance)} under budget` : `${money(-c.variance)} over budget`} className={c.variance < 0 ? 'text-destructive' : ''} />
        <Stat label="Projected profit" value={money(c.profit)} sub={`${pct(c.margin)} margin`} className={c.profit < 0 ? 'text-destructive' : ''} />
      </div>

      <div className="toolbar b-toolbar">
        <h2 className="text-base font-semibold">By cost code</h2>
        <span className="muted small-text">Committed is awarded bids. Actual is approved bills plus expenses. Click a row to see what's in it. Projected uses the committed amount once a bid is awarded, otherwise the budget, and never less than actual.</span>
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
                <Fragment key={r.key}>
                <tr className="cursor-pointer" onClick={() => setOpen(open === r.key ? null : r.key)} aria-expanded={open === r.key}>
                  <td className="whitespace-nowrap">
                    <ChevronRight className={cn('mr-1 inline size-3.5 text-muted-foreground transition-transform', open === r.key && 'rotate-90')} />
                    {r.code ? <><span className="text-muted-foreground">{r.code.number}</span> {r.code.name}</> : <span className="muted">No cost code</span>}
                  </td>
                  <td className="num">{r.budget ? money(r.budget) : <span className="muted">—</span>}</td>
                  <td className="num">{r.committed ? money(r.committed) : <span className="muted">—</span>}</td>
                  <td className="num">{r.actual ? money(r.actual) : <span className="muted">—</span>}</td>
                  <td className="w-32"><Bar r={r} /><div className="mt-0.5 text-xs text-muted-foreground">{r.budget ? pct((r.actual / r.budget) * 100) : ''}</div></td>
                  <td className="num">{money(r.projected)}</td>
                  <td className={cn('num font-medium', r.variance < 0 ? 'text-destructive' : r.variance > 0 ? 'text-[var(--success-strong)]' : 'text-muted-foreground')}>{signed(r.variance)}</td>
                  <td className="num text-muted-foreground">{r.paid ? money(r.paid) : '—'}</td>
                </tr>
                {open === r.key && r.entries.map((e, i) => (
                  <tr key={i} className="bg-muted/40 text-sm">
                    <td className="pl-8">{e.source.href ? <Link to={e.source.href} className="hover:underline">{e.label}</Link> : e.label}</td>
                    <td className="num">{e.kind === 'budget' ? money(e.amount) : ''}</td>
                    <td className="num">{e.kind === 'committed' ? money(e.amount) : ''}</td>
                    <td className="num">{e.kind === 'actual' ? money(e.amount) : ''}</td>
                    <td colSpan={3} />
                    <td className="num text-muted-foreground">{e.kind === 'actual' && e.paid ? money(e.paid) : ''}</td>
                  </tr>
                ))}
                </Fragment>
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
