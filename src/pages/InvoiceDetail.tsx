import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, BadgeDollarSign, Lock, Printer, RotateCcw, Send, Trash2, CircleCheck } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { NumCell, TextCell } from '../components/Cells';
import { Segmented, useRememberedChoice } from '../components/DocLayout';
import { History } from '../components/BudgetSigning';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useLookups, useStore, money } from '../store';
import type { Invoice, InvoiceStatus } from '../data';
import { budgetLabel, linesByBudget } from '../budgets';
import {
  INVOICE_ACTION, INVOICE_NEXT, INVOICE_STATUS_COLOR, billableBudgets, deleteInvoice, editInvoice, invoiceLabel, invoiceTotals,
  isInvoiceEditable, setInvoiceStatus, weightedPct, type InvoiceRow, type InvoiceSection,
} from '../invoices';
import { Pill } from './Budgets';

type View = 'edit' | 'split' | 'document';
const VIEWS: { id: View; label: string }[] = [
  { id: 'edit', label: 'Lines' },
  { id: 'split', label: 'Lines + document' },
  { id: 'document', label: 'Document' },
];
const ICON: Partial<Record<InvoiceStatus, typeof Send>> = { Sent: Send, Paid: BadgeDollarSign, Void: Ban };
const CONFIRM: Partial<Record<InvoiceStatus, string>> = {
  Sent: 'Sending locks this invoice so it matches what the customer received. Mark it as sent?',
  Void: 'Voiding cancels this invoice. Its amounts no longer count as billed, and later invoices will bill them again. Void it?',
};
const fmt = (n: number) => money(n, true);
const pctText = (n: number) => `${Math.round(n * 10) / 10}%`;

export default function InvoiceDetail() {
  const { id = '' } = useParams();
  const { db, update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const [view, setView] = useRememberedChoice<View>('buildtrack-invoice-view', ['edit', 'split', 'document'], 'split');
  useEffect(() => {
    const prev = document.title;
    const inv = db.invoices.find((x) => x.id === id);
    if (inv) document.title = `Invoice ${inv.number}${inv.title ? ` - ${inv.title}` : ''} - ${db.companyName}`;
    return () => { document.title = prev; };
  }, [db, id]);
  const byBudget = useMemo(() => linesByBudget(db), [db]);

  const invoice = db.invoices.find((x) => x.id === id);
  if (!invoice) {
    return (
      <div className="page scroll">
        <PageHeader title="Invoice not found" />
        <div className="detail"><p className="muted">This invoice doesn't exist. It may have been deleted. <Link to="/invoices" className="text-primary hover:underline">See all invoices</Link></p></div>
      </div>
    );
  }
  const job = L.job.get(invoice.jobId);
  const editable = isInvoiceEditable(invoice);
  const t = invoiceTotals(db, invoice, byBudget);
  const recipients = [...new Set((L.linksByJob.get(invoice.jobId) ?? []).map((l) => l.partyId))].map((pid) => L.party.get(pid)).filter((p) => !!p);
  // every approved budget can be added; budgets already on the invoice stay listed even if voided since
  const choices = [...billableBudgets(db, invoice.jobId), ...invoice.budgetIds.map((bid) => db.budgets.find((b) => b.id === bid)).filter((b) => !!b && b.status !== 'Approved')].filter((b) => !!b);

  const edit = (fn: (inv: Invoice) => Partial<Invoice>) => update((d) => editInvoice(d, id, fn));
  const setPct = (lineIds: string[], pct: number | undefined) =>
    edit((inv) => {
      const progress = { ...inv.progress };
      for (const lid of lineIds) {
        if (pct === undefined) delete progress[lid];
        else progress[lid] = pct;
      }
      return { progress };
    });
  const toggleBudget = (bid: string, on: boolean) =>
    edit((inv) => {
      const ids = on ? choices.map((b) => b.id).filter((x) => x === bid || inv.budgetIds.includes(x)) : inv.budgetIds.filter((x) => x !== bid);
      // drop percentages for lines of a budget taken off the invoice
      const dropped = new Set(on ? [] : (byBudget.get(bid) ?? []).map((l) => l.id));
      return { budgetIds: ids, progress: Object.fromEntries(Object.entries(inv.progress).filter(([k]) => !dropped.has(k))) };
    });
  const move = (to: InvoiceStatus) => {
    const q = CONFIRM[to];
    if (q && !window.confirm(q)) return;
    update((d) => setInvoiceStatus(d, id, to));
  };
  const del = () => {
    if (!window.confirm(`Delete ${invoiceLabel(invoice)}? This draft will be removed.`)) return;
    update((d) => deleteInvoice(d, id));
    nav(`/jobs?job=${invoice.jobId}&tab=invoices`);
  };

  return (
    <div className="page scroll job-page">
      <PageHeader
        crumb={job?.name ?? 'Invoice'}
        title={`${invoiceLabel(invoice)}${invoice.title ? ` · ${invoice.title}` : ''}`}
        actions={
          <>
            {INVOICE_NEXT[invoice.status].map((s) => {
              const Icon = ICON[s];
              return (
                <button key={s} type="button" className={'btn' + (s === 'Void' ? '' : ' primary')} onClick={() => move(s)}>
                  {Icon && <Icon size={14} />} {INVOICE_ACTION[s]}
                </button>
              );
            })}
            <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            {editable && <button type="button" className="btn" onClick={del}><Trash2 size={14} /> Delete</button>}
          </>
        }
      />
      <div className="j-bar">
        <Link to={`/jobs?job=${invoice.jobId}&tab=invoices`} className="back-link"><ArrowLeft size={14} /> {job?.name ?? 'Job'} invoices</Link>
        <Pill label={invoice.status} color={INVOICE_STATUS_COLOR[invoice.status]} />
        {!editable && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock size={12} /> Locked{invoice.status === 'Paid' ? ' — paid' : invoice.status === 'Sent' ? ' — sent to the customer' : ''}.
          </span>
        )}
      </div>

      <div className="detail">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Segmented label="Layout" options={VIEWS} value={view} onChange={setView} />
          {view !== 'edit' && (
            <label className="inline-flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Customer sees</span>
              <select className="b-input w-auto rounded-md border" value={invoice.detail} disabled={!editable} onChange={(e) => edit(() => ({ detail: e.target.value as Invoice['detail'] }))}>
                <option value="lines">Every line</option>
                <option value="groups">Group totals</option>
              </select>
            </label>
          )}
        </div>

        <div className={view === 'split' ? 'bt-split' : ''}>
          <div className={'b-wrap min-w-0' + (view === 'document' ? ' hidden' : '')}>
            <section className="card mb-4">
              <div className="card-body grid gap-3 sm:grid-cols-2">
                <Field label="Title">
                  {editable ? <TextCell value={invoice.title} label="Title" placeholder="e.g. Progress billing — December" onSave={(v) => edit(() => ({ title: v }))} /> : <div className="py-1.5">{invoice.title || <span className="muted">Untitled</span>}</div>}
                </Field>
                <Field label="Bill to">
                  {editable ? (
                    <select className="b-input" value={invoice.partyId} onChange={(e) => edit(() => ({ partyId: e.target.value }))}>
                      <option value="">—</option>
                      {recipients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : <div className="py-1.5">{L.party.get(invoice.partyId)?.name ?? '—'}</div>}
                </Field>
                <Field label="Invoice date">
                  {editable ? <input type="date" className="b-input" value={invoice.date} onChange={(e) => e.target.value && edit(() => ({ date: e.target.value }))} /> : <div className="py-1.5">{invoice.date}</div>}
                </Field>
                <Field label="Due">
                  {editable ? <input type="date" className="b-input" value={invoice.due} onChange={(e) => e.target.value && edit(() => ({ due: e.target.value }))} /> : <div className="py-1.5">{invoice.due}</div>}
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Notes on the invoice">
                    {editable ? <NotesBox value={invoice.notes} onSave={(v) => edit(() => ({ notes: v }))} /> : <div className="whitespace-pre-wrap py-1.5">{invoice.notes || <span className="muted">No notes</span>}</div>}
                  </Field>
                </div>
              </div>
            </section>

            {editable && (
              <section className="card mb-4">
                <div className="card-head"><h2>Billing against</h2></div>
                <div className="card-body">
                  {choices.length === 0 && <p className="text-sm text-muted-foreground">This job has no approved proposals or change orders yet. Approve one to bill against it.</p>}
                  {choices.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 py-0.5 text-sm">
                      <input type="checkbox" checked={invoice.budgetIds.includes(b.id)} onChange={(e) => toggleBudget(b.id, e.target.checked)} />
                      <span className="font-medium">{budgetLabel(b)}</span>
                      {b.title && <span className="text-muted-foreground">· {b.title}</span>}
                      {b.status !== 'Approved' && <span className="text-xs text-destructive">({b.status.toLowerCase()})</span>}
                    </label>
                  ))}
                </div>
              </section>
            )}

            <div className="b-summary">
              <div className="card stat"><span className="stat-label">Contract</span><b>{money(t.value)}</b><span className="muted small-text">{t.sections.length} budgets</span></div>
              <div className="card stat"><span className="stat-label">Previously billed</span><b>{money(t.previous)}</b></div>
              <div className="card stat"><span className="stat-label">This invoice</span><b>{fmt(t.amount)}</b></div>
              <div className="card stat"><span className="stat-label">Balance to finish</span><b>{money(t.remaining)}</b><span className="muted small-text">{pctText(t.value ? (t.toDate / t.value) * 100 : 0)} billed to date</span></div>
            </div>

            {t.sections.map((s) => <SectionTable key={s.budget.id} section={s} editable={editable} setPct={setPct} />)}
            {t.sections.length === 0 && <div className="card b-empty"><p>Nothing on this invoice yet. Tick an approved proposal or change order above.</p></div>}

            <History match={(a) => a.invoiceId === invoice.id} empty="No history recorded for this invoice yet." />
          </div>
          {view !== 'edit' && (
            <div className="bt-doc-col">
              <InvoiceDocument invoice={invoice} db={db} L={L} />
            </div>
          )}
        </div>
      </div>
      {createPortal(<div className="print-only"><InvoiceDocument invoice={invoice} db={db} L={L} /></div>, document.body)}
    </div>
  );
}

/** One budget's lines on the invoice: what was billed before and the percent complete to date. */
function SectionTable({ section: s, editable, setPct }: { section: InvoiceSection; editable: boolean; setPct: (ids: string[], pct: number | undefined) => void }) {
  const groups = [...new Set(s.rows.map((r) => r.line.group))];
  const ids = (rows: InvoiceRow[]) => rows.map((r) => r.line.id);
  return (
    <section className="card mb-4">
      <div className="card-head">
        <h2>
          <Link to={`/budgets/${s.budget.id}`} className="hover:underline">{budgetLabel(s.budget)}</Link>
          {s.budget.title && <span className="font-normal text-muted-foreground"> · {s.budget.title}</span>}
        </h2>
        <span className="ml-auto mr-2 text-sm">This invoice <b>{fmt(s.thisAmount)}</b></span>
        {editable && (
          <>
            <button type="button" className="btn btn-sm" title="Bill everything that's left" onClick={() => setPct(ids(s.rows), 100)}><CircleCheck size={14} /> Bill to 100%</button>
            <button type="button" className="icon-btn" title="Bill nothing new on this budget" aria-label={`Reset ${budgetLabel(s.budget)}`} onClick={() => setPct(ids(s.rows), undefined)}><RotateCcw size={14} /></button>
          </>
        )}
      </div>
      <div className="table-wrap">
        <table className="grid-table bt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Contract</th>
              <th className="num">Prev. %</th>
              <th className="num">Prev. billed</th>
              <th className="num">% complete to date</th>
              <th className="num">This invoice</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const rows = s.rows.filter((r) => r.line.group === g);
            const groupPct = weightedPct(rows, (r) => r.toDatePct);
            return (
              <tbody key={g}>
                <tr className="b-group">
                  <td className="bold">{g}</td>
                  <td className="num">{money(rows.reduce((x, r) => x + r.value, 0))}</td>
                  <td className="num">{pctText(weightedPct(rows, (r) => r.prevPct))}</td>
                  <td className="num">{money(rows.reduce((x, r) => x + r.prevAmount, 0))}</td>
                  <td className="num">
                    {editable ? <PctInput value={groupPct} label={`Percent complete for ${g}`} onSave={(n) => setPct(ids(rows), n)} /> : pctText(groupPct)}
                  </td>
                  <td className="num">{fmt(rows.reduce((x, r) => x + r.thisAmount, 0))}</td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.line.id}>
                    <td className="bt-wrap">{r.line.name}</td>
                    <td className="num">{money(r.value)}</td>
                    <td className="num">{pctText(r.prevPct)}</td>
                    <td className="num">{money(r.prevAmount)}</td>
                    <td className="num">{editable ? <PctInput value={r.toDatePct} label={`Percent complete for ${r.line.name}`} onSave={(n) => setPct([r.line.id], n)} /> : pctText(r.toDatePct)}</td>
                    <td className={'num bold' + (r.thisAmount < 0 ? ' text-destructive' : '')} title={r.thisAmount < 0 ? 'Below what was billed before: this credits the difference back' : undefined}>{fmt(r.thisAmount)}</td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}

const PctInput = ({ value, label, onSave }: { value: number; label: string; onSave: (n: number) => void }) => (
  <span className="inline-flex items-center gap-1"><NumCell value={value} label={label} width={64} onSave={(n) => onSave(Math.min(100, Math.max(0, n)))} />%</span>
);

function NotesBox({ value, onSave }: { value: string; onSave: (s: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      className="b-input min-h-16 w-full"
      aria-label="Notes on the invoice"
      placeholder="Payment terms or notes shown on the invoice"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
    />
  );
}
