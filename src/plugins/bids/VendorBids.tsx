// The Bids section on a subcontractor's company page.
import { Link } from 'react-router-dom';
import type { Account } from '../../data';
import { useLookups, useStore, money } from '../../store';
import { Row, Section } from '../../components/Detail';
import { Pill } from '../budgets/Budgets';
import { BID_STATUS_COLOR, bidStatusLabel, packageLabel } from './bids';

export function VendorBids({ account }: { account: Account }) {
  const { db } = useStore();
  const L = useLookups();
  const bids = db.bids.flatMap((b) => {
    const p = b.vendorId === account.id ? db.bidPackages.find((x) => x.id === b.packageId) : undefined;
    return p ? [{ b, p }] : [];
  });
  if (bids.length === 0) return null;
  return (
    <Section title="Bids" count={bids.length}>
      {bids.map(({ b, p }) => (
        <Row key={b.id}>
          <Link to={`/bids/${p.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary">{p.title || packageLabel(p)}</Link>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">{L.job.get(p.jobId)?.name}</span>
          <span className="ml-auto"><Pill label={bidStatusLabel(b)} color={BID_STATUS_COLOR[b.status]} /></span>
          <span className="w-24 text-right text-sm tabular-nums">{b.amount ? money(b.amount) : '—'}</span>
        </Row>
      ))}
    </Section>
  );
}
