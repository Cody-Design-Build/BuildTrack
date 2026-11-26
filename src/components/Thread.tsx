import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Users, Wrench, FileText, Globe, Ellipsis, Mail } from 'lucide-react';
import { Avatar } from './Layout';
import { useLookups, useStore, contactName, initials, colorFor, sameDayLabel, timeLabel, uid } from '../store';
import type { Message } from '../data';

export function useSender() {
  const L = useLookups();
  return (m: Message) => {
    if (m.fromTeamId) {
      const t = L.team.get(m.fromTeamId);
      return { name: t?.name ?? 'Team', short: t?.initials ?? '?', color: t?.color ?? '#ea580c', accountName: 'Our team', accountType: 'team' as const, accountId: '' };
    }
    const c = L.contact.get(m.fromContactId ?? '');
    const a = c ? L.account.get(c.accountId) : undefined;
    const name = contactName(c) || 'Unknown';
    // vendors show their company badge, like the original
    const isVendor = a?.type === 'vendor';
    return {
      name: isVendor ? a!.name : name,
      person: name,
      short: isVendor ? initials(a!.name).slice(0, 2) + '&' : initials(name),
      color: isVendor ? a!.color : c?.color ?? colorFor(name),
      accountName: a?.name ?? '',
      accountType: a?.type ?? 'customer',
      accountId: a?.id ?? '',
    };
  };
}

/** One conversation (a topic on a job) with its messages and a reply box. */
export function ThreadCard({ ids, time, compact }: { ids: string[]; time?: string; compact?: boolean }) {
  const { db, update } = useStore();
  const L = useLookups();
  const sender = useSender();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const msgs = ids.map((id) => db.messages.find((m) => m.id === id)).filter(Boolean) as Message[];
  if (msgs.length === 0) return null;
  const first = msgs[0];
  const account = L.account.get(first.accountId);
  const job = L.job.get(first.jobId);
  const other = msgs.map(sender).find((s) => s.accountType !== 'team') ?? sender(first);

  const send = () => {
    if (!text.trim()) return;
    const msg: Message = {
      id: uid('m'),
      fromTeamId: db.team[0]?.id,
      toContactIds: first.fromContactId ? [first.fromContactId] : [],
      accountId: first.accountId,
      jobId: first.jobId,
      topic: first.topic,
      body: text.trim(),
      date: new Date().toISOString().slice(0, 19),
      read: true,
    };
    update((d) => ({ ...d, messages: [...d.messages, msg] }));
    setText('');
    setReplying(false);
  };

  const links = (
    <>
      {account && (
        <Link className="t-link" to={`/${account.type === 'vendor' ? 'vendors' : 'customers'}?id=${account.id}`}>
          <Users size={14} className="t-ico" /> {account.name}
        </Link>
      )}
      {job && (
        <Link className="t-link" to={`/jobs?job=${job.id}`}>
          <Wrench size={14} className="t-ico" /> {job.name}
        </Link>
      )}
      <span className="t-link">
        <FileText size={14} className="t-ico" /> {first.topic}
      </span>
    </>
  );

  return (
    <div className={'thread' + (compact ? ' compact' : '')}>
      {compact ? (
        <div className="t-head">
          <span className="t-kind">
            <MessageCircle size={20} />
          </span>
          <div className="t-links">{links}</div>
          {time && <span className="t-time">{time}</span>}
        </div>
      ) : (
        <div className="t-head inline">{links}</div>
      )}
      <div className="t-card">
        <div className="t-bar">
          <span className="t-viewers">
            <Globe size={14} /> <span className="ellipsis">All Document Viewers</span>
          </span>
          <span className="t-chip">
            <Avatar text={other.short} color={other.color} size={24} />
            <span className="ellipsis">{other.name}</span>
          </span>
          <button type="button" className="t-more" aria-label="More">
            <Ellipsis size={14} />
          </button>
        </div>
        {msgs.map((m) => {
          const s = sender(m);
          return (
            <div className="t-msg" key={m.id}>
              <Avatar text={s.short} color={s.color} size={24} />
              <div className="t-msg-main">
                <div className="t-msg-head">
                  <span className="t-from">{s.name}</span>
                  <span className="t-date">
                    <Mail size={12} /> {sameDayLabel(m.date)}, {timeLabel(m.date)}
                  </span>
                </div>
                <div className="t-body">{m.body}</div>
              </div>
            </div>
          );
        })}
        {replying && (
          <div className="t-reply-box">
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" rows={3} />
            <div className="row-end">
              <button type="button" className="btn" onClick={() => setReplying(false)}>Cancel</button>
              <button type="button" className="btn primary" onClick={send}>Send</button>
            </div>
          </div>
        )}
      </div>
      {!replying && (
        <div className="t-reply">
          <button type="button" className="link-btn" onClick={() => setReplying(true)}>
            <MessageCircle size={14} /> Reply
          </button>
        </div>
      )}
    </div>
  );
}
