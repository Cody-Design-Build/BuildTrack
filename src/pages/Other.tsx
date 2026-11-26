import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { useLookups, useStore, money, parseDb, KEY } from '../store';
import type { Db } from '../data';
import { JOB_STATUSES } from '../data';

export function Documents() {
  const { db } = useStore();
  const L = useLookups();
  const [kind, setKind] = useState('');
  const kinds = [...new Set(db.docs.map((d) => d.kind))];
  const docs = db.docs.filter((d) => !kind || d.kind === kind);
  return (
    <div className="page fill">
      <PageHeader title="Documents" />
      <div className="toolbar">
        <select className="btn select-btn" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document type">
          <option value="">All document types</option>
          {kinds.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr><th>Document</th><th>With</th><th>Job</th><th>Status</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const who = L.party.get(d.partyId);
              return (
                <tr key={d.id}>
                  <td>{d.kind} {d.number}</td>
                  <td>{who && <Link className="cyan" to={who.href}>{who.name}</Link>}</td>
                  <td>{L.job.get(d.jobId)?.name}</td>
                  <td>{d.status}</td>
                  <td className="num">{d.amount ? money(d.amount) : ''}</td>
                </tr>
              );
            })}
            <tr className="filler"><td colSpan={5} /></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Reports() {
  const { db } = useStore();
  const active = db.jobs.filter((j) => j.status !== 'Completed');
  return (
    <div className="page scroll">
      <PageHeader title="Reports" />
      <div className="detail">
        <div className="stat-grid">
          <div className="card stat"><span className="stat-label">Active jobs</span><b>{active.length}</b></div>
          <div className="card stat"><span className="stat-label">Contract value</span><b>{money(active.reduce((s, j) => s + j.total, 0))}</b></div>
          <div className="card stat"><span className="stat-label">People</span><b>{db.people.length}</b></div>
          <div className="card stat"><span className="stat-label">Accounts</span><b>{db.accounts.length}</b></div>
        </div>
        <section className="card">
          <div className="card-head"><h2>Jobs by status</h2></div>
          <div className="card-body">
            {JOB_STATUSES.map((s) => {
              const n = db.jobs.filter((j) => j.status === s.name).length;
              return (
                <div key={s.name} className="bar-row">
                  <span className="bar-label">{s.name}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / Math.max(1, db.jobs.length)) * 100}%`, background: s.color }} /></span>
                  <span className="bar-n">{n}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const TABLES: { key: keyof Db; label: string; what: string }[] = [
  { key: 'people', label: 'people', what: 'People (first/last name, email, phone, address, notes) — one record per real person' },
  { key: 'accounts', label: 'accounts', what: 'Households, companies, vendors and other organisations (name, types, phone, email, address, trade, notes)' },
  { key: 'memberships', label: 'account memberships', what: 'Which people belong to which accounts, with their title and whether they are the main contact' },
  { key: 'jobLinks', label: 'job links', what: 'Which people and accounts are involved in each job, and their role (Customer, Architect, Subcontractor…)' },
  { key: 'jobs', label: 'jobs', what: 'Jobs (name, site address, status, contract total, dates)' },
  { key: 'budgets', label: 'budgets', what: 'Proposals and change orders per job (number, title, status, who it is addressed to, notes)' },
  { key: 'budgetLines', label: 'budget lines', what: 'Line items of each budget (group, cost code, cost type, vendor, qty, unit cost, markup)' },
  { key: 'costCodes', label: 'cost codes', what: 'Job-costing codes that budget lines and expenses are recorded against' },
  { key: 'expenses', label: 'expenses', what: 'Money spent per job and cost code, optionally linked to a budget line' },
  { key: 'invoices', label: 'invoices', what: 'Progress invoices per job: which approved budgets they bill, percent complete to date per line, status and dates' },
  { key: 'payments', label: 'payments', what: 'Money received against invoices (date, amount, method, check or reference number, notes)' },
  { key: 'docs', label: 'documents', what: 'Invoices, bids, subcontractor agreements, purchase orders and bills' },
  { key: 'tasks', label: 'tasks', what: 'Tasks with the person or account involved, job, due date, type and assignees' },
  { key: 'scheduleEntries', label: 'schedule entries', what: 'Scheduled work by job, start and finish dates, crew and progress' },
  { key: 'activity', label: 'activity', what: 'Document events shown in the Home feed' },
  { key: 'team', label: 'team', what: 'Your own team members' },
];

function DataCard() {
  const { db, update } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const backup = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    a.download = `buildtrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const restore = async (f: File) => {
    try {
      const next = parseDb(await f.text());
      if (!Array.isArray(next.people) || !Array.isArray(next.accounts) || !Array.isArray(next.jobs)) throw new Error('not a backup');
      if (!confirm('Replace all current data with this backup?')) return;
      update(() => next);
      setNote('Backup restored.');
    } catch {
      setNote('That file is not a BuildTrack backup.');
    }
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Your data</h2></div>
      <div className="card-body">
        <p className="form-note">
          Everything is saved in this web browser's own storage (one record named <b>{KEY}</b>), so it stays on this computer and isn't shared with other
          devices yet. The browser keeps it inside its own private profile folder, not as a file you can open — use{' '}
          <b>Download backup</b> to get a copy as a file (it lands in your Downloads folder) to keep or move to another computer. Each browser
          (Chrome, Firefox…) keeps its own separate copy.
        </p>
        <table className="grid-table data-table">
          <thead><tr><th>Table</th><th className="num">Records</th><th>What it holds</th></tr></thead>
          <tbody>
            {TABLES.map((t) => (
              <tr key={t.key}>
                <td className="bold">{t.label}</td>
                <td className="num">{Array.isArray(db[t.key]) ? (db[t.key] as unknown[]).length : 0}</td>
                <td>{t.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row-end">
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          <button type="button" className="btn" onClick={() => file.current?.click()}>Restore backup</button>
          <button type="button" className="btn primary" onClick={backup}>Download backup</button>
        </div>
        {note && <p className="form-note small">{note}</p>}
      </div>
    </section>
  );
}

export function SettingsPage() {
  const { db, update, reset } = useStore();
  const [name, setName] = useState(db.companyName);
  return (
    <div className="page scroll">
      <PageHeader title="Settings" />
      <div className="detail narrow">
        <section className="card">
          <div className="card-head"><h2>Company</h2></div>
          <div className="card-body">
            <Field label="Company name">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="row-end">
              <button type="button" className="btn primary" onClick={() => update((d) => ({ ...d, companyName: name.trim() || d.companyName }))}>Save</button>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Team</h2></div>
          <div className="card-body">
            {db.team.map((m) => <div key={m.id} className="list-row"><span className="grow">{m.name}</span><span className="muted">{m.initials}</span></div>)}
          </div>
        </section>
        <DataCard />
        <section className="card">
          <div className="card-head"><h2>Start over</h2></div>
          <div className="card-body">
            <p className="form-note">Your data is saved in this browser. Resetting brings back the sample data.</p>
            <button type="button" className="btn danger" onClick={() => confirm('Reset all data to the sample data?') && reset()}>Reset sample data</button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div className="page scroll">
      <PageHeader title={title} />
      <div className="detail narrow">
        <section className="card">
          <div className="card-body">
            <p className="form-note">{text}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
