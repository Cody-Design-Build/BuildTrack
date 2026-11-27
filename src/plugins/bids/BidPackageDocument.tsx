// The bid package as subs see it: the scope, the items to price (never our budget numbers), the
// files that come with it and when bids are due. Prints or saves as a PDF to attach to the email.
import { COMPANY_LICENSE, type BidPackage, type Db } from '../../data';
import { packageLabel } from './bids';
import type { Lookups } from '../../store';

const longDate = (ymd?: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');

export function BidPackageDocument({ pkg, db, L, vendorName }: { pkg: BidPackage; db: Db; L: Lookups; vendorName?: string }) {
  const job = L.job.get(pkg.jobId);
  const code = db.costCodes.find((c) => c.id === pkg.costCodeId);
  const me = db.team[0];
  const issued = pkg.statusDates?.['Out for bid'] ?? pkg.updated;
  return (
    <article className="budget-doc" aria-label={`${packageLabel(pkg)} document`}>
      {pkg.status === 'Cancelled' && <div className="bd-stamp" aria-hidden>Cancelled</div>}
      <header className="bd-head">
        <div>
          <div className="bd-company">{db.companyName}</div>
          <div className="bd-muted">License #{COMPANY_LICENSE}</div>
        </div>
        <div className="bd-head-right">
          <div className="bd-kind">Bid request</div>
          <table className="bd-meta">
            <tbody>
              <tr><th>Package</th><td>{pkg.number}</td></tr>
              <tr><th>Issued</th><td>{longDate(issued)}</td></tr>
              <tr><th>Bids due</th><td>{longDate(pkg.due)}</td></tr>
            </tbody>
          </table>
        </div>
      </header>

      <section className="bd-parties">
        <div>
          <div className="bd-label">Project</div>
          <div className="bd-strong">{job?.name}</div>
          {job?.address && <div>{job.address}</div>}
        </div>
        <div>
          <div className="bd-label">{vendorName ? 'Prepared for' : 'Trade'}</div>
          <div className="bd-strong">{vendorName || (code ? code.name : '—')}</div>
          {me && <div className="bd-muted">Questions: {me.name}, {db.companyName}</div>}
        </div>
      </section>

      {pkg.title && <h2 className="bd-title">{pkg.title}</h2>}
      {pkg.scope ? <p className="bd-notes whitespace-pre-wrap">{pkg.scope}</p> : <p className="bd-muted">No scope written yet.</p>}

      {pkg.items.length > 0 && (
        <table className="bd-lines">
          <thead>
            <tr>
              <th>Item</th>
              <th className="bd-num">Qty</th>
              <th>Unit</th>
              <th className="bd-num">Your price</th>
            </tr>
          </thead>
          <tbody>
            {pkg.items.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td className="bd-num">{i.unit === 'lump' ? '' : i.quantity}</td>
                <td className="bd-muted">{i.unit === 'lump' ? 'Lump sum' : i.unit}</td>
                <td className="bd-num bd-blank">&nbsp;</td>
              </tr>
            ))}
            <tr className="bd-subtotal">
              <td colSpan={3}>Total bid</td>
              <td className="bd-num bd-blank">&nbsp;</td>
            </tr>
          </tbody>
        </table>
      )}

      {pkg.attachments.length > 0 && (
        <section className="mt-4">
          <div className="bd-label">Files included</div>
          <ul className="bd-files">
            {pkg.attachments.map((f) => <li key={f.fileId}>{f.name}</li>)}
          </ul>
        </section>
      )}

      <div className="bd-keep">
        <section className="bd-sign">
          <p className="bd-muted">
            Please send your bid by {longDate(pkg.due) || 'the due date'}: a total, a price for each item if you can, what's included and excluded, how long the price is good for, and your earliest start date.
          </p>
        </section>
      </div>
    </article>
  );
}
