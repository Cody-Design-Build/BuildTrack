// Budget lines that name this company as the one doing or supplying the work.
import { Link } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import type { Account } from '../../data';
import { useLookups, useStore, money } from '../../store';
import { Row, Section } from '../../components/Detail';

export function VendorBudgetLines({ account }: { account: Account }) {
  const { db } = useStore();
  const L = useLookups();
  const lines = db.budgetLines.filter((i) => i.vendorId === account.id);
  if (lines.length === 0) return null;
  const budgetById = new Map(db.budgets.map((b) => [b.id, b] as const));
  return (
    <Section title="Budget lines" count={lines.length}>
      {lines.map((i) => {
        const b = budgetById.get(i.budgetId);
        return (
          <Row key={i.id}>
            <Hammer className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm text-foreground">{i.name}</span>
            <Link to={`/budgets/${i.budgetId}`} className="truncate text-xs text-muted-foreground hover:text-primary">
              {L.job.get(b?.jobId ?? '')?.name} · {b?.kind} {b?.number}
            </Link>
            <span className="ml-auto text-sm tabular-nums">{money(i.quantity * i.unitCost)}</span>
          </Row>
        );
      })}
    </Section>
  );
}
