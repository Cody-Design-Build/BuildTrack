import { ReceiptText } from 'lucide-react';
import type { Job } from '../../data';
import { useStore, money, pct } from '../../store';
import { SummaryRow } from '../../components/Detail';
import { definePlugin } from '../sdk';
import base from './base';
import Invoices, { JobInvoices } from './Invoices';
import InvoiceDetail from './InvoiceDetail';
import { jobBilling } from './invoices';

function Summary({ job }: { job: Job }) {
  const { db } = useStore();
  const b = jobBilling(db, job.id);
  return (
    <>
      <SummaryRow label="Billed to date">{money(b.billed)} <span className="muted">({pct(b.contract ? (b.billed / b.contract) * 100 : NaN)} of contract)</span></SummaryRow>
      <SummaryRow label="Received">{money(b.received)}</SummaryRow>
      <SummaryRow label="Outstanding" danger={b.overdue > 0}>{money(b.outstanding)}{b.overdue > 0 && <span className="font-normal"> ({money(b.overdue)} overdue)</span>}</SummaryRow>
    </>
  );
}

export default definePlugin({
  ...base,
  nav: [{ to: '/invoices', label: 'Invoices', icon: ReceiptText, group: 'work', order: 60 }],
  routes: [
    { path: '/invoices', component: Invoices },
    { path: '/invoices/:id', component: InvoiceDetail },
  ],
  jobTabs: [{ id: 'invoices', label: 'Invoices', order: 30, component: JobInvoices }],
  jobSummary: [{ order: 20, component: Summary }],
});
