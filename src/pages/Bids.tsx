import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, FilePlus2, Plus, Search } from 'lucide-react';
import { Modal, PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { Button } from '@/components/ui/button';
import { useLookups, useStore, money, uid } from '../store';
import { BID_PACKAGE_STATUSES, type BidPackage, type BidPackageStatus, type Job } from '../data';
import { PACKAGE_STATUS_COLOR, createPackage, packageLabel, packageSummary } from '../bids';
import { todayYmd } from '../invoices';
import { fmtDate } from '../components/Payments';
import { Pill } from './Budgets';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <b>{value}</b>
      {sub && <span className="muted small-text">{sub}</span>}
    </div>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Start a bid package on a job, then open its scope to fill in. */
export function NewPackageDialog({ jobId: presetJob = '', onClose }: { jobId?: string; onClose: () => void }) {
  const { db, update } = useStore();
  const nav = useNavigate();
  const [jobId, setJobId] = useState(presetJob);
  const [title, setTitle] = useState('');
  const [costCodeId, setCostCodeId] = useState('');
  const jobs = db.jobs.filter((j) => j.status !== 'Completed').sort((a, b) => a.name.localeCompare(b.name));
  const create = () => {
    if (!jobId) return;
    const id = uid('bp');
    const code = db.costCodes.find((c) => c.id === costCodeId);
    update((d) => createPackage(d, jobId, id, { title: title.trim() || (code ? code.name : ''), costCodeId }));
    onClose();
    nav(`/bids/${id}?view=scope`);
  };
  return (
    <Modal title="New bid package" onClose={onClose}>
      <p className="form-note">A bid package is a scope of work you send to subcontractors for pricing, like "Electrical — whole house". You'll write the scope, add files and choose who to send it to next.</p>
      {!presetJob && (
        <Field label="Job">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} autoFocus>
            <option value="">Choose a job…</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Trade (cost code)">
        <select value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)} autoFocus={!!presetJob}>
          <option value="">Choose…</option>
          {db.costCodes.map((c) => <option key={c.id} value={c.id}>{c.number} {c.name}</option>)}
        </select>
      </Field>
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Electrical — rough and finish" />
      </Field>
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={create} disabled={!jobId}><FilePlus2 /> Create package</Button>
      </div>
    </Modal>
  );
}

export function PackageTable({ packages, showJob = true, empty = 'No bid packages.' }: { packages: BidPackage[]; showJob?: boolean; empty?: string }) {
  const { db } = useStore();
  const L = useLookups();
  const today = todayYmd();
  return (
    <div className="table-wrap">
      <table className="grid-table bt-table">
        <thead>
          <tr>
            <th>Package</th>
            {showJob && <th>Job</th>}
            <th>Status</th>
            <th>Bids due</th>
            <th>Bids</th>
            <th className="num">Budget</th>
            <th className="num">Low bid</th>
            <th className="num">Awarded</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((p) => {
            const s = packageSummary(db, p);
            const code = db.costCodes.find((c) => c.id === p.costCodeId);
            const late = p.status === 'Out for bid' && p.due && p.due < today && s.waiting > 0;
            return (
              <tr key={p.id} className={p.status === 'Cancelled' ? 'text-muted-foreground' : ''}>
                <td>
                  <Link to={`/bids/${p.id}`} className="font-medium text-primary hover:underline"><ClipboardList size={13} className="mr-1 inline" />{p.title || packageLabel(p)}</Link>
                  <div className="text-xs text-muted-foreground">{[packageLabel(p), code && `${code.number} ${code.name}`].filter(Boolean).join(' · ')}</div>
                </td>
                {showJob && <td className="bt-wrap">{L.job.get(p.jobId)?.name}</td>}
                <td><Pill label={p.status} color={PACKAGE_STATUS_COLOR[p.status]} /></td>
                <td className={'whitespace-nowrap' + (late ? ' font-medium text-destructive' : '')}>{fmtDate(p.due)}</td>
                <td className="whitespace-nowrap">
                  {s.bids.length === 0 ? <span className="muted">Nobody invited</span> : (
                    <>
                      <div>{s.received} of {s.bids.length} back</div>
                      <div className="text-xs text-muted-foreground">{s.notSent ? `${s.notSent} not sent yet` : s.waiting ? `${s.waiting} waiting` : 'All in'}</div>
                    </>
                  )}
                </td>
                <td className="num">{s.budget ? money(s.budget) : <span className="muted">—</span>}</td>
                <td className="num">
                  {s.low ? (
                    <>
                      {money(s.low.amount)}
                      <div className="text-xs text-muted-foreground">{L.party.get(s.low.vendorId)?.name}</div>
                    </>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="num bold">
                  {s.awarded.length ? (
                    <>
                      {money(s.awardedTotal)}
                      <div className="text-xs font-normal text-muted-foreground">{s.awarded.map((b) => L.party.get(b.vendorId)?.name).join(', ')}</div>
                    </>
                  ) : <span className="muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {packages.length === 0 && <div className="wt-empty">{empty}</div>}
    </div>
  );
}

const order: Record<BidPackageStatus, number> = { 'Out for bid': 0, Draft: 1, Awarded: 2, Cancelled: 3 };
const sortPackages = (a: BidPackage, b: BidPackage) => order[a.status] - order[b.status] || (a.due || '9').localeCompare(b.due || '9');

/** The Bids tab on a job. */
export function JobBids({ job }: { job: Job }) {
  const { db } = useStore();
  const [adding, setAdding] = useState(false);
  const packages = db.bidPackages.filter((p) => p.jobId === job.id).sort(sortPackages);
  return (
    <div className="b-wrap">
      <div className="toolbar b-toolbar">
        <h2 className="text-base font-semibold">Bid packages</h2>
        <span className="muted small-text">Send a scope to subcontractors, compare their prices, and award one. Awarding creates a draft bill.</span>
        <span className="grow" />
        <button type="button" className="btn primary" onClick={() => setAdding(true)}><FilePlus2 size={14} /> New Bid Package</button>
      </div>
      {packages.length > 0 ? <PackageTable packages={packages} showJob={false} /> : <div className="card b-empty"><p>No bid packages on this job yet.</p></div>}
      {adding && <NewPackageDialog jobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Every bid package across all jobs. */
export default function Bids() {
  const { db } = useStore();
  const L = useLookups();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<BidPackageStatus | 'open' | ''>('open');
  const [jobId, setJobId] = useState(() => new URLSearchParams(location.search).get('job') ?? '');
  const [adding, setAdding] = useState(false);
  const today = todayYmd();
  const week = new Date(`${today}T12:00:00`);
  week.setDate(week.getDate() + 7);
  const weekYmd = week.toISOString().slice(0, 10);
  const open = db.bidPackages.filter((p) => p.status === 'Out for bid');
  const summaries = open.map((p) => ({ p, s: packageSummary(db, p) }));
  const toDecide = summaries.filter(({ s }) => s.received > 0 && s.awarded.length === 0);
  const dueSoon = open.filter((p) => p.due && p.due >= today && p.due <= weekYmd);
  const month = today.slice(0, 7);
  const awardedThisMonth = db.bids.filter((b) => b.status === 'Awarded' && b.awarded?.startsWith(month)).reduce((s, b) => s + b.amount, 0);
  const rows = db.bidPackages
    .filter((p) => {
      if (jobId && p.jobId !== jobId) return false;
      if (status === 'open' ? p.status !== 'Draft' && p.status !== 'Out for bid' : status && p.status !== status) return false;
      if (!q) return true;
      const code = db.costCodes.find((c) => c.id === p.costCodeId)?.name;
      const vendors = db.bids.filter((b) => b.packageId === p.id).map((b) => L.party.get(b.vendorId)?.name);
      return [packageLabel(p), p.title, code, L.job.get(p.jobId)?.name, ...vendors].join(' ').toLowerCase().includes(q.toLowerCase());
    })
    .sort(sortPackages);
  const jobs = db.jobs.filter((j) => db.bidPackages.some((p) => p.jobId === j.id));
  return (
    <div className="page scroll">
      <PageHeader title="Bids" actions={<button type="button" className="btn primary" onClick={() => setAdding(true)}><Plus size={14} /> New bid package</button>} />
      <div className="detail">
        <div className="b-summary">
          <Stat label="Out for bid" value={String(open.length)} sub={plural(summaries.reduce((s, x) => s + x.s.waiting, 0), 'sub') + ' still to reply'} />
          <Stat label="Ready to award" value={String(toDecide.length)} sub="Bids back, nothing awarded yet" />
          <Stat label="Bids due this week" value={String(dueSoon.length)} />
          <Stat label="Drafts" value={String(db.bidPackages.filter((p) => p.status === 'Draft').length)} sub="Not sent yet" />
          <Stat label="Awarded this month" value={money(awardedThisMonth)} />
        </div>
        <div className="toolbar flex-wrap">
          <label className="relative flex items-center">
            <Search size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
            <input className="b-input h-8 w-56 rounded-md border pl-8" placeholder="Search packages or subs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bid packages" />
          </label>
          <select className="btn select-btn" value={status} onChange={(e) => setStatus(e.target.value as BidPackageStatus | 'open' | '')} aria-label="Status">
            <option value="open">Open (draft or out for bid)</option>
            <option value="">All statuses</option>
            {BID_PACKAGE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="btn select-btn" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
            <option value="">All jobs</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <span className="grow" />
          <span className="muted small-text">{plural(rows.length, 'package')}</span>
        </div>
        <PackageTable packages={rows} empty={status === 'open' ? 'No open bid packages.' : 'No bid packages match.'} />
      </div>
      {adding && <NewPackageDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
