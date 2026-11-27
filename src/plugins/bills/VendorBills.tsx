// The Bills section on a vendor's company page.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Account } from '../../data';
import { useStore, money } from '../../store';
import { Empty, Section } from '../../components/Detail';
import { Button } from '@/components/ui/button';
import { BillTable, NewBillDialog, isVendor } from './Bills';
import { payables } from './bills';

export function VendorBills({ account }: { account: Account }) {
  const { db } = useStore();
  const [adding, setAdding] = useState(false);
  const bills = db.bills.filter((b) => b.vendorId === account.id).sort((a, b) => b.date.localeCompare(a.date));
  if (bills.length === 0 && !isVendor(account)) return null;
  const owed = payables(db, bills);
  return (
    <>
      <Section
        title="Bills"
        count={bills.length}
        action={
          <span className="flex items-center gap-3">
            {owed.owed > 0 && <span className={'text-sm ' + (owed.overdue > 0 ? 'text-destructive' : 'text-muted-foreground')}>{money(owed.owed)} owed{owed.overdue > 0 && ` · ${money(owed.overdue)} overdue`}</span>}
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus /> New bill</Button>
          </span>
        }
      >
        {bills.length === 0 ? <Empty>No bills from {account.name} yet.</Empty> : <BillTable bills={bills} showVendor={false} />}
      </Section>
      {adding && <NewBillDialog vendorId={account.id} onClose={() => setAdding(false)} />}
    </>
  );
}
