import { useState } from 'react';
import { Plus, Inbox, MessageSquareDot, Send, Globe, MessagesSquare, Search, ArrowLeft } from 'lucide-react';
import { PageHeader, Modal, Avatar } from '../components/Layout';
import { Field } from '../components/Forms';
import { ThreadCard, useSender } from '../components/Thread';
import { useLookups, useStore, uid, contactName, sameDayLabel } from '../store';
import type { Message } from '../data';

function NewMessage({ onClose }: { onClose: () => void }) {
  const { db, update } = useStore();
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? '');
  const [contactId, setContactId] = useState('');
  const [jobId, setJobId] = useState('');
  const [topic, setTopic] = useState('');
  const [body, setBody] = useState('');
  const contacts = db.contacts.filter((c) => c.accountId === accountId);
  const account = db.accounts.find((a) => a.id === accountId);
  const jobs = account?.type === 'customer' ? db.jobs.filter((j) => j.accountId === accountId) : db.jobs;
  const send = () => {
    if (!body.trim()) return;
    const m: Message = {
      id: uid('m'),
      fromTeamId: db.team[0]?.id,
      toContactIds: contactId ? [contactId] : [],
      // a vendor conversation is filed under the job's customer, like the original
      accountId: account?.type === 'vendor' && jobId ? db.jobs.find((j) => j.id === jobId)?.accountId ?? accountId : accountId,
      jobId,
      topic: topic.trim() || 'General',
      body: body.trim(),
      date: new Date().toISOString().slice(0, 19),
      read: true,
    };
    update((d) => ({ ...d, messages: [...d.messages, m] }));
    onClose();
  };
  return (
    <Modal title="New Message" onClose={onClose}>
      <div className="field-row">
        <Field label="Account">
          <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setContactId(''); setJobId(''); }}>
            <optgroup label="Customers">{db.accounts.filter((a) => a.type === 'customer').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
            <optgroup label="Vendors">{db.accounts.filter((a) => a.type === 'vendor').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>
          </select>
        </Field>
        <Field label="To (contact in this account)">
          <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">All contacts</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label="Job">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">None</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </Field>
        <Field label="Subject">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
      </div>
      <Field label="Message">
        <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
      </Field>
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={send} disabled={!body.trim()}>Send</button>
      </div>
    </Modal>
  );
}

export default function Messages() {
  const { db, update } = useStore();
  const L = useLookups();
  const sender = useSender();
  const [box, setBox] = useState<'inbox' | 'unread' | 'sent'>('inbox');
  const [scope, setScope] = useState<'all' | 'direct'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [composing, setComposing] = useState(false);
  const me = db.team[0]?.id;

  const needle = q.trim().toLowerCase();
  const list = [...db.messages]
    .filter((m) => {
      if (box === 'inbox' && m.fromTeamId === me) return false;
      if (box === 'unread' && (m.read || m.fromTeamId === me)) return false;
      if (box === 'sent' && m.fromTeamId !== me) return false;
      if (scope === 'direct' && m.toContactIds.length === 0 && !m.fromTeamId) return false;
      if (!needle) return true;
      return [m.body, m.topic, sender(m).name, L.account.get(m.accountId)?.name, L.job.get(m.jobId)?.name].join(' ').toLowerCase().includes(needle);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // the right side: either the selected thread or all threads
  const threadKeys: string[] = [];
  const threads: Record<string, string[]> = {};
  for (const m of [...db.messages].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = m.jobId + '|' + m.topic;
    if (!threads[k]) {
      threads[k] = [];
      threadKeys.push(k);
    }
    threads[k].push(m.id);
  }
  const shown = selected ? threadKeys.filter((k) => k === selected) : threadKeys;

  const open = (m: Message) => {
    setSelected(m.jobId + '|' + m.topic);
    if (!m.read) update((d) => ({ ...d, messages: d.messages.map((x) => (x.id === m.id ? { ...x, read: true } : x)) }));
  };

  return (
    <div className="page fill">
      <PageHeader
        title="Messages"
        actions={
          <button type="button" className="btn" onClick={() => setComposing(true)}>
            <Plus size={14} /> Message
          </button>
        }
      />
      <div className="toolbar msg-toolbar">
        <div className="btn-group">
          <button type="button" className={'btn' + (box === 'inbox' ? ' pressed' : '')} onClick={() => setBox('inbox')} title="Inbox"><Inbox size={14} /><span className="lbl">Inbox</span></button>
          <button type="button" className={'btn' + (box === 'unread' ? ' pressed' : '')} onClick={() => setBox('unread')} title="Unread"><MessageSquareDot size={14} /><span className="lbl">Unread</span></button>
          <button type="button" className={'btn' + (box === 'sent' ? ' pressed' : '')} onClick={() => setBox('sent')} title="Sent"><Send size={14} /><span className="lbl">Sent</span></button>
        </div>
        <div className="btn-group">
          <button type="button" className={'btn' + (scope === 'all' ? ' pressed' : '')} onClick={() => setScope('all')} title="All"><Globe size={14} /><span className="lbl">All</span></button>
          <button type="button" className={'btn' + (scope === 'direct' ? ' pressed' : '')} onClick={() => setScope('direct')} title="Direct"><MessagesSquare size={14} /><span className="lbl">Direct</span></button>
        </div>
        <label className="search-box">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        </label>
      </div>
      <div className={'msg-layout' + (selected ? ' has-selection' : '')}>
        <div className="msg-list">
          {list.length === 0 && <div className="wt-empty">No messages</div>}
          {list.map((m) => {
            const s = sender(m);
            const acct = L.account.get(m.accountId);
            const job = L.job.get(m.jobId);
            return (
              <button type="button" key={m.id} className={'msg-item' + (m.read ? '' : ' unread') + (selected === m.jobId + '|' + m.topic ? ' selected' : '')} onClick={() => open(m)}>
                <Avatar text={s.short} color={s.color} size={32} />
                <span className="mi-main">
                  <span className="mi-top">
                    <span className="mi-name">{s.name}</span>
                    <span className="mi-date">{sameDayLabel(m.date)}</span>
                  </span>
                  <span className="mi-subject">
                    {[acct?.name, job?.name, m.topic].filter(Boolean).join(': ')}
                  </span>
                  <span className="mi-preview">{m.body}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="msg-pane">
          <div className="mp-head">
            {selected ? (
              <button type="button" className="link-btn dark" onClick={() => setSelected('')}>
                <ArrowLeft size={14} /> All Messages
              </button>
            ) : (
              'All Messages'
            )}
          </div>
          {shown.map((k) => (
            <ThreadCard key={k} ids={threads[k].slice().reverse()} />
          ))}
        </div>
      </div>
      {composing && <NewMessage onClose={() => setComposing(false)} />}
    </div>
  );
}
