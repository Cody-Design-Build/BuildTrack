import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Calendar, SquarePen, Eye, ChevronDown, Search, Maximize, Upload, Circle, CircleCheck, EllipsisVertical, Settings, List } from 'lucide-react';
import { EditTools } from '../../components/EditTools';
import { PageHeader, Modal, Avatar } from '../../components/Layout';
import { TaskForm, Field } from '../../components/Forms';
import { meOf, useLookups, useStore } from '../../store';
import { downloadCsv, downloadIcs } from '../../lib/downloads';
import type { Task } from '../../data';
import { tint, tone } from '../../colors';

const VIEWS = {
  mine: 'My Incomplete Tasks',
  open: 'All Incomplete Tasks',
  done: 'Completed Tasks',
  all: 'All Tasks',
} as const;
type View = keyof typeof VIEWS;

// Mapped onto the theme's palette by tone() / tint() when shown.
const TYPE_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0d9488', '#ca8a04', '#c026d3'];

function typeColor(types: string[], t: string) {
  const i = types.indexOf(t);
  return TYPE_COLORS[(i < 0 ? 0 : i) % TYPE_COLORS.length];
}

function TypesModal({ onClose }: { onClose: () => void }) {
  const { db, update } = useStore();
  const types = [...new Set(db.tasks.map((t) => t.type).filter(Boolean))];
  const [draft, setDraft] = useState<Record<string, string>>(Object.fromEntries(types.map((t) => [t, t])));
  return (
    <Modal title="Task Types" onClose={onClose}>
      <p className="form-note">Rename a type to update every task that uses it.</p>
      {types.map((t) => (
        <Field key={t} label="">
          <div className="type-edit">
            <span className="type-pill" style={{ background: tone(typeColor(types, t)) }}>&nbsp;</span>
            <input value={draft[t] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [t]: e.target.value }))} />
          </div>
        </Field>
      ))}
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.type && draft[x.type] !== undefined ? { ...x, type: draft[x.type].trim() } : x)) }));
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

export default function Tasks() {
  const { db, update } = useStore();
  const L = useLookups();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('mine');
  const [menu, setMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const [sort, setSort] = useState<'list' | 'due'>('list');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [types, setTypes] = useState(false);
  const me = meOf(db)?.id;

  useEffect(() => {
    const id = params.get('id');
    const showTypes = params.has('types');
    if (!id && !showTypes) return;
    if (id) {
      const t = db.tasks.find((x) => x.id === id);
      if (t) setEditing(t);
    }
    if (showTypes) setTypes(true);
    const next = new URLSearchParams(params);
    next.delete('id');
    next.delete('types');
    setParams(next, { replace: true });
  }, [params, setParams, db.tasks]);

  const allTypes = [...new Set(db.tasks.map((t) => t.type).filter(Boolean))];
  const needle = q.trim().toLowerCase();
  const rows = db.tasks.filter((t) => {
    if (view === 'mine' && (t.done || !me || !t.assignees.includes(me))) return false;
    if (view === 'open' && t.done) return false;
    if (view === 'done' && !t.done) return false;
    if (!needle) return true;
    return [t.name, L.party.get(t.partyId)?.name, L.job.get(t.jobId)?.name, t.type].join(' ').toLowerCase().includes(needle);
  });
  if (sort === 'due') rows.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const icsDownload = () => downloadIcs('tasks.ics', db.tasks.filter((t) => t.due && !t.done).map((t) => ({ title: t.name, date: t.due })));

  const setField = (id: string, patch: Partial<Task>) => update((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  return (
    <div className="page fill">
      <PageHeader
        title="Tasks"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(true)}><Plus size={14} /> Task</button>
            <button
              type="button"
              className="btn"
              onClick={icsDownload}
            >
              <Calendar size={14} /> Calendar URL
            </button>
            <button type="button" className="btn" onClick={() => setTypes(true)}><SquarePen size={14} /> Edit Task Types</button>
          </>
        }
      />
      <div className="toolbar task-toolbar">
        <div className="menu-wrap">
          <button type="button" className="btn view-btn" onClick={() => setMenu((m) => !m)}>
            <Eye size={14} /> {VIEWS[view]} <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="dropdown">
              {(Object.keys(VIEWS) as View[]).map((v) => (
                <button key={v} type="button" className={v === view ? 'on' : ''} onClick={() => { setView(v); setMenu(false); }}>{VIEWS[v]}</button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="btn icon-only" title="Edit task types" aria-label="Settings" onClick={() => setTypes(true)}>
          <Settings size={14} />
        </button>
        <div className="menu-wrap tb-mid">
          <button type="button" className="btn view-btn list-btn" onClick={() => setSortMenu((m) => !m)}>
            <List size={14} /> {sort === 'list' ? 'List' : 'By Due'} <ChevronDown size={14} />
          </button>
          {sortMenu && (
            <div className="dropdown">
              <button type="button" className={sort === 'list' ? 'on' : ''} onClick={() => { setSort('list'); setSortMenu(false); }}>List</button>
              <button type="button" className={sort === 'due' ? 'on' : ''} onClick={() => { setSort('due'); setSortMenu(false); }}>By Due Date</button>
            </div>
          )}
        </div>
        <label className="search-box tb-wide">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        </label>
        <button type="button" className="btn icon-only tb-wide" title="Full screen" aria-label="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
          <Maximize size={14} />
        </button>
        <button
          type="button"
          className="btn icon-only tb-wide"
          title="Export to spreadsheet"
          aria-label="Export"
          onClick={() => downloadCsv('tasks.csv', [['Name', 'With', 'Job', 'Due', 'Type', 'Done'], ...rows.map((t) => [t.name, L.party.get(t.partyId)?.name ?? '', L.job.get(t.jobId)?.name ?? '', t.due, t.type, t.done ? 'yes' : 'no'])])}
        >
          <Upload size={14} />
        </button>
        <EditTools onDownload={icsDownload} />
      </div>
      <div className="table-wrap">
        <table className="grid-table task-table">
          <colgroup>
            <col style={{ width: 50 }} />
            <col style={{ width: 300 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 200 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 125 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="center">✓</th>
              <th>Name</th>
              <th>With</th>
              <th>Address</th>
              <th>Job</th>
              <th>Due</th>
              <th>Type</th>
              <th className="center">Assignees</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const who = L.party.get(t.partyId);
              const job = L.job.get(t.jobId);
              return (
                <tr key={t.id} className={t.done ? 'done' : ''}>
                  <td className="center">
                    <button type="button" className="check-btn" aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => setField(t.id, { done: !t.done })}>
                      {t.done ? <CircleCheck size={14} /> : <Circle size={14} />}
                    </button>
                  </td>
                  <td className="name-cell">
                    <div className="task-meta">
                      {[who?.name, job?.name].filter(Boolean).join(' / ') || t.type || 'Task'}
                    </div>
                    <input className="cell-input" value={t.name} onChange={(e) => setField(t.id, { name: e.target.value })} aria-label="Name" />
                    <button type="button" className="row-more" aria-label="Edit task" onClick={() => setEditing(t)}>
                      <EllipsisVertical size={14} />
                    </button>
                  </td>
                  <td className="ellipsis">{who && <Link className="cyan" to={who.href}>{who.name}</Link>}</td>
                  <td className="ellipsis text-muted-foreground">{job?.address}</td>
                  <td className="ellipsis">{job && <Link className="cyan" to={`/jobs?job=${job.id}`}>{job.name}</Link>}</td>
                  <td>
                    <input className="cell-input" type="date" value={t.due} onChange={(e) => setField(t.id, { due: e.target.value })} aria-label="Due date" />
                  </td>
                  <td>{t.type && <span className="type-pill tint" style={tint(typeColor(allTypes, t.type))}>{t.type}</span>}</td>
                  <td className="center">
                    <span className="assignees">
                      {t.assignees.map((a) => {
                        const m = L.team.get(a);
                        return m ? <Avatar key={a} text={m.initials} color={m.color} size={26} title={m.name} /> : null;
                      })}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="filler">
              <td colSpan={8} />
            </tr>
          </tbody>
        </table>
        {rows.length === 0 && <div className="wt-empty">No tasks here. Use “+ Task” to add one.</div>}
      </div>
      {creating && <TaskForm onClose={() => setCreating(false)} />}
      {editing && <TaskForm task={editing} onClose={() => setEditing(null)} />}
      {types && <TypesModal onClose={() => setTypes(false)} />}
    </div>
  );
}
