import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, ReceiptText, Search } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { useLookups, useStore, money, uid } from '../store';
import { type Invoice, type Job } from '../data';
import { budgetLabel, linesByBudget } from '../budgets';
import { STAGE_COLOR, billableBudgets, createInvoice, invoiceLabel, invoiceMoney, invoiceStage, jobBilling, type InvoiceStage } from '../invoices';
import { PaymentsTable, fmtDate } from '../components/Payments';
import { Pill } from './Budgets';

const STAGES: InvoiceStage[] = ['Draft', 'Sent', 'Partially paid', 'Overdue', 'Paid', 'Void'];

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

function Stat({ label, value, sub, bar }: { label: string; value: string; sub?: string; bar?: { pct: number; color: string } }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <b>{value}</b>
      {bar && <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, bar.pct))}%`, background: bar.color }} /></span>}
      {sub && <span className="muted small-text">{sub}</span>}
    </div>
  );
}

const pctOf = (a: number, b: number) => (b ? (a / b) * 100 : 0);

/** The job's money at a glance: contract → billed → received, what's owed, and what's left to bill. */
export function BillingCards({ job }: { job: Job }) {
  const { db } = useStore();
  const b = jobBilling(db, job.id);
  return (
    <div className="b-summary">
      <Stat label="Contract" value={money(b.contract)} sub="Approved proposals and change orders" />
      <Stat label="Billed to date" value={money(b.billed)} bar={{ pct: pctOf(b.billed, b.contract), color: '#51a2ff' }} sub={`${Math.round(pctOf(b.billed, b.contract))}% of contract`} />
      <Stat label="Received" value={money(b.received)} bar={{ pct: pctOf(b.received, b.billed), color: '#00c950' }} sub={`${Math.round(pctOf(b.received, b.billed))}% of billed`} />
      <Stat label="Outstanding" value={money(b.outstanding)} sub={b.overdue > 0 ? `${money(b.overdue)} overdue` : 'Billed, not yet received'} />
      <Stat label="Left to bill" value={money(b.left)} sub={b.drafts ? `${money(b.drafts)} in drafts` : `${Math.round(pctOf(b.left, b.contract))}% of contract`} />
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
            {showJob && <th>Job · bill to</th>}
            <th>Status</th>
            {!showJob && <th>Date</th>}
            <th>Due</th>
            <th className="num">Amount</th>
            <th className="num">Paid</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => {
            const stage = invoiceStage(db, i, byBudget);
            const m = invoiceMoney(db, i, byBudget);
            const billing = i.budgetIds.map((bid) => db.budgets.find((b) => b.id === bid)).filter((b) => !!b).map((b) => budgetLabel(b)).join(', ');
            return (
              <tr key={i.id} className={i.status === 'Void' ? 'text-muted-foreground' : ''}>
                <td>
                  <Link to={`/invoices/${i.id}`} className="font-medium text-primary hover:underline" title={`Billing ${billing}`}><ReceiptText size={13} className="mr-1 inline" />{invoiceLabel(i)}</Link>
                  <div className="text-xs text-muted-foreground">{i.title || 'Untitled'}</div>
                </td>
                {showJob && (
                  <td className="bt-wrap">
                    <div>{L.job.get(i.jobId)?.name}</div>
                    <div className="text-xs text-muted-foreground">{L.party.get(i.partyId)?.name}</div>
                  </td>
                )}
                <td><Pill label={stage} color={STAGE_COLOR[stage]} /></td>
                {!showJob && <td className="whitespace-nowrap">{fmtDate(i.date)}</td>}
                <td className={'whitespace-nowrap' + (stage === 'Overdue' ? ' font-medium text-destructive' : '')}>{fmtDate(i.due)}</td>
                <td className="num">{money(m.amount, true)}</td>
                <td className="num">{m.paid ? money(m.paid, true) : <span className="muted">—</span>}</td>
                <td className="num bold">{i.status === 'Sent' || i.status === 'Paid' ? money(m.balance, true) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {invoices.length === 0 && <div className="wt-empty">No invoices.</div>}
    </div>
  );
}

/** The Invoices tab on a job: billing totals, its invoices, and the payments received. */
export function JobInvoices({ job }: { job: Job }) {
  const { db } = useStore();
  const newInvoice = useNewInvoice();
  const canBill = billableBudgets(db, job.id).length > 0;
  const invoices = db.invoices.filter((i) => i.jobId === job.id).sort((a, b) => a.created.localeCompare(b.created));
  const { payments, received } = jobBilling(db, job.id);
  return (
    <div className="b-wrap">
      <BillingCards job={job} />
      <div className="toolbar b-toolbar">
        <h2 className="text-base font-semibold">Invoices</h2>
        {!canBill && <span className="muted small-text">Approve a proposal or change order first. Invoices bill a percentage of approved lines.</span>}
        <span className="grow" />
        <button type="button" className="btn primary" disabled={!canBill} onClick={() => newInvoice(job.id)}><FilePlus2 size={14} /> New Invoice</button>
      </div>
      {invoices.length > 0 ? <InvoiceTable invoices={invoices} /> : canBill && <div className="card b-empty"><p>No invoices yet. A new invoice includes every approved proposal and change order on this job; enter how complete each line is and the amount due is worked out for you.</p></div>}
      {invoices.some((i) => i.status === 'Sent' || i.status === 'Paid') && (
        <>
          <div className="toolbar b-toolbar mt-6">
            <h2 className="text-base font-semibold">Payments received</h2>
            <span className="muted small-text">{payments.length} · {money(received, true)}</span>
            <span className="grow" />
            <span className="muted small-text">Record a payment from the invoice it pays.</span>
          </div>
          <PaymentsTable payments={payments} showInvoice />
        </>
      )}
    </div>
  );
}

/** Every invoice across all jobs. */
export default function Invoices() {
  const { db } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<InvoiceStage | ''>('');
  const [jobId, setJobId] = useState(() => new URLSearchParams(location.search).get('job') ?? '');
  const L = useLookups();
  const byBudget = useMemo(() => linesByBudget(db), [db]);
  const rows = db.invoices
    .filter((i) => {
      if (jobId && i.jobId !== jobId) return false;
      if (status && invoiceStage(db, i, byBudget) !== status) return false;
      if (!q) return true;
      return [invoiceLabel(i), i.title, L.job.get(i.jobId)?.name, L.party.get(i.partyId)?.name].join(' ').toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const owed = db.invoices.filter((i) => i.status === 'Sent').map((i) => ({ i, balance: invoiceMoney(db, i, byBudget).balance }));
  const outstanding = owed.reduce((s, x) => s + x.balance, 0);
  const overdue = owed.filter((x) => invoiceStage(db, x.i, byBudget) === 'Overdue').reduce((s, x) => s + x.balance, 0);
  const jobsWithInvoices = db.jobs.filter((j) => db.invoices.some((i) => i.jobId === j.id));
  return (
    <div className="page fill">
      <PageHeader title="Invoices" />
      <div className="toolbar flex-wrap">
        <label className="relative flex items-center">
          <Search size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
          <input className="b-input h-8 w-56 rounded-md border pl-8" placeholder="Search invoices" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
        </label>
        <select className="btn select-btn" value={status} onChange={(e) => setStatus(e.target.value as InvoiceStage | '')} aria-label="Status">
          <option value="">All statuses</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="btn select-btn" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
          <option value="">All jobs</option>
          {jobsWithInvoices.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
        <span className="grow" />
        <span className="muted small-text">{rows.length} invoices · {money(outstanding)} outstanding{overdue > 0 && <span className="text-destructive"> · {money(overdue)} overdue</span>}</span>
      </div>
      <InvoiceTable invoices={rows} showJob />
      <p className="muted small-text px-1 py-2">To start an invoice, open a job and go to its Invoices tab.</p>
    </div>
  );
}
