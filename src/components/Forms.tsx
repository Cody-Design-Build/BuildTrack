import { useState } from 'react';
import { Modal } from './Layout';
import { useStore, uid, contactName } from '../store';
import { JOB_STATUSES, type Account, type AccountType, type Contact, type Job, type JobStatus, type Todo } from '../data';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function JobForm({ onClose, job, defaultStatus }: { onClose: () => void; job?: Job; defaultStatus?: JobStatus }) {
  const { db, update } = useStore();
  const customers = db.accounts.filter((a) => a.type === 'customer');
  const [name, setName] = useState(job?.name ?? '');
  const [accountId, setAccountId] = useState(job?.accountId ?? customers[0]?.id ?? '');
  const [address, setAddress] = useState(job ? db.locations.find((l) => l.id === job.locationId)?.address ?? '' : '');
  const [status, setStatus] = useState<JobStatus>(job?.status ?? defaultStatus ?? 'Lead');
  const [total, setTotal] = useState(String(job?.total ?? ''));
  const [start, setStart] = useState(job?.start ?? '');
  const [end, setEnd] = useState(job?.end ?? '');

  const save = () => {
    if (!name.trim() || !accountId) return;
    update((d) => {
      let locations = d.locations;
      let locationId = job?.locationId ?? '';
      const addr = address.trim();
      if (addr) {
        const existing = d.locations.find((l) => l.accountId === accountId && l.address === addr);
        if (existing) locationId = existing.id;
        else {
          locationId = uid('l');
          locations = [...locations, { id: locationId, accountId, name: addr, address: addr }];
        }
      }
      const next: Job = {
        id: job?.id ?? uid('j'),
        name: name.trim(),
        accountId,
        locationId,
        status,
        total: Number(total) || 0,
        projectedCost: job?.projectedCost ?? 0,
        start: start || new Date().toISOString().slice(0, 10),
        end: end || start || new Date().toISOString().slice(0, 10),
        progress: job?.progress ?? 0,
      };
      const jobs = job ? d.jobs.map((j) => (j.id === job.id ? next : j)) : [...d.jobs, next];
      return { ...d, jobs, locations };
    });
    onClose();
  };

  return (
    <Modal title={job ? 'Edit Job' : 'New Job'} onClose={onClose}>
      <Field label="Job name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 12 Main St - Kitchen" autoFocus />
      </Field>
      <Field label="Customer account">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Job address">
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
      </Field>
      <div className="field-row">
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
            {JOB_STATUSES.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Contract total ($)">
          <input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Start">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Finish">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="row-end">
        {job && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (!confirm('Delete this job?')) return;
              update((d) => ({ ...d, jobs: d.jobs.filter((j) => j.id !== job.id) }));
              onClose();
            }}
          >
            Delete
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={!name.trim()}>Save</button>
      </div>
    </Modal>
  );
}

export function TodoForm({ onClose, todo, presetAccountId, presetJobId }: { onClose: () => void; todo?: Todo; presetAccountId?: string; presetJobId?: string }) {
  const { db, update } = useStore();
  const [name, setName] = useState(todo?.name ?? '');
  const [accountId, setAccountId] = useState(todo?.accountId ?? presetAccountId ?? '');
  const [jobId, setJobId] = useState(todo?.jobId ?? presetJobId ?? '');
  const [due, setDue] = useState(todo?.due ?? '');
  const [type, setType] = useState(todo?.type ?? '');
  const [assignees, setAssignees] = useState<string[]>(todo?.assignees ?? [db.team[0]?.id].filter(Boolean) as string[]);
  const jobs = db.jobs.filter((j) => !accountId || j.accountId === accountId);

  const save = () => {
    if (!name.trim()) return;
    const next: Todo = { id: todo?.id ?? uid('t'), name: name.trim(), accountId, jobId, due, type, assignees, done: todo?.done ?? false };
    update((d) => ({ ...d, todos: todo ? d.todos.map((t) => (t.id === todo.id ? next : t)) : [...d.todos, next] }));
    onClose();
  };

  return (
    <Modal title={todo ? 'Edit To-Do' : 'New To-Do'} onClose={onClose}>
      <Field label="What needs doing?">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="field-row">
        <Field label="Account">
          <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setJobId(''); }}>
            <option value="">None</option>
            <optgroup label="Customers">
              {db.accounts.filter((a) => a.type === 'customer').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
            <optgroup label="Vendors">
              {db.accounts.filter((a) => a.type === 'vendor').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </optgroup>
          </select>
        </Field>
        <Field label="Job">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">None</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label="Due">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Type">
          <input value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Site Visit" list="todo-types" />
          <datalist id="todo-types">
            {[...new Set(db.todos.map((t) => t.type).filter(Boolean))].map((t) => <option key={t} value={t} />)}
          </datalist>
        </Field>
      </div>
      <Field label="Assigned to">
        <div className="chips">
          {db.team.map((m) => (
            <button
              key={m.id}
              type="button"
              className={'chip' + (assignees.includes(m.id) ? ' on' : '')}
              onClick={() => setAssignees((a) => (a.includes(m.id) ? a.filter((x) => x !== m.id) : [...a, m.id]))}
            >
              {m.name}
            </button>
          ))}
        </div>
      </Field>
      <div className="row-end">
        {todo && (
          <button type="button" className="btn danger" onClick={() => { update((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== todo.id) })); onClose(); }}>
            Delete
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={!name.trim()}>Save</button>
      </div>
    </Modal>
  );
}

export function AccountForm({ type, onClose, account, onSaved }: { type: AccountType; onClose: () => void; account?: Account; onSaved?: (id: string) => void }) {
  const { db, update } = useStore();
  const [name, setName] = useState(account?.name ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [address, setAddress] = useState(account?.address ?? '');
  const [trade, setTrade] = useState(account?.trade ?? '');
  const [notes, setNotes] = useState(account?.notes ?? '');
  // a new account starts with its first contact, so people never float around on their own
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const dup = db.accounts.find((a) => a.id !== account?.id && a.type === type && a.name.trim().toLowerCase() === name.trim().toLowerCase());

  const save = () => {
    if (!name.trim() || dup) return;
    const id = account?.id ?? uid(type === 'customer' ? 'c' : 'v');
    const colors = ['#0284c7', '#d97706', '#16a34a', '#c026d3', '#e11d48', '#ea580c', '#7c3aed', '#0d9488'];
    const next: Account = {
      id,
      type,
      name: name.trim(),
      phone,
      email,
      address,
      notes,
      trade: type === 'vendor' ? trade : undefined,
      color: account?.color ?? colors[db.accounts.length % colors.length],
    };
    update((d) => {
      const accounts = account ? d.accounts.map((a) => (a.id === id ? next : a)) : [...d.accounts, next];
      let contacts = d.contacts;
      if (!account && (first.trim() || last.trim())) {
        contacts = [...contacts, { id: uid('p'), accountId: id, firstName: first.trim(), lastName: last.trim(), title: '', email, phone, primary: true }];
      }
      return { ...d, accounts, contacts };
    });
    onSaved?.(id);
    onClose();
  };

  const label = type === 'customer' ? 'Customer' : 'Vendor';
  return (
    <Modal title={account ? `Edit ${label} Account` : `New ${label} Account`} onClose={onClose}>
      <Field label={`${label} account name`}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'customer' ? 'e.g. Smith Household' : 'e.g. Acme Plumbing'} autoFocus />
      </Field>
      {dup && <p className="form-warn">A {label.toLowerCase()} account with this name already exists.</p>}
      {type === 'vendor' && (
        <Field label="Trade">
          <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Electrical" />
        </Field>
      )}
      <div className="field-row">
        <Field label="Main phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Main email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      {!account && (
        <div className="field-row">
          <Field label="First contact — first name">
            <input value={first} onChange={(e) => setFirst(e.target.value)} />
          </Field>
          <Field label="Last name">
            <input value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
        </div>
      )}
      <Field label="Notes">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={!name.trim() || !!dup}>Save</button>
      </div>
    </Modal>
  );
}

/**
 * Add or edit a contact inside ONE account. The account can't be changed here:
 * a person who also belongs to another account needs a separate contact there.
 */
export function ContactForm({ account, contact, onClose }: { account: Account; contact?: Contact; onClose: () => void }) {
  const { db, update } = useStore();
  const [firstName, setFirst] = useState(contact?.firstName ?? '');
  const [lastName, setLast] = useState(contact?.lastName ?? '');
  const [title, setTitle] = useState(contact?.title ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [primary, setPrimary] = useState(contact?.primary ?? !db.contacts.some((c) => c.accountId === account.id));

  const full = `${firstName} ${lastName}`.trim().toLowerCase();
  const sameHere = db.contacts.find((c) => c.accountId === account.id && c.id !== contact?.id && contactName(c).toLowerCase() === full);
  const elsewhere = full
    ? db.contacts.filter((c) => c.accountId !== account.id && contactName(c).toLowerCase() === full)
    : [];

  const save = () => {
    if (!full || sameHere) return;
    const next: Contact = { id: contact?.id ?? uid('p'), accountId: account.id, firstName: firstName.trim(), lastName: lastName.trim(), title, email, phone, primary };
    update((d) => {
      let contacts = contact ? d.contacts.map((c) => (c.id === next.id ? next : c)) : [...d.contacts, next];
      if (primary) contacts = contacts.map((c) => (c.accountId === account.id && c.id !== next.id ? { ...c, primary: false } : c));
      return { ...d, contacts };
    });
    onClose();
  };

  return (
    <Modal title={contact ? 'Edit Contact' : `New Contact in ${account.name}`} onClose={onClose}>
      <p className="form-note">
        This contact belongs only to <b>{account.name}</b>. If the same person also works with another customer or vendor account, add a separate contact there.
      </p>
      <div className="field-row">
        <Field label="First name">
          <input value={firstName} onChange={(e) => setFirst(e.target.value)} autoFocus />
        </Field>
        <Field label="Last name">
          <input value={lastName} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      {sameHere && <p className="form-warn">This account already has a contact with this name.</p>}
      {elsewhere.length > 0 && !sameHere && (
        <p className="form-note small">
          A person with this name is also a contact in{' '}
          {elsewhere.map((c) => db.accounts.find((a) => a.id === c.accountId)?.name).join(', ')}. That stays a separate record — changes here won't affect it.
        </p>
      )}
      <Field label="Role / title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Owner, Project Manager" />
      </Field>
      <div className="field-row">
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Primary contact for this account
      </label>
      <div className="row-end">
        {contact && (
          <button type="button" className="btn danger" onClick={() => { update((d) => ({ ...d, contacts: d.contacts.filter((c) => c.id !== contact.id) })); onClose(); }}>
            Remove
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={!full || !!sameHere}>Save</button>
      </div>
    </Modal>
  );
}
