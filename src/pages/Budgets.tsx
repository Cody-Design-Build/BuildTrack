import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, FilePlus2, FileText, Search } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { useLookups, useStore, money, uid } from '../store';
import { BUDGET_KINDS, BUDGET_STATUSES, type Budget, type BudgetKind, type BudgetStatus, type Job } from '../data';
import { BUDGET_STATUS_COLOR, budgetLabel, cloneBudget, createBudget, jobRollup, linesByBudget, pct, totals } from '../budgets';

export const StatusPill = ({ status }: { status: BudgetStatus }) => <Pill label={status} color={BUDGET_STATUS_COLOR[status]} />;

/** A coloured status label, e.g. "Approved" or "Paid". */
export function Pill({ label, color: c }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${c}1f`, color: `color-mix(in srgb, ${c} 75%, var(--foreground))` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** Starts a new draft proposal or change order on a job and opens it. */
export function useNewBudget() {
  const { update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  return (jobId: string, kind: BudgetKind) => {
    const id = uid('bud');
    update((d) => createBudget(d, jobId, kind, L.customers(jobId)[0]?.id ?? '', id));
    nav(`/budgets/${id}`);
  };
}

export function useCloneBudget() {
  const { update } = useStore();
  const nav = useNavigate();
  return (budgetId: string) => {
    const id = uid('bud');
    update((d) => cloneBudget(d, budgetId, id));
    nav(`/budgets/${id}`);
  };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <b>{value}</b>
      {sub && <span className="muted small-text">{sub}</span>}
    </div>
  );
}

/** The job's money summary, built from its approved budgets and expenses. */
export function RollupCards({ job }: { job: Job }) {
  const { db } = useStore();
  const r = jobRollup(db, job.id);
  const spentPct = r.contract.cost ? (r.spent / r.contract.cost) * 100 : 0;
  return (
    <div className="b-summary">
      <Stat label="Original contract" value={money(r.proposals.price)} sub="Approved proposals" />
      <Stat label="Change orders" value={money(r.changeOrders.price)} sub="Approved change orders" />
      <Stat label="Revised contract" value={money(r.contract.price)} sub={`${pct(r.contract.price ? ((r.contract.price - r.contract.cost) / r.contract.price) * 100 : NaN)} margin`} />
      <Stat label="Awaiting approval" value={money(r.pending.price)} sub={`${r.pendingCount} sent · ${r.draftCount} draft`} />
      <div className="card stat">
        <span className="stat-label">Spent so far</span>
        <b>{money(r.spent)}</b>
        <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.min(100, spentPct)}%`, background: r.spent > r.contract.cost ? '#dc2626' : '#16a34a' }} /></span>
        <span className="muted small-text">{r.contract.cost ? `${money(r.contract.cost - r.spent)} left of approved cost` : 'No approved cost yet'}</span>
      </div>
    </div>
  );
}

/** The Budgets tab on a job: its proposals and change orders. */
export function JobBudgets({ job }: { job: Job }) {
  const { db } = useStore();
  const L = useLookups();
  const newBudget = useNewBudget();
  const clone = useCloneBudget();
  const byBudget = useMemo(() => linesByBudget(db), [db]);
  const budgets = db.budgets
    .filter((b) => b.jobId === job.id)
    .sort((a, b) => Number(a.kind === 'Change Order') - Number(b.kind === 'Change Order') || a.created.localeCompare(b.created));
  return (
    <div className="b-wrap">
      <RollupCards job={job} />
      <div className="toolbar b-toolbar">
        <button type="button" className="btn primary" onClick={() => newBudget(job.id, 'Proposal')}><FilePlus2 size={14} /> New Proposal</button>
        <button type="button" className="btn" onClick={() => newBudget(job.id, 'Change Order')}><FilePlus2 size={14} /> New Change Order</button>
        <span className="grow" />
        <Link to={`/budgets?job=${job.id}`} className="btn">See in all budgets</Link>
      </div>
      {budgets.length === 0 ? (
        <div className="card b-empty">
          <p>No budgets yet. Start with a proposal: it holds its own line items and becomes the document you send the customer. Add change orders the same way once work is under way.</p>
          <button type="button" className="btn primary" onClick={() => newBudget(job.id, 'Proposal')}><FilePlus2 size={14} /> Create proposal</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid-table bt-table">
            <thead>
              <tr>
                <th>Budget</th>
                <th>Title</th>
                <th>To</th>
                <th>Status</th>
                <th className="num">Cost</th>
                <th className="num">Price</th>
                <th className="num">Margin</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => {
                const t = totals(byBudget.get(b.id) ?? []);
                const muted = b.status === 'Declined' || b.status === 'Void';
                return (
                  <tr key={b.id} className={muted ? 'text-muted-foreground' : ''}>
                    <td className="whitespace-nowrap"><Link to={`/budgets/${b.id}`} className="font-medium text-primary hover:underline"><FileText size={13} className="mr-1 inline" />{budgetLabel(b)}</Link></td>
                    <td className="bt-wrap">{b.title || <span className="muted">Untitled</span>}</td>
                    <td>{L.party.get(b.partyId)?.name}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td className="num">{money(t.cost)}</td>
                    <td className="num bold">{money(t.price)}</td>
                    <td className="num">{pct(t.margin)}</td>
                    <td className="whitespace-nowrap">{fmtDate(b.updated)}</td>
                    <td className="center">
                      <button type="button" className="icon-btn" title="Clone as a new draft" aria-label={`Clone ${budgetLabel(b)}`} onClick={() => clone(b.id)}><Copy size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type SortKey = 'number' | 'job' | 'customer' | 'status' | 'price' | 'updated';

/** Every budget across all jobs, filterable and sortable, optionally grouped by job. */
export default function Budgets() {
  const { db } = useStore();
  const L = useLookups();
  const newBudget = useNewBudget();
  const [params] = useState(() => new URLSearchParams(location.search));
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<BudgetKind | ''>('');
  const [status, setStatus] = useState<BudgetStatus | ''>('');
  const [jobId, setJobId] = useState(params.get('job') ?? '');
  const [grouped, setGrouped] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updated', dir: -1 });
  const [newFor, setNewFor] = useState('');

  const byBudget = useMemo(() => linesByBudget(db), [db]);
  const price = (b: Budget) => totals(byBudget.get(b.id) ?? []).price;
  const rows = db.budgets.filter((b) => {
    if (kind && b.kind !== kind) return false;
    if (status && b.status !== status) return false;
    if (jobId && b.jobId !== jobId) return false;
    if (!q) return true;
    const hay = [budgetLabel(b), b.title, L.job.get(b.jobId)?.name, L.party.get(b.partyId)?.name].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const keyOf: Record<SortKey, (b: Budget) => string | number> = {
    number: (b) => b.number.split('-').map((x) => x.padStart(6, '0')).join('-'),
    job: (b) => L.job.get(b.jobId)?.name ?? '',
    customer: (b) => L.party.get(b.partyId)?.name ?? '',
    status: (b) => BUDGET_STATUSES.indexOf(b.status),
    price,
    updated: (b) => b.updated,
  };
  const cmp = (a: Budget, b: Budget) => {
    const x = keyOf[sort.key](a);
    const y = keyOf[sort.key](b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  };
  rows.sort(cmp);
  const groups = grouped
    ? [...new Set(rows.map((b) => b.jobId))]
        .map((id) => ({ id, rows: rows.filter((b) => b.jobId === id) }))
        .sort((a, b) => (L.job.get(a.id)?.name ?? '').localeCompare(L.job.get(b.id)?.name ?? ''))
    : [{ id: '', rows }];
  const jobsWithBudgets = db.jobs.filter((j) => db.budgets.some((b) => b.jobId === j.id));

  const Th = ({ k, children, className = '' }: { k: SortKey; children: string; className?: string }) => (
    <th className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-[inherit] uppercase"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'price' || k === 'updated' ? -1 : 1 }))}
      >
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="page fill">
      <PageHeader
        title="Budgets"
        actions={
          <>
            <select className="btn select-btn" value={newFor} aria-label="Job for a new budget" onChange={(e) => setNewFor(e.target.value)}>
              <option value="">Choose a job…</option>
              {db.jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
            <button type="button" className="btn" disabled={!newFor} onClick={() => newBudget(newFor, 'Change Order')}><FilePlus2 size={14} /> Change Order</button>
            <button type="button" className="btn primary" disabled={!newFor} onClick={() => newBudget(newFor, 'Proposal')}><FilePlus2 size={14} /> Proposal</button>
          </>
        }
      />
      <div className="toolbar flex-wrap">
        <label className="relative flex items-center">
          <Search size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
          <input className="b-input h-8 w-56 rounded-md border pl-8" placeholder="Search budgets" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search budgets" />
        </label>
        <select className="btn select-btn" value={kind} onChange={(e) => setKind(e.target.value as BudgetKind | '')} aria-label="Type">
          <option value="">All types</option>
          {BUDGET_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <select className="btn select-btn" value={status} onChange={(e) => setStatus(e.target.value as BudgetStatus | '')} aria-label="Status">
          <option value="">All statuses</option>
          {BUDGET_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="btn select-btn" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
          <option value="">All jobs</option>
          {jobsWithBudgets.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
        <label className="ml-1 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by job
        </label>
        <span className="grow" />
        <span className="muted small-text">{rows.length} budgets · {money(rows.reduce((s, b) => s + price(b), 0))}</span>
      </div>
      <div className="table-wrap">
        <table className="grid-table bt-table">
          <thead>
            <tr>
              <Th k="number">Budget</Th>
              <th>Title</th>
              {!grouped && <Th k="job">Job</Th>}
              <Th k="customer">To</Th>
              <Th k="status">Status</Th>
              <Th k="price" className="num">Price</Th>
              <Th k="updated">Updated</Th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id || 'all'}>
              {grouped && (() => {
                const r = jobRollup(db, g.id);
                return (
                  <tr className="b-group">
                    <td colSpan={4}>
                      <Link to={`/jobs?job=${g.id}&tab=budget`} className="font-semibold hover:underline">{L.job.get(g.id)?.name ?? 'No job'}</Link>
                      <span className="muted small-text ml-2">{L.customerName(g.id)}</span>
                    </td>
                    <td className="num" title="Approved proposals and change orders">{money(r.contract.price)}</td>
                    <td className="muted small-text">contract</td>
                  </tr>
                );
              })()}
              {g.rows.map((b) => (
                <tr key={b.id} className={b.status === 'Declined' || b.status === 'Void' ? 'text-muted-foreground' : ''}>
                  <td className="whitespace-nowrap"><Link to={`/budgets/${b.id}`} className="font-medium text-primary hover:underline">{budgetLabel(b)}</Link></td>
                  <td className="bt-wrap">{b.title || <span className="muted">Untitled</span>}</td>
                  {!grouped && <td>{L.job.get(b.jobId)?.name}</td>}
                  <td>{L.party.get(b.partyId)?.name}</td>
                  <td><StatusPill status={b.status} /></td>
                  <td className="num">{money(price(b))}</td>
                  <td className="whitespace-nowrap">{fmtDate(b.updated)}</td>
                </tr>
              ))}
            </tbody>
          ))}
          <tbody><tr className="filler"><td colSpan={grouped ? 6 : 7} /></tr></tbody>
        </table>
        {rows.length === 0 && <div className="wt-empty">No budgets match. Open a job and create a proposal, or pick a job above.</div>}
      </div>
    </div>
  );
}
