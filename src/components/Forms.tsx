import { useState } from 'react';
import { Modal } from './Layout';
import { PartyPicker } from './Party';
import { useStore, useLookups, uid, personName, colorFor } from '../store';
import { ACCOUNT_TYPES, JOB_ROLES, JOB_STATUSES, type Account, type Db, type Job, type JobLink, type JobStatus, type Membership, type Person, type Todo } from '../data';
import { Button } from '@/components/ui/button';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Actions({ onClose, onSave, canSave, onDelete, deleteLabel = 'Delete' }: { onClose: () => void; onSave: () => void; canSave: boolean; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <div className="row-end">
      {onDelete && (
        <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
          {deleteLabel}
        </Button>
      )}
      <span style={{ flex: 1 }} />
      <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      <Button type="button" onClick={onSave} disabled={!canSave}>Save</Button>
    </div>
  );
}

/** "Maya Harper" -> first "Maya", last "Harper"; everything after the first word is the last name. */
export function splitName(name: string) {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}

export function newPerson(name: string, extra: Partial<Person> = {}): Person {
  const n = splitName(name);
  return { id: uid('p'), ...n, email: '', phone: '', address: '', notes: '', color: colorFor(`${n.firstName} ${n.lastName}`), ...extra };
}

/** Removes a person or account and everything that pointed at it. */
export function removeParty(d: Db, id: string): Db {
  return {
    ...d,
    people: d.people.filter((p) => p.id !== id),
    accounts: d.accounts.filter((a) => a.id !== id),
    memberships: d.memberships.filter((m) => m.personId !== id && m.accountId !== id),
    jobLinks: d.jobLinks.filter((l) => l.partyId !== id),
    docs: d.docs.map((x) => (x.partyId === id ? { ...x, partyId: '' } : x)),
    todos: d.todos.map((x) => (x.partyId === id ? { ...x, partyId: '' } : x)),
    items: d.items.map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)),
  };
}

/** A role box that suggests the usual roles but accepts anything typed. */
function RoleInput({ value, onChange, options, listId, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; listId: string; placeholder?: string }) {
  return (
    <>
      <input value={value} onChange={(e) => onChange(e.target.value)} list={listId} placeholder={placeholder} />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

export function JobForm({ onClose, job, defaultStatus, presetCustomerId }: { onClose: () => void; job?: Job; defaultStatus?: JobStatus; presetCustomerId?: string }) {
  const { update } = useStore();
  const L = useLookups();
  const currentCustomer = job ? L.customers(job.id)[0]?.id ?? '' : presetCustomerId ?? '';
  const [name, setName] = useState(job?.name ?? '');
  const [customerId, setCustomerId] = useState(currentCustomer);
  const [pendingPerson, setPendingPerson] = useState<Person | null>(null);
  const [address, setAddress] = useState(job?.address ?? '');
  const [status, setStatus] = useState<JobStatus>(job?.status ?? defaultStatus ?? 'Lead');
  const [total, setTotal] = useState(String(job?.total ?? ''));
  const [start, setStart] = useState(job?.start ?? '');
  const [end, setEnd] = useState(job?.end ?? '');

  const save = () => {
    if (!name.trim()) return;
    update((d) => {
      const today = new Date().toISOString().slice(0, 10);
      const next: Job = {
        id: job?.id ?? uid('j'),
        name: name.trim(),
        address: address.trim(),
        status,
        total: Number(total) || 0,
        projectedCost: job?.projectedCost ?? 0,
        start: start || today,
        end: end || start || today,
        progress: job?.progress ?? 0,
      };
      const jobs = job ? d.jobs.map((j) => (j.id === job.id ? next : j)) : [...d.jobs, next];
      const people = pendingPerson && pendingPerson.id === customerId ? [...d.people, pendingPerson] : d.people;
      let jobLinks = d.jobLinks;
      if (customerId !== currentCustomer) {
        // swap the main customer, keeping any other people on the job
        jobLinks = jobLinks.filter((l) => !(l.jobId === next.id && l.partyId === currentCustomer && l.role === 'Customer'));
        if (customerId && !jobLinks.some((l) => l.jobId === next.id && l.partyId === customerId && l.role === 'Customer')) {
          jobLinks = [...jobLinks, { id: uid('l'), jobId: next.id, partyId: customerId, role: 'Customer' }];
        }
      }
      return { ...d, jobs, people, jobLinks };
    });
    onClose();
  };

  return (
    <Modal title={job ? 'Edit Job' : 'New Job'} onClose={onClose}>
      <Field label="Job name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 12 Main St - Kitchen" autoFocus />
      </Field>
      <div className="field">
        <span className="field-label">Customer</span>
        <PartyPicker
          value={customerId}
          onChange={setCustomerId}
          placeholder="Choose or add the customer"
          allowClear
          onCreatePerson={(n) => {
            const p = newPerson(n);
            setPendingPerson(p);
            setCustomerId(p.id);
          }}
        />
        {pendingPerson && pendingPerson.id === customerId && (
          <span className="form-note small">{personName(pendingPerson)} will be added to People when you save.</span>
        )}
      </div>
      <Field label="Job site address">
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
      <Actions
        onClose={onClose}
        onSave={save}
        canSave={!!name.trim()}
        onDelete={
          job
            ? () => {
                if (!confirm('Delete this job?')) return;
                update((d) => ({ ...d, jobs: d.jobs.filter((j) => j.id !== job.id), jobLinks: d.jobLinks.filter((l) => l.jobId !== job.id) }));
                onClose();
              }
            : undefined
        }
      />
    </Modal>
  );
}

export function TodoForm({ onClose, todo, presetPartyId, presetJobId }: { onClose: () => void; todo?: Todo; presetPartyId?: string; presetJobId?: string }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [name, setName] = useState(todo?.name ?? '');
  const [partyId, setPartyId] = useState(todo?.partyId ?? presetPartyId ?? '');
  const [jobId, setJobId] = useState(todo?.jobId ?? presetJobId ?? '');
  const [due, setDue] = useState(todo?.due ?? '');
  const [type, setType] = useState(todo?.type ?? '');
  const [assignees, setAssignees] = useState<string[]>(todo?.assignees ?? ([db.team[0]?.id].filter(Boolean) as string[]));
  // with a person or account chosen, offer their jobs first
  const theirs = new Set((L.linksByParty.get(partyId) ?? []).map((l) => l.jobId));
  const jobs = [...db.jobs].sort((a, b) => Number(theirs.has(b.id)) - Number(theirs.has(a.id)) || a.name.localeCompare(b.name));

  const save = () => {
    if (!name.trim()) return;
    const next: Todo = { id: todo?.id ?? uid('t'), name: name.trim(), partyId, jobId, due, type, assignees, done: todo?.done ?? false };
    update((d) => ({ ...d, todos: todo ? d.todos.map((t) => (t.id === todo.id ? next : t)) : [...d.todos, next] }));
    onClose();
  };

  return (
    <Modal title={todo ? 'Edit To-Do' : 'New To-Do'} onClose={onClose}>
      <Field label="What needs doing?">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="field">
        <span className="field-label">With (person or account)</span>
        <PartyPicker value={partyId} onChange={setPartyId} placeholder="Nobody in particular" allowClear />
      </div>
      <Field label="Job">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">None</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}{theirs.has(j.id) ? ' ★' : ''}</option>)}
        </select>
      </Field>
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
      <Actions
        onClose={onClose}
        onSave={save}
        canSave={!!name.trim()}
        onDelete={todo ? () => { update((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== todo.id) })); onClose(); } : undefined}
      />
    </Modal>
  );
}

export function PersonForm({ person, presetAccountId, onClose, onSaved }: { person?: Person; presetAccountId?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const { db, update } = useStore();
  const [firstName, setFirst] = useState(person?.firstName ?? '');
  const [lastName, setLast] = useState(person?.lastName ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [address, setAddress] = useState(person?.address ?? '');
  const [notes, setNotes] = useState(person?.notes ?? '');
  // a new person can be placed in an account straight away
  const [accountId, setAccountId] = useState(presetAccountId ?? '');
  const [title, setTitle] = useState('');
  const full = `${firstName} ${lastName}`.trim();
  const dup = full ? db.people.find((p) => p.id !== person?.id && personName(p).toLowerCase() === full.toLowerCase()) : undefined;

  const save = () => {
    if (!full) return;
    const next: Person = {
      id: person?.id ?? uid('p'),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      notes,
      color: person?.color ?? colorFor(full),
    };
    update((d) => {
      const people = person ? d.people.map((p) => (p.id === next.id ? next : p)) : [...d.people, next];
      const memberships: Membership[] =
        !person && accountId
          ? [...d.memberships, { id: uid('m'), personId: next.id, accountId, title: title.trim(), primary: !d.memberships.some((m) => m.accountId === accountId) }]
          : d.memberships;
      return { ...d, people, memberships };
    });
    onSaved?.(next.id);
    onClose();
  };

  return (
    <Modal title={person ? 'Edit Person' : 'New Person'} onClose={onClose}>
      <div className="field-row">
        <Field label="First name">
          <input value={firstName} onChange={(e) => setFirst(e.target.value)} autoFocus />
        </Field>
        <Field label="Last name">
          <input value={lastName} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      {dup && <p className="form-note small">There's already a person called {personName(dup)}. If this is the same person, open their record instead of adding a second one.</p>}
      <div className="field-row">
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      {!person && (
        <div className="field-row">
          <div className="field">
            <span className="field-label">Account (optional)</span>
            <PartyPicker kinds={['account']} value={accountId} onChange={setAccountId} placeholder="Not part of an account" allowClear />
          </div>
          <Field label="Title there">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Owner, Estimator" disabled={!accountId} />
          </Field>
        </div>
      )}
      <Field label="Notes">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Actions
        onClose={onClose}
        onSave={save}
        canSave={!!full}
        onDelete={
          person
            ? () => {
                if (!confirm(`Delete ${personName(person)}? They'll be removed from their accounts and jobs.`)) return;
                update((d) => removeParty(d, person.id));
                onClose();
              }
            : undefined
        }
      />
    </Modal>
  );
}

export function AccountForm({ account, presetTypes, onClose, onSaved }: { account?: Account; presetTypes?: string[]; onClose: () => void; onSaved?: (id: string) => void }) {
  const { db, update } = useStore();
  const [name, setName] = useState(account?.name ?? '');
  const [types, setTypes] = useState<string[]>(account?.types ?? presetTypes ?? []);
  const [custom, setCustom] = useState('');
  const [trade, setTrade] = useState(account?.trade ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [address, setAddress] = useState(account?.address ?? '');
  const [notes, setNotes] = useState(account?.notes ?? '');
  const dup = db.accounts.find((a) => a.id !== account?.id && a.name.trim().toLowerCase() === name.trim().toLowerCase());
  const allTypes = [...new Set([...ACCOUNT_TYPES, ...db.accounts.flatMap((a) => a.types), ...types])];
  const toggle = (t: string) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  const save = () => {
    if (!name.trim() || dup) return;
    const colors = ['#0284c7', '#d97706', '#16a34a', '#c026d3', '#e11d48', '#ea580c', '#7c3aed', '#0d9488'];
    const next: Account = {
      id: account?.id ?? uid('a'),
      name: name.trim(),
      types,
      phone,
      email,
      address,
      notes,
      trade: trade.trim() || undefined,
      color: account?.color ?? colors[db.accounts.length % colors.length],
    };
    update((d) => ({ ...d, accounts: account ? d.accounts.map((a) => (a.id === next.id ? next : a)) : [...d.accounts, next] }));
    onSaved?.(next.id);
    onClose();
  };

  return (
    <Modal title={account ? 'Edit Account' : 'New Account'} onClose={onClose}>
      <Field label="Account name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smith Household, Acme Plumbing" autoFocus />
      </Field>
      {dup && <p className="form-warn">An account with this name already exists.</p>}
      <Field label="Type">
        <div className="chips">
          {allTypes.map((t) => (
            <button key={t} type="button" className={'chip' + (types.includes(t) ? ' on' : '')} onClick={() => toggle(t)}>
              {t}
            </button>
          ))}
          <input
            className="chip-input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) {
                e.preventDefault();
                if (!types.includes(custom.trim())) setTypes((ts) => [...ts, custom.trim()]);
                setCustom('');
              }
            }}
            placeholder="+ Other type"
            aria-label="Add another type"
          />
        </div>
      </Field>
      <Field label="Trade (optional)">
        <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Electrical, Tile" />
      </Field>
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
      <Field label="Notes">
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Actions
        onClose={onClose}
        onSave={save}
        canSave={!!name.trim() && !dup}
        onDelete={
          account
            ? () => {
                if (!confirm(`Delete ${account.name}? Its people stay in People; they're just no longer linked to it.`)) return;
                update((d) => removeParty(d, account.id));
                onClose();
              }
            : undefined
        }
      />
    </Modal>
  );
}

/**
 * Links a person to an account with a title. Opened from an account (choose the person,
 * or type a new name) or from a person (choose the account).
 */
export function MembershipForm({ accountId, personId, membership, onClose }: { accountId?: string; personId?: string; membership?: Membership; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [pid, setPid] = useState(membership?.personId ?? personId ?? '');
  const [aid, setAid] = useState(membership?.accountId ?? accountId ?? '');
  const [pendingPerson, setPendingPerson] = useState<Person | null>(null);
  const [title, setTitle] = useState(membership?.title ?? '');
  const [primary, setPrimary] = useState(membership?.primary ?? (aid ? !db.memberships.some((m) => m.accountId === aid) : false));
  const fixedAccount = !!(accountId || membership);
  const fixedPerson = !!(personId || membership);
  const already = !membership && pid && aid ? db.memberships.some((m) => m.personId === pid && m.accountId === aid) : false;
  const existingInAccount = aid ? new Set((L.membersOf.get(aid) ?? []).map((m) => m.personId)) : new Set<string>();
  const existingForPerson = pid ? new Set((L.accountsOf.get(pid) ?? []).map((m) => m.accountId)) : new Set<string>();
  const personLabel = pendingPerson && pendingPerson.id === pid ? personName(pendingPerson) : L.party.get(pid)?.name;
  const accountLabel = L.account.get(aid)?.name;

  const save = () => {
    if (!pid || !aid || already) return;
    update((d) => {
      const people = pendingPerson && pendingPerson.id === pid ? [...d.people, pendingPerson] : d.people;
      const next: Membership = { id: membership?.id ?? uid('m'), personId: pid, accountId: aid, title: title.trim(), primary };
      let memberships = membership ? d.memberships.map((m) => (m.id === next.id ? next : m)) : [...d.memberships, next];
      if (primary) memberships = memberships.map((m) => (m.accountId === aid && m.id !== next.id ? { ...m, primary: false } : m));
      return { ...d, people, memberships };
    });
    onClose();
  };

  const heading = membership ? `${personLabel} at ${accountLabel}` : fixedAccount ? `Add a person to ${accountLabel}` : `Add ${personLabel} to an account`;
  return (
    <Modal title={heading} onClose={onClose}>
      {!fixedPerson && (
        <div className="field">
          <span className="field-label">Person</span>
          <PartyPicker
            kinds={['person']}
            value={pid}
            onChange={setPid}
            exclude={[...existingInAccount]}
            placeholder="Choose someone, or type a new name"
            onCreatePerson={(n) => {
              const p = newPerson(n);
              setPendingPerson(p);
              setPid(p.id);
            }}
          />
          {pendingPerson && pendingPerson.id === pid && <span className="form-note small">{personName(pendingPerson)} will be added to People when you save.</span>}
        </div>
      )}
      {!fixedAccount && (
        <div className="field">
          <span className="field-label">Account</span>
          <PartyPicker kinds={['account']} value={aid} onChange={setAid} exclude={[...existingForPerson]} placeholder="Choose an account" />
        </div>
      )}
      {already && <p className="form-warn">They're already in this account.</p>}
      <Field label="Title / role in the account">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Owner, Project Manager, Spouse" />
      </Field>
      <label className="check">
        <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Main contact for this account
      </label>
      <Actions
        onClose={onClose}
        onSave={save}
        canSave={!!pid && !!aid && !already}
        deleteLabel="Remove from account"
        onDelete={membership ? () => { update((d) => ({ ...d, memberships: d.memberships.filter((m) => m.id !== membership.id) })); onClose(); } : undefined}
      />
    </Modal>
  );
}

/** Links a person or account to a job with a role. Opened from a job (choose who) or from a person/account (choose the job). */
export function JobLinkForm({ jobId, partyId, link, onClose }: { jobId?: string; partyId?: string; link?: JobLink; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [jid, setJid] = useState(link?.jobId ?? jobId ?? '');
  const [pid, setPid] = useState(link?.partyId ?? partyId ?? '');
  const [pendingPerson, setPendingPerson] = useState<Person | null>(null);
  const [role, setRole] = useState(link?.role ?? 'Customer');
  const fixedJob = !!(jobId || link);
  const fixedParty = !!(partyId || link);
  const dup = !!pid && !!jid && db.jobLinks.some((l) => l.id !== link?.id && l.jobId === jid && l.partyId === pid && l.role.toLowerCase() === role.trim().toLowerCase());
  const usedRoles = [...new Set([...JOB_ROLES, ...db.jobLinks.map((l) => l.role)])];

  const save = () => {
    if (!jid || !pid || !role.trim() || dup) return;
    update((d) => {
      const people = pendingPerson && pendingPerson.id === pid ? [...d.people, pendingPerson] : d.people;
      const next: JobLink = { id: link?.id ?? uid('l'), jobId: jid, partyId: pid, role: role.trim() };
      return { ...d, people, jobLinks: link ? d.jobLinks.map((l) => (l.id === next.id ? next : l)) : [...d.jobLinks, next] };
    });
    onClose();
  };

  const who = pendingPerson && pendingPerson.id === pid ? personName(pendingPerson) : L.party.get(pid)?.name;
  const heading = link ? `${who} on ${L.job.get(jid)?.name}` : fixedJob ? 'Add someone to this job' : `Add ${who} to a job`;
  return (
    <Modal title={heading} onClose={onClose}>
      {!fixedParty && (
        <div className="field">
          <span className="field-label">Person or account</span>
          <PartyPicker
            value={pid}
            onChange={setPid}
            placeholder="Choose, or type a new person's name"
            onCreatePerson={(n) => {
              const p = newPerson(n);
              setPendingPerson(p);
              setPid(p.id);
            }}
          />
          {pendingPerson && pendingPerson.id === pid && <span className="form-note small">{personName(pendingPerson)} will be added to People when you save.</span>}
        </div>
      )}
      {!fixedJob && (
        <Field label="Job">
          <select value={jid} onChange={(e) => setJid(e.target.value)}>
            <option value="">Choose a job</option>
            {[...db.jobs].sort((a, b) => a.name.localeCompare(b.name)).map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Role on the job">
        <RoleInput value={role} onChange={setRole} options={usedRoles} listId="job-roles" placeholder="e.g. Customer, Architect" />
      </Field>
      {dup && <p className="form-warn">They already have this role on the job.</p>}
      <Actions
        onClose={onClose}
        onSave={save}
        canSave={!!jid && !!pid && !!role.trim() && !dup}
        deleteLabel="Remove from job"
        onDelete={link ? () => { update((d) => ({ ...d, jobLinks: d.jobLinks.filter((l) => l.id !== link.id) })); onClose(); } : undefined}
      />
    </Modal>
  );
}
