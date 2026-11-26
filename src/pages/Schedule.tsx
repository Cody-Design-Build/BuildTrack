import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Calendar, SquarePen, Eye, ChevronDown, ChevronRight, Search, Maximize, ZoomIn, ZoomOut, Upload, SquareCheck, Check, Square, Settings, ChartNoAxesGantt, Link2, Maximize2, Minimize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EditTools } from '../components/EditTools';
import { PageHeader, Modal } from '../components/Layout';
import { Field } from '../components/Forms';
import { useLookups, useStore, uid } from '../store';
import { downloadCsv, downloadIcs } from './Todos';
import type { Task } from '../data';

const DAY = 86400000;
const parse = (s: string) => new Date(s + 'T00:00:00Z').getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function TaskForm({ task, onClose, presetJobId }: { task?: Task; onClose: () => void; presetJobId?: string }) {
  const { db, update } = useStore();
  const [jobId, setJobId] = useState(task?.jobId ?? presetJobId ?? db.jobs[0]?.id ?? '');
  const [name, setName] = useState(task?.name ?? '');
  const [start, setStart] = useState(task?.start ?? '2026-11-30');
  const [end, setEnd] = useState(task?.end ?? '2026-12-04');
  const [progress, setProgress] = useState(String(task?.progress ?? 0));
  const save = () => {
    if (!name.trim() || !jobId) return;
    const next: Task = { id: task?.id ?? uid('k'), jobId, name: name.trim(), start, end: end < start ? start : end, progress: Math.max(0, Math.min(100, Number(progress) || 0)) };
    update((d) => ({ ...d, tasks: task ? d.tasks.map((t) => (t.id === task.id ? next : t)) : [...d.tasks, next] }));
    onClose();
  };
  return (
    <Modal title={task ? 'Edit Task' : 'New Task'} onClose={onClose}>
      <Field label="Task name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="Job">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          {db.jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
      </Field>
      <div className="field-row">
        <Field label="Start"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Finish"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="% done"><input inputMode="numeric" value={progress} onChange={(e) => setProgress(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      <div className="row-end">
        {task && <button type="button" className="btn danger" onClick={() => { update((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== task.id) })); onClose(); }}>Delete</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={!name.trim()}>Save</button>
      </div>
    </Modal>
  );
}

export default function Schedule() {
  const { db, update } = useStore();
  const L = useLookups();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'timelines' | 'tasks'>('timelines');
  const [menu, setMenu] = useState(false);
  const [kindMenu, setKindMenu] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const go = useNavigate();
  const [list, setList] = useState(false);
  const [zoom, setZoom] = useState(25);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const needle = q.trim().toLowerCase();
  const jobs = db.jobs.filter((j) => db.tasks.some((t) => t.jobId === j.id) && (!needle || j.name.toLowerCase().includes(needle) || (L.account.get(j.accountId)?.name ?? '').toLowerCase().includes(needle)));

  const span = useMemo(() => {
    const ts = db.tasks.filter((t) => jobs.some((j) => j.id === t.jobId));
    if (ts.length === 0) return { from: parse('2026-11-01'), days: 90 };
    const from = Math.min(...ts.map((t) => parse(t.start))) - 2 * DAY;
    const to = Math.max(...ts.map((t) => parse(t.end))) + 14 * DAY;
    return { from, days: Math.max(60, Math.round((to - from) / DAY)) };
  }, [db.tasks, jobs]);

  const days = Array.from({ length: span.days }, (_, i) => new Date(span.from + i * DAY));
  const months: { label: string; count: number }[] = [];
  for (const d of days) {
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
    const last = months[months.length - 1];
    if (last && last.label === label) last.count++;
    else months.push({ label, count: 1 });
  }
  const x = (date: string) => ((parse(date) - span.from) / DAY) * zoom;
  const w = (a: string, b: string) => ((parse(b) - parse(a)) / DAY + 1) * zoom;
  const jobTasks = (id: string) => db.tasks.filter((t) => t.jobId === id).sort((a, b) => a.start.localeCompare(b.start));
  const pct = (ts: Task[]) => (ts.length ? Math.round(ts.reduce((s, t) => s + t.progress, 0) / ts.length) : 0);
  const allTasks = jobs.flatMap((j) => jobTasks(j.id));
  const todayX = x('2026-11-26');

  return (
    <div className="page fill">
      <PageHeader
        title="Schedule"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(true)}><Plus size={14} /> Task</button>
            <button type="button" className="btn" onClick={() => downloadIcs('schedule.ics', db.tasks.map((t) => ({ title: `${L.job.get(t.jobId)?.name}: ${t.name}`, date: t.start, end: t.end })))}>
              <Calendar size={14} /> Calendar URL
            </button>
            <Link to="/to-dos?types=1" className="btn"><SquarePen size={14} /> Edit Task Types</Link>
          </>
        }
      />
      <div className="toolbar sched-toolbar">
        <div className="menu-wrap">
          <button type="button" className="btn view-btn wide" onClick={() => setMenu((m) => !m)}>
            <Eye size={14} /> <span className="grow">{mode === 'timelines' ? 'Project Timelines' : 'All Tasks Open'}</span> <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="dropdown">
              <button type="button" className={mode === 'timelines' ? 'on' : ''} onClick={() => { setMode('timelines'); setMenu(false); }}>Project Timelines</button>
              <button type="button" className={mode === 'tasks' ? 'on' : ''} onClick={() => { setMode('tasks'); setMenu(false); setOpen(Object.fromEntries(jobs.map((j) => [j.id, true]))); }}>All Tasks Open</button>
            </div>
          )}
        </div>
        <button type="button" className="btn icon-only" title={mode === 'tasks' ? 'Collapse all jobs' : 'Open all jobs'} aria-label="Settings" onClick={() => { const next = mode === 'tasks' ? 'timelines' : 'tasks'; setMode(next); setOpen(next === 'tasks' ? Object.fromEntries(jobs.map((j) => [j.id, true])) : {}); }}>
          <Settings size={14} />
        </button>
        <div className="menu-wrap tb-mid">
          <button type="button" className="btn view-btn gantt-btn" onClick={() => setKindMenu((m) => !m)}>
            <ChartNoAxesGantt size={14} /> {list ? 'List' : 'Gantt'} <ChevronDown size={14} />
          </button>
          {kindMenu && (
            <div className="dropdown">
              <button type="button" className={!list ? 'on' : ''} onClick={() => { setList(false); setKindMenu(false); }}>Gantt</button>
              <button type="button" className={list ? 'on' : ''} onClick={() => { setList(true); setKindMenu(false); setOpen(Object.fromEntries(jobs.map((j) => [j.id, true]))); }}>List</button>
            </div>
          )}
        </div>
        <label className="search-box tb-wide">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        </label>
        <button type="button" className="btn icon-only tb-wide" aria-label="Full screen" title="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize size={14} /></button>
        <div className="btn-group tb-wide">
          <button type="button" className="btn icon-only" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((z) => Math.max(8, z - 6))}><ZoomOut size={14} /></button>
          <button type="button" className="btn icon-only" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((z) => Math.min(60, z + 6))}><ZoomIn size={14} /></button>
        </div>
        <button
          type="button"
          className="btn icon-only tb-wide"
          aria-label="Export"
          title="Export to spreadsheet"
          onClick={() => downloadCsv('schedule.csv', [['Job', 'Task', 'Start', 'Finish', '% done'], ...allTasks.filter((t) => !Object.values(sel).some(Boolean) || sel[t.jobId]).map((t) => [L.job.get(t.jobId)?.name ?? '', t.name, t.start, t.end, String(t.progress)])])}
        >
          <Upload size={14} />
        </button>
        <EditTools
          onDownload={() => downloadIcs('schedule.ics', db.tasks.map((t) => ({ title: `${L.job.get(t.jobId)?.name}: ${t.name}`, date: t.start, end: t.end })))}
          extra={[{ label: 'Zoom in', run: () => setZoom((z) => Math.min(60, z + 6)) }, { label: 'Zoom out', run: () => setZoom((z) => Math.max(8, z - 6)) }]}
        />
      </div>

      <div className={'gantt' + (list ? ' list-mode' : '')}>
        <div className="g-left">
          <div className="g-row g-headrow">
            <span className="g-cb"><SquarePen size={12} /></span>
            <span className="g-name">NAME</span>
            <span className="g-pct">%</span>
            <span className="g-done"><Check size={12} /></span>
          </div>
          <div className="g-row g-overall">
            <span className="g-cb">
              <input type="checkbox" aria-label="Select all jobs" checked={jobs.length > 0 && jobs.every((j) => sel[j.id])} onChange={(e) => setSel(Object.fromEntries(jobs.map((j) => [j.id, e.target.checked])))} />
            </span>
            <span className="g-name bold">Overall</span>
            <span className="g-pct">{pct(allTasks)}%</span>
            <span className="g-done"><Square size={12} /></span>
          </div>
          {jobs.map((j) => {
            const ts = jobTasks(j.id);
            const isOpen = open[j.id];
            const loc = L.location.get(j.locationId);
            return (
              <div key={j.id}>
                <div className="g-row g-job">
                  <span className="g-cb">
                    <input type="checkbox" aria-label={`Select ${j.name}`} checked={!!sel[j.id]} onChange={(e) => setSel((x) => ({ ...x, [j.id]: e.target.checked }))} />
                  </span>
                  <button type="button" className="g-exp" aria-label="Show tasks" onClick={() => setOpen((o) => ({ ...o, [j.id]: !o[j.id] }))}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <span className="g-name">
                    <b>{j.name}</b>
                    <span className="g-sub">{L.account.get(j.accountId)?.name} / {loc?.address}</span>
                  </span>
                  <span className="g-tools">
                    <button type="button" title="Open job" aria-label="Open job" onClick={() => go(`/jobs?job=${j.id}`)}><Link2 size={12} /></button>
                    <button type="button" title="Show tasks" aria-label="Show tasks" onClick={() => setOpen((o) => ({ ...o, [j.id]: true }))}><Maximize2 size={12} /></button>
                    <button type="button" title="Hide tasks" aria-label="Hide tasks" onClick={() => setOpen((o) => ({ ...o, [j.id]: false }))}><Minimize2 size={12} /></button>
                  </span>
                  <span className="g-pct">{pct(ts)}%</span>
                  <span className="g-done">
                    <input
                      type="checkbox"
                      aria-label="All tasks done"
                      checked={ts.length > 0 && ts.every((t) => t.progress === 100)}
                      onChange={(e) => update((d) => ({ ...d, tasks: d.tasks.map((t) => (t.jobId === j.id ? { ...t, progress: e.target.checked ? 100 : 0 } : t)) }))}
                    />
                  </span>
                </div>
                {isOpen &&
                  ts.map((t) => (
                    <div className="g-row g-task" key={t.id} onClick={() => setEditing(t)}>
                      <span className="g-cb" />
                      <span className="g-name task">{t.name}</span>
                      <span className="g-pct">{t.progress}%</span>
                      <span className="g-done">{t.progress === 100 ? <Check size={12} /> : null}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
        <div className="g-right">
          <div className="g-canvas" style={{ width: span.days * zoom }}>
            <div className="g-months">
              {months.map((m) => (
                <span key={m.label} style={{ width: m.count * zoom }}>{m.label}</span>
              ))}
            </div>
            <div className="g-days">
              {days.map((d) => (
                <span key={d.getTime()} style={{ width: zoom }} className={d.getUTCDay() === 0 ? 'week' : ''}>
                  <b>{zoom >= 18 ? d.getUTCDate() : ''}</b>
                  {zoom >= 18 ? 'SMTWTFS'[d.getUTCDay()] : ''}
                </span>
              ))}
            </div>
            <div className="g-lines">
              {days.map((d, i) => (
                <span key={i} style={{ left: i * zoom }} className={d.getUTCDay() === 0 ? 'week' : ''} />
              ))}
              {todayX >= 0 && <span className="g-today" style={{ left: todayX }} />}
            </div>
            {jobs.map((j) => {
              const ts = jobTasks(j.id);
              const s = ts[0]?.start ?? j.start;
              const e = ts.reduce((m, t) => (t.end > m ? t.end : m), s);
              return (
                <div key={j.id}>
                  <div className="g-brow g-job-b">
                    <span className="g-jobbar" style={{ left: x(s), width: w(s, e) }} title={j.name} />
                  </div>
                  {open[j.id] &&
                    ts.map((t) => (
                      <div className="g-brow g-task-b" key={t.id}>
                        <button type="button" className="g-bar" style={{ left: x(t.start), width: w(t.start, t.end) }} onClick={() => setEditing(t)} title={`${t.name} (${t.progress}%)`}>
                          <span className="g-prog" style={{ width: `${t.progress}%` }} />
                          <span className="g-bar-label">{t.name}</span>
                        </button>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {jobs.length === 0 && <div className="wt-empty">No scheduled tasks yet. Use “+ Task” to add one.</div>}
      {creating && <TaskForm onClose={() => setCreating(false)} />}
      {editing && <TaskForm task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
