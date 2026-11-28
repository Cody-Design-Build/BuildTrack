// Vendor bills: what we owe subcontractors and suppliers, and what we've paid them.
//
// A bill is a list of charges (each with a cost code, for job costing) entered from the vendor's
// invoice. It's Draft while someone checks it, Open once it's approved to pay, and Paid when
// payments cover it. Like invoices, Paid is never set by hand: recording or removing a payment
// moves the bill between Open and Paid. Payments live in the same table as customer payments,
// marked with billId instead of invoiceId.
import type { Activity, Bill, BillLine, BillStatus, Db, Payment } from '../../data';
import { meOf, localIso, uid } from '../../model';
import { todayYmd } from '../invoices/invoices';
import type { CostEntry } from '../sdk';

export const BILL_STATUS_COLOR: Record<BillStatus, string> = {
  Draft: '#2b7fff',
  Open: '#f0b100',
  Paid: '#00c950',
  Void: '#6b7280',
};

/** Status changes made from the status menu. Paid isn't here: recording payments sets it. */
export const BILL_NEXT: Record<BillStatus, BillStatus[]> = {
  Draft: ['Open', 'Void'],
  Open: ['Draft', 'Void'],
  Paid: [],
  Void: [],
};

export const billLabel = (b: Pick<Bill, 'number'>) => `Bill ${b.number}`;
export const isBillEditable = (b: Pick<Bill, 'status'>) => b.status === 'Draft';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const billAmount = (b: Pick<Bill, 'lines'>) => round2(b.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));

/** Payments made on a bill, oldest first. */
export function billPayments(db: Db, billId: string): Payment[] {
  return db.payments.filter((p) => p.billId === billId).sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));
}

/** What a bill is for, what has been paid on it, and what we still owe. */
export function billMoney(db: Db, bill: Bill) {
  const amount = billAmount(bill);
  const pays = billPayments(db, bill.id);
  const paid = round2(pays.reduce((s, p) => s + p.amount, 0));
  const balance = bill.status === 'Open' || bill.status === 'Paid' ? round2(amount - paid) : 0;
  return { amount, paid, balance, payments: pays.length, lastPaid: pays.length ? pays[pays.length - 1].date : '' };
}

export type BillStage = BillStatus | 'Partially paid' | 'Overdue';
export const BILL_STAGES: BillStage[] = ['Draft', 'Open', 'Partially paid', 'Overdue', 'Paid', 'Void'];
export const BILL_STAGE_COLOR: Record<BillStage, string> = { ...BILL_STATUS_COLOR, 'Partially paid': '#8b5cf6', Overdue: '#fb2c36' };

/** The status to show: an open bill is Overdue past its due date, or Partially paid once we've paid some. */
export function billStage(db: Db, bill: Bill, today = todayYmd()): BillStage {
  if (bill.status !== 'Open') return bill.status;
  if (bill.due && bill.due < today && billMoney(db, bill).balance > 0) return 'Overdue';
  return billPayments(db, bill.id).length ? 'Partially paid' : 'Open';
}

/** Totals over a set of bills: approved (open + paid), paid, still owed, overdue, and drafts waiting. */
export function payables(db: Db, bills: Bill[], today = todayYmd()) {
  let billed = 0, paid = 0, overdue = 0, drafts = 0, dueSoon = 0;
  const soon = addDays(today, 7);
  for (const b of bills) {
    const m = billMoney(db, b);
    if (b.status === 'Draft') drafts += m.amount;
    if (b.status !== 'Open' && b.status !== 'Paid') continue;
    billed += m.amount;
    paid += m.paid;
    if (b.status === 'Open' && b.due && b.due < today) overdue += m.balance;
    else if (b.status === 'Open' && b.due && b.due <= soon) dueSoon += m.balance;
  }
  return { billed: round2(billed), paid: round2(paid), owed: round2(billed - paid), overdue: round2(overdue), dueSoon: round2(dueSoon), drafts: round2(drafts) };
}

/** A job's bills and the payments made on them, newest payment first. */
export function jobPayables(db: Db, jobId: string) {
  const bills = db.bills.filter((b) => b.jobId === jobId);
  const ids = new Set(bills.map((b) => b.id));
  const payments = db.payments.filter((p) => p.billId && ids.has(p.billId)).sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  return { ...payables(db, bills), bills, payments };
}

export function nextBillNumber(db: Db, jobId: string) {
  const prefix = `${jobId.replace(/\D/g, '') || '1'}-`;
  const seqs = db.bills.filter((b) => b.jobId === jobId && b.number.startsWith(prefix)).map((b) => Number(b.number.slice(prefix.length)));
  return prefix + (Math.max(0, ...seqs.filter(Number.isFinite)) + 1);
}

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localIso(d).slice(0, 10);
}

/** The cost code that matches a vendor's trade ("Electrical" → 11 Electrical), if there is one. */
export function tradeCostCode(db: Db, vendorId: string) {
  const trade = db.accounts.find((a) => a.id === vendorId)?.trade?.toLowerCase().trim();
  if (!trade) return '';
  return db.costCodes.find((c) => c.name.toLowerCase() === trade)?.id ?? db.costCodes.find((c) => c.name.toLowerCase().includes(trade))?.id ?? '';
}

export const newBillLine = (costCodeId = ''): BillLine => ({ id: uid('bl'), description: '', costCodeId, amount: 0 });

export function logBill(d: Db, bill: Bill, what: string): Activity {
  const job = d.jobs.find((j) => j.id === bill.jobId);
  const me = meOf(d)?.name ?? 'You';
  return {
    id: uid('a'),
    date: localIso(),
    partyId: bill.vendorId,
    jobId: bill.jobId,
    title: d.accounts.find((a) => a.id === bill.vendorId)?.name ?? '',
    doc: billLabel(bill),
    amount: Math.round(billAmount(bill)),
    text: `${what} by ${me}${job ? ` on ${job.name}` : ''}`,
    color: what === 'Created' ? '#2b7fff' : BILL_STATUS_COLOR[bill.status],
    billId: bill.id,
  };
}

/** A new draft bill from a vendor on a job, with one empty line coded to the vendor's trade. */
export function createBill(d: Db, jobId: string, vendorId: string, id = uid('bill')): Db {
  const t = localIso();
  const bill: Bill = {
    id, jobId, vendorId, number: nextBillNumber(d, jobId), vendorRef: '', title: '', status: 'Draft',
    date: t.slice(0, 10), due: addDays(t.slice(0, 10), 30), lines: [newBillLine(tradeCostCode(d, vendorId))], notes: '', attachments: [],
    created: t, updated: t,
  };
  const next = { ...d, bills: [...d.bills, bill] };
  return { ...next, activity: [...next.activity, logBill(next, bill, 'Created')] };
}

/** Edits a draft bill. Attachments can be changed at any status: they don't change what's owed. */
export function editBill(d: Db, id: string, fn: (b: Bill) => Partial<Bill>): Db {
  const bill = d.bills.find((x) => x.id === id);
  if (!bill) return d;
  const p = fn(bill);
  if (!isBillEditable(bill)) {
    if (!p.attachments) return d;
    return { ...d, bills: d.bills.map((x) => (x.id === id ? { ...x, attachments: p.attachments!, updated: localIso() } : x)) };
  }
  if (p.lines) p.lines = p.lines.map((l) => ({ ...l, amount: round2(Number(l.amount) || 0) }));
  return { ...d, bills: d.bills.map((x) => (x.id === id ? { ...x, ...p, updated: localIso() } : x)) };
}

/** Whether the status menu can move a bill to `to` right now (no going back or voiding once paid on). */
export function canMoveBill(db: Db, bill: Bill, to: BillStatus) {
  if (!BILL_NEXT[bill.status].includes(to)) return false;
  if ((to === 'Void' || to === 'Draft') && db.payments.some((p) => p.billId === bill.id)) return false;
  return true;
}

export function setBillStatus(d: Db, id: string, status: BillStatus): Db {
  const src = d.bills.find((x) => x.id === id);
  if (!src || !canMoveBill(d, src, status)) return d;
  const t = localIso();
  const statusDates = { ...src.statusDates, [status]: t };
  if (status === 'Draft') delete statusDates.Open;
  const bill: Bill = { ...src, status, updated: t, statusDates };
  const next = { ...d, bills: d.bills.map((x) => (x.id === id ? bill : x)) };
  const what = status === 'Open' ? 'Approved to pay' : status === 'Draft' ? 'Moved back to draft' : `Marked as ${status.toLowerCase()}`;
  return { ...next, activity: [...next.activity, logBill(next, bill, what)] };
}

export function deleteBill(d: Db, id: string): Db {
  const bill = d.bills.find((x) => x.id === id);
  if (!bill || !isBillEditable(bill)) return d;
  return { ...d, bills: d.bills.filter((x) => x.id !== id) };
}

function logBillPayment(d: Db, bill: Bill, p: Payment, what: string): Activity {
  const job = d.jobs.find((j) => j.id === bill.jobId);
  return {
    ...logBill(d, bill, what),
    amount: Math.round(p.amount),
    text: `${what}: ${p.method}${p.reference ? ` #${p.reference}` : ''}${job ? ` on ${job.name}` : ''}`,
    color: BILL_STATUS_COLOR.Paid,
  };
}

/** Moves a bill between Open and Paid to match its payments. */
function settle(d: Db, billId: string, paidOn: string): Db {
  const bill = d.bills.find((x) => x.id === billId);
  if (!bill || (bill.status !== 'Open' && bill.status !== 'Paid')) return d;
  const { balance } = billMoney(d, bill);
  const status: BillStatus = balance <= 0.005 ? 'Paid' : 'Open';
  if (status === bill.status) return d;
  const statusDates = { ...bill.statusDates };
  if (status === 'Paid') statusDates.Paid = `${paidOn}T12:00:00`;
  else delete statusDates.Paid;
  const next: Bill = { ...bill, status, statusDates, updated: localIso() };
  const out = { ...d, bills: d.bills.map((x) => (x.id === billId ? next : x)) };
  return { ...out, activity: [...out.activity, logBill(out, next, status === 'Paid' ? 'Paid in full' : 'Reopened (payment removed)')] };
}

/** Records money paid on an open bill; the bill turns Paid when it's covered. */
export function recordBillPayment(d: Db, p: Omit<Payment, 'id' | 'jobId' | 'created' | 'invoiceId'> & { billId: string; id?: string }): Db {
  const bill = d.bills.find((x) => x.id === p.billId);
  if (!bill || bill.status !== 'Open' || !(p.amount > 0)) return d;
  const payment: Payment = { ...p, id: p.id ?? uid('pay'), jobId: bill.jobId, amount: round2(p.amount), created: localIso() };
  const out = { ...d, payments: [...d.payments, payment] };
  return settle({ ...out, activity: [...out.activity, logBillPayment(out, bill, payment, 'Payment made')] }, bill.id, payment.date);
}

/** Removes a payment made on a bill (e.g. a voided check); a paid bill goes back to Open. */
export function deleteBillPayment(d: Db, paymentId: string): Db {
  const p = d.payments.find((x) => x.id === paymentId);
  if (!p?.billId) return d;
  const bill = d.bills.find((x) => x.id === p.billId);
  const out = { ...d, payments: d.payments.filter((x) => x.id !== paymentId) };
  if (!bill) return out;
  return settle({ ...out, activity: [...out.activity, logBillPayment(out, bill, p, 'Payment removed')] }, bill.id, p.date);
}

/** costs/v1: each line of an approved (open or paid) bill is actual cost, with its share of what's been paid. */
export function billCostEntries(db: Db, jobId?: string): CostEntry[] {
  return db.bills.flatMap((bill) => {
    if ((jobId && bill.jobId !== jobId) || (bill.status !== 'Open' && bill.status !== 'Paid')) return [];
    const total = billAmount(bill);
    const paid = db.payments.filter((p) => p.billId === bill.id).reduce((s, p) => s + p.amount, 0);
    const vendor = db.accounts.find((a) => a.id === bill.vendorId)?.name;
    return bill.lines.map((l) => ({
      jobId: bill.jobId, costCodeId: l.costCodeId, kind: 'actual' as const, amount: l.amount,
      paid: total ? (paid * l.amount) / total : 0, vendorId: bill.vendorId, date: bill.date,
      label: `${billLabel(bill)}${vendor ? ` · ${vendor}` : ''}${l.description ? ` · ${l.description}` : ''}`,
      source: { plugin: 'buildtrack.bills', id: bill.id, href: `/bills/${bill.id}` },
    }));
  });
}
