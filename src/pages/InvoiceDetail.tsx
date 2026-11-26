import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Printer, RotateCcw, Trash2, CircleCheck } from 'lucide-react';
import { StatusMenu } from '../components/StatusMenu';
import { PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { NumCell, TextCell } from '../components/Cells';
import { Segmented, useRememberedChoice } from '../components/DocLayout';
import { History } from '../components/BudgetSigning';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useLookups, useStore, money } from '../store';
import { INVOICE_STATUSES, type Invoice, type InvoiceStatus } from '../data';
import { budgetLabel, linesByBudget } from '../budgets';
import {
  INVOICE_NEXT, INVOICE_STATUS_COLOR, billableBudgets, deleteInvoice, editInvoice, invoiceLabel, invoiceTotals,
  isInvoiceEditable, setInvoiceStatus, weightedPct, type InvoiceRow, type InvoiceSection,
} from '../invoices';

type View = 'lines' | 'document' | 'details';
const VIEWS: { id: View; label: string }[] = [
  { id: 'lines', label: 'Lines' },
  { id: 'document', label: 'Document' },
  { id: 'details', label: 'Details' },
];
const STATUS_HINT: Record<InvoiceStatus, string> = {
  Draft: 'Marking it sent locks it and freezes what was billed before it.',
  Sent: "A sent invoice can't go back to draft. Void it and start a new one to change it.",
  Paid: 'Paid is final.',
  Void: 'Void is final. Its amounts can be billed again on a new invoice.',
};
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
  const [view, setView] = useRememberedChoice<View>('buildtrack-invoice-view', ['lines', 'document', 'details'], 'lines', (v) => v !== 'details');
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
            <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            {editable && <button type="button" className="btn" onClick={del}><Trash2 size={14} /> Delete</button>}
          </>
        }
      />
      <div className="j-bar flex-wrap">
        <Link to={`/jobs?job=${invoice.jobId}&tab=invoices`} className="back-link"><ArrowLeft size={14} /> {job?.name ?? 'Job'} invoices</Link>
        <StatusMenu value={invoice.status} statuses={INVOICE_STATUSES} allowed={INVOICE_NEXT[invoice.status]} colors={INVOICE_STATUS_COLOR} onSelect={move} hint={STATUS_HINT[invoice.status]} />
        {!editable && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock size={12} /> Locked{invoice.status === 'Paid' ? ' · paid' : invoice.status === 'Sent' ? ' · sent to the customer' : ''}</span>
        )}
        <span className="grow" />
        <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
      </div>

      <div className="detail">
        {view === 'lines' && (
          <div className="b-wrap">
            <div className="toolbar b-toolbar flex-wrap">
              <span className="text-sm text-muted-foreground">
                Contract <b className="text-foreground tabular-nums">{money(t.value)}</b>
                <span className="mx-2">·</span>Previously billed <b className="text-foreground tabular-nums">{money(t.previous)}</b>
                <span className="mx-2">·</span>Balance to finish <b className="text-foreground tabular-nums">{money(t.remaining)}</b>
              </span>
              <span className="grow" />
              <span className="text-sm">This invoice <b className="text-base tabular-nums">{fmt(t.amount)}</b></span>
            </div>
            {t.sections.map((s) => <SectionTable key={s.budget.id} section={s} editable={editable} setPct={setPct} />)}
            {t.sections.length === 0 && (
              <div className="card b-empty">
                <p>Nothing on this invoice yet. Choose which approved proposals and change orders it bills on the Details tab.</p>
                <button type="button" className="btn primary" onClick={() => setView('details')}>Open details</button>
              </div>
            )}

          </div>
        )}

        {view === 'document' && (
          <>
            <label className="mb-3 inline-flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Customer sees</span>
              <select className="b-input w-auto rounded-md border" value={invoice.detail} disabled={!editable} onChange={(e) => edit(() => ({ detail: e.target.value as Invoice['detail'] }))}>
                <option value="lines">Every line</option>
                <option value="groups">Group totals</option>
              </select>
            </label>
            <div className="bt-doc-col">
              <InvoiceDocument invoice={invoice} db={db} L={L} />
            </div>
          </>
        )}

        {view === 'details' && (
          <div className="b-wrap max-w-4xl">
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

            <History match={(a) => a.invoiceId === invoice.id} empty="No history recorded for this invoice yet." />
          </div>
        )}
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
