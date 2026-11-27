import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, Plus, Receipt, Search } from 'lucide-react';
import { Modal, PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { Button } from '@/components/ui/button';
import { useLookups, useStore, money, uid } from '../store';
import type { Account, Bill, Job } from '../data';
import { BILL_STAGES, BILL_STAGE_COLOR, billLabel, billMoney, billStage, createBill, jobPayables, payables, type BillStage } from '../bills';
import { todayYmd } from '../invoices';
import { PaidOn, PaymentsTable, fmtDate } from '../components/Payments';
import { Pill } from './Budgets';

const VENDOR_TYPES = ['Vendor', 'Subcontractor', 'Supplier'];
export const isVendor = (a: Account) => a.types.some((t) => VENDOR_TYPES.includes(t));

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <b className={tone === 'bad' ? 'text-destructive' : ''}>{value}</b>
      {sub && <span className="muted small-text">{sub}</span>}
    </div>
  );
}

/** Choose the job and vendor for a new bill, then open it. */
export function NewBillDialog({ jobId: presetJob = '', vendorId: presetVendor = '', onClose }: { jobId?: string; vendorId?: string; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const [jobId, setJobId] = useState(presetJob);
  const [vendorId, setVendorId] = useState(presetVendor);
  // vendors on the chosen job first, then every other vendor
  const onJob = new Set((L.linksByJob.get(jobId) ?? []).map((l) => l.partyId));
  const vendors = db.accounts.filter(isVendor).sort((a, b) => Number(onJob.has(b.id)) - Number(onJob.has(a.id)) || a.name.localeCompare(b.name));
  const jobs = [...db.jobs].sort((a, b) => Number(a.status === 'Completed') - Number(b.status === 'Completed') || a.name.localeCompare(b.name));
  const create = () => {
    if (!jobId || !vendorId) return;
    const id = uid('bill');
    update((d) => createBill(d, jobId, vendorId, id));
    onClose();
    nav(`/bills/${id}`);
  };
  return (
    <Modal title="New bill" onClose={onClose}>
      <p className="form-note">Enter a bill from a vendor or subcontractor's invoice. It starts as a draft so you can check it before approving it to pay.</p>
      <Field label="Job">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} autoFocus={!presetJob}>
          <option value="">Choose a job…</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
      </Field>
      <Field label="Vendor">
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} autoFocus={!!presetJob && !presetVendor}>
          <option value="">Choose a vendor…</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.trade ? ` · ${v.trade}` : ''}{onJob.has(v.id) ? ' (on this job)' : ''}</option>)}
        </select>
      </Field>
      {vendors.length === 0 && <p className="form-note small">No vendors yet. Add an account with the Vendor or Subcontractor type first.</p>}
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={create} disabled={!jobId || !vendorId}><FilePlus2 /> Create bill</Button>
      </div>
    </Modal>
  );
}

export function BillTable({ bills, showJob = true, showVendor = true, empty = 'No bills.' }: { bills: Bill[]; showJob?: boolean; showVendor?: boolean; empty?: string }) {
  const { db } = useStore();
  const L = useLookups();
  const today = todayYmd();
  return (
    <div className="table-wrap">
      <table className="grid-table bt-table">
        <thead>
          <tr>
            <th>Bill</th>
            {(showVendor || showJob) && <th>{showVendor && showJob ? 'Vendor · job' : showVendor ? 'Vendor' : 'Job'}</th>}
            <th>Status</th>
            <th>Due</th>
            <th className="num">Amount</th>
            <th className="num">Paid</th>
            <th className="num">Owed</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => {
            const stage = billStage(db, b, today);
            const m = billMoney(db, b);
            const counts = b.status === 'Open' || b.status === 'Paid';
            return (
              <tr key={b.id} className={b.status === 'Void' ? 'text-muted-foreground' : ''}>
                <td>
                  <Link to={`/bills/${b.id}`} className="font-medium text-primary hover:underline"><Receipt size={13} className="mr-1 inline" />{billLabel(b)}</Link>
                  <div className="text-xs text-muted-foreground">{[b.title || 'Untitled', b.vendorRef && `#${b.vendorRef}`].filter(Boolean).join(' · ')}</div>
                </td>
                {(showVendor || showJob) && (
                  <td className="bt-wrap">
                    {showVendor && <div>{L.party.get(b.vendorId)?.name ?? '—'}</div>}
                    {showJob && <div className={showVendor ? 'text-xs text-muted-foreground' : ''}>{L.job.get(b.jobId)?.name}</div>}
                  </td>
                )}
                <td><Pill label={stage} color={BILL_STAGE_COLOR[stage]} /></td>
                <td className={'whitespace-nowrap' + (stage === 'Overdue' ? ' font-medium text-destructive' : '')}>{fmtDate(b.due)}</td>
                <td className="num">{money(m.amount, true)}</td>
                <td className="num">{m.paid ? <>{money(m.paid, true)}<PaidOn count={m.payments} last={m.lastPaid} /></> : <span className="muted">—</span>}</td>
                <td className="num bold">{counts ? money(m.balance, true) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {bills.length === 0 && <div className="wt-empty">{empty}</div>}
    </div>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const byDue = (a: Bill, b: Bill) => (a.due || '9').localeCompare(b.due || '9') || a.created.localeCompare(b.created);

/** The Bills tab on a job: what we owe its vendors, the bills, and the payments made. */
export function JobBills({ job }: { job: Job }) {
  const { db } = useStore();
  const [adding, setAdding] = useState(false);
  const p = jobPayables(db, job.id);
  const bills = [...p.bills].sort(byDue);
  return (
    <div className="b-wrap">
      <div className="b-summary">
        <Stat label="Approved bills" value={money(p.billed)} sub={p.drafts ? `${money(p.drafts)} in drafts to review` : 'Open and paid bills'} />
        <Stat label="Paid" value={money(p.paid)} sub={`${p.payments.length} payment${p.payments.length === 1 ? '' : 's'}`} />
        <Stat label="Owed" value={money(p.owed)} sub={p.dueSoon ? `${money(p.dueSoon)} due this week` : 'Approved, not yet paid'} />
        <Stat label="Overdue" value={money(p.overdue)} tone={p.overdue > 0 ? 'bad' : undefined} sub={p.overdue > 0 ? 'Past the due date' : 'Nothing overdue'} />
      </div>
      <div className="toolbar b-toolbar">
        <h2 className="text-base font-semibold">Bills</h2>
        <span className="grow" />
        <button type="button" className="btn primary" onClick={() => setAdding(true)}><FilePlus2 size={14} /> New Bill</button>
      </div>
      {bills.length > 0 ? <BillTable bills={bills} showJob={false} /> : <div className="card b-empty"><p>No bills on this job yet. Enter one when a vendor or subcontractor invoices you, then record payments against it as you pay.</p></div>}
      {p.payments.length > 0 && (
        <>
          <div className="toolbar b-toolbar mt-6">
            <h2 className="text-base font-semibold">Payments made</h2>
            <span className="muted small-text">{p.payments.length} · {money(p.paid, true)}</span>
            <span className="grow" />
            <span className="muted small-text">Record a payment from the bill it pays.</span>
          </div>
          <PaymentsTable payments={p.payments} showDoc />
        </>
      )}
      {adding && <NewBillDialog jobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Every bill across all jobs. */
export default function Bills() {
  const { db } = useStore();
  const L = useLookups();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<BillStage | 'unpaid' | ''>('unpaid');
  const [jobId, setJobId] = useState(() => new URLSearchParams(location.search).get('job') ?? '');
  const [vendorId, setVendorId] = useState(() => new URLSearchParams(location.search).get('vendor') ?? '');
  const [adding, setAdding] = useState(false);
  const today = todayYmd();
  const p = useMemo(() => payables(db, db.bills, today), [db, today]);
  const month = today.slice(0, 7);
  const paidThisMonth = db.payments.filter((x) => x.billId && x.date.startsWith(month)).reduce((s, x) => s + x.amount, 0);
  const rows = db.bills
    .filter((b) => {
      if (jobId && b.jobId !== jobId) return false;
      if (vendorId && b.vendorId !== vendorId) return false;
      const st = billStage(db, b, today);
      if (stage === 'unpaid' ? st === 'Paid' || st === 'Void' : stage && st !== stage) return false;
      if (!q) return true;
      return [billLabel(b), b.title, b.vendorRef, L.job.get(b.jobId)?.name, L.party.get(b.vendorId)?.name].join(' ').toLowerCase().includes(q.toLowerCase());
    })
    .sort(stage === 'Paid' || stage === 'Void' ? (a, b) => b.date.localeCompare(a.date) : byDue);
  const jobs = db.jobs.filter((j) => db.bills.some((b) => b.jobId === j.id));
  const vendors = db.accounts.filter((a) => db.bills.some((b) => b.vendorId === a.id));
  return (
    <div className="page scroll">
      <PageHeader title="Bills" actions={<button type="button" className="btn primary" onClick={() => setAdding(true)}><Plus size={14} /> New bill</button>} />
      <div className="detail">
        <div className="b-summary">
          <Stat label="Owed" value={money(p.owed)} sub="Approved bills not yet paid" />
          <Stat label="Overdue" value={money(p.overdue)} tone={p.overdue > 0 ? 'bad' : undefined} sub={p.overdue > 0 ? 'Past the due date' : 'Nothing overdue'} />
          <Stat label="Due in the next 7 days" value={money(p.dueSoon)} />
          <Stat label="Paid this month" value={money(paidThisMonth)} />
          <Stat label="Drafts to review" value={money(p.drafts)} sub={plural(db.bills.filter((b) => b.status === 'Draft').length, 'bill') + ' waiting for approval'} />
        </div>
        <div className="toolbar flex-wrap">
          <label className="relative flex items-center">
            <Search size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
            <input className="b-input h-8 w-56 rounded-md border pl-8" placeholder="Search bills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bills" />
          </label>
          <select className="btn select-btn" value={stage} onChange={(e) => setStage(e.target.value as BillStage | 'unpaid' | '')} aria-label="Status">
            <option value="unpaid">Not yet paid</option>
            <option value="">All statuses</option>
            {BILL_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="btn select-btn" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
            <option value="">All jobs</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <select className="btn select-btn" value={vendorId} onChange={(e) => setVendorId(e.target.value)} aria-label="Vendor">
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <span className="grow" />
          <span className="muted small-text">{plural(rows.length, 'bill')} · {money(rows.reduce((s, b) => s + billMoney(db, b).balance, 0))} owed</span>
        </div>
        <BillTable bills={rows} empty={stage === 'unpaid' ? 'Nothing waiting to be paid.' : 'No bills match.'} />
      </div>
      {adding && <NewBillDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
