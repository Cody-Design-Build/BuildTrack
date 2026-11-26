import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Phone, Mail, MapPin, Pencil, Star, UserPlus, ArrowLeft, Info } from 'lucide-react';
import { PageHeader, Avatar } from '../components/Layout';
import { AccountForm, ContactForm, JobForm, TodoForm } from '../components/Forms';
import { useStore, contactName, initials, colorFor, money, sameDayLabel } from '../store';
import { JOB_STATUSES, type Account, type AccountType, type Contact } from '../data';

function AccountDetail({ account }: { account: Account }) {
  const { db } = useStore();
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<Contact | 'new' | null>(null);
  const [newJob, setNewJob] = useState(false);
  const [newTodo, setNewTodo] = useState(false);
  const base = account.type === 'customer' ? '/customers' : '/vendors';
  const contacts = db.contacts.filter((c) => c.accountId === account.id).sort((a, b) => Number(b.primary) - Number(a.primary));
  const jobs = account.type === 'customer' ? db.jobs.filter((j) => j.accountId === account.id) : db.jobs.filter((j) => db.docs.some((d) => d.accountId === account.id && d.jobId === j.id));
  const docs = db.docs.filter((d) => d.accountId === account.id);
  const todos = db.todos.filter((t) => t.accountId === account.id && !t.done);
  const contactIds = new Set(contacts.map((c) => c.id));
  const msgs = db.messages
    .filter((m) => (m.fromContactId && contactIds.has(m.fromContactId)) || m.toContactIds.some((id) => contactIds.has(id)) || (account.type === 'customer' && m.accountId === account.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div className="page scroll">
      <PageHeader
        crumb={account.type === 'customer' ? 'Customers' : 'Vendors'}
        title={account.name}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setContact('new')}><UserPlus size={14} /> Contact</button>
            {account.type === 'customer' && <button type="button" className="btn" onClick={() => setNewJob(true)}><Plus size={14} /> Job</button>}
            <button type="button" className="btn" onClick={() => setNewTodo(true)}><Plus size={14} /> To-Do</button>
            <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
          </>
        }
      />
      <div className="detail">
        <Link to={base} className="back-link"><ArrowLeft size={14} /> All {account.type === 'customer' ? 'customers' : 'vendors'}</Link>
        <div className="detail-grid">
          <section className="card">
            <div className="card-head"><h2>{account.type === 'customer' ? 'Customer Account' : 'Vendor Account'}</h2></div>
            <div className="card-body info-list">
              {account.trade && <div><span className="muted">Trade</span> {account.trade}</div>}
              <div><Phone size={14} /> {account.phone || <span className="muted">No phone</span>}</div>
              <div><Mail size={14} /> {account.email || <span className="muted">No email</span>}</div>
              <div><MapPin size={14} /> {account.address || <span className="muted">No address</span>}</div>
              {account.notes && <p className="notes">{account.notes}</p>}
            </div>
          </section>

          <section className="card contacts-card">
            <div className="card-head">
              <h2>Contacts ({contacts.length})</h2>
              <button type="button" className="btn btn-sm" onClick={() => setContact('new')}><Plus size={14} /> Add contact</button>
            </div>
            <div className="card-body">
              <p className="hint"><Info size={14} /> Contacts belong only to this account. The same person in another account is a separate contact.</p>
              {contacts.length === 0 && <div className="wt-empty">No contacts yet</div>}
              {contacts.map((c) => (
                <div key={c.id} className="contact-row">
                  <Avatar text={initials(contactName(c))} color={colorFor(contactName(c))} size={32} />
                  <div className="cr-main">
                    <div className="cr-name">
                      {contactName(c)} {c.primary && <span className="tag"><Star size={10} /> Primary</span>}
                    </div>
                    <div className="cr-sub">{[c.title, c.email, c.phone].filter(Boolean).join(' · ') || 'No details yet'}</div>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => setContact(c)}><Pencil size={12} /> Edit</button>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Jobs ({jobs.length})</h2></div>
            <div className="card-body">
              {jobs.length === 0 && <div className="wt-empty">No jobs</div>}
              {jobs.map((j) => (
                <Link key={j.id} to={`/jobs?job=${j.id}`} className="list-row">
                  <span className="status-dot" style={{ background: JOB_STATUSES.find((s) => s.name === j.status)?.color }} />
                  <span className="grow">{j.name}</span>
                  <span className="muted">{j.status}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Documents ({docs.length})</h2></div>
            <div className="card-body">
              {docs.length === 0 && <div className="wt-empty">No documents</div>}
              {docs.map((d) => (
                <div key={d.id} className="list-row">
                  <span className="grow">{d.kind} {d.number}</span>
                  <span className="muted">{d.status}</span>
                  <span className="num">{d.amount ? money(d.amount) : ''}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Open To-Dos ({todos.length})</h2></div>
            <div className="card-body">
              {todos.length === 0 && <div className="wt-empty">Nothing open</div>}
              {todos.map((t) => (
                <Link key={t.id} to={`/to-dos?id=${t.id}`} className="list-row"><span className="grow">{t.name}</span><span className="muted">{t.due}</span></Link>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Recent Messages</h2></div>
            <div className="card-body">
              {msgs.length === 0 && <div className="wt-empty">No messages</div>}
              {msgs.map((m) => (
                <Link key={m.id} to="/messages" className="list-row">
                  <span className="grow ellipsis">{m.topic}: {m.body}</span>
                  <span className="muted">{sameDayLabel(m.date)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
      {editing && <AccountForm type={account.type} account={account} onClose={() => setEditing(false)} />}
      {contact && <ContactForm account={account} contact={contact === 'new' ? undefined : contact} onClose={() => setContact(null)} />}
      {newJob && <JobForm onClose={() => setNewJob(false)} />}
      {newTodo && <TodoForm presetAccountId={account.id} onClose={() => setNewTodo(false)} />}
    </div>
  );
}

export default function Accounts({ type }: { type: AccountType }) {
  const { db } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const id = params.get('id');
  useEffect(() => {
    if (params.get('new')) {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const account = id ? db.accounts.find((a) => a.id === id && a.type === type) : undefined;
  if (account) return <AccountDetail account={account} />;

  const label = type === 'customer' ? 'Customers' : 'Vendors';
  const needle = q.trim().toLowerCase();
  const accounts = db.accounts
    .filter((a) => a.type === type)
    .filter((a) => {
      if (!needle) return true;
      const people = db.contacts.filter((c) => c.accountId === a.id).map(contactName).join(' ');
      return [a.name, a.email, a.phone, a.trade, people].join(' ').toLowerCase().includes(needle);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page fill">
      <PageHeader
        title={label}
        actions={
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            <Plus size={14} /> {type === 'customer' ? 'Customer' : 'Vendor'}
          </button>
        }
      />
      <div className="toolbar">
        <label className="search-box">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()} and their contacts`} />
        </label>
      </div>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Account</th>
              {type === 'vendor' && <th>Trade</th>}
              <th>Primary contact</th>
              <th>Contacts</th>
              <th>Phone</th>
              <th>Email</th>
              <th>{type === 'customer' ? 'Jobs' : 'Orders'}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const cs = db.contacts.filter((c) => c.accountId === a.id);
              const primary = cs.find((c) => c.primary) ?? cs[0];
              const count = type === 'customer' ? db.jobs.filter((j) => j.accountId === a.id).length : db.docs.filter((d) => d.accountId === a.id).length;
              return (
                <tr key={a.id} className="clickable" onClick={() => setParams({ id: a.id })}>
                  <td>
                    <span className="acct-cell">
                      <Avatar text={initials(a.name)} color={a.color} size={24} />
                      <Link to={`?id=${a.id}`} className="cyan" onClick={(e) => e.stopPropagation()}>{a.name}</Link>
                    </span>
                  </td>
                  {type === 'vendor' && <td>{a.trade}</td>}
                  <td>{contactName(primary) || <span className="muted">—</span>}</td>
                  <td>{cs.length}</td>
                  <td>{a.phone}</td>
                  <td className="ellipsis">{a.email}</td>
                  <td>{count}</td>
                </tr>
              );
            })}
            <tr className="filler"><td colSpan={7} /></tr>
          </tbody>
        </table>
        {accounts.length === 0 && <div className="wt-empty">No {label.toLowerCase()} found</div>}
      </div>
      {creating && <AccountForm type={type} onClose={() => setCreating(false)} onSaved={(nid) => setParams({ id: nid })} />}
    </div>
  );
}
