// The customer-facing progress invoice: one section per budget billed (the original proposal,
// each change order), showing what was billed before, percent complete and what is due now.
import { Fragment } from 'react';
import { COMPANY_LICENSE, type Db, type Invoice } from '../data';
import { budgetLabel } from '../budgets';
import { invoiceMoney, invoiceTotals, weightedPct, type InvoiceRow } from '../invoices';
import { money, type Lookups } from '../store';

const longDate = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const cents = (n: number) => money(n, true);
const pctText = (n: number) => `${Math.round(n * 10) / 10}%`;

export function InvoiceDocument({ invoice, db, L }: { invoice: Invoice; db: Db; L: Lookups }) {
  const job = L.job.get(invoice.jobId);
  const party = L.party.get(invoice.partyId);
  const partyAddress = party?.account?.address || party?.person?.address || '';
  const t = invoiceTotals(db, invoice);
  const m = invoiceMoney(db, invoice);
  const stamp = invoice.status === 'Draft' ? 'Draft' : invoice.status === 'Void' ? 'Void' : invoice.status === 'Paid' ? 'Paid' : '';

  const Row = ({ label, sub, rows }: { label: string; sub?: string; rows: InvoiceRow[] }) => {
    const value = rows.reduce((s, r) => s + r.value, 0);
    const prev = rows.reduce((s, r) => s + r.prevAmount, 0);
    const now = rows.reduce((s, r) => s + r.thisAmount, 0);
    return (
      <tr>
        <td>
          {label}
          {sub && <div className="bd-muted">{sub}</div>}
        </td>
        <td className="bd-num">{cents(value)}</td>
        <td className="bd-num">{cents(prev)}</td>
        <td className="bd-num">{pctText(weightedPct(rows, (r) => r.toDatePct))}</td>
        <td className="bd-num">{cents(now)}</td>
      </tr>
    );
  };

  return (
    <article className="budget-doc" aria-label={`Invoice ${invoice.number} document`}>
      {stamp && <div className={'bd-stamp' + (stamp === 'Paid' ? ' bd-stamp-paid' : '')} aria-hidden>{stamp}</div>}

      <header className="bd-head">
        <div>
          <div className="bd-company">{db.companyName}</div>
          <div className="bd-muted">License #{COMPANY_LICENSE}</div>
        </div>
        <div className="bd-head-right">
          <div className="bd-kind">Invoice</div>
          <table className="bd-meta">
            <tbody>
              <tr><th>Number</th><td>{invoice.number}</td></tr>
              <tr><th>Date</th><td>{longDate(invoice.date)}</td></tr>
              <tr><th>Due</th><td>{longDate(invoice.due)}</td></tr>
            </tbody>
          </table>
        </div>
      </header>

      <section className="bd-parties">
        <div>
          <div className="bd-label">Bill to</div>
          <div className="bd-strong">{party?.name || '—'}</div>
          {partyAddress && <div>{partyAddress}</div>}
        </div>
        <div>
          <div className="bd-label">Project</div>
          <div className="bd-strong">{job?.name}</div>
          {job?.address && <div>{job.address}</div>}
        </div>
      </section>

      {invoice.title && <h2 className="bd-title">{invoice.title}</h2>}
      {invoice.notes && <p className="bd-notes">{invoice.notes}</p>}

      {t.sections.length === 0 ? (
        <p className="bd-muted bd-empty">Nothing to bill yet. Add an approved proposal or change order to this invoice.</p>
      ) : (
        <table className="bd-lines bd-invoice">
          <thead>
            <tr>
              <th>Description</th>
              <th className="bd-num">Contract</th>
              <th className="bd-num">Previously billed</th>
              <th className="bd-num">Complete</th>
              <th className="bd-num">This invoice</th>
            </tr>
          </thead>
          {t.sections.map((s) => {
            const groups = [...new Set(s.rows.map((r) => r.line.group))];
            return (
              <tbody key={s.budget.id}>
                <tr className="bd-group">
                  <td colSpan={5}>{budgetLabel(s.budget)}{s.budget.title ? ` · ${s.budget.title}` : ''}</td>
                </tr>
                {invoice.detail === 'groups'
                  ? groups.map((g) => <Row key={g} label={g} rows={s.rows.filter((r) => r.line.group === g)} />)
                  : groups.map((g) => (
                      <Fragment key={g}>
                        {groups.length > 1 && <tr className="bd-subgroup"><td colSpan={5}>{g}</td></tr>}
                        {s.rows.filter((r) => r.line.group === g).map((r) => <Row key={r.line.id} label={r.line.name} rows={[r]} />)}
                      </Fragment>
                    ))}
                {t.sections.length > 1 && (
                  <tr className="bd-subtotal">
                    <td>{budgetLabel(s.budget)} subtotal</td>
                    <td className="bd-num">{cents(s.value)}</td>
                    <td className="bd-num">{cents(s.prevAmount)}</td>
                    <td className="bd-num">{pctText(weightedPct(s.rows, (r) => r.toDatePct))}</td>
                    <td className="bd-num">{cents(s.thisAmount)}</td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      )}

      <div className="bd-keep">
      <section className="bd-totals">
        <table>
          <tbody>
            <tr><th>Contract total</th><td>{cents(t.value)}</td></tr>
            <tr><th>Previously billed</th><td>{cents(t.previous)}</td></tr>
            <tr><th>Billed to date</th><td>{cents(t.toDate)}</td></tr>
            <tr><th>Balance to finish</th><td>{cents(t.remaining)}</td></tr>
            <tr><th>This invoice</th><td>{cents(t.amount)}</td></tr>
            {m.paid > 0 && <tr><th>Payments received</th><td>−{cents(m.paid)}</td></tr>}
            <tr className="bd-grand"><th>{m.balance < 0 ? 'Credit' : 'Balance due'}</th><td>{cents(Math.abs(m.paid > 0 || invoice.status === 'Paid' ? m.balance : t.amount))}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="bd-sign">
        <p className="bd-muted">
          {invoice.status === 'Paid'
            ? `Paid${invoice.statusDates?.Paid ? ` on ${longDate(invoice.statusDates.Paid)}` : ''}. Thank you.`
            : `Please pay ${cents(m.paid > 0 ? m.balance : t.amount)} by ${longDate(invoice.due)}. Make checks payable to ${db.companyName.replace(/\.$/, '')}.`}
        </p>
      </section>
      </div>
    </article>
  );
}
