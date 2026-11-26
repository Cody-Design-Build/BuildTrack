import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Maximize, RefreshCw, Plus, Settings, Filter, Sheet, Hammer, ArrowRight, FileText } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { ThreadCard } from '../components/Thread';
import { useLookups, useStore, money, sameDayLabel, timeLabel } from '../store';
import { QuickAdd } from '../components/QuickAdd';

function Widget({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'widget ' + className}>
      <div className="widget-head">
        <h2>{title}</h2>
        {right ?? <Sheet size={14} className="widget-icon" aria-hidden="true" />}
      </div>
      {children}
    </section>
  );
}

interface Row {
  key: string;
  a: string;
  b: string;
  c: string;
  to: string;
}

function TableWidget({ title, cols, rows, total, empty }: { title: string; cols: [string, string, string]; rows: Row[]; total?: string; empty: string }) {
  const nav = useNavigate();
  return (
    <Widget title={title}>
      <div className="wt-head wt-grid">
        <span>{cols[0]}</span>
        <span>{cols[1]}</span>
        <span className="num">{cols[2]}</span>
      </div>
      <div className="wt-body">
        {rows.length === 0 && <div className="wt-empty">{empty}</div>}
        {rows.map((r) => (
          <div key={r.key} className="wt-row wt-grid" role="link" tabIndex={0} onClick={() => nav(r.to)} onKeyDown={(e) => e.key === 'Enter' && nav(r.to)}>
            <span>{r.a}</span>
            <span>{r.b}</span>
            <span className="num">{r.c}</span>
          </div>
        ))}
      </div>
      <div className="wt-foot wt-grid">
        <span className="count-label">Count</span>
        <span className="count-num">{rows.length}</span>
        <span className="num total">{total}</span>
      </div>
    </Widget>
  );
}

export default function Home() {
  const { db } = useStore();
  const L = useLookups();
  const [filter, setFilter] = useState<'all' | 'customer' | 'vendor'>('all');
  const [showFilter, setShowFilter] = useState(false);
  const [adding, setAdding] = useState(false);

  const acctName = (id: string) => L.account.get(id)?.name ?? '';
  const jobName = (id: string) => L.job.get(id)?.name ?? '';

  // Activity: conversation threads grouped by topic, newest first
  const msgs = [...db.messages]
    .filter((m) => {
      if (filter === 'all') return true;
      const sender = m.fromContactId ? L.contact.get(m.fromContactId) : undefined;
      const type = sender ? L.account.get(sender.accountId)?.type : undefined;
      return type === filter;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const threads: { key: string; ids: string[]; last: string }[] = [];
  for (const m of msgs) {
    const key = m.jobId + '|' + m.topic;
    const t = threads.find((x) => x.key === key);
    if (t) t.ids.push(m.id);
    else threads.push({ key, ids: [m.id], last: m.date });
  }
  const events = db.activity.filter((a) => filter === 'all' || L.account.get(a.accountId)?.type === filter);
  const feed = [
    ...threads.map((t) => ({ kind: 'thread' as const, key: t.key, date: t.last, thread: t })),
    ...events.map((a) => ({ kind: 'event' as const, key: a.id, date: a.date, event: a })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const activeCustomerJobs = db.jobs.filter((j) => ['Pre-Construction', 'In Progress', 'Punch List'].includes(j.status) && j.total > 0);
  const openInvoices = db.docs.filter((d) => d.kind === 'Invoice' && d.status === 'Open');
  const leads = db.jobs.filter((j) => ['Lead', 'Estimating', 'Negotiating'].includes(j.status));
  const custOrders = db.docs.filter((d) => (d.kind === 'Proposal' || d.kind === 'Change Order') && d.status === 'Pending');
  const vendorOrders = db.docs.filter((d) => (d.kind === 'Subcontractor Agreement' || d.kind === 'Purchase Order') && d.status === 'Pending');
  const draftBills = db.docs.filter((d) => d.kind === 'Bill' && d.status === 'Draft');
  const sum = (xs: number[]) => money(xs.reduce((a, b) => a + b, 0));
  const myTodos = db.todos.filter((t) => !t.done && t.assignees.includes(db.team[0]?.id));

  let lastDay = '';
  return (
    <div className="home">
      <PageHeader
        home
        crumb="Home"
        title={`${db.companyName} - Lic# 1118207`}
        actions={
          <>
            <button type="button" className="btn icon-only" aria-label="Full screen" title="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
              <Maximize size={14} />
            </button>
            <button type="button" className="btn icon-only" aria-label="Refresh" title="Refresh" onClick={() => location.reload()}>
              <RefreshCw size={14} />
            </button>
            <button type="button" className="btn icon-only" aria-label="Add" title="Add" onClick={() => setAdding(true)}>
              <Plus size={14} />
            </button>
            <Link to="/settings" className="btn icon-only" aria-label="Settings" title="Settings">
              <Settings size={14} />
            </Link>
          </>
        }
      />
      <div className="dash">
        <Widget
          title="Activity"
          className="w-activity"
          right={
            <div className="filter-wrap">
              <button type="button" className="btn btn-sm" onClick={() => setShowFilter((s) => !s)}>
                <Filter size={14} /> Filters
              </button>
              {showFilter && (
                <div className="dropdown">
                  {(['all', 'customer', 'vendor'] as const).map((f) => (
                    <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => { setFilter(f); setShowFilter(false); }}>
                      {f === 'all' ? 'All activity' : f === 'customer' ? 'From customers' : 'From vendors'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        >
          <div className="activity-body">
            {feed.length === 0 && <div className="wt-empty">No activity yet</div>}
            {feed.map((f) => {
              const day = sameDayLabel(f.date);
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <div key={f.key}>
                  {showDay && (
                    <div className="day-sep">
                      <span>{day}</span>
                    </div>
                  )}
                  {f.kind === 'thread' ? (
                    <ThreadCard ids={f.thread.ids.slice().reverse()} time={timeLabel(f.date)} compact />
                  ) : (
                    <Link to={f.event.jobId ? `/jobs?job=${f.event.jobId}&tab=documents` : '/documents'} className="event">
                      <FileText size={20} className="ev-icon" style={{ color: f.event.color }} />
                      <span className="ev-main">
                        <span className="ev-top">
                          <b>{f.event.title}</b>
                          <span className="t-time">{timeLabel(f.date)}</span>
                        </span>
                        <span className="ev-doc">
                          {f.event.doc}
                          {f.event.amount ? <b> {money(f.event.amount, true)}</b> : null}
                        </span>
                        <span className="ev-text">{f.event.text}</span>
                      </span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </Widget>

        <Widget title="Action Items" className="w-actions">
          <div className="wt-body">
            {myTodos.length === 0 && <div className="wt-empty">Nothing to do — nice!</div>}
            {myTodos.map((t) => (
              <div className="action-item" key={t.id}>
                <Hammer size={28} strokeWidth={1.5} className="ai-icon" />
                <div className="ai-text">
                  <div className="ai-title">{t.name}</div>
                  <div className="ai-sub">
                    {t.jobId ? `To-Do on ${jobName(t.jobId)}` : t.accountId ? `To-Do on ${acctName(t.accountId)}` : 'Task'}
                  </div>
                </div>
                <Link to={`/to-dos?id=${t.id}`} className="ai-view">
                  View <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </Widget>

        <TableWidget
          title="Active Customer Jobs"
          cols={['Customer', 'Job', 'Total']}
          rows={activeCustomerJobs.map((j) => ({ key: j.id, a: acctName(j.accountId), b: j.name, c: money(j.total), to: `/jobs?job=${j.id}` }))}
          total={sum(activeCustomerJobs.map((j) => j.total))}
          empty="There are no Jobs that match these filters"
        />
        <TableWidget
          title="Open Customer Invoices"
          cols={['Customer', 'Document', 'Balance']}
          rows={openInvoices.map((d) => ({ key: d.id, a: acctName(d.accountId), b: `${d.kind} ${d.number}`, c: money(d.amount), to: `/customers?id=${d.accountId}` }))}
          total={sum(openInvoices.map((d) => d.amount))}
          empty="There are no Documents that match these filters"
        />
        <TableWidget
          title="Leads & Estimates"
          cols={['Customer', 'Job', 'Projected Cost']}
          rows={leads.map((j) => ({ key: j.id, a: acctName(j.accountId), b: j.name, c: j.projectedCost ? money(j.projectedCost) : '', to: `/jobs?job=${j.id}` }))}
          empty="There are no Jobs that match these filters"
        />
        <TableWidget
          title="Pending Customer Orders"
          cols={['Customer', 'Document', 'Total']}
          rows={custOrders.map((d) => ({ key: d.id, a: acctName(d.accountId), b: `${d.kind} ${d.number}`, c: money(d.amount), to: `/customers?id=${d.accountId}` }))}
          total={sum(custOrders.map((d) => d.amount))}
          empty="There are no Documents that match these filters"
        />
        <TableWidget
          title="Pending Vendor Orders"
          cols={['Vendor', 'Document', 'Cost']}
          rows={vendorOrders.map((d) => ({ key: d.id, a: acctName(d.accountId), b: `${d.kind} ${d.number}`, c: money(d.amount), to: `/vendors?id=${d.accountId}` }))}
          total={sum(vendorOrders.map((d) => d.amount))}
          empty="There are no Documents that match these filters"
        />
        <TableWidget
          title="Draft Vendor Bills"
          cols={['Vendor', 'Document', 'Cost']}
          rows={draftBills.map((d) => ({ key: d.id, a: acctName(d.accountId), b: `${d.kind} ${d.number}`, c: money(d.amount), to: `/vendors?id=${d.accountId}` }))}
          empty="There are no Documents that match these filters"
        />
      </div>
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </div>
  );
}
