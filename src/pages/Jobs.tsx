import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight, ArrowRight, Settings, Search } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { JobForm } from '../components/Forms';
import { useLookups, useStore, money } from '../store';
import { JOB_STATUSES, type Job, type JobStatus } from '../data';
import JobDetail from './JobDetail';

function JobCard({ job, color, onOpen }: { job: Job; color: string; onOpen: () => void }) {
  const L = useLookups();
  const { update } = useStore();
  const [open, setOpen] = useState(false);
  const account = L.account.get(job.accountId);
  const loc = L.location.get(job.locationId);
  return (
    <div
      className="job-card"
      style={{ borderLeftColor: color }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', job.id)}
    >
      <div className="jc-head">
        <button type="button" className="jc-toggle" aria-label="Details" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button type="button" className="jc-title" onClick={onOpen}>
          {job.name}
        </button>
        <button type="button" className="jc-go" aria-label="Open job" onClick={onOpen}>
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="jc-field">
        <div className="jc-label">Customer: Name</div>
        {account ? <Link to={`/customers?id=${account.id}`} className="jc-value plain">{account.name}</Link> : <div className="jc-value">—</div>}
      </div>
      <div className="jc-field">
        <div className="jc-label">Location: Name</div>
        <div className="jc-value">{loc?.name ?? '—'}</div>
      </div>
      {open && (
        <>
          <div className="jc-field">
            <div className="jc-label">Contract Total</div>
            <div className="jc-value">{job.total ? money(job.total) : '—'}</div>
          </div>
          <div className="jc-field">
            <div className="jc-label">Status</div>
            <select
              className="jc-select"
              value={job.status}
              onChange={(e) => update((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, status: e.target.value as JobStatus } : j)) }))}
            >
              {JOB_STATUSES.map((s) => <option key={s.name}>{s.name}</option>)}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

export default function Jobs() {
  const { db, update } = useStore();
  const L = useLookups();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [viewMenu, setViewMenu] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Job | null>(null);
  const [creating, setCreating] = useState<JobStatus | null>(null);
  const [over, setOver] = useState<string>('');

  useEffect(() => {
    if (params.get('new')) {
      setCreating('Lead');
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, db.jobs]);

  const needle = q.trim().toLowerCase();
  const jobs = db.jobs.filter((j) => {
    if (!needle) return true;
    const hay = [j.name, L.account.get(j.accountId)?.name, L.location.get(j.locationId)?.name].join(' ').toLowerCase();
    return hay.includes(needle);
  });
  const move = (id: string, status: JobStatus) => update((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === id ? { ...j, status } : j)) }));
  const columns = JOB_STATUSES.filter((s) => !hideEmpty || jobs.some((j) => j.status === s.name));
  const openJob = (j: Job) => setParams({ job: j.id });
  const current = db.jobs.find((j) => j.id === params.get('job'));
  if (current) return <JobDetail key={current.id} job={current} />;

  return (
    <div className="page fill">
      <PageHeader
        title="Jobs"
        actions={
          <button type="button" className="btn" onClick={() => setCreating('Lead')}>
            <Plus size={14} /> Job
          </button>
        }
      />
      <div className="toolbar jobs-toolbar">
        <div className="tb-row">
          <div className="menu-wrap grow-phone">
            <button type="button" className="btn view-btn" onClick={() => setViewMenu((v) => !v)}>
              {view === 'kanban' ? 'Kanban by Status' : 'List of Jobs'} <ChevronDown size={14} />
            </button>
            {viewMenu && (
              <div className="dropdown">
                <button type="button" className={view === 'kanban' ? 'on' : ''} onClick={() => { setView('kanban'); setViewMenu(false); }}>Kanban by Status</button>
                <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => { setView('list'); setViewMenu(false); }}>List of Jobs</button>
              </div>
            )}
          </div>
          <button type="button" className={'btn icon-only' + (hideEmpty ? ' pressed' : '')} title={hideEmpty ? 'Show all statuses' : 'Hide empty statuses'} aria-label="Column settings" onClick={() => setHideEmpty((h) => !h)}>
            <Settings size={14} />
          </button>
          <button type="button" className="btn icon-only sparkle-btn" title="New job" aria-label="New job" onClick={() => setCreating('Lead')}>
            <Plus size={14} />
          </button>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Jobs" />
        </label>
      </div>

      {view === 'kanban' ? (
        <div className="kanban">
          {columns.map((s) => {
            const list = jobs.filter((j) => j.status === s.name);
            const isCollapsed = collapsed[s.name];
            return (
              <div
                key={s.name}
                className={'k-col' + (over === s.name ? ' over' : '') + (isCollapsed ? ' collapsed' : '')}
                onDragOver={(e) => { e.preventDefault(); setOver(s.name); }}
                onDragLeave={() => setOver('')}
                onDrop={(e) => { e.preventDefault(); setOver(''); move(e.dataTransfer.getData('text/plain'), s.name); }}
              >
                <div className="k-head" style={{ borderBottomColor: s.color, color: s.color }}>
                  <button type="button" className="k-toggle" aria-label="Collapse column" onClick={() => setCollapsed((c) => ({ ...c, [s.name]: !c[s.name] }))}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <span className="k-title">{s.name}</span>
                  <span className="k-count">{list.length}</span>
                </div>
                {!isCollapsed && (
                  <div className="k-body">
                    {list.map((j) => (
                      <JobCard key={j.id} job={j} color={s.color} onOpen={() => openJob(j)} />
                    ))}
                    {list.length === 0 && <div className="k-empty">Drop jobs here</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Status</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} onClick={() => openJob(j)} className="clickable">
                  <td>{j.name}</td>
                  <td className="cyan">{L.account.get(j.accountId)?.name}</td>
                  <td>{L.location.get(j.locationId)?.name}</td>
                  <td><span className="status-dot" style={{ background: JOB_STATUSES.find((s) => s.name === j.status)?.color }} /> {j.status}</td>
                  <td className="num">{j.total ? money(j.total) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <JobForm job={editing} onClose={() => setEditing(null)} />}
      {creating && <JobForm defaultStatus={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}
