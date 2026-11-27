import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronDown, Copy, FilePlus2, FileText, Plus, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '../components/Layout';
import { useLookups, useStore, money, uid } from '../store';
import { BUDGET_KINDS, BUDGET_STATUSES, type Budget, type BudgetKind, type BudgetStatus, type Job } from '../data';
import { useRememberedChoice } from '../components/DocLayout';
import { BUDGET_STATUS_COLOR, budgetLabel, cloneBudget, createBudget, linesByBudget, pct, totals } from '../budgets';
import { tone } from '../colors';

export const StatusPill = ({ status }: { status: BudgetStatus }) => <Pill label={status} color={BUDGET_STATUS_COLOR[status]} />;

/** A coloured status label, e.g. "Approved" or "Paid". */
export function Pill({ label, color: c }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in oklab, ${tone(c)} 15%, transparent)`, color: `color-mix(in oklab, ${tone(c)} 78%, var(--foreground))` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: tone(c) }} />
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

const KIND_HINT: Record<BudgetKind, string> = {
  Proposal: 'The main scope of work, or an option to price',
  'Change Order': 'Added or changed work on an agreed job',
};

/** One "New" button that asks which kind of budget to start. Disabled until there is a job. */
export function NewBudgetMenu({ jobId, label = 'New', primary = true }: { jobId: string; label?: string; primary?: boolean }) {
  const newBudget = useNewBudget();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={'btn' + (primary ? ' primary' : '')} disabled={!jobId}>
        <Plus size={14} /> {label} <ChevronDown size={14} className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {BUDGET_KINDS.map((k) => (
          <DropdownMenuItem key={k} className="items-start gap-3 py-2" onSelect={() => newBudget(jobId, k)}>
            <FilePlus2 className="mt-0.5 size-4 text-muted-foreground" />
            <span className="flex flex-col">
              <span className="font-medium">{k}</span>
              <span className="text-xs text-muted-foreground">{KIND_HINT[k]}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type GroupBy = 'status' | 'kind' | 'job' | 'none';
type SortKey = 'number' | 'title' | 'job' | 'customer' | 'status' | 'price' | 'updated';
const GROUP_LABEL: Record<GroupBy, string> = { status: 'Status', kind: 'Type', job: 'Job', none: 'None' };
// approved first, since that's the signed work
const STATUS_ORDER: BudgetStatus[] = ['Approved', 'Sent', 'Draft', 'Declined', 'Void'];

/**
 * A list of budgets that can be grouped (by status, type or job) and sorted. Group rows show
 * totals: grouped by status they add up the group, otherwise they show what's approved in it.
 */
function BudgetList({ budgets, showJob, groups, storageKey, defaultSort, toolbar, actions }: {
  budgets: Budget[];
  showJob?: boolean;
  groups: GroupBy[];
  storageKey: string;
  defaultSort: { key: SortKey; dir: 1 | -1 };
  toolbar?: ReactNode;
  actions?: ReactNode; // right-hand end of the toolbar, after Group by
}) {
  const { db } = useStore();
  const L = useLookups();
  const clone = useCloneBudget();
  const [groupBy, setGroupBy] = useRememberedChoice<GroupBy>(storageKey, groups, groups[0]);
  const [sort, setSort] = useState(defaultSort);
  const byBudget = useMemo(() => linesByBudget(db), [db]);
  const t = (b: Budget) => totals(byBudget.get(b.id) ?? []);

  const keyOf: Record<SortKey, (b: Budget) => string | number> = {
    number: (b) => b.number.split('-').map((x) => x.padStart(6, '0')).join('-'),
    title: (b) => b.title.toLowerCase(),
    job: (b) => L.job.get(b.jobId)?.name ?? '',
    customer: (b) => L.party.get(b.partyId)?.name ?? '',
    status: (b) => STATUS_ORDER.indexOf(b.status),
    price: (b) => t(b).price,
    updated: (b) => b.updated,
  };
  const rows = [...budgets].sort((a, b) => {
    const x = keyOf[sort.key](a);
    const y = keyOf[sort.key](b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const sections: { key: string; label: ReactNode; rows: Budget[] }[] =
    groupBy === 'status'
      ? STATUS_ORDER.map((st) => ({ key: st, label: <StatusPill status={st} />, rows: rows.filter((b) => b.status === st) }))
      : groupBy === 'kind'
        ? BUDGET_KINDS.map((k) => ({ key: k, label: <b>{k === 'Proposal' ? 'Proposals' : 'Change orders'}</b>, rows: rows.filter((b) => b.kind === k) }))
        : groupBy === 'job'
          ? [...new Set(rows.map((b) => b.jobId))]
              .sort((x, y) => (L.job.get(x)?.name ?? '').localeCompare(L.job.get(y)?.name ?? ''))
              .map((jid) => ({
                key: jid,
                label: (
                  <>
                    <Link to={`/jobs?job=${jid}&tab=budget`} className="font-semibold hover:underline">{L.job.get(jid)?.name ?? 'No job'}</Link>
                    <span className="muted small-text ml-2">{L.customerName(jid)}</span>
                  </>
                ),
                rows: rows.filter((b) => b.jobId === jid),
              }))
          : [{ key: 'all', label: null, rows }];

  const labelCols = showJob ? 5 : 4;
  const Th = ({ k, children, className = '' }: { k: SortKey; children: string; className?: string }) => (
    <th className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-[inherit] uppercase"
        onClick={() => setSort((x) => ({ key: k, dir: x.key === k ? (x.dir === 1 ? -1 : 1) : k === 'price' || k === 'updated' ? -1 : 1 }))}
      >
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <>
      <div className="toolbar b-toolbar flex-wrap">
        {toolbar}
        <span className="grow" />
        {groups.length > 1 && (
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Group by</span>
            <select className="btn select-btn" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Group by">
              {groups.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
            </select>
          </label>
        )}
        {actions}
      </div>
      <div className="table-wrap">
        <table className="grid-table bt-table">
          <thead>
            <tr>
              <Th k="number">Budget</Th>
              <Th k="title">Title</Th>
              {showJob && <Th k="job">Job</Th>}
              <Th k="customer">To</Th>
              <Th k="status">Status</Th>
              <th className="num">Cost</th>
              <Th k="price" className="num">Price</Th>
              <th className="num">Margin</th>
              <Th k="updated">Updated</Th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          {sections.filter((sec) => sec.rows.length > 0).map((sec) => {
            const sum = totals(sec.rows.flatMap((b) => byBudget.get(b.id) ?? []));
            const approved = sec.rows.filter((b) => b.status === 'Approved');
            const approvedPrice = approved.reduce((x, b) => x + t(b).price, 0);
            return (
              <tbody key={sec.key}>
                {sec.label && (
                  <tr className="b-group">
                    <td colSpan={labelCols}>
                      <span className="inline-flex items-center gap-2">
                        {sec.label}
                        <span className="muted small-text">{sec.rows.length}</span>
                        {groupBy === 'status'
                          ? <b className="tabular-nums">{money(sum.price)}</b>
                          : approved.length > 0 && <span className="muted small-text">· {money(approvedPrice)} approved</span>}
                      </span>
                    </td>
                    {groupBy === 'status' ? (
                      <>
                        <td className="num">{money(sum.cost)}</td>
                        <td className="num bold">{money(sum.price)}</td>
                        <td className="num">{pct(sum.margin)}</td>
                      </>
                    ) : <td colSpan={3} />}
                    <td colSpan={2} />
                  </tr>
                )}
                {sec.rows.map((b) => {
                  const bt = t(b);
                  return (
                    <tr key={b.id} className={b.status === 'Declined' || b.status === 'Void' ? 'text-muted-foreground' : ''}>
                      <td className="whitespace-nowrap"><Link to={`/budgets/${b.id}`} className="font-medium text-primary hover:underline"><FileText size={13} className="mr-1 inline" />{budgetLabel(b)}</Link></td>
                      <td className="bt-wrap">{b.title || <span className="muted">Untitled</span>}</td>
                      {showJob && <td>{L.job.get(b.jobId)?.name}</td>}
                      <td>{L.party.get(b.partyId)?.name}</td>
                      <td><StatusPill status={b.status} /></td>
                      <td className="num">{money(bt.cost)}</td>
                      <td className="num bold">{money(bt.price)}</td>
                      <td className="num">{pct(bt.margin)}</td>
                      <td className="whitespace-nowrap">{fmtDate(b.updated)}</td>
                      <td className="center">
                        <button type="button" className="icon-btn" title="Clone as a new draft" aria-label={`Clone ${budgetLabel(b)}`} onClick={() => clone(b.id)}><Copy size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
        {rows.length === 0 && <div className="wt-empty">No budgets match.</div>}
      </div>
    </>
  );
}

/** The Budgets tab on a job: its proposals and change orders, grouped by status. */
export function JobBudgets({ job }: { job: Job }) {
  const { db } = useStore();
  const budgets = db.budgets.filter((b) => b.jobId === job.id);
  const byBudget = useMemo(() => linesByBudget(db), [db]);
  if (budgets.length === 0) {
    return (
      <div className="b-wrap">
        <div className="card b-empty">
          <p>No budgets yet. Start with a proposal: it holds its own line items and becomes the document you send the customer. Add change orders, or more proposals for separate work, the same way.</p>
          <NewBudgetMenu jobId={job.id} label="New budget" />
        </div>
      </div>
    );
  }
  const approved = budgets.filter((b) => b.status === 'Approved').reduce((s, b) => s + totals(byBudget.get(b.id) ?? []).price, 0);
  return (
    <div className="b-wrap">
      <BudgetList
        budgets={budgets}
        groups={['status', 'kind', 'none']}
        storageKey="buildtrack-job-budgets-group"
        defaultSort={{ key: 'number', dir: 1 }}
        toolbar={<span className="muted small-text">{budgets.length} {budgets.length === 1 ? 'budget' : 'budgets'} · {money(approved)} approved</span>}
        actions={<NewBudgetMenu jobId={job.id} />}
      />
    </div>
  );
}

/** Every budget across all jobs, filterable, sortable and groupable. */
export default function Budgets() {
  const { db } = useStore();
  const L = useLookups();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<BudgetKind | ''>('');
  const [status, setStatus] = useState<BudgetStatus | ''>('');
  const [jobId, setJobId] = useState(() => new URLSearchParams(location.search).get('job') ?? '');
  const [newFor, setNewFor] = useState('');
  const byBudget = useMemo(() => linesByBudget(db), [db]);

  const rows = db.budgets.filter((b) => {
    if (kind && b.kind !== kind) return false;
    if (status && b.status !== status) return false;
    if (jobId && b.jobId !== jobId) return false;
    if (!q) return true;
    return [budgetLabel(b), b.title, L.job.get(b.jobId)?.name, L.party.get(b.partyId)?.name].join(' ').toLowerCase().includes(q.toLowerCase());
  });
  const approvedTotal = rows.filter((b) => b.status === 'Approved').reduce((s, b) => s + totals(byBudget.get(b.id) ?? []).price, 0);
  const jobsWithBudgets = db.jobs.filter((j) => db.budgets.some((b) => b.jobId === j.id));

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
            <NewBudgetMenu jobId={newFor} label="New budget" />
          </>
        }
      />
      <BudgetList
        budgets={rows}
        showJob
        groups={['job', 'status', 'kind', 'none']}
        storageKey="buildtrack-budgets-group"
        defaultSort={{ key: 'updated', dir: -1 }}
        toolbar={
          <>
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
            <span className="muted small-text">{rows.length} budgets · {money(approvedTotal)} approved</span>
          </>
        }
      />
    </div>
  );
}
