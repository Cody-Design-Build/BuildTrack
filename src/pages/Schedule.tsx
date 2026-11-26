import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Calendar, SquarePen, Eye, ChevronDown, ChevronRight, Search, Maximize, ZoomIn, ZoomOut, Upload, Check, Square, Settings, ChartNoAxesGantt, Link2, Maximize2, Minimize2 } from 'lucide-react';
import { EditTools } from '../components/EditTools';
import { PageHeader, Modal } from '../components/Layout';
import { Field } from '../components/Forms';
import { useLookups, useStore, uid, type Lookups } from '../store';
import { downloadCsv, downloadIcs } from '../lib/downloads';
import type { ScheduleEntry } from '../data';

const DAY = 86400000;
const parse = (s: string) => new Date(s + 'T00:00:00Z').getTime();
const hasDates = (entry: ScheduleEntry) => Number.isFinite(parse(entry.start)) && Number.isFinite(parse(entry.end));
const crewNames = (entry: ScheduleEntry, team: Lookups['team']) =>
  entry.crewIds.map((id) => team.get(id)?.name).filter(Boolean).join(', ');

export function ScheduleTable({ entries, showJob = false, onEdit }: {
  entries: ScheduleEntry[];
  showJob?: boolean;
  onEdit: (entry: ScheduleEntry) => void;
}) {
  const { job, team } = useLookups();
  return (
    <div className="table-wrap">
      <table className="grid-table j-table" aria-label={showJob ? 'Job and crew schedule' : 'Job schedule'}>
        <thead>
          <tr>
            <th>Scheduled work</th>
            {showJob && <th>Job</th>}
            <th>Start</th>
            <th>Finish</th>
            <th>Crew</th>
            <th className="num">Progress</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td><button type="button" className="text-left hover:underline" onClick={() => onEdit(entry)}>{entry.name}</button></td>
              {showJob && <td><Link to={`/jobs?job=${entry.jobId}&tab=schedule`}>{job.get(entry.jobId)?.name}</Link></td>}
              <td className="whitespace-nowrap">{entry.start || '—'}</td>
              <td className="whitespace-nowrap">{entry.end || '—'}</td>
              <td>{crewNames(entry, team) || 'Unassigned'}</td>
              <td className="num">
                <span className="bar-track j-mini"><span className="bar-fill" style={{ width: `${entry.progress}%`, background: '#51a2ff' }} /></span> {entry.progress}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <div className="wt-empty">No schedule entries found.</div>}
    </div>
  );
}

export function ScheduleEntryForm({ entry, onClose, presetJobId }: { entry?: ScheduleEntry; onClose: () => void; presetJobId?: string }) {
  const { db, update } = useStore();
  const [jobId, setJobId] = useState(entry?.jobId ?? presetJobId ?? db.jobs[0]?.id ?? '');
  const [name, setName] = useState(entry?.name ?? '');
  const [start, setStart] = useState(entry?.start ?? '2026-11-30');
  const [end, setEnd] = useState(entry?.end ?? '2026-12-04');
  const [progress, setProgress] = useState(String(entry?.progress ?? 0));
  const [crewIds, setCrewIds] = useState(entry?.crewIds ?? []);
  const canSave = !!(name.trim() && start && end && db.jobs.some((job) => job.id === jobId));
  const save = () => {
    if (!canSave) return;
    const next: ScheduleEntry = {
      id: entry?.id ?? uid('k'),
      jobId,
      name: name.trim(),
      start,
      end: end < start ? start : end,
      crewIds,
      progress: Math.max(0, Math.min(100, Number(progress) || 0)),
    };
    update((d) => ({
      ...d,
      scheduleEntries: entry ? d.scheduleEntries.map((item) => (item.id === entry.id ? next : item)) : [...d.scheduleEntries, next],
    }));
    onClose();
  };
  return (
    <Modal title={entry ? 'Edit Schedule Entry' : 'New Schedule Entry'} onClose={onClose}>
      <Field label="Scheduled work"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
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
      <fieldset className="field">
        <legend className="field-label">Crew</legend>
        <div className="chips">
          {db.team.map((member) => (
            <button
              key={member.id}
              type="button"
              className={`chip${crewIds.includes(member.id) ? ' on' : ''}`}
              aria-pressed={crewIds.includes(member.id)}
              onClick={() => setCrewIds((ids) => ids.includes(member.id) ? ids.filter((id) => id !== member.id) : [...ids, member.id])}
            >
              {member.name}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="row-end">
        {entry && <button type="button" className="btn danger" onClick={() => { update((d) => ({ ...d, scheduleEntries: d.scheduleEntries.filter((t) => t.id !== entry.id) })); onClose(); }}>Delete</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={!canSave}>Save</button>
      </div>
    </Modal>
  );
}

export default function Schedule() {
  const { db, update } = useStore();
  const L = useLookups();
  const [q, setQ] = useState('');
  const [crewId, setCrewId] = useState('');
  const [mode, setMode] = useState<'timelines' | 'entries'>('timelines');
  const [menu, setMenu] = useState(false);
  const [kindMenu, setKindMenu] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const go = useNavigate();
  const [list, setList] = useState(true);
  const [zoom, setZoom] = useState(25);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const needle = q.trim().toLowerCase();
  const entriesByJob = new Map<string, ScheduleEntry[]>();
  for (const entry of db.scheduleEntries) {
    const job = L.job.get(entry.jobId);
    if (!job || (crewId && !entry.crewIds.includes(crewId))) continue;
    if (needle && ![job.name, L.customerName(job.id), entry.name, crewNames(entry, L.team)].some((value) => value.toLowerCase().includes(needle))) continue;
    const entries = entriesByJob.get(job.id) ?? [];
    entries.push(entry);
    entriesByJob.set(job.id, entries);
  }
  for (const entries of entriesByJob.values()) entries.sort((a, b) => a.start.localeCompare(b.start));
  const jobs = db.jobs.filter((job) => entriesByJob.has(job.id));
  const jobEntries = (id: string) => entriesByJob.get(id) ?? [];
  const allEntries = jobs.flatMap((job) => jobEntries(job.id));
  const datedEntries = allEntries.filter(hasDates);
  const from = datedEntries.length ? Math.min(...datedEntries.map((entry) => parse(entry.start))) - 2 * DAY : parse('2026-11-01');
  const to = datedEntries.length ? Math.max(...datedEntries.map((entry) => parse(entry.end))) + 14 * DAY : from + 90 * DAY;
  const days = Array.from({ length: list ? 0 : Math.max(60, Math.round((to - from) / DAY)) }, (_, i) => new Date(from + i * DAY));
  const months: { label: string; count: number }[] = [];
  for (const d of days) {
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
    const last = months[months.length - 1];
    if (last && last.label === label) last.count++;
    else months.push({ label, count: 1 });
  }
  const x = (date: string) => ((parse(date) - from) / DAY) * zoom;
  const w = (a: string, b: string) => ((parse(b) - parse(a)) / DAY + 1) * zoom;
  const pct = (ts: ScheduleEntry[]) => (ts.length ? Math.round(ts.reduce((s, t) => s + t.progress, 0) / ts.length) : 0);
  const todayX = x('2026-11-26');
  const isOpen = (jobId: string) => open[jobId] ?? mode === 'entries';
  const setExpansion = (next: typeof mode) => {
    setMode(next);
    setOpen({});
    setMenu(false);
  };
  const calendarDownload = () => downloadIcs('schedule.ics', db.scheduleEntries.filter(hasDates).map((entry) => ({
    title: [L.job.get(entry.jobId)?.name, entry.name].filter(Boolean).join(': '), date: entry.start, end: entry.end,
  })));
  const exportSchedule = () => {
    const selectedJobs = new Set(jobs.filter((job) => sel[job.id]).map((job) => job.id));
    const entries = allEntries.filter((entry) => list || !selectedJobs.size || selectedJobs.has(entry.jobId));
    downloadCsv('schedule.csv', [
      ['Job', 'Scheduled work', 'Start', 'Finish', 'Crew', 'Progress (%)'],
      ...entries.map((entry) => [L.job.get(entry.jobId)?.name ?? '', entry.name, entry.start, entry.end, crewNames(entry, L.team), String(entry.progress)]),
    ]);
  };

  return (
    <div className="page fill">
      <PageHeader
        title="Schedule"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(true)}><Plus size={14} /> Schedule Entry</button>
            <button type="button" className="btn" onClick={calendarDownload}>
              <Calendar size={14} /> Calendar URL
            </button>
          </>
        }
      />
      <div className="toolbar sched-toolbar">
        {!list && <div className="menu-wrap">
          <button type="button" className="btn view-btn wide" onClick={() => setMenu((m) => !m)}>
            <Eye size={14} /> <span className="grow">{mode === 'timelines' ? 'Project Timelines' : 'Expanded Schedule'}</span> <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="dropdown">
              <button type="button" className={mode === 'timelines' ? 'on' : ''} onClick={() => setExpansion('timelines')}>Project Timelines</button>
              <button type="button" className={mode === 'entries' ? 'on' : ''} onClick={() => setExpansion('entries')}>Expanded Schedule</button>
            </div>
          )}
        </div>}
        {!list && <button type="button" className="btn icon-only" aria-label={mode === 'entries' ? 'Collapse all jobs' : 'Open all jobs'} onClick={() => setExpansion(mode === 'entries' ? 'timelines' : 'entries')}>
          <Settings size={14} />
        </button>}
        <div className="menu-wrap">
          <button type="button" className="btn view-btn gantt-btn" onClick={() => setKindMenu((m) => !m)}>
            <ChartNoAxesGantt size={14} /> {list ? 'List' : 'Gantt'} <ChevronDown size={14} />
          </button>
          {kindMenu && (
            <div className="dropdown">
              <button type="button" className={!list ? 'on' : ''} onClick={() => { setList(false); setKindMenu(false); }}>Gantt</button>
              <button type="button" className={list ? 'on' : ''} onClick={() => { setList(true); setKindMenu(false); }}>List</button>
            </div>
          )}
        </div>
        <label className="search-box tb-wide">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search schedule" />
        </label>
        <select className="btn min-w-0 max-w-40" aria-label="Filter by crew member" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
          <option value="">All crew</option>
          {db.team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <button type="button" className="btn icon-only tb-wide" aria-label="Full screen" title="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize size={14} /></button>
        {!list && <div className="btn-group tb-wide">
          <button type="button" className="btn icon-only" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom((z) => Math.max(8, z - 6))}><ZoomOut size={14} /></button>
          <button type="button" className="btn icon-only" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom((z) => Math.min(60, z + 6))}><ZoomIn size={14} /></button>
        </div>}
        <button
          type="button"
          className="btn icon-only tb-wide"
          aria-label="Export"
          title="Export to spreadsheet"
          onClick={exportSchedule}
        >
          <Upload size={14} />
        </button>
        <EditTools
          onDownload={calendarDownload}
          extra={list ? undefined : [{ label: 'Zoom in', run: () => setZoom((z) => Math.min(60, z + 6)) }, { label: 'Zoom out', run: () => setZoom((z) => Math.max(8, z - 6)) }]}
        />
      </div>

      {list ? <ScheduleTable entries={allEntries} showJob onEdit={setEditing} /> : jobs.length === 0 ? (
        <div className="wt-empty">No schedule entries found.</div>
      ) : (
      <div className="gantt">
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
            <span className="g-pct">{pct(allEntries)}%</span>
            <span className="g-done"><Square size={12} /></span>
          </div>
          {jobs.map((j) => {
            const ts = jobEntries(j.id);
            const expanded = isOpen(j.id);
            return (
              <div key={j.id}>
                <div className="g-row g-job">
                  <span className="g-cb">
                    <input type="checkbox" aria-label={`Select ${j.name}`} checked={!!sel[j.id]} onChange={(e) => setSel((x) => ({ ...x, [j.id]: e.target.checked }))} />
                  </span>
                  <button type="button" className="g-exp" aria-label="Schedule entries" aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [j.id]: !expanded }))}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <span className="g-name">
                    <b>{j.name}</b>
                    <span className="g-sub">{[L.customerName(j.id), j.address].filter(Boolean).join(' / ')}</span>
                  </span>
                  <span className="g-tools">
                    <button type="button" title="Open job" aria-label="Open job" onClick={() => go(`/jobs?job=${j.id}`)}><Link2 size={12} /></button>
                    <button type="button" title="Show schedule entries" aria-label="Show schedule entries" onClick={() => setOpen((o) => ({ ...o, [j.id]: true }))}><Maximize2 size={12} /></button>
                    <button type="button" title="Hide schedule entries" aria-label="Hide schedule entries" onClick={() => setOpen((o) => ({ ...o, [j.id]: false }))}><Minimize2 size={12} /></button>
                  </span>
                  <span className="g-pct">{pct(ts)}%</span>
                  <span className="g-done">
                    <input
                      type="checkbox"
                      aria-label="Mark visible schedule entries complete"
                      checked={ts.every((t) => t.progress === 100)}
                      onChange={(e) => {
                        const ids = new Set(ts.map((entry) => entry.id));
                        const progress = e.target.checked ? 100 : 0;
                        update((d) => ({ ...d, scheduleEntries: d.scheduleEntries.map((entry) => ids.has(entry.id) ? { ...entry, progress } : entry) }));
                      }}
                    />
                  </span>
                </div>
                {expanded &&
                  ts.map((t) => (
                    <div className="g-row g-task" key={t.id}>
                      <span className="g-cb" />
                      <button type="button" className="g-name task text-left" onClick={() => setEditing(t)} title={crewNames(t, L.team) || 'Unassigned'}>{t.name}</button>
                      <span className="g-pct">{t.progress}%</span>
                      <span className="g-done">{t.progress === 100 ? <Check size={12} /> : null}</span>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
        <div className="g-right">
          <div className="g-canvas" style={{ width: days.length * zoom }}>
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
              {todayX >= 0 && todayX < days.length * zoom && <span className="g-today" style={{ left: todayX }} />}
            </div>
            {jobs.map((j) => {
              const ts = jobEntries(j.id);
              const scheduled = ts.filter(hasDates);
              const s = scheduled[0]?.start;
              const e = scheduled.reduce((m, t) => (t.end > m ? t.end : m), s ?? '');
              return (
                <div key={j.id}>
                  <div className="g-brow g-job-b">
                    {s && <span className="g-jobbar" style={{ left: x(s), width: w(s, e) }} title={j.name} />}
                  </div>
                  {isOpen(j.id) &&
                    ts.map((t) => (
                      <div className="g-brow g-task-b" key={t.id}>
                        {hasDates(t) && <button type="button" className="g-bar" style={{ left: x(t.start), width: w(t.start, t.end) }} onClick={() => setEditing(t)} title={`${t.name} (${t.progress}%)`}>
                          <span className="g-prog" style={{ width: `${t.progress}%` }} />
                          <span className="g-bar-label">{t.name}</span>
                        </button>}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
      {creating && <ScheduleEntryForm onClose={() => setCreating(false)} />}
      {editing && <ScheduleEntryForm entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
