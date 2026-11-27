import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, MapPin, Calendar } from 'lucide-react';
import { PageHeader, Modal } from '../../components/Layout';
import { JobForm, JobLinkForm, TaskForm } from '../../components/Forms';
import { PartyLink, RoleBadge } from '../../components/Party';
import { Button } from '@/components/ui/button';
import { useLookups, useStore, money, uid, localIso } from '../../store';
import { JOB_STATUSES, type JobLink, type Activity, type Db, type Doc, type Job, type JobStatus } from '../../data';
import { tint } from '../../colors';
import { usePlugins } from '../registry';

/** The Overview tab is built in; every other tab comes from a plugin. */
function useJobTabs() {
  const plugins = usePlugins();
  return [{ id: 'overview', label: 'Overview', order: 0, component: null }, ...plugins.flatMap((p) => p.jobTabs ?? []).sort((x, y) => x.order - y.order)];
}

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

function Overview({ job, go }: { job: Job; go: (t: string) => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [editingLink, setEditingLink] = useState<JobLink | 'new' | null>(null);
  // customers first, then everyone else; accounts before people within a role
  const order = (r: string) => (r === 'Customer' ? 0 : 1);
  const links = [...(L.linksByJob.get(job.id) ?? [])].sort(
    (a, b) => order(a.role) - order(b.role) || a.role.localeCompare(b.role) || Number(L.person.has(a.partyId)) - Number(L.person.has(b.partyId)),
  );
  const summary = usePlugins().flatMap((p) => p.jobSummary ?? []).sort((x, y) => x.order - y.order);
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

      {summary.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Money</h2></div>
          <div className="card-body info-list">
            {summary.map(({ component: C }, i) => <C key={i} job={job} />)}
          </div>
        </section>
      )}

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

export function DocumentsTab({ job }: { job: Job }) {
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
  const tabs = useJobTabs();
  const want = tabParam === 'to-dos' ? 'tasks' : tabParam;
  const tab = tabs.find((t) => t.id === want) ?? tabs[0];
  const go = (t: string) => setParams({ job: job.id, tab: t });
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
        {tabs.map((t) => (
          <button key={t.id} type="button" className={'j-tab' + (t.id === tab.id ? ' active' : '')} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="detail">
        {tab.component ? <tab.component job={job} /> : <Overview job={job} go={go} />}
      </div>
      {editing && <JobForm job={job} onClose={() => setEditing(false)} />}
      {adding && <TaskForm presetPartyId={L.customers(job.id)[0]?.id} presetJobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}
