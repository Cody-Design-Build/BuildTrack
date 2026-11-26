import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2, FileText, FolderPlus, Upload, Phone, Mail, MapPin, Calendar, MessageCircle } from 'lucide-react';
import { PageHeader, Modal } from '../components/Layout';
import { JobForm, TodoForm, Field } from '../components/Forms';
import { ThreadCard } from '../components/Thread';
import { TaskForm } from './Schedule';
import { downloadCsv } from './Todos';
import { useLookups, useStore, money, uid, contactName, lineCost, linePrice } from '../store';
import { COST_TYPES, JOB_STATUSES, type Activity, type Db, type BudgetItem, type CostType, type Doc, type Job, type JobStatus, type Task } from '../data';

const TABS = ['overview', 'budget', 'schedule', 'to-dos', 'messages', 'documents'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  budget: 'Budget & Estimate',
  schedule: 'Schedule',
  'to-dos': 'To-Dos',
  messages: 'Messages',
  documents: 'Documents',
};

const STATUS_COLOR: Record<Doc['status'], string> = { Draft: '#2b7fff', Pending: '#f0b100', Approved: '#00c950', Open: '#00b8db', Paid: '#00c950' };

/** An activity-feed entry for a document change. */
function logDoc(d: Db, doc: Doc, what: string): Activity {
  const acct = d.accounts.find((a) => a.id === doc.accountId);
  const job = d.jobs.find((j) => j.id === doc.jobId);
  const me = d.team[0]?.name ?? 'You';
  return {
    id: uid('a'),
    date: new Date().toISOString().slice(0, 19),
    accountId: doc.accountId,
    jobId: doc.jobId,
    title: acct?.name ?? '',
    doc: `${doc.kind} ${doc.number}`,
    amount: doc.amount,
    text: `${what} by ${me}${job ? ` on ${job.name}` : ''}`,
    color: what === 'Created' ? '#2b7fff' : STATUS_COLOR[doc.status],
  };
}

const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : '—');

function totals(items: BudgetItem[]) {
  const cost = items.reduce((s, i) => s + lineCost(i), 0);
  const price = items.reduce((s, i) => s + linePrice(i), 0);
  const actual = items.reduce((s, i) => s + (i.actual || 0), 0);
  return { cost, price, actual, profit: price - cost, margin: price ? ((price - cost) / price) * 100 : NaN };
}

/** A number box that only saves when you leave it, so typing isn't interrupted. */
function NumCell({ value, onSave, label, width = 80 }: { value: number; onSave: (n: number) => void; label: string; width?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="b-input num"
      style={{ width }}
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^0-9.\-]/g, ''))}
      onBlur={() => {
        const n = Number(text);
        if (Number.isFinite(n) && n !== value) onSave(n);
        else setText(String(value));
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function TextCell({ value, onSave, label, className = '' }: { value: string; onSave: (s: string) => void; label: string; className?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={'b-input ' + className}
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Summary({ items, job }: { items: BudgetItem[]; job: Job }) {
  const t = totals(items);
  const contract = job.total || t.price;
  return (
    <div className="b-summary">
      <div className="card stat">
        <span className="stat-label">Estimated cost</span>
        <b>{money(t.cost)}</b>
      </div>
      <div className="card stat">
        <span className="stat-label">Estimated price</span>
        <b>{money(t.price)}</b>
      </div>
      <div className="card stat">
        <span className="stat-label">Profit · margin</span>
        <b>{money(t.profit)}</b>
        <span className="muted small-text">{pct(t.margin)} margin</span>
      </div>
      <div className="card stat">
        <span className="stat-label">Spent so far</span>
        <b>{money(t.actual)}</b>
        <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.min(100, t.cost ? (t.actual / t.cost) * 100 : 0)}%`, background: t.actual > t.cost ? '#dc2626' : '#16a34a' }} /></span>
        <span className="muted small-text">{money(t.cost - t.actual)} left of budget</span>
      </div>
      <div className="card stat">
        <span className="stat-label">Contract total</span>
        <b>{money(contract)}</b>
        <span className="muted small-text">{job.total ? 'Signed with customer' : 'Not signed yet (shows estimate)'}</span>
      </div>
    </div>
  );
}

function Budget({ job }: { job: Job }) {
  const { db, update } = useStore();
  const L = useLookups();
  const items = db.items.filter((i) => i.jobId === job.id);
  const groups = [...new Set(items.map((i) => i.group))];
  const vendors = db.accounts.filter((a) => a.type === 'vendor');
  const [newGroup, setNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [made, setMade] = useState('');

  const patch = (id: string, p: Partial<BudgetItem>) => update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const remove = (id: string) => update((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
  const add = (group: string) =>
    update((d) => ({
      ...d,
      items: [...d.items, { id: uid('b'), jobId: job.id, group, name: 'New item', costType: 'Materials', quantity: 1, unit: 'ea', unitCost: 0, markup: 20, vendorId: '', actual: 0 }],
    }));
  const renameGroup = (from: string, to: string) => {
    const name = to.trim();
    if (!name) return;
    update((d) => ({ ...d, items: d.items.map((i) => (i.jobId === job.id && i.group === from ? { ...i, group: name } : i)) }));
  };

  const makeProposal = () => {
    const t = totals(items);
    const count = db.docs.filter((d) => d.jobId === job.id).length + 1;
    const doc: Doc = { id: uid('d'), jobId: job.id, accountId: job.accountId, kind: 'Proposal', number: `${job.id.replace(/\D/g, '') || '1'}-${count}`, amount: Math.round(t.price), status: 'Pending' };
    update((d) => ({ ...d, docs: [...d.docs, doc], activity: [...d.activity, logDoc(d, doc, 'Created')] }));
    setMade(`Proposal ${doc.number} for ${money(doc.amount)} was created. Find it under Documents.`);
  };

  return (
    <div className="b-wrap">
      <Summary items={items} job={job} />
      <div className="toolbar b-toolbar">
        <button type="button" className="btn" onClick={() => add(groups[groups.length - 1] ?? 'General')}><Plus size={14} /> Item</button>
        <button type="button" className="btn" onClick={() => { setGroupName(''); setNewGroup(true); }}><FolderPlus size={14} /> Group</button>
        <span className="grow" />
        <button
          type="button"
          className="btn icon-only"
          title="Export to spreadsheet"
          aria-label="Export"
          onClick={() =>
            downloadCsv(`${job.name} budget.csv`, [
              ['Group', 'Item', 'Type', 'Vendor', 'Qty', 'Unit', 'Unit cost', 'Markup %', 'Cost', 'Price', 'Actual'],
              ...items.map((i) => [i.group, i.name, i.costType, L.account.get(i.vendorId)?.name ?? '', String(i.quantity), i.unit, String(i.unitCost), String(i.markup), lineCost(i).toFixed(2), linePrice(i).toFixed(2), String(i.actual)]),
            ])
          }
        >
          <Upload size={14} />
        </button>
        <button type="button" className="btn primary" onClick={makeProposal} disabled={items.length === 0}><FileText size={14} /> Create Proposal</button>
      </div>
      {made && <p className="b-note">{made}</p>}
      {items.length === 0 ? (
        <div className="card b-empty">
          <p>No budget yet. Add the costs for this job — labor, materials and subcontractors — and set your markup. The price to the customer is worked out for you.</p>
          <button type="button" className="btn primary" onClick={() => add('General')}><Plus size={14} /> Add first item</button>
        </div>
      ) : (
        <div className="table-wrap b-table-wrap">
          <table className="grid-table b-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Vendor</th>
                <th className="num">Qty</th>
                <th>Unit</th>
                <th className="num">Unit cost</th>
                <th className="num">Markup %</th>
                <th className="num">Cost</th>
                <th className="num">Price</th>
                <th className="num">Spent</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            {groups.map((g) => {
              const gi = items.filter((i) => i.group === g);
              const gt = totals(gi);
              return (
                <tbody key={g}>
                  <tr className="b-group">
                    <td colSpan={7}>
                      <TextCell value={g} label="Group name" className="bold" onSave={(v) => renameGroup(g, v)} />
                    </td>
                    <td className="num">{money(gt.cost)}</td>
                    <td className="num">{money(gt.price)}</td>
                    <td className="num">{money(gt.actual)}</td>
                    <td className="center">
                      <button type="button" className="icon-btn" title={`Add item to ${g}`} aria-label={`Add item to ${g}`} onClick={() => add(g)}><Plus size={14} /></button>
                    </td>
                  </tr>
                  {gi.map((i) => (
                    <tr key={i.id}>
                      <td><TextCell value={i.name} label="Item name" onSave={(v) => patch(i.id, { name: v })} /></td>
                      <td>
                        <select className="b-input" value={i.costType} aria-label="Cost type" onChange={(e) => patch(i.id, { costType: e.target.value as CostType })}>
                          {COST_TYPES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="b-input" value={i.vendorId} aria-label="Vendor" onChange={(e) => patch(i.id, { vendorId: e.target.value })}>
                          <option value="">—</option>
                          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </td>
                      <td className="num"><NumCell value={i.quantity} label="Quantity" width={60} onSave={(n) => patch(i.id, { quantity: n })} /></td>
                      <td><TextCell value={i.unit} label="Unit" className="b-unit" onSave={(v) => patch(i.id, { unit: v })} /></td>
                      <td className="num"><NumCell value={i.unitCost} label="Unit cost" onSave={(n) => patch(i.id, { unitCost: n })} /></td>
                      <td className="num"><NumCell value={i.markup} label="Markup percent" width={56} onSave={(n) => patch(i.id, { markup: n })} /></td>
                      <td className="num">{money(lineCost(i))}</td>
                      <td className="num bold">{money(linePrice(i))}</td>
                      <td className="num"><NumCell value={i.actual} label="Spent so far" onSave={(n) => patch(i.id, { actual: n })} /></td>
                      <td className="center">
                        <button type="button" className="icon-btn" title="Remove item" aria-label="Remove item" onClick={() => remove(i.id)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
            <tfoot>
              <tr className="b-total">
                <td colSpan={7}>Job total</td>
                <td className="num">{money(totals(items).cost)}</td>
                <td className="num">{money(totals(items).price)}</td>
                <td className="num">{money(totals(items).actual)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {newGroup && (
        <Modal title="New Group" onClose={() => setNewGroup(false)}>
          <Field label="Group name (e.g. Framing, Electrical)">
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} autoFocus />
          </Field>
          <div className="row-end">
            <button type="button" className="btn" onClick={() => setNewGroup(false)}>Cancel</button>
            <button type="button" className="btn primary" disabled={!groupName.trim()} onClick={() => { add(groupName.trim()); setNewGroup(false); }}>Add group</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Overview({ job, go }: { job: Job; go: (t: Tab) => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const account = L.account.get(job.accountId);
  const loc = L.location.get(job.locationId);
  const contacts = db.contacts.filter((c) => c.accountId === job.accountId).sort((a, b) => Number(b.primary) - Number(a.primary));
  const items = db.items.filter((i) => i.jobId === job.id);
  const t = totals(items);
  const todos = db.todos.filter((x) => x.jobId === job.id && !x.done);
  const tasks = db.tasks.filter((x) => x.jobId === job.id);
  const progress = tasks.length ? Math.round(tasks.reduce((s, x) => s + x.progress, 0) / tasks.length) : job.progress;
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
          <div><MapPin size={14} /> {loc?.address || <span className="muted">No address</span>}</div>
          <div><Calendar size={14} /> {job.start} → {job.end}</div>
          <div><span className="muted j-lbl">Progress</span><span className="bar-track"><span className="bar-fill" style={{ width: `${progress}%`, background: '#51a2ff' }} /></span> {progress}%</div>
          <div><span className="muted j-lbl">Contract</span> {job.total ? money(job.total) : <span className="muted">Not signed yet</span>}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Customer</h2>
          {account && <Link className="btn btn-sm" to={`/customers?id=${account.id}`}>Open account</Link>}
        </div>
        <div className="card-body">
          <div className="cr-name">{account?.name}</div>
          <div className="info-list j-acct">
            {account?.phone && <div><Phone size={14} /> {account.phone}</div>}
            {account?.email && <div><Mail size={14} /> {account.email}</div>}
          </div>
          {contacts.map((c) => (
            <div key={c.id} className="list-row">
              <span className="grow">{contactName(c)} {c.primary && <span className="tag">Primary</span>}</span>
              <span className="muted ellipsis">{c.email || c.phone}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Budget</h2>
          <button type="button" className="btn btn-sm" onClick={() => go('budget')}>Open budget</button>
        </div>
        <div className="card-body info-list">
          <div className="j-row"><span>Estimated cost</span><b>{money(t.cost)}</b></div>
          <div className="j-row"><span>Estimated price</span><b>{money(t.price)}</b></div>
          <div className="j-row"><span>Profit</span><b>{money(t.profit)} <span className="muted">({pct(t.margin)})</span></b></div>
          <div className="j-row"><span>Spent so far</span><b>{money(t.actual)}</b></div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Open To-Dos ({todos.length})</h2>
          <button type="button" className="btn btn-sm" onClick={() => go('to-dos')}>All to-dos</button>
        </div>
        <div className="card-body">
          {todos.length === 0 && <div className="wt-empty">Nothing open</div>}
          {todos.map((x) => (
            <Link key={x.id} to={`/to-dos?id=${x.id}`} className="list-row"><span className="grow">{x.name}</span><span className="muted">{x.due}</span></Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function ScheduleTab({ job }: { job: Job }) {
  const { db } = useStore();
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const tasks = db.tasks.filter((t) => t.jobId === job.id).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div>
      <div className="toolbar j-tab-bar">
        <button type="button" className="btn" onClick={() => setEditing('new')}><Plus size={14} /> Task</button>
        <span className="grow" />
        <Link to="/schedule" className="btn">See all jobs on the schedule</Link>
      </div>
      <div className="table-wrap">
        <table className="grid-table j-table">
          <thead><tr><th>Task</th><th>Start</th><th>Finish</th><th className="num">% done</th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => setEditing(t)}>
                <td>{t.name}</td><td>{t.start}</td><td>{t.end}</td>
                <td className="num"><span className="bar-track j-mini"><span className="bar-fill" style={{ width: `${t.progress}%`, background: '#51a2ff' }} /></span> {t.progress}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <div className="wt-empty">No tasks scheduled yet.</div>}
      </div>
      {editing && <TaskForm task={editing === 'new' ? undefined : editing} presetJobId={job.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TodosTab({ job }: { job: Job }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [adding, setAdding] = useState(false);
  const todos = db.todos.filter((t) => t.jobId === job.id);
  return (
    <div>
      <div className="toolbar j-tab-bar">
        <button type="button" className="btn" onClick={() => setAdding(true)}><Plus size={14} /> To-Do</button>
      </div>
      <div className="table-wrap">
        <table className="grid-table j-table">
          <thead><tr><th className="center">✓</th><th>Name</th><th>Due</th><th>Type</th><th>Assignees</th></tr></thead>
          <tbody>
            {todos.map((t) => (
              <tr key={t.id} className={t.done ? 'done' : ''}>
                <td className="center"><input type="checkbox" checked={t.done} aria-label="Done" onChange={() => update((d) => ({ ...d, todos: d.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))} /></td>
                <td><Link to={`/to-dos?id=${t.id}`}>{t.name}</Link></td>
                <td>{t.due}</td>
                <td>{t.type}</td>
                <td>{t.assignees.map((a) => L.team.get(a)?.name).filter(Boolean).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {todos.length === 0 && <div className="wt-empty">No to-dos for this job.</div>}
      </div>
      {adding && <TodoForm presetAccountId={job.accountId} presetJobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

function MessagesTab({ job }: { job: Job }) {
  const { db } = useStore();
  const threads: Record<string, string[]> = {};
  const keys: string[] = [];
  for (const m of db.messages.filter((x) => x.jobId === job.id).sort((a, b) => b.date.localeCompare(a.date))) {
    if (!threads[m.topic]) {
      threads[m.topic] = [];
      keys.push(m.topic);
    }
    threads[m.topic].push(m.id);
  }
  return (
    <div className="j-messages">
      <div className="toolbar j-tab-bar">
        <Link to="/messages" className="btn"><MessageCircle size={14} /> All messages</Link>
      </div>
      {keys.length === 0 && <div className="wt-empty">No messages about this job yet.</div>}
      {keys.map((k) => <ThreadCard key={k} ids={threads[k].slice().reverse()} />)}
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
      // approving a customer proposal signs the contract
      const jobs = doc && status === 'Approved' && doc.kind === 'Proposal' ? d.jobs.map((j) => (j.id === job.id ? { ...j, total: doc.amount } : j)) : d.jobs;
      return {
        ...d,
        jobs,
        docs: d.docs.map((x) => (x.id === id ? { ...x, status } : x)),
        activity: doc ? [...d.activity, logDoc(d, { ...doc, status }, `Marked as ${status.toLowerCase()}`)] : d.activity,
      };
    });
  return (
    <div className="table-wrap">
      <table className="grid-table j-table">
        <thead><tr><th>Document</th><th>Account</th><th>Status</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {docs.map((d) => {
            const a = L.account.get(d.accountId);
            return (
              <tr key={d.id}>
                <td>{d.kind} {d.number}</td>
                <td>{a && <Link className="cyan" to={`/${a.type === 'vendor' ? 'vendors' : 'customers'}?id=${a.id}`}>{a.name}</Link>}</td>
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
      {docs.length === 0 && <div className="wt-empty">No documents yet. Create a proposal from the Budget tab.</div>}
    </div>
  );
}

export default function JobDetail({ job }: { job: Job }) {
  const L = useLookups();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const go = (t: Tab) => setParams({ job: job.id, tab: t });
  const status = JOB_STATUSES.find((s) => s.name === job.status);
  return (
    <div className="page scroll job-page">
      <PageHeader
        crumb={L.account.get(job.accountId)?.name ?? 'Job'}
        title={job.name}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAdding(true)}><Plus size={14} /> To-Do</button>
            <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit Job</button>
          </>
        }
      />
      <div className="j-bar">
        <Link to="/jobs" className="back-link"><ArrowLeft size={14} /> All jobs</Link>
        <span className="j-status-pill" style={{ background: status?.color }}>{job.status}</span>
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
        {tab === 'budget' && <Budget job={job} />}
        {tab === 'schedule' && <ScheduleTab job={job} />}
        {tab === 'to-dos' && <TodosTab job={job} />}
        {tab === 'messages' && <MessagesTab job={job} />}
        {tab === 'documents' && <DocumentsTab job={job} />}
      </div>
      {editing && <JobForm job={job} onClose={() => setEditing(false)} />}
      {adding && <TodoForm presetAccountId={job.accountId} presetJobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}
