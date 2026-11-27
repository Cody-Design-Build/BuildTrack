import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, MapPin, Calendar } from 'lucide-react';
import { PageHeader, Modal } from '../components/Layout';
import { JobForm, JobLinkForm, TaskForm } from '../components/Forms';
import { PartyLink, RoleBadge } from '../components/Party';
import { Button } from '@/components/ui/button';
import { ScheduleEntryForm, ScheduleTable } from './Schedule';
import { useLookups, useStore, money, uid, localIso } from '../store';
import { JobBudgets } from './Budgets';
import { JobInvoices } from './Invoices';
import { JobBills } from './Bills';
import { jobPayables } from '../bills';
import { jobBilling } from '../invoices';
import { jobRollup, pct } from '../budgets';
import { JOB_STATUSES, type JobLink, type Activity, type Db, type Doc, type Job, type JobStatus, type ScheduleEntry } from '../data';
import { tint } from '../colors';

const TABS = ['overview', 'budget', 'invoices', 'bills', 'schedule', 'tasks', 'documents'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  budget: 'Budgets',
  invoices: 'Invoices',
  bills: 'Bills',
  schedule: 'Schedule',
  'tasks': 'Tasks',
  documents: 'Documents',
};

const STATUS_COLOR: Record<Doc['status'], string> = { Draft: '#2b7fff', Pending: '#f0b100', Approved: '#00c950', Open: '#00b8db', Paid: '#00c950' };

/** An activity-feed entry for a document change. */
function logDoc(d: Db, doc: Doc, what: string): Activity {
  const p = d.people.find((x) => x.id === doc.partyId);
  const who = p ? `${p.firstName} ${p.lastName}`.trim() : d.accounts.find((a) => a.id === doc.partyId)?.name ?? '';
  const job = d.jobs.find((j) => j.id === doc.jobId);
  const me = d.team[0]?.name ?? 'You';
  return {
    id: uid('a'),
    date: localIso(),
    partyId: doc.partyId,
    jobId: doc.jobId,
    title: who,
    doc: `${doc.kind} ${doc.number}`,
    amount: doc.amount,
    text: `${what} by ${me}${job ? ` on ${job.name}` : ''}`,
    color: what === 'Created' ? '#2b7fff' : STATUS_COLOR[doc.status],
  };
}

function Overview({ job, go }: { job: Job; go: (t: Tab) => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [editingLink, setEditingLink] = useState<JobLink | 'new' | null>(null);
  // customers first, then everyone else; accounts before people within a role
  const order = (r: string) => (r === 'Customer' ? 0 : 1);
  const links = [...(L.linksByJob.get(job.id) ?? [])].sort(
    (a, b) => order(a.role) - order(b.role) || a.role.localeCompare(b.role) || Number(L.person.has(a.partyId)) - Number(L.person.has(b.partyId)),
  );
  const r = jobRollup(db, job.id);
  const billing = jobBilling(db, job.id);
  const payables = jobPayables(db, job.id);
  const tasks = db.tasks.filter((x) => x.jobId === job.id && !x.done);
  const entries = db.scheduleEntries.filter((x) => x.jobId === job.id);
  const progress = entries.length ? Math.round(entries.reduce((s, x) => s + x.progress, 0) / entries.length) : job.progress;
  return (
    <div className="detail-grid">
      <section className="card">
        <div className="card-head"><h2>Job</h2></div>
        <div className="card-body info-list">
          <div>
            <span className="muted j-lbl">Status</span>
            <select
              className="b-input j-status"
              value={job.status}
              onChange={(e) => update((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, status: e.target.value as JobStatus } : j)) }))}
            >
              {JOB_STATUSES.map((s) => <option key={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div><MapPin size={14} /> {job.address || <span className="muted">No address</span>}</div>
          <div><Calendar size={14} /> {job.start} → {job.end}</div>
          <div><span className="muted j-lbl">Progress</span><span className="bar-track"><span className="bar-fill" style={{ width: `${progress}%`, background: 'var(--info)' }} /></span> {progress}%</div>
          <div><span className="muted j-lbl">Contract</span> {job.total ? money(job.total) : <span className="muted">Not signed yet</span>}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>People on this job ({links.length})</h2>
          <Button size="sm" variant="ghost" onClick={() => setEditingLink('new')}><Plus /> Add</Button>
        </div>
        <div className="p-2">
          {links.length === 0 && <div className="wt-empty">Nobody linked yet. Add the customer and anyone else involved.</div>}
          {links.map((l) => {
            const p = L.party.get(l.partyId);
            const detail = p?.person ? p.person.email || p.person.phone : p?.account?.phone || p?.account?.email;
            return (
              <div key={l.id} className="group flex min-h-11 items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-muted/60">
                <PartyLink id={l.partyId} size={26} />
                <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">{detail}</span>
                <RoleBadge role={l.role} className="ml-auto" />
                <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Edit role" onClick={() => setEditingLink(l)}><Pencil /></Button>
              </div>
            );
          })}
        </div>
        {editingLink && <JobLinkForm jobId={job.id} link={editingLink === 'new' ? undefined : editingLink} onClose={() => setEditingLink(null)} />}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Budgets &amp; billing</h2>
          <button type="button" className="btn btn-sm" onClick={() => go('budget')}>Open budgets</button>
        </div>
        <div className="card-body info-list">
          <div className="j-row"><span>Approved ({r.approvedCount})</span><b>{money(r.contract.price)} <span className="muted">({pct(r.contract.price ? ((r.contract.price - r.contract.cost) / r.contract.price) * 100 : NaN)} margin)</span></b></div>
          <div className="j-row"><span>Awaiting approval</span><b>{money(r.pending.price)}</b></div>
          <div className="j-row"><span>Billed to date</span><b>{money(billing.billed)} <span className="muted">({pct(billing.contract ? (billing.billed / billing.contract) * 100 : NaN)} of contract)</span></b></div>
          <div className="j-row"><span>Received</span><b>{money(billing.received)}</b></div>
          <div className="j-row"><span>Outstanding</span><b className={billing.overdue > 0 ? 'text-destructive' : ''}>{money(billing.outstanding)}{billing.overdue > 0 && <span className="font-normal"> ({money(billing.overdue)} overdue)</span>}</b></div>
          <div className="j-row"><span>Vendor bills</span><b>{money(payables.billed)} <span className="muted">({money(payables.paid)} paid)</span></b></div>
          <div className="j-row"><span>Owed to vendors</span><b className={payables.overdue > 0 ? 'text-destructive' : ''}>{money(payables.owed)}{payables.overdue > 0 && <span className="font-normal"> ({money(payables.overdue)} overdue)</span>}</b></div>
          <div className="j-row"><span>Spent so far</span><b>{money(r.spent)}</b></div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Open Tasks ({tasks.length})</h2>
          <button type="button" className="btn btn-sm" onClick={() => go('tasks')}>All tasks</button>
        </div>
        <div className="card-body">
          {tasks.length === 0 && <div className="wt-empty">Nothing open</div>}
          {tasks.map((x) => (
            <Link key={x.id} to={`/tasks?id=${x.id}`} className="list-row"><span className="grow">{x.name}</span><span className="muted">{x.due}</span></Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScheduleTab({ job }: { job: Job }) {
  const { db } = useStore();
  const [editing, setEditing] = useState<ScheduleEntry | 'new' | null>(null);
  const entries = db.scheduleEntries.filter((t) => t.jobId === job.id).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div>
      <div className="toolbar j-tab-bar">
        <button type="button" className="btn" onClick={() => setEditing('new')}><Plus size={14} /> Schedule Entry</button>
        <span className="grow" />
        <Link to="/schedule" className="btn">See all jobs on the schedule</Link>
      </div>
      <ScheduleTable entries={entries} onEdit={setEditing} />
      {editing && <ScheduleEntryForm entry={editing === 'new' ? undefined : editing} presetJobId={job.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TasksTab({ job }: { job: Job }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [adding, setAdding] = useState(false);
  const tasks = db.tasks.filter((t) => t.jobId === job.id);
  return (
    <div>
      <div className="toolbar j-tab-bar">
        <button type="button" className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Task</button>
      </div>
      <div className="table-wrap">
        <table className="grid-table j-table">
          <thead><tr><th className="center">✓</th><th>Name</th><th>Due</th><th>Type</th><th>Assignees</th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className={t.done ? 'done' : ''}>
                <td className="center"><input type="checkbox" checked={t.done} aria-label="Done" onChange={() => update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))} /></td>
                <td><Link to={`/tasks?id=${t.id}`}>{t.name}</Link></td>
                <td>{t.due}</td>
                <td>{t.type}</td>
                <td>{t.assignees.map((a) => L.team.get(a)?.name).filter(Boolean).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <div className="wt-empty">No tasks for this job.</div>}
      </div>
      {adding && <TaskForm presetPartyId={L.customers(job.id)[0]?.id} presetJobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

function DocumentsTab({ job }: { job: Job }) {
  const { db, update } = useStore();
  const L = useLookups();
  const docs = db.docs.filter((d) => d.jobId === job.id);
  const setStatus = (id: string, status: Doc['status']) =>
    update((d) => {
      const doc = d.docs.find((x) => x.id === id);
      return {
        ...d,
        docs: d.docs.map((x) => (x.id === id ? { ...x, status } : x)),
        activity: doc ? [...d.activity, logDoc(d, { ...doc, status }, `Marked as ${status.toLowerCase()}`)] : d.activity,
      };
    });
  return (
    <div className="table-wrap">
      <table className="grid-table j-table">
        <thead><tr><th>Document</th><th>With</th><th>Status</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {docs.map((d) => {
            return (
              <tr key={d.id}>
                <td>{d.kind} {d.number}</td>
                <td>{d.partyId && <PartyLink id={d.partyId} size={20} />}</td>
                <td>
                  <select className="b-input" value={d.status} aria-label="Status" onChange={(e) => setStatus(d.id, e.target.value as Doc['status'])}>
                    {['Draft', 'Pending', 'Approved', 'Open', 'Paid'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="num">{d.amount ? money(d.amount) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {docs.length === 0 && <div className="wt-empty">No documents yet. Proposals and change orders live on the Budgets tab.</div>}
    </div>
  );
}

export default function JobDetail({ job }: { job: Job }) {
  const L = useLookups();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const tabParam = params.get('tab');
  const tab = tabParam === 'to-dos' ? 'tasks' : TABS.find((t) => t === tabParam) ?? 'overview';
  const go = (t: Tab) => setParams({ job: job.id, tab: t });
  const status = JOB_STATUSES.find((s) => s.name === job.status);
  return (
    <div className="page scroll job-page">
      <PageHeader
        crumb={L.customerName(job.id) || 'Job'}
        title={job.name}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Task</button>
            <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit Job</button>
          </>
        }
      />
      <div className="j-bar">
        <Link to="/jobs" className="back-link"><ArrowLeft size={14} /> All jobs</Link>
        <span className="j-status-pill tint" style={tint(status?.color)}>{job.status}</span>
      </div>
      <nav className="j-tabs" aria-label="Job sections">
        {TABS.map((t) => (
          <button key={t} type="button" className={'j-tab' + (t === tab ? ' active' : '')} onClick={() => go(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>
      <div className="detail">
        {tab === 'overview' && <Overview job={job} go={go} />}
        {tab === 'budget' && <JobBudgets job={job} />}
        {tab === 'invoices' && <JobInvoices job={job} />}
        {tab === 'bills' && <JobBills job={job} />}
        {tab === 'schedule' && <ScheduleTab job={job} />}
        {tab === 'tasks' && <TasksTab job={job} />}
        {tab === 'documents' && <DocumentsTab job={job} />}
      </div>
      {editing && <JobForm job={job} onClose={() => setEditing(false)} />}
      {adding && <TaskForm presetPartyId={L.customers(job.id)[0]?.id} presetJobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}
