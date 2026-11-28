import { definePluginBase } from '../sdk';
import { billCostEntries } from './bills';

export default definePluginBase({
  id: 'buildtrack.bills',
  name: 'Bills',
  description: 'What you owe vendors and subcontractors, coded to cost codes, with payments made.',
  collections: ['bills', 'payments'],
  costEntries: billCostEntries,
  filesInUse: (db) => db.bills.flatMap((b) => b.attachments.map((f) => f.fileId)),
  // bills are financial records: keep them, just without the vendor
  removeParty: (d, id) => ({ ...d, bills: d.bills.map((x) => (x.vendorId === id ? { ...x, vendorId: '' } : x)) }),
  skills: [
    {
      name: 'vendor-bills',
      description: 'How vendor and subcontractor bills work: draft, approve to pay, payments, owed and overdue, and how they feed job costing. Use for questions about what the company owes or has paid out.',
      body: `# Vendor bills

Bills (\`bills\`) are what the company owes vendors and subcontractors, entered from the vendor's own invoice. Each bill has one or more lines, and each line has an amount and a **cost code**.

## Statuses
- **Draft**: being checked; amounts can change.
- **Open**: approved to pay; amounts are locked. Can go back to draft or be voided until a payment is made.
- **Paid**: set automatically when payments cover the bill; reopens if a payment is removed.
- **Void**: doesn't count.
- An open bill past its due date is **Overdue**.

## Payments
Money paid out is in \`payments\` with a \`billId\` (payments with an \`invoiceId\` are money received from customers).

## Job costing
Open and paid bills count as **actual** cost, by cost code. Drafts don't count yet.

## Answering questions
- \`bills_owed\`: everything owed across jobs, what's overdue and due this week, bill by bill.
- \`list_records\` with \`bills\` for detail; the vendor is the account in \`vendorId\`.`,
    },
  ],
});
