// Progress invoicing: billing percentages of approved budget lines.
//
// Each invoice stores, per budget line, the percent complete TO DATE. What it bills for a line
// is (to date − previously billed) × the line's price. A line an invoice doesn't mention stays
// where it was, so it bills nothing.
//
// "Previously billed" for a draft is the sum of what every sent or paid invoice on the job billed
// for that line. When an invoice is sent, that figure is frozen on it (billedFrom), so voiding
// another invoice later never changes an invoice the customer already has; the voided amount
// simply becomes billable again on the next draft.
//
// Payments are separate records against one invoice. An invoice's balance is its amount minus
// its payments; it turns Paid when the balance reaches zero and back to Sent if a payment is
// removed. Paid is never set by hand.
import type { Activity, Budget, BudgetLine, Db, Invoice, InvoiceStatus, Payment } from '../../data';
import { linesByBudget, totals } from '../budgets/budgets';
import { meOf, linePrice, localIso, uid } from '../../store';

export const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  Draft: '#2b7fff',
  Sent: '#f0b100',
  Paid: '#00c950',
  Void: '#6b7280',
};

/** Status changes made from the status menu. Paid isn't here: recording payments sets it. */
export const INVOICE_NEXT: Record<InvoiceStatus, InvoiceStatus[]> = {
  Draft: ['Sent'],
  Sent: ['Void'],
  Paid: [],
  Void: [],
};

export const invoiceLabel = (i: Pick<Invoice, 'number'>) => `Invoice ${i.number}`;
export const isInvoiceEditable = (i: Pick<Invoice, 'status'>) => i.status === 'Draft';

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/** Approved budgets on a job, proposals first, in the order they were created. */
export function billableBudgets(db: Db, jobId: string): Budget[] {
  return db.budgets
    .filter((b) => b.jobId === jobId && b.status === 'Approved')
    .sort((a, b) => Number(a.kind === 'Change Order') - Number(b.kind === 'Change Order') || a.created.localeCompare(b.created));
}

const counts = (i: Invoice) => i.status === 'Sent' || i.status === 'Paid';

/** Percent of each line an invoice itself billed (to date minus what was billed before it). */
function billedBy(inv: Invoice): Map<string, number> {
  const from = inv.billedFrom ?? {};
  const out = new Map<string, number>();
  for (const id of new Set([...Object.keys(inv.progress), ...Object.keys(from)])) {
    const delta = (inv.progress[id] ?? from[id] ?? 0) - (from[id] ?? 0);
    if (delta) out.set(id, delta);
  }
  return out;
}

/** Percent of each budget line billed before this invoice. */
export function previousProgress(db: Db, inv: Invoice): Map<string, number> {
  if (!isInvoiceEditable(inv) && inv.billedFrom) return new Map(Object.entries(inv.billedFrom));
  const prev = new Map<string, number>();
  for (const other of db.invoices) {
    if (other.jobId !== inv.jobId || other.id === inv.id || !counts(other)) continue;
    for (const [id, pct] of billedBy(other)) prev.set(id, (prev.get(id) ?? 0) + pct);
  }
  return prev;
}

export interface InvoiceRow {
  line: BudgetLine;
  value: number; // the line's price (its "scheduled value")
  prevPct: number;
  prevAmount: number;
  toDatePct: number;
  thisAmount: number;
}

export interface InvoiceSection {
  budget: Budget;
  rows: InvoiceRow[];
  value: number;
  prevAmount: number;
  thisAmount: number;
  toDateAmount: number;
}

/** The invoice's sections (one per included budget) with every line's billing worked out. */
export function invoiceSections(db: Db, inv: Invoice, byBudget = linesByBudget(db)): InvoiceSection[] {
  const prev = previousProgress(db, inv);
  return inv.budgetIds
    .map((id) => db.budgets.find((b) => b.id === id))
    .filter((b): b is Budget => !!b)
    .map((budget) => {
      const rows = (byBudget.get(budget.id) ?? []).map((line): InvoiceRow => {
        const value = linePrice(line);
        const prevPct = prev.get(line.id) ?? 0;
        const toDatePct = inv.progress[line.id] ?? prevPct;
        return { line, value, prevPct, prevAmount: round2((value * prevPct) / 100), toDatePct, thisAmount: round2((value * (toDatePct - prevPct)) / 100) };
      });
      const sum = (f: (r: InvoiceRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
      return {
        budget,
        rows,
        value: sum((r) => r.value),
        prevAmount: sum((r) => r.prevAmount),
        thisAmount: sum((r) => r.thisAmount),
        toDateAmount: sum((r) => r.prevAmount + r.thisAmount),
      };
    });
}

export function invoiceTotals(db: Db, inv: Invoice, byBudget = linesByBudget(db)) {
  const sections = invoiceSections(db, inv, byBudget);
  const sum = (f: (s: InvoiceSection) => number) => round2(sections.reduce((t, s) => t + f(s), 0));
  const value = sum((s) => s.value);
  const toDate = sum((s) => s.toDateAmount);
  return { sections, value, previous: sum((s) => s.prevAmount), amount: sum((s) => s.thisAmount), toDate, remaining: round2(value - toDate) };
}

/** Weighted percent complete for a set of rows (by price), e.g. a whole group or budget. */
export function weightedPct(rows: InvoiceRow[], pick: (r: InvoiceRow) => number) {
  const total = rows.reduce((s, r) => s + Math.abs(r.value), 0);
  if (!total) return 0;
  return Math.round((rows.reduce((s, r) => s + Math.abs(r.value) * pick(r), 0) / total) * 10) / 10;
}

/** Payments recorded against an invoice, oldest first. */
export function invoicePayments(db: Db, invoiceId: string): Payment[] {
  return db.payments.filter((p) => p.invoiceId === invoiceId).sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));
}

export const todayYmd = () => localIso().slice(0, 10);

/** What an invoice bills, what has been paid on it, and what is still owed. */
export function invoiceMoney(db: Db, inv: Invoice, byBudget = linesByBudget(db)) {
  const amount = invoiceTotals(db, inv, byBudget).amount;
  const pays = invoicePayments(db, inv.id);
  const paid = round2(pays.reduce((s, p) => s + p.amount, 0));
  const balance = inv.status === 'Sent' || inv.status === 'Paid' ? round2(amount - paid) : 0;
  // lastPaid: date (yyyy-mm-dd) of the most recent payment, '' if none
  return { amount, paid, balance, payments: pays.length, lastPaid: pays.length ? pays[pays.length - 1].date : '' };
}

export type InvoiceStage = InvoiceStatus | 'Partially paid' | 'Overdue';
export const STAGE_COLOR: Record<InvoiceStage, string> = { ...INVOICE_STATUS_COLOR, 'Partially paid': '#8b5cf6', Overdue: '#fb2c36' };

/** The status to show: a sent invoice is Overdue past its due date, or Partially paid once money is in. */
export function invoiceStage(db: Db, inv: Invoice, byBudget = linesByBudget(db), today = todayYmd()): InvoiceStage {
  if (inv.status !== 'Sent') return inv.status;
  if (inv.due && inv.due < today && invoiceMoney(db, inv, byBudget).balance > 0) return 'Overdue';
  return invoicePayments(db, inv.id).length ? 'Partially paid' : 'Sent';
}

/**
 * The job's billing picture. Contract is every approved budget. Billed counts sent and paid
 * invoices; received is the payments on them; outstanding is billed minus received.
 */
export function jobBilling(db: Db, jobId: string, today = todayYmd()) {
  const byBudget = linesByBudget(db);
  const contract = round2(billableBudgets(db, jobId).reduce((s, b) => s + totals(byBudget.get(b.id) ?? []).price, 0));
  const invs = db.invoices.filter((i) => i.jobId === jobId);
  let billed = 0, received = 0, overdue = 0, drafts = 0;
  for (const i of invs) {
    const m = invoiceMoney(db, i, byBudget);
    if (i.status === 'Draft') drafts += m.amount;
    if (i.status !== 'Sent' && i.status !== 'Paid') continue;
    billed += m.amount;
    received += m.paid;
    if (i.status === 'Sent' && i.due && i.due < today) overdue += m.balance;
  }
  const payments = db.payments.filter((p) => p.jobId === jobId && p.invoiceId).sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  return {
    contract,
    billed: round2(billed),
    received: round2(received),
    outstanding: round2(billed - received),
    overdue: round2(overdue),
    drafts: round2(drafts),
    left: round2(contract - billed),
    payments,
  };
}

export function nextInvoiceNumber(db: Db, jobId: string) {
  const prefix = `${jobId.replace(/\D/g, '') || '1'}-`;
  const seqs = db.invoices.filter((i) => i.jobId === jobId && i.number.startsWith(prefix)).map((i) => Number(i.number.slice(prefix.length)));
  return prefix + (Math.max(0, ...seqs.filter(Number.isFinite)) + 1);
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localIso(d).slice(0, 10);
};

export function logInvoice(d: Db, inv: Invoice, what: string): Activity {
  const p = d.people.find((x) => x.id === inv.partyId);
  const who = p ? `${p.firstName} ${p.lastName}`.trim() : d.accounts.find((a) => a.id === inv.partyId)?.name ?? '';
  const job = d.jobs.find((j) => j.id === inv.jobId);
  const me = meOf(d)?.name ?? 'You';
  return {
    id: uid('a'),
    date: localIso(),
    partyId: inv.partyId,
    jobId: inv.jobId,
    title: who,
    doc: invoiceLabel(inv),
    amount: Math.round(invoiceTotals(d, inv).amount),
    text: `${what} by ${me}${job ? ` on ${job.name}` : ''}`,
    color: what === 'Created' ? '#2b7fff' : INVOICE_STATUS_COLOR[inv.status],
    invoiceId: inv.id,
  };
}

/** A new draft invoice against every approved budget on the job, billing nothing yet. */
export function createInvoice(d: Db, jobId: string, partyId: string, id = uid('inv')): Db {
  const t = localIso();
  const inv: Invoice = {
    id, jobId, number: nextInvoiceNumber(d, jobId), title: '', status: 'Draft', partyId,
    date: t.slice(0, 10), due: addDays(t.slice(0, 10), 14), notes: '',
    budgetIds: billableBudgets(d, jobId).map((b) => b.id), progress: {}, detail: 'lines', created: t, updated: t,
  };
  const next = { ...d, invoices: [...d.invoices, inv] };
  return { ...next, activity: [...next.activity, logInvoice(next, inv, 'Created')] };
}

/** Edits a draft invoice; refuses anything sent, paid or void. Percentages are kept within 0–100. */
export function editInvoice(d: Db, id: string, fn: (inv: Invoice) => Partial<Invoice>): Db {
  const inv = d.invoices.find((x) => x.id === id);
  if (!inv || !isInvoiceEditable(inv)) return d;
  const p = fn(inv);
  if (p.progress) p.progress = Object.fromEntries(Object.entries(p.progress).map(([k, v]) => [k, clampPct(v)]));
  return { ...d, invoices: d.invoices.map((x) => (x.id === id ? { ...x, ...p, updated: localIso() } : x)) };
}

export function setInvoiceStatus(d: Db, id: string, status: InvoiceStatus): Db {
  const src = d.invoices.find((x) => x.id === id);
  if (!src || !INVOICE_NEXT[src.status].includes(status)) return d;
  if (status === 'Void' && d.payments.some((p) => p.invoiceId === id)) return d; // remove its payments first
  const t = localIso();
  const inv: Invoice = { ...src, status, updated: t, statusDates: { ...src.statusDates, [status]: t } };
  // sending freezes what had been billed before, so this invoice's amounts never change afterwards
  if (status === 'Sent') inv.billedFrom = Object.fromEntries(previousProgress(d, src));
  const next = { ...d, invoices: d.invoices.map((x) => (x.id === id ? inv : x)) };
  return { ...next, activity: [...next.activity, logInvoice(next, inv, `Marked as ${status.toLowerCase()}`)] };
}

export function deleteInvoice(d: Db, id: string): Db {
  const inv = d.invoices.find((x) => x.id === id);
  if (!inv || !isInvoiceEditable(inv)) return d;
  return { ...d, invoices: d.invoices.filter((x) => x.id !== id) };
}

function logPayment(d: Db, inv: Invoice, p: Payment, what: string): Activity {
  const job = d.jobs.find((j) => j.id === inv.jobId);
  return {
    ...logInvoice(d, inv, what),
    amount: Math.round(p.amount),
    text: `${what}: ${p.method}${p.reference ? ` #${p.reference}` : ''}${job ? ` on ${job.name}` : ''}`,
    color: INVOICE_STATUS_COLOR.Paid,
  };
}

/** Moves an invoice between Sent and Paid to match its payments. */
function settle(d: Db, invoiceId: string, paidOn: string): Db {
  const inv = d.invoices.find((x) => x.id === invoiceId);
  if (!inv || (inv.status !== 'Sent' && inv.status !== 'Paid')) return d;
  const { balance } = invoiceMoney(d, inv);
  const status: InvoiceStatus = balance <= 0.005 ? 'Paid' : 'Sent';
  if (status === inv.status) return d;
  const statusDates = { ...inv.statusDates };
  if (status === 'Paid') statusDates.Paid = `${paidOn}T12:00:00`;
  else delete statusDates.Paid;
  const next: Invoice = { ...inv, status, statusDates, updated: localIso() };
  const out = { ...d, invoices: d.invoices.map((x) => (x.id === invoiceId ? next : x)) };
  return { ...out, activity: [...out.activity, logInvoice(out, next, status === 'Paid' ? 'Paid in full' : 'Reopened (payment removed)')] };
}

/** Records money received against a sent invoice; the invoice turns Paid when it's covered. */
export function recordPayment(d: Db, p: Omit<Payment, 'id' | 'jobId' | 'created' | 'billId'> & { invoiceId: string; id?: string }): Db {
  const inv = d.invoices.find((x) => x.id === p.invoiceId);
  if (!inv || inv.status !== 'Sent' || !(p.amount > 0)) return d;
  const payment: Payment = { ...p, id: p.id ?? uid('pay'), jobId: inv.jobId, amount: round2(p.amount), created: localIso() };
  const out = { ...d, payments: [...d.payments, payment] };
  return settle({ ...out, activity: [...out.activity, logPayment(out, inv, payment, 'Payment received')] }, inv.id, payment.date);
}

/** Removes a payment (e.g. a bounced check); a paid invoice goes back to Sent. */
export function deletePayment(d: Db, paymentId: string): Db {
  const p = d.payments.find((x) => x.id === paymentId);
  if (!p?.invoiceId) return d;
  const inv = d.invoices.find((x) => x.id === p.invoiceId);
  const out = { ...d, payments: d.payments.filter((x) => x.id !== paymentId) };
  if (!inv) return out;
  return settle({ ...out, activity: [...out.activity, logPayment(out, inv, p, 'Payment removed')] }, inv.id, p.date);
}
