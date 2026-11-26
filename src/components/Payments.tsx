// Recording and listing customer payments against invoices.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Modal } from './Layout';
import { Field } from './Forms';
import { Button } from '@/components/ui/button';
import { useStore, money } from '../store';
import { PAYMENT_METHODS, type Invoice, type Payment, type PaymentMethod } from '../data';
import { deletePayment, invoiceLabel, invoiceMoney, recordPayment, todayYmd } from '../invoices';

export const fmtDate = (ymd: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/**
 * When money came in, for a list row: "Nov 24, 2026", or "2 payments · last Nov 24, 2026".
 * Shared so anything paid in installments (invoices now, vendor bills later) reads the same.
 */
export function PaidOn({ count, last }: { count: number; last: string }) {
  if (!count) return null;
  return <div className="text-xs text-muted-foreground">{count > 1 ? `${count} payments · last ` : ''}{fmtDate(last)}</div>;
}

/** Dialog for money received against one sent invoice. Defaults to the full balance. */
export function PaymentForm({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { db, update } = useStore();
  const { amount: billed, paid, balance } = invoiceMoney(db, invoice);
  const [date, setDate] = useState(todayYmd());
  const [amount, setAmount] = useState(balance > 0 ? balance.toFixed(2) : '');
  const [method, setMethod] = useState<PaymentMethod>('Check');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const n = Number(amount);
  const valid = n > 0 && !!date;
  const over = valid && n > balance + 0.005;

  const save = () => {
    if (!valid) return;
    update((d) => recordPayment(d, { invoiceId: invoice.id, date, amount: n, method, reference: reference.trim(), notes: notes.trim() }));
    onClose();
  };

  return (
    <Modal title={`Record payment · ${invoiceLabel(invoice)}`} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-sm">
        <div><div className="text-xs text-muted-foreground">Invoice</div><b className="tabular-nums">{money(billed, true)}</b></div>
        <div><div className="text-xs text-muted-foreground">Paid so far</div><b className="tabular-nums">{money(paid, true)}</b></div>
        <div><div className="text-xs text-muted-foreground">Balance due</div><b className="tabular-nums">{money(balance, true)}</b></div>
      </div>
      <div className="field-row">
        <Field label="Amount received">
          <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Date received">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {over && <p className="-mt-2 text-xs text-destructive">That's {money(n - balance, true)} more than the balance due. The invoice will show a credit.</p>}
      <div className="field-row">
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label={method === 'Check' ? 'Check number' : 'Reference'}>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'Check' ? 'e.g. 1048' : 'Transaction or confirmation number'} />
        </Field>
      </div>
      <Field label="Notes">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={save} disabled={!valid}>Record {valid ? money(n, true) : 'payment'}</Button>
      </div>
    </Modal>
  );
}

/** A list of payments. With showInvoice, each row links to the invoice it paid. */
export function PaymentsTable({ payments, showInvoice, empty = 'No payments recorded yet.' }: { payments: Payment[]; showInvoice?: boolean; empty?: string }) {
  const { db, update } = useStore();
  const remove = (p: Payment) => {
    if (!window.confirm(`Remove the ${money(p.amount, true)} payment from ${fmtDate(p.date)}? If it had paid the invoice off, the invoice goes back to sent.`)) return;
    update((d) => deletePayment(d, p.id));
  };
  if (payments.length === 0) return <div className="wt-empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="grid-table bt-table">
        <thead>
          <tr>
            <th>Date</th>
            {showInvoice && <th>Invoice</th>}
            <th>Method</th>
            <th>Reference</th>
            <th>Notes</th>
            <th className="num">Amount</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const inv = db.invoices.find((i) => i.id === p.invoiceId);
            return (
              <tr key={p.id}>
                <td className="whitespace-nowrap">{fmtDate(p.date)}</td>
                {showInvoice && <td className="whitespace-nowrap">{inv ? <Link to={`/invoices/${inv.id}`} className="text-primary hover:underline">{invoiceLabel(inv)}</Link> : '—'}</td>}
                <td>{p.method}</td>
                <td className="text-muted-foreground">{p.reference || '—'}</td>
                <td className="bt-wrap text-muted-foreground">{p.notes}</td>
                <td className="num bold">{money(p.amount, true)}</td>
                <td className="center">
                  <button type="button" className="icon-btn" title="Remove payment" aria-label={`Remove ${money(p.amount, true)} payment`} onClick={() => remove(p)}><Trash2 size={14} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
