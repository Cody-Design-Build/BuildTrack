import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Lock, Plus, Printer, Trash2 } from 'lucide-react';
import { StatusMenu } from '../components/StatusMenu';
import { PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { NumCell, TextCell } from '../components/Cells';
import { Segmented, useRememberedChoice } from '../components/DocLayout';
import { History } from '../components/BudgetSigning';
import { BillDocument } from '../components/BillDocument';
import { Attachments } from '../components/Attachments';
import { PaymentForm, PaymentsTable, fmtDate } from '../components/Payments';
import { useLookups, useStore, money } from '../store';
import { BILL_STATUSES, type Bill, type BillLine, type BillStatus } from '../data';
import {
  BILL_NEXT, BILL_STAGE_COLOR, BILL_STATUS_COLOR, billLabel, billMoney, billPayments, billStage, canMoveBill, deleteBill, editBill,
  isBillEditable, newBillLine, setBillStatus, tradeCostCode,
} from '../bills';
import { tone } from '../colors';
import { isVendor } from './Bills';

type View = 'bill' | 'document';
const VIEWS: { id: View; label: string }[] = [
  { id: 'bill', label: 'Bill' },
  { id: 'document', label: 'Document' },
];
const STATUS_HINT: Record<BillStatus, string> = {
  Draft: 'Check it against the vendor’s invoice, then approve it to pay. Approving locks the amounts.',
  Open: 'Approved to pay. It becomes Paid when payments cover it. Move it back to draft to correct it.',
  Paid: 'Paid in full. Remove a payment to reopen it.',
  Void: 'Void is final. It no longer counts as owed.',
};
const CONFIRM: Partial<Record<BillStatus, string>> = {
  Open: 'Approve this bill to pay? Its amounts lock and it counts as owed.',
  Void: 'Void this bill? It will no longer count as owed.',
};
const fmt = (n: number) => money(n, true);

export default function BillDetail() {
  const { id = '' } = useParams();
  const { db, update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const [paying, setPaying] = useState(false);
  const [view, setView] = useRememberedChoice<View>('buildtrack-bill-view', ['bill', 'document'], 'bill');
  useEffect(() => {
    const prev = document.title;
    const b = db.bills.find((x) => x.id === id);
    if (b) document.title = `Bill ${b.number}${b.title ? ` - ${b.title}` : ''} - ${db.companyName}`;
    return () => { document.title = prev; };
  }, [db, id]);

  const bill = db.bills.find((x) => x.id === id);
  if (!bill) {
    return (
      <div className="page scroll">
        <PageHeader title="Bill not found" />
        <div className="detail"><p className="muted">This bill doesn't exist. It may have been deleted. <Link to="/bills" className="text-primary hover:underline">See all bills</Link></p></div>
      </div>
    );
  }
  const job = L.job.get(bill.jobId);
  const vendor = L.party.get(bill.vendorId);
  const editable = isBillEditable(bill);
  const m = billMoney(db, bill);
  const payments = billPayments(db, bill.id);
  const stage = billStage(db, bill);
  const approved = bill.status === 'Open' || bill.status === 'Paid';
  const allowed = BILL_NEXT[bill.status].filter((s) => canMoveBill(db, bill, s));
  const hint = payments.length && bill.status === 'Open' ? 'It becomes Paid when payments cover it. Remove its payments to change or void it.' : STATUS_HINT[bill.status];

  const edit = (fn: (b: Bill) => Partial<Bill>) => update((d) => editBill(d, id, fn));
  const setLine = (lineId: string, patch: Partial<BillLine>) => edit((b) => ({ lines: b.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));
  const move = (to: BillStatus) => {
    if (to === 'Open' && m.amount <= 0) return window.alert('Add the amounts first. This bill totals $0.');
    const q = CONFIRM[to];
    if (q && !window.confirm(q)) return;
    update((d) => setBillStatus(d, id, to));
  };
  const del = () => {
    if (!window.confirm(`Delete ${billLabel(bill)}? This draft will be removed.`)) return;
    update((d) => deleteBill(d, id));
    nav(`/jobs?job=${bill.jobId}&tab=bills`);
  };

  return (
    <div className="page scroll job-page">
      <PageHeader
        crumb={vendor?.name ?? 'Bill'}
        title={`${billLabel(bill)}${bill.title ? ` · ${bill.title}` : ''}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            {bill.status === 'Draft' && <button type="button" className="btn primary" onClick={() => move('Open')}>Approve to pay</button>}
            {bill.status === 'Open' && <button type="button" className="btn primary" onClick={() => setPaying(true)}><Banknote size={14} /> Record payment</button>}
            {editable && <button type="button" className="btn" onClick={del}><Trash2 size={14} /> Delete</button>}
          </>
        }
      />
      <div className="j-bar flex-wrap">
        <Link to={`/jobs?job=${bill.jobId}&tab=bills`} className="back-link"><ArrowLeft size={14} /> {job?.name ?? 'Job'} bills</Link>
        <StatusMenu value={bill.status} statuses={BILL_STATUSES} allowed={allowed} colors={BILL_STATUS_COLOR} onSelect={move} hint={hint} />
        {stage !== bill.status && <span className="text-xs font-medium" style={{ color: tone(BILL_STAGE_COLOR[stage]) }}>{stage}</span>}
        {m.lastPaid && <span className="text-xs font-medium">{bill.status === 'Paid' ? `Paid in full ${fmtDate(m.lastPaid)}` : `Last payment ${fmtDate(m.lastPaid)}`}</span>}
        {!editable && bill.status !== 'Void' && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock size={12} /> Amounts locked</span>}
        <span className="grow" />
        <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
      </div>

      <div className="detail">
        {view === 'document' && (
          <div className="bt-doc-col">
            <BillDocument bill={bill} db={db} L={L} />
          </div>
        )}

        {view === 'bill' && (
          <div className="b-wrap max-w-5xl">
            {approved && <PaymentsCard m={m} payments={payments} canPay={bill.status === 'Open'} onPay={() => setPaying(true)} />}

            <section className="card mb-4">
              <div className="card-head"><h2>Bill</h2></div>
              <div className="card-body grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Vendor">
                  {editable ? (
                    <select className="b-input" value={bill.vendorId} onChange={(e) => edit(() => ({ vendorId: e.target.value }))}>
                      {db.accounts.filter((a) => isVendor(a) || a.id === bill.vendorId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  ) : (
                    <div className="py-1.5">{vendor ? <Link to={vendor.href} className="text-primary hover:underline">{vendor.name}</Link> : '—'}</div>
                  )}
                </Field>
                <Field label="Vendor's invoice #">
                  {editable ? <TextCell value={bill.vendorRef} label="Vendor's invoice number" placeholder="From their invoice" onSave={(v) => edit(() => ({ vendorRef: v.trim() }))} /> : <div className="py-1.5">{bill.vendorRef || <span className="muted">—</span>}</div>}
                </Field>
                <Field label="Job">
                  <div className="py-1.5">{job ? <Link to={`/jobs?job=${job.id}&tab=bills`} className="text-primary hover:underline">{job.name}</Link> : '—'}</div>
                </Field>
                <Field label="Title">
                  {editable ? <TextCell value={bill.title} label="Title" placeholder="e.g. Rough electrical — progress 1" onSave={(v) => edit(() => ({ title: v }))} /> : <div className="py-1.5">{bill.title || <span className="muted">Untitled</span>}</div>}
                </Field>
                <Field label="Bill date">
                  {editable ? <input type="date" className="b-input" value={bill.date} onChange={(e) => e.target.value && edit(() => ({ date: e.target.value }))} /> : <div className="py-1.5">{fmtDate(bill.date)}</div>}
                </Field>
                <Field label="Due">
                  {editable ? <input type="date" className="b-input" value={bill.due} onChange={(e) => e.target.value && edit(() => ({ due: e.target.value }))} /> : <div className={'py-1.5' + (stage === 'Overdue' ? ' font-medium text-destructive' : '')}>{fmtDate(bill.due)}</div>}
                </Field>
              </div>
            </section>

            <section className="card mb-4">
              <div className="card-head">
                <h2>Charges</h2>
                <span className="ml-auto text-sm">Total <b className="text-base tabular-nums">{fmt(m.amount)}</b></span>
              </div>
              <div className="table-wrap">
                <table className="grid-table bt-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Cost code</th>
                      <th className="num">Amount</th>
                      {editable && <th aria-label="Actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {bill.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="bt-wrap">
                          {editable ? <TextCell value={l.description} label="Description" className="w-full" placeholder="What the charge is for" onSave={(v) => setLine(l.id, { description: v })} /> : l.description || <span className="muted">—</span>}
                        </td>
                        <td>
                          {editable ? (
                            <select className="b-input" value={l.costCodeId} aria-label="Cost code" onChange={(e) => setLine(l.id, { costCodeId: e.target.value })}>
                              <option value="">No cost code</option>
                              {db.costCodes.map((c) => <option key={c.id} value={c.id}>{c.number} {c.name}</option>)}
                            </select>
                          ) : (
                            <CostCode id={l.costCodeId} />
                          )}
                        </td>
                        <td className="num">{editable ? <NumCell value={l.amount} label="Amount" width={110} onSave={(n) => setLine(l.id, { amount: n })} /> : fmt(l.amount)}</td>
                        {editable && (
                          <td className="center">
                            <button type="button" className="icon-btn" title="Remove line" aria-label="Remove line" disabled={bill.lines.length === 1} onClick={() => edit((b) => ({ lines: b.lines.filter((x) => x.id !== l.id) }))}><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editable && (
                <div className="card-body pt-2">
                  <button type="button" className="btn btn-sm" onClick={() => edit((b) => ({ lines: [...b.lines, newBillLine(b.lines[b.lines.length - 1]?.costCodeId || tradeCostCode(db, b.vendorId))] }))}><Plus size={14} /> Add line</button>
                  <span className="ml-3 text-xs text-muted-foreground">Split the bill by cost code so job costing can total what each part of the job cost.</span>
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card">
                <div className="card-head"><h2>Notes</h2></div>
                <div className="card-body">
                  {editable ? <NotesBox value={bill.notes} onSave={(v) => edit(() => ({ notes: v }))} /> : <div className="whitespace-pre-wrap text-sm">{bill.notes || <span className="muted">No notes</span>}</div>}
                </div>
              </section>
              <section className="card">
                <div className="card-head"><h2>Attachments</h2></div>
                <div className="card-body">
                  <Attachments files={bill.attachments} onChange={(next) => edit(() => ({ attachments: next }))} hint="The vendor's invoice, lien release or receipts." />
                </div>
              </section>
            </div>

            <History match={(a) => a.billId === bill.id} empty="No history recorded for this bill yet." />
          </div>
        )}
      </div>
      {paying && <PaymentForm bill={bill} onClose={() => setPaying(false)} />}
      {createPortal(<div className="print-only"><BillDocument bill={bill} db={db} L={L} /></div>, document.body)}
    </div>
  );
}

function CostCode({ id }: { id: string }) {
  const { db } = useStore();
  const c = db.costCodes.find((x) => x.id === id);
  return c ? <span>{c.number} {c.name}</span> : <span className="muted">—</span>;
}

/** What the bill is for, what we've paid on it, and what we still owe. */
function PaymentsCard({ m, payments, canPay, onPay }: { m: { amount: number; paid: number; balance: number }; payments: ReturnType<typeof billPayments>; canPay: boolean; onPay: () => void }) {
  return (
    <section className="card mb-4">
      <div className="card-head">
        <h2>Payments</h2>
        <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Bill <b className="text-foreground tabular-nums">{fmt(m.amount)}</b></span>
          <span className="text-muted-foreground">Paid <b className="text-foreground tabular-nums">{fmt(m.paid)}</b></span>
          <span className={m.balance > 0 ? '' : 'text-muted-foreground'}>{m.balance < 0 ? 'Overpaid' : 'Owed'} <b className="tabular-nums">{fmt(Math.abs(m.balance))}</b></span>
          {canPay && <button type="button" className="btn btn-sm" onClick={onPay}><Banknote size={14} /> Record payment</button>}
        </span>
      </div>
      <PaymentsTable payments={payments} empty="Nothing paid yet." />
    </section>
  );
}

function NotesBox({ value, onSave }: { value: string; onSave: (s: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      className="b-input min-h-16 w-full"
      aria-label="Notes"
      placeholder="Anything to remember about this bill"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
    />
  );
}
