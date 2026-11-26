import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, ReceiptText, Search } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { useLookups, useStore, money, uid } from '../store';
import { INVOICE_STATUSES, type Invoice, type InvoiceStatus, type Job } from '../data';
import { budgetLabel, linesByBudget } from '../budgets';
import { INVOICE_STATUS_COLOR, billableBudgets, createInvoice, invoiceLabel, invoiceTotals, jobBilling } from '../invoices';
import { Pill } from './Budgets';

const fmtDate = (ymd: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const today = () => new Date().toLocaleDateString('en-CA');

/** Starts a draft invoice on a job (against all its approved budgets) and opens it. */
export function useNewInvoice() {
  const { update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  return (jobId: string) => {
    const id = uid('inv');
    update((d) => createInvoice(d, jobId, L.customers(jobId)[0]?.id ?? '', id));
    nav(`/invoices/${id}`);
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

export function BillingCards({ job }: { job: Job }) {
  const { db } = useStore();
  const b = jobBilling(db, job.id);
  const billedPct = b.contract ? (b.billed / b.contract) * 100 : 0;
  return (
    <div className="b-summary">
      <Stat label="Contract" value={money(b.contract)} sub="Approved proposals + change orders" />
      <div className="card stat">
        <span className="stat-label">Billed to date</span>
        <b>{money(b.billed)}</b>
        <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.min(100, billedPct)}%`, background: '#51a2ff' }} /></span>
        <span className="muted small-text">{Math.round(billedPct)}% of contract</span>
      </div>
      <Stat label="Paid" value={money(b.paid)} />
      <Stat label="Outstanding" value={money(b.outstanding)} sub="Sent, not yet paid" />
      <Stat label="Left to bill" value={money(b.left)} sub={b.drafts ? `${money(b.drafts)} in drafts` : undefined} />
    </div>
  );
}

function InvoiceTable({ invoices, showJob }: { invoices: Invoice[]; showJob?: boolean }) {
  const { db } = useStore();
  const L = useLookups();
  const byBudget = useMemo(() => linesByBudget(db), [db]);
  return (
    <div className="table-wrap">
      <table className="grid-table bt-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Title</th>
            {showJob && <th>Job</th>}
            <th>Bill to</th>
            <th>Billing against</th>
            <th>Status</th>
            <th>Date</th>
            <th>Due</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => {
            const overdue = i.status === 'Sent' && i.due < today();
            return (
              <tr key={i.id} className={i.status === 'Void' ? 'text-muted-foreground' : ''}>
                <td><Link to={`/invoices/${i.id}`} className="font-medium text-primary hover:underline"><ReceiptText size={13} className="mr-1 inline" />{invoiceLabel(i)}</Link></td>
                <td className="bt-wrap">{i.title || <span className="muted">Untitled</span>}</td>
                {showJob && <td>{L.job.get(i.jobId)?.name}</td>}
                <td>{L.party.get(i.partyId)?.name}</td>
                <td className="text-xs text-muted-foreground">{i.budgetIds.map((bid) => db.budgets.find((b) => b.id === bid)).filter((b) => !!b).map((b) => budgetLabel(b)).join(', ')}</td>
                <td><Pill label={overdue ? 'Overdue' : i.status} color={overdue ? '#fb2c36' : INVOICE_STATUS_COLOR[i.status]} /></td>
                <td>{fmtDate(i.date)}</td>
                <td>{fmtDate(i.due)}</td>
                <td className="num bold">{money(invoiceTotals(db, i, byBudget).amount, true)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {invoices.length === 0 && <div className="wt-empty">No invoices.</div>}
    </div>
  );
}

/** The Invoices tab on a job. */
export function JobInvoices({ job }: { job: Job }) {
  const { db } = useStore();
  const newInvoice = useNewInvoice();
  const canBill = billableBudgets(db, job.id).length > 0;
  const invoices = db.invoices.filter((i) => i.jobId === job.id).sort((a, b) => a.created.localeCompare(b.created));
  return (
    <div className="b-wrap">
      <BillingCards job={job} />
      <div className="toolbar b-toolbar">
        <button type="button" className="btn primary" disabled={!canBill} onClick={() => newInvoice(job.id)}><FilePlus2 size={14} /> New Invoice</button>
        {!canBill && <span className="muted small-text">Approve a proposal or change order first. Invoices bill a percentage of approved lines.</span>}
      </div>
      {invoices.length > 0 ? <InvoiceTable invoices={invoices} /> : canBill && <div className="card b-empty"><p>No invoices yet. A new invoice includes every approved proposal and change order on this job; enter how complete each line is and the amount due is worked out for you.</p></div>}
    </div>
  );
}

/** Every invoice across all jobs. */
export default function Invoices() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | 'Overdue' | ''>('');
  const [jobId, setJobId] = useState(() => new URLSearchParams(location.search).get('job') ?? '');
  const L = useLookups();
  const byBudget = useMemo(() => linesByBudget(db), [db]);
  const rows = db.invoices
    .filter((i) => {
      if (jobId && i.jobId !== jobId) return false;
      if (status === 'Overdue' ? !(i.status === 'Sent' && i.due < today()) : status && i.status !== status) return false;
      if (!q) return true;
      return [invoiceLabel(i), i.title, L.job.get(i.jobId)?.name, L.party.get(i.partyId)?.name].join(' ').toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const outstanding = db.invoices.filter((i) => i.status === 'Sent').reduce((s, i) => s + invoiceTotals(db, i, byBudget).amount, 0);
  const jobsWithInvoices = db.jobs.filter((j) => db.invoices.some((i) => i.jobId === j.id));
  return (
    <div className="page fill">
      <PageHeader title="Invoices" />
      <div className="toolbar flex-wrap">
        <label className="relative flex items-center">
          <Search size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
          <input className="b-input h-8 w-56 rounded-md border pl-8" placeholder="Search invoices" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
        </label>
        <select className="btn select-btn" value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | 'Overdue' | '')} aria-label="Status">
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          <option>Overdue</option>
        </select>
        <select className="btn select-btn" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
          <option value="">All jobs</option>
          {jobsWithInvoices.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
        <span className="grow" />
        <span className="muted small-text">{rows.length} invoices · {money(outstanding)} outstanding</span>
      </div>
      <InvoiceTable invoices={rows} showJob />
      <p className="muted small-text px-1 py-2">To start an invoice, open a job and go to its Invoices tab.</p>
    </div>
  );
}
