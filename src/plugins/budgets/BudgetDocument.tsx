// The customer-facing document for a proposal or change order. It shows prices only (never
// cost or markup), and is what gets printed or saved as a PDF.
import { COMPANY_LICENSE, DEFAULT_DISPLAY, type Budget, type BudgetLine, type Db } from '../../data';
import { approvedBefore, totals } from './budgets';
import { linePrice, money, type Lookups } from '../../store';

const longDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const cents = (n: number) => money(n, true);
const qty = (l: BudgetLine) => `${Number.isInteger(l.quantity) ? l.quantity : l.quantity.toFixed(2)} ${l.unit}`.trim();

export function BudgetDocument({ budget, lines, db, L }: { budget: Budget; lines: BudgetLine[]; db: Db; L: Lookups }) {
  const display = budget.display ?? DEFAULT_DISPLAY;
  const job = L.job.get(budget.jobId);
  const party = L.party.get(budget.partyId);
  const partyAddress = party?.account?.address || party?.person?.address || '';
  const groups = [...new Set(lines.map((l) => l.group))];
  const total = totals(lines).price;
  const isCO = budget.kind === 'Change Order';
  const before = isCO ? approvedBefore(db, budget) : null;
  const sentOn = budget.statusDates?.Sent;
  const approvedOn = budget.approval?.date ? `${budget.approval.date}T12:00:00` : budget.statusDates?.Approved ?? (budget.status === 'Approved' ? budget.updated : undefined);
  const stamp = budget.status === 'Draft' ? 'Draft' : budget.status === 'Void' ? 'Void' : budget.status === 'Declined' ? 'Declined' : '';

  return (
    <article className="budget-doc" aria-label={`${budget.kind} ${budget.number} document`}>
      {stamp && <div className="bd-stamp" aria-hidden>{stamp}</div>}

      <header className="bd-head">
        <div>
          <div className="bd-company">{db.companyName}</div>
          <div className="bd-muted">License #{COMPANY_LICENSE}</div>
        </div>
        <div className="bd-head-right">
          <div className="bd-kind">{budget.kind}</div>
          <table className="bd-meta">
            <tbody>
              <tr><th>Number</th><td>{budget.number}</td></tr>
              <tr><th>Date</th><td>{longDate(sentOn ?? budget.updated)}</td></tr>
              {approvedOn && budget.status === 'Approved' && <tr><th>Approved</th><td>{longDate(approvedOn)}</td></tr>}
            </tbody>
          </table>
        </div>
      </header>

      <section className="bd-parties">
        <div>
          <div className="bd-label">Prepared for</div>
          <div className="bd-strong">{party?.name || '—'}</div>
          {partyAddress && <div>{partyAddress}</div>}
        </div>
        <div>
          <div className="bd-label">Project</div>
          <div className="bd-strong">{job?.name}</div>
          {job?.address && <div>{job.address}</div>}
        </div>
      </section>

      {budget.title && <h2 className="bd-title">{budget.title}</h2>}
      {budget.notes && <p className="bd-notes">{budget.notes}</p>}

      {lines.length === 0 ? (
        <p className="bd-muted bd-empty">No line items yet.</p>
      ) : display.detail === 'total' ? (
        // scope only: what's included, one price for everything
        <section className="bd-scope">
          <div className="bd-label">Scope of work</div>
          {groups.map((g) => (
            <div key={g} className="bd-scope-group">
              <div className="bd-strong">{g}</div>
              <ul>
                {lines.filter((l) => l.group === g).map((l) => (
                  <li key={l.id}>
                    {l.name}
                    {display.quantities && <span className="bd-muted"> · {qty(l)}</span>}
                    {l.description && <div className="bd-muted">{l.description}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <table className="bd-lines">
          <thead>
            <tr>
              <th>Description</th>
              {display.detail === 'lines' && display.quantities && <th className="bd-num">Qty</th>}
              <th className="bd-num">Amount</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const gl = lines.filter((l) => l.group === g);
            const gt = totals(gl).price;
            if (display.detail === 'groups') {
              return (
                <tbody key={g}>
                  <tr className="bd-group-only">
                    <td>
                      <div className="bd-strong">{g}</div>
                      <div className="bd-muted">{gl.map((l) => l.name).join(' · ')}</div>
                    </td>
                    <td className="bd-num">{cents(gt)}</td>
                  </tr>
                </tbody>
              );
            }
            return (
              <tbody key={g}>
                <tr className="bd-group"><td colSpan={display.quantities ? 3 : 2}>{g}</td></tr>
                {gl.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.name}
                      {l.description && <div className="bd-muted">{l.description}</div>}
                    </td>
                    {display.quantities && <td className="bd-num bd-nowrap">{qty(l)}</td>}
                    <td className="bd-num">{cents(linePrice(l))}</td>
                  </tr>
                ))}
                {groups.length > 1 && (
                  <tr className="bd-subtotal">
                    <td colSpan={display.quantities ? 2 : 1}>{g} subtotal</td>
                    <td className="bd-num">{cents(gt)}</td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      )}

      <section className="bd-totals">
        <table>
          <tbody>
            {before !== null && (
              <>
                <tr><th>Previously approved</th><td>{cents(before)}</td></tr>
                <tr><th>This change order</th><td>{cents(total)}</td></tr>
                <tr className="bd-grand"><th>New approved total</th><td>{cents(before + total)}</td></tr>
              </>
            )}
            {before === null && <tr className="bd-grand"><th>Total</th><td>{cents(total)}</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="bd-sign">
        <p className="bd-muted">
          {isCO
            ? 'By signing below, the customer authorizes this change to the contract scope and price.'
            : 'By signing below, the customer accepts this proposal and authorizes the work described above.'}
        </p>
        {budget.status === 'Approved' && budget.approval && (
          <p className="bd-approved">Approved by {budget.approval.signedBy} on {longDate(approvedOn)}.</p>
        )}
        <div className="bd-sign-grid">
          <div>
            <div className="bd-sign-line" />
            <div className="bd-sign-cap">Customer signature{party ? ` — ${party.name}` : ''}</div>
          </div>
          <div>
            <div className="bd-sign-line">{approvedOn && budget.status === 'Approved' ? longDate(approvedOn) : ''}</div>
            <div className="bd-sign-cap">Date</div>
          </div>
          <div>
            <div className="bd-sign-line" />
            <div className="bd-sign-cap">{db.companyName}</div>
          </div>
          <div>
            <div className="bd-sign-line" />
            <div className="bd-sign-cap">Date</div>
          </div>
        </div>
      </section>
    </article>
  );
}
