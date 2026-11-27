// A vendor bill as a printable record: who we owe, for what (by cost code), the payments we've
// made and what's left. Useful as a remittance copy to send with a check, or for the files.
import { COMPANY_LICENSE, type Bill, type Db } from '../data';
import { billMoney, billPayments } from '../bills';
import { money, type Lookups } from '../store';

const longDate = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const cents = (n: number) => money(n, true);

export function BillDocument({ bill, db, L }: { bill: Bill; db: Db; L: Lookups }) {
  const job = L.job.get(bill.jobId);
  const vendor = L.party.get(bill.vendorId)?.account;
  const m = billMoney(db, bill);
  const pays = billPayments(db, bill.id);
  const code = (id: string) => {
    const c = db.costCodes.find((x) => x.id === id);
    return c ? `${c.number} ${c.name}` : '';
  };
  const stamp = bill.status === 'Draft' ? 'Draft' : bill.status === 'Void' ? 'Void' : bill.status === 'Paid' ? 'Paid' : '';

  return (
    <article className="budget-doc" aria-label={`Bill ${bill.number} document`}>
      {stamp && <div className={'bd-stamp' + (stamp === 'Paid' ? ' bd-stamp-paid' : '')} aria-hidden>{stamp}</div>}

      <header className="bd-head">
        <div>
          <div className="bd-company">{db.companyName}</div>
          <div className="bd-muted">License #{COMPANY_LICENSE}</div>
        </div>
        <div className="bd-head-right">
          <div className="bd-kind">Bill</div>
          <table className="bd-meta">
            <tbody>
              <tr><th>Number</th><td>{bill.number}</td></tr>
              {bill.vendorRef && <tr><th>Vendor invoice</th><td>{bill.vendorRef}</td></tr>}
              <tr><th>Date</th><td>{longDate(bill.date)}</td></tr>
              <tr><th>Due</th><td>{longDate(bill.due)}</td></tr>
            </tbody>
          </table>
        </div>
      </header>

      <section className="bd-parties">
        <div>
          <div className="bd-label">Pay to</div>
          <div className="bd-strong">{vendor?.name || '—'}</div>
          {vendor?.address && <div>{vendor.address}</div>}
          {vendor?.trade && <div className="bd-muted">{vendor.trade}</div>}
        </div>
        <div>
          <div className="bd-label">Project</div>
          <div className="bd-strong">{job?.name}</div>
          {job?.address && <div>{job.address}</div>}
        </div>
      </section>

      {bill.title && <h2 className="bd-title">{bill.title}</h2>}
      {bill.notes && <p className="bd-notes">{bill.notes}</p>}

      <table className="bd-lines">
        <thead>
          <tr>
            <th>Description</th>
            <th>Cost code</th>
            <th className="bd-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description || <span className="bd-muted">—</span>}</td>
              <td className="bd-muted">{code(l.costCodeId)}</td>
              <td className="bd-num">{cents(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bd-keep">
        <section className="bd-totals">
          <table>
            <tbody>
              <tr><th>Bill total</th><td>{cents(m.amount)}</td></tr>
              {pays.map((p) => (
                <tr key={p.id}><th>Paid {longDate(p.date)} <span className="bd-muted">· {p.method}{p.reference ? ` #${p.reference}` : ''}</span></th><td>−{cents(p.amount)}</td></tr>
              ))}
              <tr className="bd-grand"><th>{m.balance < 0 ? 'Overpaid' : 'Balance owed'}</th><td>{cents(Math.abs(pays.length || bill.status === 'Paid' ? m.balance : m.amount))}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="bd-sign">
          <p className="bd-muted">
            {bill.status === 'Paid'
              ? `Paid in full${bill.statusDates?.Paid ? ` on ${longDate(bill.statusDates.Paid)}` : ''}.`
              : bill.status === 'Void'
                ? 'This bill was voided.'
                : `${cents(pays.length ? m.balance : m.amount)} due ${longDate(bill.due)}.`}
          </p>
        </section>
      </div>
    </article>
  );
}
