import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Calendar, SquarePen, Eye, ChevronDown, Search, Maximize, Upload, Circle, CircleCheck, EllipsisVertical, Settings, List } from 'lucide-react';
import { EditTools } from '../components/EditTools';
import { PageHeader, Modal, Avatar } from '../components/Layout';
import { TodoForm, Field } from '../components/Forms';
import { useLookups, useStore } from '../store';
import type { Todo } from '../data';

const VIEWS = {
  mine: 'My Incomplete To-Dos',
  open: 'All Incomplete To-Dos',
  done: 'Completed To-Dos',
  all: 'All To-Dos',
} as const;
type View = keyof typeof VIEWS;

const TYPE_COLORS = ['#ff0000', '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0d9488'];

export function typeColor(types: string[], t: string) {
  const i = types.indexOf(t);
  return TYPE_COLORS[(i < 0 ? 0 : i) % TYPE_COLORS.length];
}

export function downloadIcs(name: string, events: { title: string; date: string; end?: string }[]) {
  const fmt = (d: string) => d.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BuildTrack//EN'];
  events.forEach((e, i) => {
    const endDate = new Date((e.end ?? e.date) + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    lines.push('BEGIN:VEVENT', `UID:${i}-${fmt(e.date)}@buildtrack`, `DTSTART;VALUE=DATE:${fmt(e.date)}`, `DTEND;VALUE=DATE:${fmt(endDate.toISOString().slice(0, 10))}`, `SUMMARY:${e.title.replace(/[,;]/g, ' ')}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  a.download = name;
  a.click();
}

export function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
}

function TypesModal({ onClose }: { onClose: () => void }) {
  const { db, update } = useStore();
  const types = [...new Set(db.todos.map((t) => t.type).filter(Boolean))];
  const [draft, setDraft] = useState<Record<string, string>>(Object.fromEntries(types.map((t) => [t, t])));
  return (
    <Modal title="Task Types" onClose={onClose}>
      <p className="form-note">Rename a type to update every to-do that uses it.</p>
      {types.map((t) => (
        <Field key={t} label="">
          <div className="type-edit">
            <span className="type-pill" style={{ background: typeColor(types, t) }}>&nbsp;</span>
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
            update((d) => ({ ...d, todos: d.todos.map((x) => (x.type && draft[x.type] !== undefined ? { ...x, type: draft[x.type].trim() } : x)) }));
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

export default function Todos() {
  const { db, update } = useStore();
  const L = useLookups();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('mine');
  const [menu, setMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const [sort, setSort] = useState<'list' | 'due'>('list');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Todo | null>(null);
  const [creating, setCreating] = useState(false);
  const [types, setTypes] = useState(false);
  const me = db.team[0]?.id;

  useEffect(() => {
    const id = params.get('id');
    if (id) {
      const t = db.todos.find((x) => x.id === id);
      if (t) setEditing(t);
      params.delete('id');
      setParams(params, { replace: true });
    }
    if (params.get('types')) {
      setTypes(true);
      params.delete('types');
      setParams(params, { replace: true });
    }
  }, [params, setParams, db.todos]);

  const allTypes = [...new Set(db.todos.map((t) => t.type).filter(Boolean))];
  const needle = q.trim().toLowerCase();
  const rows = db.todos.filter((t) => {
    if (view === 'mine' && (t.done || !t.assignees.includes(me))) return false;
    if (view === 'open' && t.done) return false;
    if (view === 'done' && !t.done) return false;
    if (!needle) return true;
    return [t.name, L.account.get(t.accountId)?.name, L.job.get(t.jobId)?.name, t.type].join(' ').toLowerCase().includes(needle);
  });
  if (sort === 'due') rows.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const icsDownload = () => downloadIcs('to-dos.ics', db.todos.filter((t) => t.due && !t.done).map((t) => ({ title: t.name, date: t.due })));

  const setField = (id: string, patch: Partial<Todo>) => update((d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  return (
    <div className="page fill">
      <PageHeader
        title="To-Dos"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(true)}><Plus size={14} /> To-Do</button>
            <button
              type="button"
              className="btn"
              onClick={() => downloadIcs('to-dos.ics', db.todos.filter((t) => t.due && !t.done).map((t) => ({ title: t.name, date: t.due })))}
            >
              <Calendar size={14} /> Calendar URL
            </button>
            <button type="button" className="btn" onClick={() => setTypes(true)}><SquarePen size={14} /> Edit Task Types</button>
          </>
        }
      />
      <div className="toolbar todo-toolbar">
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
          onClick={() => downloadCsv('to-dos.csv', [['Name', 'Account', 'Job', 'Due', 'Type', 'Done'], ...rows.map((t) => [t.name, L.account.get(t.accountId)?.name ?? '', L.job.get(t.jobId)?.name ?? '', t.due, t.type, t.done ? 'yes' : 'no'])])}
        >
          <Upload size={14} />
        </button>
        <EditTools onDownload={icsDownload} />
      </div>
      <div className="table-wrap">
        <table className="grid-table todo-table">
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
              <th>Account</th>
              <th>Location</th>
              <th>Job</th>
              <th>Due</th>
              <th>Type</th>
              <th className="center">Assignees</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const acct = L.account.get(t.accountId);
              const job = L.job.get(t.jobId);
              const loc = job ? L.location.get(job.locationId) : undefined;
              return (
                <tr key={t.id} className={t.done ? 'done' : ''}>
                  <td className="center">
                    <button type="button" className="check-btn" aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => setField(t.id, { done: !t.done })}>
                      {t.done ? <CircleCheck size={14} /> : <Circle size={14} />}
                    </button>
                  </td>
                  <td className="name-cell">
                    <div className="todo-meta">
                      {[acct?.name, job?.name].filter(Boolean).join(' / ') || t.type || 'To-Do'}
                    </div>
                    <input className="cell-input" value={t.name} onChange={(e) => setField(t.id, { name: e.target.value })} aria-label="Name" />
                    <button type="button" className="row-more" aria-label="Edit to-do" onClick={() => setEditing(t)}>
                      <EllipsisVertical size={14} />
                    </button>
                  </td>
                  <td className="ellipsis">{acct && <Link className="cyan" to={`/${acct.type === 'vendor' ? 'vendors' : 'customers'}?id=${acct.id}`}>{acct.name}</Link>}</td>
                  <td className="ellipsis cyan">{loc?.name}</td>
                  <td className="ellipsis">{job && <Link className="cyan" to={`/jobs?job=${job.id}`}>{job.name}</Link>}</td>
                  <td>
                    <input className="cell-input" type="date" value={t.due} onChange={(e) => setField(t.id, { due: e.target.value })} aria-label="Due date" />
                  </td>
                  <td>{t.type && <span className="type-pill" style={{ background: typeColor(allTypes, t.type) }}>{t.type}</span>}</td>
                  <td className="center">
                    <span className="assignees">
                      {t.assignees.map((a) => {
                        const m = L.team.get(a);
                        return m ? <Avatar key={a} text={m.initials} color={m.color} size={16} /> : null;
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
        {rows.length === 0 && <div className="wt-empty">No to-dos here. Use “+ To-Do” to add one.</div>}
      </div>
      {creating && <TodoForm onClose={() => setCreating(false)} />}
      {editing && <TodoForm todo={editing} onClose={() => setEditing(null)} />}
      {types && <TypesModal onClose={() => setTypes(false)} />}
    </div>
  );
}
